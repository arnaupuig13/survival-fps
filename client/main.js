// Bootstrap — wire together world, player, network, entities, weapons, HUD,
// inventory, loot, sounds. Single game loop.

import { renderer, scene, camera, setTimeOfDay } from './three-setup.js';
import * as THREE from 'three';
import { heightAt } from './world.js';
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
  setCompass, setSurvival,
  setXp, setStatus, renderQuests,
  openTrader, closeTrader, isTraderOpen, refreshTraderScrap,
} from './hud.js';
import * as survival from './survival.js';
import * as tools from './tools.js';
const knife = tools; // legacy alias — older code uses knife.updateKnife / setKnifeActive
import { updateCityLights, toggleColliderDebug } from './towns.js';
import { updatePoi } from './poi.js';
import * as build from './build.js';
import { toggleMap, isMapOpen, updateMap, noteSupplyDrop } from './map.js';
import { toggleStash, isStashOpen } from './stash.js';
import * as inv from './inventory.js';
import * as inventoryUI from './inventory-ui.js';
import * as sfx from './sounds.js';
import { nearestInRange, removeCrate } from './loot.js';
import { renderMinimap } from './minimap.js';
import {
  lastShotWithinKillWindow, getActive as getActiveWeapon,
  selectWeaponBySlot, isReloading, activeWeaponMeta, consumeRecoil,
} from './weapons.js';
import { updateEffects, spawnBloodDecal, spawnGoreBurst } from './effects.js';
import { enemies } from './entities.js';
import * as vehicle from './vehicle.js';
import * as progression from './progression.js';
import * as quests from './quests.js';
import * as status from './status.js';
import * as traps from './traps.js';
import * as trader from './trader.js';

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
  setHotbarCount(0, state.bullet_p);
  setHotbarCount(1, state.bullet_r);
  setHotbarCount(2, state.bandage);
  setHotbarCount(3, state.grenade);
  setHotbarCount(7, state.shell);
  setHotbarCount(8, state.sniper_round);
  setHotbarLocked(1, !state.rifle_pickup);
  setHotbarLocked(5, !state.axe);
  setHotbarLocked(6, !state.pickaxe);
  setHotbarLocked(7, !state.shotgun_pickup);
  setHotbarLocked(8, !state.sniper_pickup);
  // Sync armor onto the player so takeDamage applies the reduction.
  player.armorState = { vest: !!state.vest_armor, helmet: !!state.helmet_armor };
  // El nuevo inventory-ui se suscribe solo a inv.onChange — no necesitamos
  // re-renderizar acá. Mantenemos esta función para los hotbar counts.
});

// Conecta el handler de crafting al panel Rust-style.
inventoryUI.setCraftHandler(tryCraft);

// Progresión: cada cambio actualiza barra XP/nivel y expone maxHp para HP bar.
progression.onChange((s) => {
  const need = progression.xpForNext(s.level);
  setXp(s.level, s.xpThisLevel, need);
  if (typeof window !== 'undefined') window.__playerMaxHp = player.maxHp || 100;
});

// Quests: refresca el panel cuando cambia el progreso.
quests.onChange((s) => renderQuests(s.quests));

// Status: pinta indicadores de sangrado / infección.
status.onChange((s) => setStatus(s.bleeding, s.infected));

// Track harvest / craft — observamos deltas positivos de wood/stone para
// asumir que vinieron de talar/picar. Si vinieron de loot también cuenta
// (no distinguimos — es OK para quest tracking).
let _lastWood = 0, _lastStone = 0;
inv.onChange((s) => {
  const w = s.wood | 0, st = s.stone | 0;
  if (w > _lastWood) quests.track('harvest_wood', w - _lastWood);
  if (st > _lastStone) quests.track('harvest_stone', st - _lastStone);
  _lastWood = w; _lastStone = st;
});

// Crafting handler — exposed to hud.js via the inventory render args.
function tryCraft(recipeId) {
  const result = inv.craft(recipeId, { nearFire: player.nearFire, nearWater: false });
  if (result == null) {
    logLine('No se puede craftear (faltan materiales o necesitás fuego)');
  } else {
    logLine(`+ ${result}`);
    sfx.playPickup?.();
    quests.track('craft', 1);
  }
}

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
inventoryUI.setName(profile.name || 'P1');

