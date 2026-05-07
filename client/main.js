// Bootstrap — wire together world, player, network, entities, weapons, HUD,
// inventory, loot, sounds. Single game loop.

import { renderer, scene, camera, setTimeOfDay } from './three-setup.js';
import './world.js';                 // builds terrain + trees + rocks
import { player, updatePlayer } from './player.js';
import { network } from './network.js';
import { updateEntities } from './entities.js';
import { updateWeapons } from './weapons.js';
import {
  setHP, setOnlineCount, flashDamage, logLine, tickFps, showBanner,
  setInventory, showInteract, hideInteract,
  setClock, showDamageArrow, setStamina, flashHitMarker,
} from './hud.js';
import * as inv from './inventory.js';
import * as sfx from './sounds.js';
import { nearestInRange } from './loot.js';
import { renderMinimap } from './minimap.js';
import { lastShotWithinKillWindow } from './weapons.js';

// Day/night state — interpolated locally between server `time` updates.
let serverHour = 8;
let serverHourSetAt = performance.now();
const DAY_LENGTH = 360; // seconds — keep in sync with server
function currentHour() {
  const elapsedS = (performance.now() - serverHourSetAt) / 1000;
  return (serverHour + (elapsedS * 24 / DAY_LENGTH)) % 24;
}

const menuEl = document.getElementById('menu');
const playBtn = document.getElementById('playBtn');
const deathEl = document.getElementById('death');
const respawnBtn = document.getElementById('respawnBtn');

// HUD subscribes to inventory updates so ammo/kill counts always match state.
inv.onChange(setInventory);

// =====================================================================
// Network wiring.
// =====================================================================
network.connect(player);
network.onYouHit = (dmg, src, source) => {
  player.takeDamage(dmg);
  setHP(player.hp);
  flashDamage();
  sfx.playPlayerHurt();
  // Directional arrow — angle from camera forward to source position.
  if (src && Number.isFinite(src.x) && Number.isFinite(src.z)) {
    const yaw = player.yaw();
    // Forward vector in world coords (camera looks -Z when yaw=0).
    const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
    const dx = src.x - player.pos.x, dz = src.z - player.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const dirX = dx / len, dirZ = dz / len;
    // Signed angle between forward and source direction. Positive = right.
    const dot = fwdX * dirX + fwdZ * dirZ;
    const cross = fwdX * dirZ - fwdZ * dirX;
    const angle = Math.atan2(cross, dot);
    showDamageArrow(angle);
  }
  if (player.hp <= 0) {
    deathEl.classList.add('show');
    menuEl.style.display = 'none';
    document.exitPointerLock?.();
  }
};
network.onPeerCount = setOnlineCount;
network.onBanner = (text) => {
  showBanner(text);
  if (text.includes('DOCTOR') && text.includes('LABORATORIO')) sfx.playBossSting();
};
network.onEnemyDead = (id, msg) => {
  // Town despawns broadcast eDead too — ignore those for the kill counter.
  if (msg.despawn) return;
  inv.bumpKills();
  // If we were the one who shot this enemy a moment ago, upgrade the
  // hit marker to red and chime.
  if (lastShotWithinKillWindow(id)) {
    flashHitMarker(true);
    sfx.playKill();
  }
  if (msg.isBoss) {
    logLine('★ EL DOCTOR HA CAIDO — loot legendario disponible');
    sfx.playPickup();
  }
};
network.onLootGranted = (loot) => {
  const lines = inv.applyLoot(loot);
  for (const l of lines) logLine(l);
  sfx.playPickup();
};
let isNightServer = false;
network.onTimeUpdate = (h, isNight) => {
  serverHour = h;
  serverHourSetAt = performance.now();
  // Update music mode if night flipped (debounced inside setMusicMode).
  if (isNight !== isNightServer) {
    isNightServer = isNight;
    sfx.setMusicMode?.(isNight ? 'night' : 'day');
  }
};

