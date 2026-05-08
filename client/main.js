// Bootstrap — wire together world, player, network, entities, weapons, HUD,
// inventory, loot, sounds. Single game loop.

import { renderer, scene, camera, setTimeOfDay } from './three-setup.js';
import * as THREE from 'three';
import { heightAt, biomeAt } from './world.js';
import './world.js';                 // builds terrain + trees + rocks
import { player, updatePlayer } from './player.js';
import { network } from './network.js';
import { updateEntities } from './entities.js';
import { updateWeapons } from './weapons.js';
import {
  setHP, setOnlineCount, flashDamage, logLine, tickFps, showBanner,
  setInventory, showInteract, hideInteract,
  setClock, showDamageArrow, setStamina, flashHitMarker,
  setDay, setPlayerName, setHotbarActive, setHotbarCount, setHotbarLocked, paintHotbarSlot,
  setActiveWeapon, showReload, toggleInventory, isInventoryOpen, renderInventory,
  setCompass, setSurvival,
  setXp, setStatus, renderQuests,
  openTrader, closeTrader, isTraderOpen, refreshTraderScrap,
  openPerksPanel, closePerksPanel, isPerksOpen, setPerkPending,
  setDifficulty, setWeather,
  openStash, closeStash, isStashOpen,
  openStats, closeStats, isStatsOpen,
  setAmmoType,
} from './hud.js';
import * as survival from './survival.js';
import * as tools from './tools.js';
const knife = tools; // legacy alias — older code uses knife.updateKnife / setKnifeActive
import { updateCityLights, toggleColliderDebug } from './towns.js';
import { updatePoi } from './poi.js';
import * as build from './build.js';
import { toggleMap, isMapOpen, updateMap, noteSupplyDrop } from './map.js';
// stash.js (viejo) está deshabilitado — usamos stash-personal.js en su lugar.
import * as inv from './inventory.js';
import * as inventoryUI from './inventory-ui.js';
import * as sfx from './sounds.js';
import { nearestInRange, removeCrate } from './loot.js';
import { renderMinimap } from './minimap.js';
import {
  lastShotWithinKillWindow, getActive as getActiveWeapon,
  selectWeaponBySlot, selectWeapon, isReloading, activeWeaponMeta, consumeRecoil,
  setAimMode,
} from './weapons.js';
import { updateEffects, spawnBloodDecal, spawnGoreBurst } from './effects.js';
import { enemies, markDespawn, tickCorpses } from './entities.js';
import * as vehicle from './vehicle.js';
import * as progression from './progression.js';
import * as quests from './quests.js';
import * as status from './status.js';
import * as traps from './traps.js';
import * as trader from './trader.js';
import * as perks from './perks.js';
import * as ammoTypes from './ammo-types.js';
import * as flashlight from './flashlight.js';
import * as bedroll from './bedroll.js';
import * as dog from './dog.js';
import * as heliTrader from './heli-trader.js';
import * as hotbar from './hotbar.js';
import * as attachments from './attachments.js';
import * as smoke from './smoke.js';
import * as storm from './storm.js';
import * as flashbang from './flashbang.js';
import * as convoyPlane from './convoy-plane.js';
import * as stashPersonal from './stash-personal.js';
import * as nvg from './nvg.js';
import * as fishing from './fishing.js';
import * as screenShake from './screen-shake.js';
import * as magDrop from './mag-drop.js';
import * as weaponTiers from './weapon-tiers.js';
import { spawnAmbientProps, spawnDust, tickDust } from './ambient-props.js';
import * as farming from './farming.js';
import * as tutorial from './tutorial.js';
import { initBiomeParticles, tick as tickBiomeParticles } from './biome-particles.js';
import { setPeerPvP } from './entities.js';

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
  // Sync armor onto the player so takeDamage applies the reduction.
  player.armorState = { vest: !!state.vest_armor, helmet: !!state.helmet_armor };
  repaintHotbar();
});

// Repinta los 6 slots del cinturón según hotbar.getSlots() y el state
// del inventario actual. Llamado al inicio + en cada cambio de inv/hotbar.
function repaintHotbar() {
  const slots = hotbar.getSlots();
  const state = inv.getState();
  for (let i = 0; i < slots.length; i++) {
    const key = slots[i];
    const meta = key ? inv.ITEMS[key] : null;
    const count = key ? (state[key] | 0) : 0;
    paintHotbarSlot(i, key, count, meta);
  }
}
hotbar.onChange(repaintHotbar);

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