// Day counter — derived from gameHour rollovers since session start. The
// in-session day starts at 1 and increments each time the hour wraps.
let inSessionDay = 1;
let _lastClockHour = 0;

// =====================================================================
// Chat — T opens an input, Enter sends, Escape cancels. Pointer lock is
// released while the input is focused so the user can type.
// =====================================================================
const chatInputWrap = document.getElementById('chatInputWrap');
const chatInput     = document.getElementById('chatInput');
const chatLog       = document.getElementById('chatLog');
let _chatOpen = false;
function openChat() {
  if (_chatOpen) return;
  _chatOpen = true;
  _voluntaryUnlock = true;
  document.exitPointerLock?.();
  chatInputWrap.classList.remove('hidden');
  chatInput.value = '';
  setTimeout(() => chatInput.focus(), 30);
}
function closeChat(send = false) {
  if (!_chatOpen) return;
  _chatOpen = false;
  const text = chatInput.value.trim();
  chatInputWrap.classList.add('hidden');
  if (send && text) network.chat(text);
  // Re-engage pointer lock when chat closes.
  setTimeout(() => {
    _voluntaryUnlock = false;
    renderer.domElement.requestPointerLock?.();
  }, 50);
}
chatInput?.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') { e.preventDefault(); closeChat(true); }
  else if (e.code === 'Escape') { e.preventDefault(); closeChat(false); }
});
// Trader panel — abre el modal con el catálogo del comerciante. Libera el
// mouse mientras está abierto. Refresh manual cada vez que abrimos para
// reflejar cambios en scrap.
function openTraderPanel() {
  _voluntaryUnlock = true;
  document.exitPointerLock?.();
  openTrader(
    trader.SHOP, trader.BUY, inv.get('scrap'),
    (offerId) => {
      trader.tryBuy(offerId);
      // Refresh: re-render el panel con el nuevo scrap.
      openTrader(trader.SHOP, trader.BUY, inv.get('scrap'),
        (id2) => { trader.tryBuy(id2); refreshTraderScrap(inv.get('scrap')); },
        (id2) => { trader.trySell(id2); refreshTraderScrap(inv.get('scrap')); },
        (o) => { for (const k of Object.keys(o.give || {})) if (inv.ITEMS[k]?.oneTime && inv.has(k, 1)) return true; return false; });
    },
    (offerId) => {
      trader.trySell(offerId);
      refreshTraderScrap(inv.get('scrap'));
    },
    (o) => { for (const k of Object.keys(o.give || {})) if (inv.ITEMS[k]?.oneTime && inv.has(k, 1)) return true; return false; },
  );
}
function closeTraderPanel() {
  closeTrader();
  if (player.hp > 0) {
    setTimeout(() => {
      _voluntaryUnlock = false;
      renderer.domElement.requestPointerLock?.();
    }, 60);
  }
}

function appendChatLog(name, text) {
  const div = document.createElement('div');
  div.className = 'cline';
  div.innerHTML = `<span class="cname">${escapeHTML(name)}</span>${escapeHTML(text)}`;
  chatLog.prepend(div);
  setTimeout(() => { div.style.transition = 'opacity 0.6s'; div.style.opacity = '0'; }, 5500);
  setTimeout(() => div.remove(), 6200);
  while (chatLog.children.length > 6) chatLog.lastChild.remove();
}
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[m]); }

// =====================================================================
// ADS — right-click holds to aim down sights. Reduces FOV (zoom) and
// shows a scope vignette. Released → back to base.
// =====================================================================
const BASE_FOV = camera.fov;
const ADS_FOV  = 45;
let _ads = false;
const scopeVignette = document.getElementById('scopeVignette');
addEventListener('mousedown', (e) => { if (e.button === 2) setADS(true); });
addEventListener('mouseup',   (e) => { if (e.button === 2) setADS(false); });
function setADS(on) {
  _ads = on;
  if (scopeVignette) scopeVignette.classList.toggle('show', on);
}

