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
  setDay, setPlayerName, setHotbarActive, setHotbarCount, setHotbarLocked,
  setActiveWeapon, showReload, toggleInventory, isInventoryOpen, renderInventory,
} from './hud.js';
import * as inv from './inventory.js';
import * as sfx from './sounds.js';
import { nearestInRange } from './loot.js';
import { renderMinimap } from './minimap.js';
import {
  lastShotWithinKillWindow, getActive as getActiveWeapon,
  selectWeaponBySlot, isReloading, activeWeaponMeta,
} from './weapons.js';
import { updateEffects, spawnBloodDecal, spawnGoreBurst } from './effects.js';
import { enemies } from './entities.js';
import * as vehicle from './vehicle.js';

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
inv.onChange((state) => {
  // Hotbar slot counts: pistol bullets, rifle bullets, bandages.
  setHotbarCount(0, state.bullet_p);
  setHotbarCount(1, state.bullet_r);
  setHotbarCount(2, state.bandage);
  setHotbarLocked(1, !state.rifle_pickup);    // rifle locked until looted
  // If the inventory panel is currently open, keep it in sync.
  if (isInventoryOpen()) renderInventory(state, inv.ITEMS);
});

// =====================================================================
// Persistence — total kills, days survived, nickname.
// =====================================================================
const STORAGE_KEY = 'survival-fps-v1-profile';
function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { name: '', totalKills: 0, daysSurvived: 0 };
    return JSON.parse(raw);
  } catch { return { name: '', totalKills: 0, daysSurvived: 0 }; }
}
function saveProfile(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}
const profile = loadProfile();
setPlayerName(profile.name);

// Day counter — derived from gameHour rollovers since session start. The
// in-session day starts at 1 and increments each time the hour wraps.
let inSessionDay = 1;
let _lastClockHour = 0;

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
  // Capture position BEFORE removeEnemy strips the mesh from entities.
  // (network.js calls removeEnemy after invoking this callback.)
  const e = enemies.get(id);
  const x = e ? e.mesh.position.x : null;
  const z = e ? e.mesh.position.z : null;
  // Town despawns broadcast eDead too — ignore those for the kill counter.
  if (msg.despawn) return;
  inv.bumpKills();
  // Persist total kills.
  profile.totalKills = (profile.totalKills | 0) + 1;
  saveProfile(profile);
  // Visceral feedback only on real kills, not despawn cleanups.
  if (e && x != null) {
    spawnBloodDecal(x, z);
    spawnGoreBurst(x, e.mesh.position.y, z, msg.isBoss ? 32 : 12);
  }
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
// Name dialog — first time the user clicks JUGAR, ask for a nickname.
const nameDialog = document.getElementById('nameDialog');
const nameInput = document.getElementById('nameInput');
const nameOk = document.getElementById('nameOk');
function openNameDialog() {
  if (!nameDialog) return;
  nameInput.value = profile.name || `P${Math.floor(Math.random() * 99) + 1}`;
  nameDialog.classList.remove('hidden');
  setTimeout(() => nameInput.focus(), 50);
}
function closeNameDialog() {
  if (nameDialog) nameDialog.classList.add('hidden');
}
nameOk?.addEventListener('click', () => {
  const v = (nameInput.value || '').trim().slice(0, 14) || 'P1';
  profile.name = v;
  saveProfile(profile);
  setPlayerName(v);
  closeNameDialog();
  startGame();
});
nameInput?.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') nameOk.click();
});

function startGame() {
  sfx.ensureAudio();          // first user gesture unlocks AudioContext
  sfx.startMusic?.();         // start the ambient drone
  player.startGame();
  menuEl.style.display = 'none';
  renderer.domElement.requestPointerLock?.();
  logLine(`Bienvenido ${profile.name || 'P1'}. Total bajas: ${profile.totalKills | 0}.`);
}