// Achievement chequeo en cambio de inventario — scrap acumulado, primera
// arma, primer cofre boss, etc.
inv.onChange((s) => {
  if ((s.scrap | 0) >= 100) unlockAchievement('scrap_100', 'Mercader — 100 chatarra');
  if ((s.scrap | 0) >= 500) unlockAchievement('scrap_500', 'Magnate — 500 chatarra');
  if (s.flashlight)         unlockAchievement('first_light', 'Iluminaste la noche');
  if (s.dog_collar)         unlockAchievement('best_friend', 'Conseguiste un perro aliado');
  if (s.sniper_pickup)      unlockAchievement('sniper_unlocked', 'Conseguiste un sniper');
});

// Perks: refresca badge + abre modal cuando hay pendiente al subir nivel.
perks.onChange((s) => setPerkPending(s.pending));

// Engancho level-up de progression para que dé perk pendiente cada 3 niveles.
const _origAddXp = progression.addXp;
progression.onChange((s) => {
  // Side-effect: detectar si subió de nivel reciente. Lo manejamos en el
  // wrapper de addXp más abajo (override directo para capturar leveledUp).
});
// Wrap addXp para detectar level-up sin tocar progression.js.
const _addXp = progression.addXp;
let _lastLevel = progression.getLevel();
function _checkLevelUp() {
  const cur = progression.getLevel();
  while (_lastLevel < cur) {
    _lastLevel++;
    perks.onLevelUp(_lastLevel);
  }
}
progression.onChange(_checkLevelUp);

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

// Stash personal — modal de cofre persistente. `stashId` identifica
// cuál de los stashes colocados estamos abriendo (ahora son múltiples).
let _openStashId = null;
function openStashPanel(stashId) {
  if (!stashId) return;
  _openStashId = stashId;
  _voluntaryUnlock = true;
  document.exitPointerLock?.();
  openStash(
    () => {
      // Lista plana de items del inv que se pueden depositar (con label).
      const out = [];
      const state = inv.getState();
      for (const [k, n] of Object.entries(state)) {
        if (typeof n !== 'number' || n <= 0) continue;
        const meta = inv.ITEMS[k];
        if (!meta || meta.noDrop) continue;
        out.push({ key: k, count: n, label: meta.label || k });
      }
      return out;
    },
    () => {
      const stash = stashPersonal.getById(_openStashId);
      if (!stash) return [];
      return stash.slots.map((s) => {
        if (!s) return null;
        const meta = inv.ITEMS[s.item];
        return { key: s.item, count: s.count, label: meta?.label || s.item };
      });
    },
    (key) => stashPersonal.deposit(_openStashId, key, 1),
    (idx) => stashPersonal.withdraw(_openStashId, idx, null),
    () => stashPersonal.withdrawAll(_openStashId),
    () => stashPersonal.destroy(_openStashId),
  );
}
function closeStashPanel() {
  closeStash();
  if (player.hp > 0) {
    setTimeout(() => {
      _voluntaryUnlock = false;
      renderer.domElement.requestPointerLock?.();
    }, 60);
  }
}