// =====================================================================
// Grenade rendering — server-driven mesh + boom particles.
// =====================================================================
const grenadeMeshes = new Map(); // id → mesh
function spawnGrenadeMesh(g) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x404044, roughness: 0.55, metalness: 0.5 }),
  );
  m.position.set(g.x, g.y, g.z);
  scene.add(m);
  grenadeMeshes.set(g.id, { mesh: m, x: g.x, y: g.y, z: g.z, vx: g.vx, vy: g.vy, vz: g.vz, fuse: g.fuse });
}
function destroyGrenadeMesh(id) {
  const e = grenadeMeshes.get(id); if (!e) return;
  scene.remove(e.mesh);
  e.mesh.geometry.dispose(); e.mesh.material.dispose();
  grenadeMeshes.delete(id);
}

// =====================================================================
// Network wiring.
// =====================================================================
network.connect(player);
network.onYouHit = (dmg, src, source) => {
  player.takeDamage(dmg);
  setHP(player.hp);
  flashDamage();
  sfx.playPlayerHurt();
  // Status effects según fuente del daño.
  const kind = (source === 'animal') ? 'animal'
             : (source === 'zombie' || source === 'enemy') ? 'melee'
             : 'gunshot';
  status.onDamage(dmg, kind);
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
  const e = enemies.get(id);
  const x = e ? e.mesh.position.x : null;
  const z = e ? e.mesh.position.z : null;
  if (msg.despawn) return;
  inv.bumpKills();
  lifeKills++;
  // Persist total kills.
  profile.totalKills = (profile.totalKills | 0) + 1;
  saveProfile(profile);
  // XP por kill — el etype del cliente nos da el tipo (zombie/runner/tank/wolf/...).
  const kind = e ? (e.etype || 'zombie') : 'zombie';
  progression.awardKillXp(kind, !!msg.isBoss);
  // Track de quests por tipo de enemigo.
  if (!msg.isBoss) {
    const isZombieKind = ['zombie','runner','tank','brute','spitter','screamer','exploder'].includes(kind);
    if (isZombieKind) quests.track('kill_zombies', 1);
    if (kind === 'runner') quests.track('kill_runners', 1);
    if (kind === 'tank' || kind === 'brute')   quests.track('kill_tank', 1);
    if (kind === 'scientist' || kind === 'sci_shotgun' || kind === 'sci_sniper') quests.track('kill_scientists', 1);
    if (kind === 'wolf' || kind === 'boar' || kind === 'bear' || kind === 'deer' || kind === 'rabbit') {
      quests.track('kill_animals', 1);
    }
  }
  // Drop random de chatarra: 30% en humanoides básicos, 60% en científicos
  // y specials, 100% en boss/brute.
  if (msg.isBoss) {
    inv.add('scrap', 5 + Math.floor(Math.random() * 6));
  } else if (kind === 'brute') {
    inv.add('scrap', 3 + Math.floor(Math.random() * 3));
  } else if (kind === 'scientist' || kind === 'sci_shotgun' || kind === 'sci_sniper') {
    if (Math.random() < 0.7) inv.add('scrap', 1 + Math.floor(Math.random() * 3));
  } else if (['spitter','screamer','exploder'].includes(kind)) {
    if (Math.random() < 0.55) inv.add('scrap', 1 + Math.floor(Math.random() * 2));
  } else if (['zombie','runner','tank'].includes(kind)) {
    if (Math.random() < 0.3) inv.add('scrap', 1);
  }
  // Achievement milestones.
  if (profile.totalKills === 1)   unlockAchievement('first_kill', 'Primera baja');
  if (profile.totalKills === 10)  unlockAchievement('ten_kills', '10 enemigos eliminados');
  if (profile.totalKills === 50)  unlockAchievement('fifty_kills', '50 enemigos eliminados');
  if (profile.totalKills === 100) unlockAchievement('hundred_kills', 'Centurión: 100 enemigos');
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
    unlockAchievement('boss_down', 'El Doctor cayó');
  }
};
network.onLootGranted = (loot, crateId) => {
  const lines = inv.applyLoot(loot);
  for (const l of lines) logLine(typeof l === 'string' ? l : `+ ${l.text.replace(/^\+\s*/, '')}`);
  sfx.playPickup();
  // XP por cofre + tracking de quest. Cada cofre da 5 XP base.
  progression.addXp(5, 'cofre');
  quests.track('open_crates', 1);
  // Quests específicos por tier — el id de crate del server tiene prefix.
  if (typeof crateId === 'string' && crateId.startsWith('city')) quests.track('open_city_crate', 1);
};
let isNightServer = false;
network.onChat = (id, name, text) => {
  appendChatLog(name, text);
};
network.onGrenade = (g) => spawnGrenadeMesh(g);
network.onGrenadeBoom = (msg) => {
  destroyGrenadeMesh(msg.id);
  spawnGoreBurst(msg.x, msg.y, msg.z, 26);
  // Also a quick screen-flash + sting.
  flashDamage();
  sfx.playKill?.();
};
network.onWave = (state) => {
  if (state === 'start') {
    sfx.setMusicMode?.('combat');
    showBanner('⚠ OLEADA INMINENTE ⚠');
    logLine('⚠ Inicia oleada de hostiles');
  } else {
    sfx.setMusicMode?.(isNightServer ? 'night' : 'day');
    logLine('Oleada terminó');
  }
};
network.onSupplyDrop = (x, z) => {
  sfx.playPickup?.();
  showBanner('★ SUMINISTROS CAYERON ★', 4000);
  logLine(`★ Suministros en (${Math.round(x)}, ${Math.round(z)})`);
  noteSupplyDrop(x, z);
  unlockAchievement('supply_dropped', 'Suministros aéreos avistados');
};

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
  inventoryUI.setName(v);
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
  // Push name to server so peers see it.
  if (profile.name) network.setName(profile.name);
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
  // Bedroll respawn pausado (sistema de building deshabilitado).
  setHP(player.hp);
  deathEl.classList.remove('show');
  resetLifeStats();
  renderer.domElement.requestPointerLock?.();
});

