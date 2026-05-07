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
  setCompass,
} from './hud.js';
import * as knife from './knife.js';
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
  // Hotbar slot counts.
  setHotbarCount(0, state.bullet_p);
  setHotbarCount(1, state.bullet_r);
  setHotbarCount(2, state.bandage);
  setHotbarCount(3, state.grenade);
  setHotbarLocked(1, !state.rifle_pickup);
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
  setTimeout(() => renderer.domElement.requestPointerLock?.(), 50);
}
chatInput?.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') { e.preventDefault(); closeChat(true); }
  else if (e.code === 'Escape') { e.preventDefault(); closeChat(false); }
});
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
  setHP(player.hp);
  deathEl.classList.remove('show');
  resetLifeStats();
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
  // TAB inventory works even outside game.
  if (e.code === 'Tab') {
    e.preventDefault();
    toggleInventory();
    if (isInventoryOpen()) renderInventory(_currentInvState(), inv.ITEMS);
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
  if (slotIdx === 0 || slotIdx === 1) {
    // Pistol or rifle.
    knife.setKnifeActive(false);
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
    // Grenade selection — actual throw on G key. Just visual cue here.
    setHotbarActive(3);
    return;
  }
  if (slotIdx === 4) {
    // Knife — slot 5.
    knife.setKnifeActive(true);
    setHotbarActive(4);
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
  player.regen(dt);
  setHP(player.hp);
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

  // ADS FOV lerp.
  const targetFov = _ads ? ADS_FOV : BASE_FOV;
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-15 * dt));
  camera.updateProjectionMatrix();

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