// Heli trader — usa el mismo modal que el trader normal pero con el
// catálogo SHOP del heli y BUY vacío (el heli no compra).
function openHeliTraderPanel() {
  _voluntaryUnlock = true;
  document.exitPointerLock?.();
  const refreshShow = () => {
    openTrader(
      heliTrader.HELI_SHOP, heliTrader.HELI_BUY, inv.get('scrap'),
      (offerId) => { heliTrader.tryBuy(offerId); refreshShow(); },
      () => {},
      (o) => { for (const k of Object.keys(o.give || {})) if (inv.ITEMS[k]?.oneTime && inv.has(k, 1)) return true; return false; },
    );
  };
  refreshShow();
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
addEventListener('mousedown', (e) => { if (e.button === 2 && !_grenadeMode) setADS(true); });
addEventListener('mouseup',   (e) => { if (e.button === 2) setADS(false); });
function setADS(on) {
  _ads = on;
  // La viñeta negra solo tiene sentido en sniper (efecto de óptica con
  // bordes oscuros). En pistola/rifle queda raro — usá las miras de
  // hierro o el reflex sight.
  const isSniperNow = getActiveWeapon() === 'sniper';
  if (scopeVignette) scopeVignette.classList.toggle('show', on && isSniperNow);
  setAimMode(on);
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

// Spawn ambient props (autos abandonados + cadáveres civiles + dust).
spawnAmbientProps();
spawnDust();
initBiomeParticles();
network.onYouHit = (dmg, src, source) => {
  player.takeDamage(dmg);
  setHP(player.hp);
  flashDamage();
  sfx.playPlayerHurt();
  screenShake.bump(Math.min(0.6, dmg / 50));
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
network.onDifficulty = (day, mul) => {
  setDifficulty(day, mul);
};
network.onWeather = (msg) => {
  setWeather(msg.kind);
  player.weatherKind = msg.kind;
};
network.onHeliTrader = (msg) => {
  if (msg.state === 'arrive') {
    heliTrader.spawn(msg.x, msg.z, msg.expiresAt);
  } else if (msg.state === 'leave') {
    heliTrader.despawn();
  }
};
network.onStorm = (msg) => {
  storm.setFromServer(msg);
  if (msg.state === 'warning') sfx.playBossSting?.();
};
network.onFlashbang = (msg) => {
  flashbang.onServerFlash(msg);
};
network.onConvoy = (msg) => {
  sfx.playBossSting?.();
  if (msg && msg.dirX != null) {
    convoyPlane.spawn(msg.x, msg.z, msg.dirX, msg.dirZ);
  }
};
network.onLightning = (msg) => {
  // White flash overlay (similar al flashbang pero más corto + sound).
  const overlay = document.getElementById('flashOverlay');
  const dx = (player.pos?.x || 0) - msg.x;
  const dz = (player.pos?.z || 0) - msg.z;
  const d = Math.hypot(dx, dz);
  if (overlay && d < 200) {
    const intensity = Math.max(0.2, 1 - d / 200);
    overlay.style.opacity = String(0.85 * intensity);
    overlay.classList.add('show');
    setTimeout(() => {
      overlay.classList.remove('show');
      overlay.style.opacity = '0';
    }, 250);
  }
  sfx.playBossSting?.();
};
let _localPvP = false;
network.onPvpStatus = (on) => {
  _localPvP = !!on;
  showBanner(on ? '★ PVP ACTIVADO ★' : 'PvP desactivado', 1500);
  logLine(on ? 'Estás en modo PvP — otros con PvP on pueden atacarte' : 'PvP desactivado');
};
network.onPeerPvp = (id, on) => {
  setPeerPvP(id, !!on);
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
    const isZombieKind = ['zombie','runner','tank','brute','spitter','screamer','exploder','bilebomber'].includes(kind);
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
  } else if (['spitter','screamer','exploder','bilebomber'].includes(kind)) {
    if (Math.random() < 0.55) inv.add('scrap', 1 + Math.floor(Math.random() * 2));
  } else if (['zombie','runner','tank'].includes(kind)) {
    if (Math.random() < 0.3) inv.add('scrap', 1);
  }
  // Achievement milestones.
  if (profile.totalKills === 1)   unlockAchievement('first_kill', 'Primera baja');
  if (profile.totalKills === 10)  unlockAchievement('ten_kills', '10 enemigos eliminados');
  if (profile.totalKills === 50)  unlockAchievement('fifty_kills', 'Cazador — 50 enemigos');
  if (profile.totalKills === 100) unlockAchievement('hundred_kills', 'Veterano — 100 enemigos');
  if (profile.totalKills === 200) unlockAchievement('devastator', 'Devastador — 200 enemigos');
  if (profile.totalKills === 500) unlockAchievement('apocalyptic', 'Apocalíptico — 500 enemigos');
  // Por tipo de enemigo — track set de tipos matados.
  if (kind === 'brute')      unlockAchievement('brute_down', 'Mataste un Brute');
  if (kind === 'screamer')   unlockAchievement('screamer_down', 'Silenciaste un Screamer');
  if (kind === 'spitter')    unlockAchievement('spitter_down', 'Mataste un Spitter');
  if (kind === 'exploder')   unlockAchievement('exploder_down', 'Liquidaste un Exploder');
  if (kind === 'bear')       unlockAchievement('bear_hunter', 'Cazaste un oso');
  if (kind === 'wolf')       unlockAchievement('wolf_hunter', 'Cazaste un lobo');
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
    screenShake.bump(msg.isBoss ? 0.7 : 0.35);
    screenShake.showKillFeedback(msg.isBoss ? '★ BOSS DOWN ★' : '✗');
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
  // Tier rolling para cualquier weapon_pickup recibido.
  weaponTiers.applyLootTiers(loot);
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
  // Tutorial deshabilitado por ahora — tenía bugs. Reactivar cuando se
  // arregle el flow de los pasos.
  // setTimeout(() => tutorial.start(), 1500);
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
  // Si tenés bedroll colocado, respawneás ahí (manda coords al server).
  const bp = bedroll.getPos();
  if (bp) {
    network.respawn({ x: bp.x, z: bp.z });
    // Mover el player local también para evitar el flash en (0,0).
    player.pos.set(bp.x, heightAt(bp.x, bp.z) + 1.65, bp.z);
    logLine('★ Despertaste en tu cama');
  } else {
    network.respawn();
  }
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
let nearbyHeli = null;
let nearbyStash = null;
let nearbyFarmPlant = null;

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
    tutorial.trigger?.('tab');
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
  // Granada modo — G entra/sale del modo. En modo granada:
  //   click DERECHO mantenido = cocinar (empieza al apretar)
  //   click IZQUIERDO = tirar con cooking_t actual
  //   Si pasan 3.5s cocinando sin tirar, te explota en la mano.
  if (e.code === 'KeyG' && player.locked && !e.repeat) {
    if (!_grenadeMode) {
      if (!inv.has('grenade', 1)) {
        logLine('Sin granadas');
        return;
      }
      _grenadeMode = true;
      _cookingGrenade = false;
      player.grenadeMode = true;
      logLine('Granada equipada — click derecho cocina, click izquierdo tira (G para guardar)');
    } else {
      _grenadeMode = false;
      _cookingGrenade = false;
      player.grenadeMode = false;
      logLine('Granada guardada');
    }
    return;
  }
  // Cierre de modales con E — antes del check de pointer lock, porque al
  // abrir el stash/trader el cursor está libre (player.locked == false).
  if (e.code === 'KeyE' && isStashOpen()) { closeStashPanel(); return; }
  if (e.code === 'KeyE' && isTraderOpen()) { closeTraderPanel(); return; }
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
  } else if (e.code === 'KeyE' && nearbyHeli && !isTraderOpen()) {
    openHeliTraderPanel();
    hideInteract();
  } else if (e.code === 'KeyE' && nearbyStash && !isStashOpen()) {
    openStashPanel(nearbyStash.id);
    hideInteract();
  } else if (e.code === 'KeyE' && nearbyFarmPlant) {
    farming.harvest(nearbyFarmPlant.id);
    nearbyFarmPlant = null;
    hideInteract();
  } else if (e.code === 'KeyQ' && !e.repeat) {
    // Cycle ammo type del arma activa.
    ammoTypes.cycleAmmo(getActiveWeapon());
  } else if (e.code === 'KeyO' && !e.repeat) {
    // Linterna toggle.
    flashlight.toggle();
  } else if (e.code === 'KeyZ' && !e.repeat) {
    // Bedroll: coloca tu punto de respawn en el suelo frente al jugador.
    if (!inv.has('bedroll_item', 1)) {
      logLine('Necesitás una cama (loot raro)');
    } else {
      const yaw = player.yaw();
      const fx = player.pos.x + Math.sin(yaw) * -1.6;
      const fz = player.pos.z + Math.cos(yaw) * -1.6;
      if (bedroll.placeAt(fx, fz)) {
        network.setSpawn(fx, fz);
      }
    }
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
    // Si tenés caña, pescá. Sino llená botella.
    if (inv.has('fishing_rod', 1)) {
      fishing.startFishing();
    } else if (inv.add('water_bottle', 1) || true) {
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
  } else if (e.code === 'KeyV' && !e.repeat) {
    // Granada de humo — cobertura visual.
    if (inv.consume('smoke_grenade', 1)) {
      smoke.throwSmoke();
    } else {
      logLine('Sin granadas de humo');
    }
  } else if (e.code === 'KeyX' && !e.repeat) {
    // Granada flashbang — ciega enemigos cercanos 3s.
    if (inv.consume('flashbang', 1)) {
      flashbang.throwFlashbang();
    } else {
      logLine('Sin granadas flashbang');
    }
  } else if (e.code === 'F2' && !e.repeat) {
    // PvP toggle — ambos players con PvP on pueden dañarse entre sí.
    network.togglePvP();
  } else if (e.code === 'F3' && !e.repeat) {
    // Stats panel — totales locales de la partida + perfil.
    e.preventDefault();
    if (isStatsOpen()) {
      closeStats();
      if (player.hp > 0) setTimeout(() => { _voluntaryUnlock = false; renderer.domElement.requestPointerLock?.(); }, 60);
    } else {
      _voluntaryUnlock = true;
      document.exitPointerLock?.();
      const lvl = progression.getLevel();
      const xp = progression.getXp();
      openStats([
        ['NIVEL', lvl],
        ['XP TOTAL', xp],
        ['BAJAS TOTALES', profile.totalKills | 0],
        ['DIAS SOBREVIVIDOS', profile.daysSurvived | 0],
        ['BAJAS ESTA SESION', lifeKills | 0],
        ['CHATARRA ACTUAL', inv.get('scrap') | 0],
        ['NIVEL DE DIA ACTUAL', inSessionDay],
        ['JUGADOR', profile.name || '—'],
      ]);
    }
  } else if (e.code === 'Digit0' && !e.repeat) {
    // NVG toggle (visión nocturna).
    nvg.toggle();
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
    // Abrir / cerrar panel de perks. Solo si hay perks pendientes O ya
    // está abierto (para poder cerrarlo).
    if (isPerksOpen()) {
      closePerksPanel();
      if (player.hp > 0) {
        setTimeout(() => { _voluntaryUnlock = false; renderer.domElement.requestPointerLock?.(); }, 60);
      }
    } else if (perks.getPendingCount() > 0) {
      const opts = perks.pickThreeOptions();
      _voluntaryUnlock = true;
      document.exitPointerLock?.();
      openPerksPanel(opts, (id) => {
        perks.choosePerk(id);
        // Si quedan más perks pendientes, re-render con nuevas opciones.
        if (perks.getPendingCount() > 0) {
          openPerksPanel(perks.pickThreeOptions(), (id2) => perks.choosePerk(id2));
        } else {
          closePerksPanel();
          if (player.hp > 0) setTimeout(() => { _voluntaryUnlock = false; renderer.domElement.requestPointerLock?.(); }, 60);
        }
      });
    } else {
      logLine('No hay perks disponibles. Subí de nivel.');
    }
  } else if (e.code === 'KeyY' && !e.repeat) {
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

// Activa el slot `idx` del cinturón. La acción depende del item asignado.
// Si el slot está vacío, no hace nada. Si el item requiere un pickup
// (rifle/shotgun/etc) y no lo tenés, lo decimos.
function handleHotbarSlot(slotIdx) {
  const itemKey = hotbar.getSlot(slotIdx);
  if (!itemKey) {
    logLine(`Slot ${slotIdx + 1} vacío — arrastrá un item del inventario`);
    return;
  }
  // Mapeo item → acción.
  // ARMAS DE FUEGO (pickup): equipar el arma correspondiente.
  if (itemKey === 'pistol_pickup' || itemKey === 'bullet_p') {
    tools.setActiveTool(null);
    selectWeaponBySlot(0);
    setHotbarActive(slotIdx);
    return;
  }
  if (itemKey === 'rifle_pickup' || itemKey === 'bullet_r') {
    if (!inv.has('rifle_pickup', 1)) { logLine('Necesitás un rifle'); return; }
    tools.setActiveTool(null);
    selectWeaponBySlot(1);
    setHotbarActive(slotIdx);
    return;
  }
  if (itemKey === 'smg_pickup' || itemKey === 'bullet_smg') {
    if (!inv.has('smg_pickup', 1)) { logLine('Necesitás un SMG'); return; }
    tools.setActiveTool(null);
    selectWeaponBySlot(2); // sin slot fijo — usá selectWeapon directo
    return;
  }
  if (itemKey === 'shotgun_pickup' || itemKey === 'shell') {
    if (!inv.has('shotgun_pickup', 1)) { logLine('Necesitás una escopeta'); return; }
    tools.setActiveTool(null);
    selectWeaponBySlot(7);
    setHotbarActive(slotIdx);
    return;
  }
  if (itemKey === 'sniper_pickup' || itemKey === 'sniper_round') {
    if (!inv.has('sniper_pickup', 1)) { logLine('Necesitás un sniper'); return; }
    tools.setActiveTool(null);
    selectWeaponBySlot(8);
    setHotbarActive(slotIdx);
    return;
  }
  if (itemKey === 'crossbow_pickup' || itemKey === 'bolt') {
    if (!inv.has('crossbow_pickup', 1)) { logLine('Necesitás una ballesta'); return; }
    tools.setActiveTool(null);
    selectWeapon('crossbow');
    setHotbarActive(slotIdx);
    return;
  }
  // HERRAMIENTAS MELEE.
  if (itemKey === 'axe') {
    if (!inv.has('axe', 1)) { logLine('Necesitás un hacha'); return; }
    tools.setActiveTool('axe');
    setHotbarActive(slotIdx);
    return;
  }
  if (itemKey === 'pickaxe') {
    if (!inv.has('pickaxe', 1)) { logLine('Necesitás un pico'); return; }
    tools.setActiveTool('pickaxe');
    setHotbarActive(slotIdx);
    return;
  }
  // Cuchillo — sin pickup necesario, siempre disponible si el jugador lo
  // asigna al hotbar. Asumimos un item virtual 'knife' (no en inv).
  if (itemKey === 'knife') {
    tools.setActiveTool('knife');
    setHotbarActive(slotIdx);
    return;
  }
  // CONSUMIBLES.
  if (itemKey === 'bandage') {
    if (inv.useBandage(player)) { logLine('+30 HP (vendaje)'); sfx.playPickup(); status.stopBleeding(); }
    return;
  }
  if (itemKey === 'antibiotics') { status.tryAntibiotics(); return; }
  if (itemKey === 'meat_cooked') {
    if (inv.consume('meat_cooked', 1)) { player.eat('meat_cooked'); logLine('+ CARNE COCIDA'); sfx.playPickup(); quests.track('eat_food', 1); }
    return;
  }
  if (itemKey === 'meat_raw') {
    if (inv.consume('meat_raw', 1)) { player.eat('meat_raw'); logLine('+ CARNE CRUDA (-5 HP)'); sfx.playPickup(); quests.track('eat_food', 1); }
    return;
  }
  if (itemKey === 'berry') {
    if (inv.consume('berry', 1)) { player.eat('berry'); logLine('+ BAYAS'); sfx.playPickup(); quests.track('eat_food', 1); }
    return;
  }
  if (itemKey === 'water_bottle') {
    if (inv.consume('water_bottle', 1)) { player.drink(); logLine('+ AGUA'); sfx.playPickup(); quests.track('drink_water', 1); }
    return;
  }
  // GRANADA — solo selecciona el slot. G la tira realmente.
  if (itemKey === 'grenade') {
    if (!inv.has('grenade', 1)) { logLine('Sin granadas'); return; }
    setHotbarActive(slotIdx);
    logLine('Granada lista — G para lanzar');
    return;
  }
  // PLACEABLES — colocar al frente.
  if (itemKey === 'campfire') {
    if (inv.consume('campfire', 1)) {
      survival.placeFire(player.pos.x, player.pos.z);
      logLine('Hoguera colocada');
      sfx.playPickup();
    } else logLine('Sin hogueras (crafteable)');
    return;
  }
  if (itemKey === 'bear_trap') {
    if (inv.consume('bear_trap', 1)) {
      const yaw = player.yaw();
      const fx = player.pos.x + Math.sin(yaw) * -1.5;
      const fz = player.pos.z + Math.cos(yaw) * -1.5;
      traps.placeTrap(fx, fz);
    } else logLine('Sin cepos');
    return;
  }
  if (itemKey === 'bedroll_item') {
    if (!inv.has('bedroll_item', 1)) { logLine('Sin camas'); return; }
    const yaw = player.yaw();
    const fx = player.pos.x + Math.sin(yaw) * -1.6;
    const fz = player.pos.z + Math.cos(yaw) * -1.6;
    if (bedroll.placeAt(fx, fz)) network.setSpawn(fx, fz);
    return;
  }
  if (itemKey === 'flashlight') { flashlight.toggle(); return; }
  if (itemKey === 'dog_collar') {
    if (dog.isSummoned()) { logLine('Ya tenés un perro'); return; }
    if (inv.consume('dog_collar', 1)) dog.tryUseCollar();
    return;
  }
  logLine(`Item "${inv.ITEMS[itemKey]?.label || itemKey}" no se puede usar desde el hotbar`);
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
  player.biome = biomeAt(player.pos.x, player.pos.z);
  player.tickSurvival(dt, isNightServer);
  player.regen(dt);
  status.tick(dt);             // sangrado / infección
  traps.update(dt);            // cepos chequean enemigos cercanos
  trader.update(dt, player.pos);
  flashlight.tick();
  dog.update(dt);
  heliTrader.update(dt);
  smoke.update(dt);
  storm.tickHud();
  flashbang.tick();
  convoyPlane.update(dt);
  tickCorpses(dt);
  nvg.tick();
  fishing.tick();
  magDrop.tick(dt);
  screenShake.tick(dt);
  tickDust(dt, player.pos);
  tickBiomeParticles(dt, player.pos);
  farming.tick();
  // Cocinar granada — si llega a COOK_MAX, te explota en la mano.
  if (_cookingGrenade) {
    const cookT = performance.now() / 1000 - _cookingStart;
    if (cookT >= COOK_MAX) {
      _cookingGrenade = false;
      if (inv.consume?.('grenade', 1)) {
        player.takeDamage(80);
        setHP(player.hp);
        flashDamage();
        screenShake.bump(0.9);
        logLine('★★★ Te explotó la granada en la mano ★★★');
        sfx.playKill?.();
      }
    }
  }
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

  // Interaction prompt — priority: crate > trader > heli > stash > farm > plant > bush > lake > vehicle.
  if (player.locked && player.hp > 0) {
    const c = nearestInRange(player.pos);
    const tr = !c ? trader.nearestInRange(player.pos) : null;
    const heli = (!c && !tr) ? heliTrader.nearestInRange(player.pos) : null;
    const sta = (!c && !tr && !heli) ? stashPersonal.nearestInRange(player.pos) : null;
    const fp = (!c && !tr && !heli && !sta) ? farming.nearestInRange(player.pos) : null;
    const plant = (!c && !tr && !heli && !sta && !fp) ? survival.nearestPlantInRange(player.pos) : null;
    const bush = (!c && !tr && !heli && !sta && !fp && !plant) ? survival.nearestBushInRange(player.pos) : null;
    const lake = (!c && !tr && !heli && !sta && !fp && !plant && !bush) ? survival.nearestLakeInRange(player.pos) : null;
    const vp = (!c && !tr && !heli && !sta && !fp && !plant && !bush && !lake) ? vehicle.nearbyVehiclePrompt(player.pos) : null;
    nearbyCrate = c || null;
    nearbyTrader = tr || null;
    nearbyHeli = heli || null;
    nearbyStash = sta || null;
    nearbyFarmPlant = fp || null;
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
    else if (heli) showInteract('comerciar con el heli');
    else if (sta) showInteract('abrir stash personal');
    else if (fp) showInteract('cosechar planta');
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
    if (profile.daysSurvived === 3)  unlockAchievement('survive_3', 'Sobreviviste 3 días');
    if (profile.daysSurvived === 7)  unlockAchievement('survive_7', 'Superviviente — 7 días');
    if (profile.daysSurvived === 14) unlockAchievement('survive_14', 'Resistencia — 14 días');
  }
  // Survive-night tracking — al amanecer (06:00) marcamos quest.
  if (_lastClockHour < 6 && h >= 6 && h < 7) {
    quests.track('survive_night', 1);
  }
  _lastClockHour = h;
  setDay(inSessionDay);

  // Active weapon HUD + hotbar visual.
  const meta = activeWeaponMeta();
  // Tier color del arma activa.
  const activeName = getActiveWeapon();
  const tierMeta = activeName ? weaponTiers.getTierMeta(activeName) : null;
  setActiveWeapon(meta.name, meta.loaded, { tierColor: tierMeta?.color });
  // Ammo type HUD.
  const ammoMetaActive = activeName ? ammoTypes.getActiveAmmo(activeName) : null;
  if (ammoMetaActive) setAmmoType(ammoMetaActive.type, ammoMetaActive.label);
  else setAmmoType('normal', '');
  // setHotbarActive ahora se llama desde handleHotbarSlot al seleccionar
  // un slot — no forzamos slots fijos por arma (todo es configurable).
  showReload(isReloading());

  // Stamina HUD bar.
  setStamina(player.stamina ?? 100);

  // Combat music mode — flip to combat when player has been hit recently.
  // Falls back to day/night otherwise.
  const inCombat = (performance.now() / 1000 - (player.lastHitAt || 0)) < 4;
  if (inCombat && !_combatMusic) { _combatMusic = true; sfx.setMusicMode?.('combat'); }
  else if (!inCombat && _combatMusic) { _combatMusic = false; sfx.setMusicMode?.(isNightServer ? 'night' : 'day'); }

  // Ambient soundscape — viento ocasional + gemido lejano random según
  // contexto (más frecuente de noche). No suenan durante hordas activas
  // (ya hay mucho audio).
  _ambientAccum += dt;
  if (player.locked && player.hp > 0 && _ambientAccum > _nextAmbientAt) {
    _ambientAccum = 0;
    const isNightNow = isNightServer;
    const r = Math.random();
    if (r < 0.55) {
      sfx.playWindGust?.();
      _nextAmbientAt = 8 + Math.random() * 6;
    } else if (r < 0.85 && (isNightNow || Math.random() < 0.5)) {
      // Distance random 30-100m para variedad de cercanía.
      const dist = 30 + Math.random() * 70;
      sfx.playDistantMoan?.(dist);
      _nextAmbientAt = isNightNow ? (10 + Math.random() * 8) : (18 + Math.random() * 12);
    } else {
      sfx.playLeafRustle?.();
      _nextAmbientAt = 12 + Math.random() * 8;
    }
  }

  // ADS FOV lerp — sniper auto-zooms further while ADS held.
  // Mirilla equipada: reduce el FOV de ADS (más zoom = más precisión) en
  // todas las armas que no sean sniper (que ya tiene zoom intrínseco).
  const isSniper = getActiveWeapon() === 'sniper';
  const hasScope = attachments.has(getActiveWeapon(), 'scope');
  const adsFov = isSniper ? 22 : (hasScope ? 32 : ADS_FOV);
  const targetFov = _ads ? adsFov : BASE_FOV;
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
let _ambientAccum = 0;
let _nextAmbientAt = 6;
let _grenadeMode = false;
let _cookingGrenade = false;
let _cookingStart = 0;
const COOK_MAX = 3.5;
const COOK_FUSE_BASE = 2.4;

// Click derecho mantenido en modo granada = cocinar. setADS sigue siendo
// el handler para apuntar cuando NO estás en modo granada.
addEventListener('mousedown', (e) => {
  if (e.button === 2 && _grenadeMode && !_cookingGrenade) {
    _cookingGrenade = true;
    _cookingStart = performance.now() / 1000;
    logLine('Cocinando granada...');
  } else if (e.button === 0 && _grenadeMode) {
    // Click izquierdo en modo granada = tirar.
    if (inv.consume?.('grenade', 1)) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const cookT = _cookingGrenade ? (performance.now() / 1000 - _cookingStart) : 0;
      const yArc = Math.max(0.05, 0.25 - cookT * 0.05);
      network.throwGrenade(dir.x, dir.y + yArc, dir.z);
      sfx.playEmpty?.();
      logLine(`Granada lanzada${cookT > 0.2 ? ` (cocinada ${cookT.toFixed(1)}s)` : ''}`);
    }
    // Salir del modo granada. Si tenés más, podés volver a entrar con G.
    _cookingGrenade = false;
    _grenadeMode = false;
    player.grenadeMode = false;
  }
});
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