// Flag para distinguir desbloqueos voluntarios (inventario / chat) del
// desbloqueo "ESC" que debería mostrar el menú principal.
let _voluntaryUnlock = false;

player.onLockChange = (locked) => {
  if (locked) return;
  if (player.hp <= 0) return;
  if (deathEl.classList.contains('show')) return;
  if (_voluntaryUnlock) return;       // inventario / chat — no mostrar menú
  menuEl.style.display = 'flex';
};

// =====================================================================
// Interaction keys: E (open crate), H (heal with bandage).
// =====================================================================
let nearbyCrate = null;
let nearbyBush = null;
let nearbyPlant = null;
let nearbyLake = null;
let nearbyTrader = null;

// Player.js applies player.mouseSensitivity if present (default 0.0022).
// We just need the field to exist so applySettings can override it.

addEventListener('keydown', (e) => {
  if (_chatOpen) return;
  // ESC toggles settings menu (don't fight the browser's pointer-lock release).
  if (e.code === 'Escape' && !e.repeat) {
    if (settingsMenu.classList.contains('hidden')) openSettings();
    else closeSettings();
    return;
  }
  // TAB inventory works even outside game. Liberamos el pointer lock al
  // abrir para que el mouse pueda usar el panel; al cerrar volvemos al lock
  // si el jugador estaba jugando (para que pueda seguir sin clickear).
  if (e.code === 'Tab') {
    e.preventDefault();
    const wasOpen = isInventoryOpen();
    toggleInventory();
    if (!wasOpen) {
      // Acabamos de abrir
      inventoryUI.refresh();
      if (player.hp > 0 && !menuEl.style.display.includes('flex')) {
        _voluntaryUnlock = true;
        document.exitPointerLock?.();
      }
    } else {
      // Acabamos de cerrar — re-lockear si estaba en juego
      if (player.hp > 0 && _voluntaryUnlock) {
        setTimeout(() => {
          _voluntaryUnlock = false;
          renderer.domElement.requestPointerLock?.();
        }, 60);
      }
    }
    return;
  }
  // Chat open key — only when the player is in-game.
  if (e.code === 'KeyT' && player.locked && !e.repeat) {
    e.preventDefault();
    openChat();
    return;
  }
  // Throw grenade — G. Throw direction = camera forward + a bit of arc.
  if (e.code === 'KeyG' && player.locked && !e.repeat) {
    if (inv.consume?.('grenade', 1)) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      network.throwGrenade(dir.x, dir.y + 0.2, dir.z);
      sfx.playEmpty?.();
    }
    return;
  }
  if (!player.locked || player.hp <= 0) return;
  if (e.code === 'KeyE' && nearbyCrate) {
    if (nearbyCrate.localLoot) {
      // Item soltado localmente — aplicamos el loot directamente sin
      // consultar al servidor (no existe en su mundo).
      const lines = inv.applyLoot(nearbyCrate.localLoot);
      for (const ln of lines) logLine(`+ ${ln.text.replace(/^\+\s*/, '')}`);
      sfx.playPickup?.();
      removeCrate(nearbyCrate.id);
    } else {
      network.openCrate(nearbyCrate.id);
    }
    nearbyCrate = null;
    hideInteract();
  } else if (e.code === 'KeyE' && nearbyTrader && !isTraderOpen()) {
    openTraderPanel();
    hideInteract();
  } else if (e.code === 'KeyE' && isTraderOpen()) {
    closeTraderPanel();
  } else if (e.code === 'KeyE' && nearbyBush) {
    const got = survival.harvestBush(nearbyBush);
    if (got > 0) {
      inv.add('berry', got);
      logLine('+1 BAYA');
      sfx.playPickup?.();
      unlockAchievement('first_berry', 'Recolectaste tu primera baya');
    }
    nearbyBush = null;
    hideInteract();
  } else if (e.code === 'KeyE' && nearbyPlant) {
    if (survival.harvestPlant(nearbyPlant)) {
      player.hp = Math.min(100, player.hp + 20);
      logLine('+20 HP (planta medicinal)');
      sfx.playPickup?.();
      unlockAchievement('herbalist', 'Sanaste con una planta medicinal');
    }
    nearbyPlant = null;
    hideInteract();
  } else if (e.code === 'KeyE' && nearbyLake) {
    if (inv.add('water_bottle', 1) || true) {
      // add returns nothing meaningful; just give one and check max via has logic.
      logLine('+1 BOTELLA AGUA');
      sfx.playPickup?.();
    }
    nearbyLake = null;
    hideInteract();
  } else if (e.code === 'KeyH') {
    if (inv.useBandage(player)) {
      logLine('+30 HP (vendaje usado)');
      status.stopBleeding();
      sfx.playPickup();
    }
  } else if (e.code === 'KeyN' && !e.repeat) {
    // Colocar cepo en el suelo (frente al jugador).
    if (inv.consume('bear_trap', 1)) {
      const yaw = player.yaw();
      const fx = player.pos.x + Math.sin(yaw) * -1.5;
      const fz = player.pos.z + Math.cos(yaw) * -1.5;
      traps.placeTrap(fx, fz);
    } else {
      logLine('Necesitás un cepo (crafteable: 4 piedra + 2 madera + 3 chatarra)');
    }
  } else if (e.code === 'KeyP' && !e.repeat) {
    // Antibióticos — cura infección.
    status.tryAntibiotics();
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
  } else if (e.code === 'KeyL' && !e.repeat) {
    // Dev god-mode toggle. Will be removed before public launch.
    player.godMode = !player.godMode;
    if (player.godMode) {
      logLine('★★★ MODO DIOS ACTIVADO — velocidad x10, balas inf, vuelo (SPACE sube, CTRL baja). Tecla K para ver colliders.');
      showBanner('★ MODO DIOS ★', 1500);
    } else {
      logLine('Modo dios desactivado');
      showBanner('mortal', 1200);
    }
  } else if (e.code === 'KeyK' && !e.repeat) {
    // Dev: visualize obstacle colliders as wireframes (yellow box, blue circle).
    const on = toggleColliderDebug();
    logLine(on ? 'Colliders ON (debug)' : 'Colliders OFF');
  } else if (e.code === 'KeyB' && !e.repeat) {
    // Place a campfire at the player's feet — needs 1 campfire item.
    if (inv.consume('campfire', 1)) {
      survival.placeFire(player.pos.x, player.pos.z);
      logLine('Hoguera colocada');
      sfx.playPickup?.();
    } else {
      logLine('Necesitas una hoguera (crafteable con 5 madera + 2 piedra)');
    }
  } else if (e.code === 'KeyJ' && !e.repeat) {
    // Quick-eat: prefer cooked meat → berry → raw meat.
    let ate = null;
    if (inv.consume('meat_cooked', 1)) { player.eat('meat_cooked'); ate = 'CARNE COCIDA'; }
    else if (inv.consume('berry', 1))  { player.eat('berry'); ate = 'BAYAS'; }
    else if (inv.consume('meat_raw', 1)) { player.eat('meat_raw'); ate = 'CARNE CRUDA (-5 HP)'; }
    if (ate) { logLine(`+ ${ate}`); sfx.playPickup?.(); quests.track('eat_food', 1); }
    else logLine('Sin comida');
  } else if (e.code === 'KeyU' && !e.repeat) {
    // Quick-drink water bottle.
    if (inv.consume('water_bottle', 1)) { player.drink(); logLine('+ AGUA'); sfx.playPickup?.(); quests.track('drink_water', 1); }
    else logLine('Sin agua');
  }
  // NOTE: Build (Z) / Map (M) / Stash (X) están deshabilitados por ahora.
  // El user pidió priorizar otras cosas; el código sigue en
  // client/build.js, client/map.js, client/stash.js para reactivar después.
});