playBtn.addEventListener('click', () => {
  // First-run: ask for a name. Subsequent runs go straight in.
  if (!profile.name) {
    openNameDialog();
  } else {
    startGame();
  }
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
  // TAB inventory works even outside game (helps the user explore the
  // hotbar before pressing JUGAR). Block default tab focus changes.
  if (e.code === 'Tab') {
    e.preventDefault();
    toggleInventory();
    if (isInventoryOpen()) renderInventory(_currentInvState(), inv.ITEMS);
    return;
  }
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
  } else if (e.code === 'KeyF') {
    if (vehicle.isDriving()) {
      vehicle.exit();
      logLine('Bajaste del buggy');
    } else if (vehicle.enterNearest(player.pos)) {
      logLine('Subiste al buggy — W/S acelerar, A/D girar, F bajar');
    }
  } else if (/^Digit[1-9]$/.test(e.code)) {
    // Hotbar selection.
    const slotIdx = parseInt(e.code.replace('Digit', ''), 10) - 1;
    handleHotbarSlot(slotIdx);
  }
});

// Snapshot of the inventory state — inventory.js doesn't expose the raw
// state object, so we shadow it via the onChange listener.
let _shadowInvState = {};
inv.onChange((s) => { _shadowInvState = { ...s }; });
function _currentInvState() { return _shadowInvState; }