// =====================================================================
// Menu wiring.
// =====================================================================
playBtn.addEventListener('click', () => {
  sfx.ensureAudio();          // first user gesture unlocks AudioContext
  sfx.startMusic?.();         // start the ambient drone
  player.startGame();
  menuEl.style.display = 'none';
  renderer.domElement.requestPointerLock?.();
  logLine('Bienvenido. Sobrevivi.');
});

respawnBtn.addEventListener('click', () => {
  player.respawn();
  network.respawn();
  setHP(player.hp);
  deathEl.classList.remove('show');
  renderer.domElement.requestPointerLock?.();
});

player.onLockChange = (locked) => {
  if (locked) return;
  if (player.hp <= 0) return;
  if (deathEl.classList.contains('show')) return;
  menuEl.style.display = 'flex';
};

// =====================================================================
// Interaction keys: E (open crate), H (heal with bandage).
// =====================================================================
let nearbyCrate = null;

addEventListener('keydown', (e) => {
  if (!player.locked || player.hp <= 0) return;
  if (e.code === 'KeyE' && nearbyCrate) {
    network.openCrate(nearbyCrate.id);
    nearbyCrate = null;
    hideInteract();
  } else if (e.code === 'KeyH') {
    if (inv.useBandage(player)) {
      logLine('+30 HP (vendaje usado)');
      sfx.playPickup();
    }
  }
});

// =====================================================================
// Footstep ticker — plays a soft thump roughly every 0.45 s while moving.
// =====================================================================
let footAccum = 0;
let lastPlayerX = player.pos.x, lastPlayerZ = player.pos.z;

// =====================================================================
// Game loop.
// =====================================================================
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  updatePlayer(dt);
  updateEntities(dt);
  updateWeapons(dt);
  network.update(dt);
  player.regen(dt);
  setHP(player.hp);

  // Death detection — see hp <= 0 even if onYouHit didn't fire on this tick.
  if (player.hp <= 0 && !deathEl.classList.contains('show')) {
    deathEl.classList.add('show');
    menuEl.style.display = 'none';
    document.exitPointerLock?.();
  }

  // Footstep cadence.
  if (player.locked) {
    const dx = player.pos.x - lastPlayerX, dz = player.pos.z - lastPlayerZ;
    const moved = Math.hypot(dx, dz);
    if (moved > 0.05) footAccum += moved;
    lastPlayerX = player.pos.x; lastPlayerZ = player.pos.z;
    if (footAccum > 2.4) {
      footAccum = 0;
      sfx.playFootstep();
    }
  }

  // Pickup prompt.
  if (player.locked && player.hp > 0) {
    const c = nearestInRange(player.pos);
    if (c && c !== nearbyCrate) {
      nearbyCrate = c;
      const tier = c.tableKey === 'boss' ? 'cofre del DOCTOR'
                : c.tableKey === 'city' ? 'cofre del laboratorio'
                : 'cofre';
      showInteract(`abrir ${tier}`);
    } else if (!c && nearbyCrate) {
      nearbyCrate = null;
      hideInteract();
    }
  }

  // Drive day/night visuals — interpolate between server updates.
  const h = currentHour();
  setTimeOfDay(h);
  setClock(h);

  // Stamina HUD bar.
  setStamina(player.stamina ?? 100);

  // Combat music mode — flip to combat when player has been hit recently.
  // Falls back to day/night otherwise.
  const inCombat = (performance.now() / 1000 - (player.lastHitAt || 0)) < 4;
  if (inCombat && !_combatMusic) { _combatMusic = true; sfx.setMusicMode?.('combat'); }
  else if (!inCombat && _combatMusic) { _combatMusic = false; sfx.setMusicMode?.(isNightServer ? 'night' : 'day'); }

  // Mini-map.
  renderMinimap();

  tickFps(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
let _combatMusic = false;
requestAnimationFrame(frame);