// Snapshot of the inventory state — inventory.js doesn't expose the raw
// state object, so we shadow it via the onChange listener.
let _shadowInvState = {};
inv.onChange((s) => { _shadowInvState = { ...s }; });
function _currentInvState() { return _shadowInvState; }

// =====================================================================
// Per-life stats — reset on respawn, displayed on the death screen.
// =====================================================================
let lifeStartedAt = performance.now();
let lifeKills = 0;
let lifeDamage = 0;
function resetLifeStats() {
  lifeStartedAt = performance.now();
  lifeKills = 0;
  lifeDamage = 0;
}
function showDeathStats() {
  const t = (performance.now() - lifeStartedAt) / 1000;
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  document.getElementById('dsTimeI').textContent = `${m}:${String(s).padStart(2, '0')}`;
  document.getElementById('dsKillsI').textContent = lifeKills | 0;
  document.getElementById('dsDmgI').textContent = lifeDamage | 0;
  document.getElementById('dsTotalI').textContent = profile.totalKills | 0;
}

// =====================================================================
// Settings menu — ESC during play. Saves to localStorage.
// =====================================================================
const SETTINGS_KEY = 'survival-fps-v1-settings';
const settings = (function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return Object.assign({ vol: 40, sens: 22, crosshair: true, minimap: true }, JSON.parse(raw));
  } catch {}
  return { vol: 40, sens: 22, crosshair: true, minimap: true };
})();
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }
function applySettings() {
  document.body.classList.toggle('no-crosshair', !settings.crosshair);
  document.body.classList.toggle('no-minimap', !settings.minimap);
  // Volume: sounds module has a setMaster() — fall back if not present.
  sfx.setMasterVolume?.(settings.vol / 100);
  // Mouse sensitivity drives a player.js exposed scalar.
  player.mouseSensitivity = settings.sens / 10;
}