function handleHotbarSlot(slotIdx) {
  if (slotIdx === 0 || slotIdx === 1) {
    // Weapon slot: delegate to weapons.js. Hotbar visual sync below.
    selectWeaponBySlot(slotIdx);
    setHotbarActive(slotIdx);
    return;
  }
  if (slotIdx === 2) {
    // Bandage — use immediately.
    if (inv.useBandage(player)) {
      logLine('+30 HP (vendaje usado)');
      sfx.playPickup();
    }
    return;
  }
  // Slots 3..8 reserved for future items (grenades, food, etc).
}

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

  if (vehicle.isDriving()) vehicle.updateDriving(dt);
  else updatePlayer(dt);
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

  // Interaction prompt — prefer crate prompt; fall back to vehicle prompt.
  if (player.locked && player.hp > 0) {
    const c = nearestInRange(player.pos);
    const vp = vehicle.nearbyVehiclePrompt(player.pos);
    if (c && c !== nearbyCrate) {
      nearbyCrate = c;
      const tier = c.tableKey === 'boss' ? 'cofre del DOCTOR'
                : c.tableKey === 'city' ? 'cofre del laboratorio'
                : c.tableKey === 'animal' ? 'restos del animal'
                : 'cofre';
      showInteract(`abrir ${tier}`);
    } else if (!c && nearbyCrate) {
      nearbyCrate = null;
      hideInteract();
    } else if (!c && !nearbyCrate && vp) {
      showInteract(vp.replace('[F]', '').trim());
      // Use the prompt label but the [F] action is wired in the keydown handler above.
    } else if (!c && !nearbyCrate && !vp) {
      hideInteract();
    }
  }

  // Drive day/night visuals — interpolate between server updates.
  const h = currentHour();
  setTimeOfDay(h);
  setClock(h);

  // Day counter — increment each time the hour rolls past midnight.
  if (_lastClockHour > 23 && h < 1) {
    inSessionDay++;
    profile.daysSurvived = (profile.daysSurvived | 0) + 1;
    saveProfile(profile);
    logLine(`★ DIA ${inSessionDay}`);
  }
  _lastClockHour = h;
  setDay(inSessionDay);

  // Active weapon HUD + hotbar visual.
  const meta = activeWeaponMeta();
  setActiveWeapon(meta.name, meta.loaded);
  setHotbarActive(getActiveWeapon() === 'rifle' ? 1 : 0);
  showReload(isReloading());

  // Stamina HUD bar.
  setStamina(player.stamina ?? 100);

  // Combat music mode — flip to combat when player has been hit recently.
  // Falls back to day/night otherwise.
  const inCombat = (performance.now() / 1000 - (player.lastHitAt || 0)) < 4;
  if (inCombat && !_combatMusic) { _combatMusic = true; sfx.setMusicMode?.('combat'); }
  else if (!inCombat && _combatMusic) { _combatMusic = false; sfx.setMusicMode?.(isNightServer ? 'night' : 'day'); }

  // Mini-map.
  renderMinimap();

  // Effects: tracers, decals, gore particles.
  updateEffects(dt);

  // Sniper warning — show a red dot in HUD if any sci_sniper has us in
  // line of sight from > 35 m and is roughly facing us.
  updateSniperWarning(dt);

  tickFps(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
let _combatMusic = false;

// =====================================================================
// Sniper warning — checks every frame whether any sci_sniper has the
// player in their attack range AND is facing us. If so, fade in a red
// dot at top-center; play a low pulse the moment it appears.
// =====================================================================
let _sniperWarnEl = null;
let _sniperWarnActive = false;
let _sniperWarnPulseAt = 0;
function ensureSniperWarn() {
  if (_sniperWarnEl) return _sniperWarnEl;
  _sniperWarnEl = document.createElement('div');
  Object.assign(_sniperWarnEl.style, {
    position: 'fixed', top: '90px', left: '50%', transform: 'translateX(-50%)',
    width: '14px', height: '14px', borderRadius: '50%',
    background: '#ff2020', boxShadow: '0 0 12px rgba(255,30,30,0.9)',
    opacity: '0', transition: 'opacity 0.25s', pointerEvents: 'none', zIndex: 7,
  });
  document.body.appendChild(_sniperWarnEl);
  // Label below the dot.
  const lbl = document.createElement('div');
  Object.assign(lbl.style, {
    position: 'fixed', top: '108px', left: '50%', transform: 'translateX(-50%)',
    color: '#ff5050', fontSize: '11px', letterSpacing: '2px', fontWeight: '700',
    opacity: '0', transition: 'opacity 0.25s', pointerEvents: 'none', zIndex: 7,
    fontFamily: 'system-ui, sans-serif',
  });
  lbl.textContent = 'TE TIENEN EN LA MIRA';
  document.body.appendChild(lbl);
  _sniperWarnEl._label = lbl;
  return _sniperWarnEl;
}
function updateSniperWarning(dt) {
  if (!player.locked) {
    if (_sniperWarnActive) {
      ensureSniperWarn().style.opacity = '0';
      _sniperWarnEl._label.style.opacity = '0';
      _sniperWarnActive = false;
    }
    return;
  }
  let tracked = false;
  for (const e of enemies.values()) {
    if (e.etype !== 'sci_sniper') continue;
    const dx = player.pos.x - e.mesh.position.x;
    const dz = player.pos.z - e.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 35 || d > 70) continue;        // sniper sweet spot for warning
    // Sniper aim direction is its yaw — see if it points roughly at us.
    const aimX = Math.sin(e.mesh.rotation.y);
    const aimZ = Math.cos(e.mesh.rotation.y);
    const dirX = dx / (d || 1), dirZ = dz / (d || 1);
    const dot = aimX * dirX + aimZ * dirZ;
    if (dot > 0.85) { tracked = true; break; }
  }
  const el = ensureSniperWarn();
  if (tracked && !_sniperWarnActive) {
    el.style.opacity = '1';
    el._label.style.opacity = '0.9';
    _sniperWarnActive = true;
    if (performance.now() - _sniperWarnPulseAt > 800) {
      sfx.playEmpty(); // short sting; reuse the empty-click chirp
      _sniperWarnPulseAt = performance.now();
    }
  } else if (!tracked && _sniperWarnActive) {
    el.style.opacity = '0';
    el._label.style.opacity = '0';
    _sniperWarnActive = false;
  }
}
requestAnimationFrame(frame);