// Bind UI controls.
const settingsMenu = document.getElementById('settingsMenu');
const setVol = document.getElementById('setVol');
const setVolN = document.getElementById('setVolN');
const setSens = document.getElementById('setSens');
const setSensN = document.getElementById('setSensN');
const setCross = document.getElementById('setCross');
const setMinimap = document.getElementById('setMinimap');
const setOk = document.getElementById('setOk');
function syncSettingsUI() {
  setVol.value = settings.vol; setVolN.textContent = settings.vol;
  setSens.value = settings.sens; setSensN.textContent = (settings.sens / 10).toFixed(1);
  setCross.checked = !!settings.crosshair;
  setMinimap.checked = !!settings.minimap;
}
syncSettingsUI();
applySettings();

setVol?.addEventListener('input', () => { settings.vol = +setVol.value; setVolN.textContent = settings.vol; applySettings(); saveSettings(); });
setSens?.addEventListener('input', () => { settings.sens = +setSens.value; setSensN.textContent = (settings.sens / 10).toFixed(1); applySettings(); saveSettings(); });
setCross?.addEventListener('change', () => { settings.crosshair = setCross.checked; applySettings(); saveSettings(); });
setMinimap?.addEventListener('change', () => { settings.minimap = setMinimap.checked; applySettings(); saveSettings(); });
setOk?.addEventListener('click', () => closeSettings());

function openSettings() {
  settingsMenu.classList.remove('hidden');
  document.exitPointerLock?.();
}
function closeSettings() {
  settingsMenu.classList.add('hidden');
  if (player.locked || player.hp > 0) {
    setTimeout(() => renderer.domElement.requestPointerLock?.(), 50);
  }
}

function handleHotbarSlot(slotIdx) {
  // Firearm slots: 0 pistol, 1 rifle, 7 shotgun, 8 sniper.
  if (slotIdx === 0 || slotIdx === 1 || slotIdx === 7 || slotIdx === 8) {
    if (slotIdx === 7 && !inv.has('shotgun_pickup', 1)) { logLine('Necesitás encontrar la escopeta'); return; }
    if (slotIdx === 8 && !inv.has('sniper_pickup', 1)) { logLine('Necesitás encontrar el rifle de francotirador'); return; }
    tools.setActiveTool(null);
    selectWeaponBySlot(slotIdx);
    setHotbarActive(slotIdx);
    return;
  }
  if (slotIdx === 2) {
    if (inv.useBandage(player)) {
      logLine('+30 HP (vendaje usado)');
      sfx.playPickup();
    }
    return;
  }
  if (slotIdx === 3) {
    setHotbarActive(3);
    return;
  }
  if (slotIdx === 4) {
    tools.setActiveTool('knife');
    setHotbarActive(4);
    return;
  }
  if (slotIdx === 5) {
    if (!inv.has('axe', 1)) { logLine('Necesitás craftear un hacha (3 madera + 2 piedra)'); return; }
    tools.setActiveTool('axe');
    setHotbarActive(5);
    return;
  }
  if (slotIdx === 6) {
    if (!inv.has('pickaxe', 1)) { logLine('Necesitás craftear un pico (2 madera + 4 piedra)'); return; }
    tools.setActiveTool('pickaxe');
    setHotbarActive(6);
    return;
  }
}

// =====================================================================
// Footstep ticker — plays a soft thump roughly every 0.45 s while moving.
// =====================================================================
let footAccum = 0;
let lastPlayerX = player.pos.x, lastPlayerZ = player.pos.z;
let _growlAccum = 0;

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
  knife.updateKnife(dt);
  network.update(dt);
  // Survival systems — fire flicker + nearFire flag for the player tick.
  survival.updateSurvival(dt);
  player.nearFire = survival.isNearAnyFire(player.pos.x, player.pos.z);
  player.tickSurvival(dt, isNightServer);
  player.regen(dt);
  status.tick(dt);             // sangrado / infección
  traps.update(dt);            // cepos chequean enemigos cercanos
  trader.update(dt, player.pos);
  setHP(player.hp);
  setSurvival(player.hunger, player.thirst, player.warmth);
  setCompass(player.yaw());

  // Death detection — see hp <= 0 even if onYouHit didn't fire on this tick.
  if (player.hp <= 0 && !deathEl.classList.contains('show')) {
    deathEl.classList.add('show');
    menuEl.style.display = 'none';
    document.exitPointerLock?.();
    showDeathStats();
  }

  // Zombie growl cue: every ~2.5 s, pick a random close hostile and play
  // a growl scaled by distance. Cheap atmospheric pressure.
  _growlAccum += dt;
  if (_growlAccum > 2.5) {
    _growlAccum = 0;
    const candidates = [];
    for (const e of enemies.values()) {
      if (e.sleeping) continue;
      const dx = e.mesh.position.x - player.pos.x;
      const dz = e.mesh.position.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 22 && (e.etype === 'zombie' || e.etype === 'runner' || e.etype === 'tank')) {
        candidates.push({ e, d });
      }
    }
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      sfx.playGrowl?.(pick.d);
    }
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

  // Interaction prompt — priority: crate > trader > plant > bush > lake > vehicle.
  if (player.locked && player.hp > 0) {
    const c = nearestInRange(player.pos);
    const tr = !c ? trader.nearestInRange(player.pos) : null;
    const plant = (!c && !tr) ? survival.nearestPlantInRange(player.pos) : null;
    const bush = (!c && !tr && !plant) ? survival.nearestBushInRange(player.pos) : null;
    const lake = (!c && !tr && !plant && !bush) ? survival.nearestLakeInRange(player.pos) : null;
    const vp = (!c && !tr && !plant && !bush && !lake) ? vehicle.nearbyVehiclePrompt(player.pos) : null;
    nearbyCrate = c || null;
    nearbyTrader = tr || null;
    nearbyPlant = plant || null;
    nearbyBush = bush || null;
    nearbyLake = lake || null;
    if (c) {
      const tier = c.localLoot ? 'item soltado'
                : c.tableKey === 'boss' ? 'cofre del DOCTOR'
                : c.tableKey === 'city' ? 'cofre del laboratorio'
                : c.tableKey === 'animal' ? 'restos del animal'
                : 'cofre';
      showInteract(c.localLoot ? `recoger ${tier}` : `abrir ${tier}`);
    } else if (tr) showInteract('hablar con el comerciante');
    else if (plant) showInteract('recoger planta medicinal');
    else if (bush) showInteract('recoger bayas');
    else if (lake) showInteract('rellenar botella');
    else if (vp) showInteract(vp.replace('[F]', '').trim());
    else hideInteract();
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
  // Survive-night tracking — al amanecer (06:00) marcamos quest.
  if (_lastClockHour < 6 && h >= 6 && h < 7) {
    quests.track('survive_night', 1);
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

  // ADS FOV lerp — sniper auto-zooms further while ADS held.
  const isSniper = getActiveWeapon() === 'sniper';
  const targetFov = _ads ? (isSniper ? 22 : ADS_FOV) : BASE_FOV;
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-15 * dt));
  camera.updateProjectionMatrix();

  // Recoil — tilt the camera up briefly each shot. We pile pitch onto a
  // local kick value that decays fast.
  const kick = consumeRecoil();
  if (kick > 0) _recoilKick += kick;
  if (_recoilKick > 0) {
    camera.rotation.x -= _recoilKick;
    _recoilKick *= Math.max(0, 1 - dt * 8);
    if (_recoilKick < 0.001) _recoilKick = 0;
  }

  // Grenade meshes — local physics interp until detonation. Server is
  // authoritative for damage; this is just visual smoothing between the
  // spawn and boom messages.
  for (const g of grenadeMeshes.values()) {
    g.fuse -= dt;
    g.vy -= 22 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.z += g.vz * dt;
    const ground = heightAt(g.x, g.z) + 0.18;
    if (g.y < ground) { g.y = ground; g.vy = -g.vy * 0.35; g.vx *= 0.7; g.vz *= 0.7; }
    g.mesh.position.set(g.x, g.y, g.z);
  }

  // Mini-map.
  renderMinimap();

  // Effects: tracers, decals, gore particles.
  updateEffects(dt);

  // Pulse the Helix Lab's red emergency lights + POI smoke pillars.
  updateCityLights(dt);
  updatePoi(dt);
  // build.updateBuild + updateMap pausados — ver nota arriba.

  // Sniper warning — show a red dot in HUD if any sci_sniper has us in
  // line of sight from > 35 m and is roughly facing us.
  updateSniperWarning(dt);

  tickFps(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
let _combatMusic = false;
let _recoilKick = 0;

// =====================================================================
// Achievements — one-shot toasts persisted in localStorage so they don't
// re-fire across sessions. Track ad-hoc IDs from gameplay events.
// =====================================================================
const ACH_KEY = 'survival-fps-v1-achievements';
const _achievementsUnlocked = (function loadAch() {
  try { return new Set(JSON.parse(localStorage.getItem(ACH_KEY) || '[]')); }
  catch { return new Set(); }
})();
function saveAchievements() {
  try { localStorage.setItem(ACH_KEY, JSON.stringify([..._achievementsUnlocked])); } catch {}
}
function unlockAchievement(id, label) {
  if (_achievementsUnlocked.has(id)) return;
  _achievementsUnlocked.add(id);
  saveAchievements();
  showAchievementToast(label);
}
function showAchievementToast(label) {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed', top: '120px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(40,30,10,0.92)', border: '1px solid #f0c060',
    color: '#f0c060', padding: '12px 26px', font: '700 14px system-ui',
    letterSpacing: '2px', zIndex: 9, opacity: '0',
    transition: 'opacity 0.4s, transform 0.4s', pointerEvents: 'none',
  });
  el.innerHTML = `★ LOGRO<br><span style="color:#fff;font-weight:400;font-size:12px;letter-spacing:1px;">${label}</span>`;
  document.body.appendChild(el);
  // Animate in.
  setTimeout(() => { el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(8px)'; }, 20);
  setTimeout(() => { el.style.opacity = '0'; }, 4000);
  setTimeout(() => el.remove(), 4500);
  sfx.playPickup?.();
}

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
