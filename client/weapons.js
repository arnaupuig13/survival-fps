// Weapons: pistol + rifle. Each is a raycast hit-scan weapon. On click,
// raycast against zombie meshes; if it hits, send `shoot` to server with
// hit zombie id and damage. Server applies the damage.

import * as THREE from 'three';
import { camera, scene } from './three-setup.js';
import { enemies } from './entities.js';
import { network } from './network.js';
import { player } from './player.js';
import * as inv from './inventory.js';
import * as sfx from './sounds.js';
import { spawnTracer, spawnDamageNumber, spawnBulletHole } from './effects.js';
import { scene as worldScene } from './three-setup.js';
import * as ammoTypes from './ammo-types.js';
import { getActiveTool } from './tools.js';

// Each weapon names the inventory key it consumes per shot. magazineSize
// caps the loaded round count; reload pulls from the inventory pool.
//
// shotgun fires `pellets` per shot at high spread.
// sniper has a slow cooldown but huge damage; auto-zooms when ADS held.
const WEAPONS = {
  pistol:  { dmg: 4,  cooldown: 0.5,  range: 50,  auto: false, name: 'PISTOLA',     ammo: 'bullet_p',     magazineSize: 12, reloadTime: 1.2, aggroRange: 18 },
  rifle:   { dmg: 6,  cooldown: 0.12, range: 100, auto: true,  name: 'RIFLE',       ammo: 'bullet_r',     requires: 'rifle_pickup',   magazineSize: 30, reloadTime: 1.8, aggroRange: 32 },
  smg:     { dmg: 3,  cooldown: 0.07, range: 70,  auto: true,  name: 'SMG',         ammo: 'bullet_smg',   requires: 'smg_pickup',     magazineSize: 35, reloadTime: 2.0, aggroRange: 24 },
  shotgun: { dmg: 5,  cooldown: 0.85, range: 35,  auto: false, name: 'ESCOPETA',    ammo: 'shell',        requires: 'shotgun_pickup', magazineSize: 6,  reloadTime: 2.4, aggroRange: 30, pellets: 8, spread: 0.18 },
  sniper:  { dmg: 90, cooldown: 1.6,  range: 220, auto: false, name: 'SNIPER',      ammo: 'sniper_round', requires: 'sniper_pickup',  magazineSize: 5,  reloadTime: 2.8, aggroRange: 42 },
};

// =====================================================================
// State
// =====================================================================
let active = 'pistol';
let cooldown = 0;
let mouseDown = false;
const loaded = { pistol: 12, rifle: 0, smg: 0, shotgun: 0, sniper: 0 };
let reloading = false;
let reloadTimer = 0;
const ray = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

// Visible weapon stub in front of camera — a simple gun-shaped box for now.
// Material is kept brightish + emissive so it reads even when the player is
// in shade. Adding a small camera-attached light avoids the "huge black box"
// look caused by the arm being entirely in the directional light's shadow.
const gunGroup = new THREE.Group();
const gunBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.12, 0.36),
  new THREE.MeshStandardMaterial({ color: 0x6a6a72, roughness: 0.55, metalness: 0.4, emissive: 0x111114 }),
);
gunBody.position.set(0.18, -0.18, -0.45);
gunGroup.add(gunBody);
// Barrel — slightly slimmer cylinder protruding forward.
const barrel = new THREE.Mesh(
  new THREE.CylinderGeometry(0.022, 0.022, 0.22, 8),
  new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.4, metalness: 0.85 }),
);
barrel.rotation.x = Math.PI / 2;
barrel.position.set(0.18, -0.18, -0.7);
gunGroup.add(barrel);

const muzzle = new THREE.PointLight(0xffaa44, 0, 4);
muzzle.position.set(0.18, -0.16, -0.82);
gunGroup.add(muzzle);

// Always-on small fill light attached to the camera so weapon and nearby
// objects get a baseline read regardless of sun direction.
const camFill = new THREE.PointLight(0xfff0d8, 0.5, 6, 1.5);
camFill.position.set(0, 0, 0);
gunGroup.add(camFill);

camera.add(gunGroup);
scene.add(camera); // make sure camera is in scene so its children render

// =====================================================================
// Input
// =====================================================================
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') startReload();
  // Hotbar weapon select happens via main.js (handleHotbarSlot calls
  // selectWeaponBySlot). Direct number keys here would conflict.
});

function selectWeapon(name) {
  const cfg = WEAPONS[name];
  if (!cfg) return;
  if (cfg.requires && !inv.has(cfg.requires, 1)) return;
  if (reloading) cancelReload();
  active = name; updateGunVisual();
}
export function getActive() { return active; }
export function getLoaded() { return loaded[active] | 0; }
export function isReloading() { return reloading; }

function startReload() {
  if (reloading) return;
  const cfg = WEAPONS[active];
  if (!cfg) return;
  if ((loaded[active] | 0) >= cfg.magazineSize) return; // already full
  if (!inv.has(cfg.ammo, 1)) return;                    // no ammo to load
  reloading = true;
  // Perk INGENIERO acorta tiempo de recarga (reloadSpeedMult <1).
  reloadTimer = cfg.reloadTime * (player.reloadSpeedMult || 1);
  sfx.playEmpty?.(); // mechanical click stand-in
}
function cancelReload() { reloading = false; reloadTimer = 0; }
function finishReload() {
  const cfg = WEAPONS[active];
  if (!cfg) return;
  // Extended-mag attachment increases capacity by 50%.
  const cap = inv.has('ext_mag', 1) ? Math.round(cfg.magazineSize * 1.5) : cfg.magazineSize;
  const need = cap - (loaded[active] | 0);
  const got = Math.min(need, inv.get(cfg.ammo));
  if (got > 0) {
    loaded[active] = (loaded[active] | 0) + got;
    inv.remove(cfg.ammo, got);
  }
  reloading = false;
  reloadTimer = 0;
}
addEventListener('mousedown', (e) => { if (e.button === 0) { mouseDown = true; tryFire(); } });
addEventListener('mouseup',   (e) => { if (e.button === 0)   mouseDown = false; });

function updateGunVisual() {
  // Different size per weapon — visual cue only.
  if (active === 'rifle') {
    gunBody.scale.set(1, 1, 1.6);
  } else {
    gunBody.scale.set(1, 1, 1);
  }
}

function tryFire() {
  if (!player.locked || player.hp <= 0) return;
  if (cooldown > 0 || reloading) return;
  // Si hay una herramienta melee activa (cuchillo/hacha/pico), NO disparamos
  // — ese click corresponde al swing manejado por tools.js. Esto evita
  // disparar la pistola con el hacha en la mano.
  if (getActiveTool()) return;
  const cfg = WEAPONS[active];
  // Resuelve el tipo de munición activo. Si elegiste especial pero no
  // tenés stock, fallback automático a normal.
  ammoTypes.fallbackToAvailable(active);
  const ammoMeta = ammoTypes.getActiveAmmo(active) || { type: 'normal', item: cfg.ammo };
  const isSpecial = ammoMeta.type !== 'normal';

  // God mode bypasses ammo entirely — never reload, never run dry.
  if (!player.godMode) {
    if (isSpecial) {
      // Munición especial NO usa cargador — consumís directo del pool.
      if (!inv.has(ammoMeta.item, 1)) {
        sfx.playEmpty();
        cooldown = 0.25;
        mouseDown = false;
        return;
      }
      inv.remove(ammoMeta.item, 1);
    } else {
      if ((loaded[active] | 0) <= 0) {
        if (inv.has(cfg.ammo, 1)) {
          startReload();
        } else {
          sfx.playEmpty();
          cooldown = 0.25;
          mouseDown = false;
        }
        return;
      }
      loaded[active] = (loaded[active] | 0) - 1;
    }
  }
  cooldown = cfg.cooldown;
  // Sound — silencer mutes the report. Picks per weapon kind.
  const silent = inv.has('silencer', 1) && (active === 'pistol' || active === 'smg');
  if (silent) sfx.playEmpty?.();
  else if (active === 'rifle' || active === 'sniper') sfx.playRifle(0);
  else sfx.playPistol(0);
  // Recoil — pitch the camera up a bit, scaled by weapon damage.
  pendingRecoil += cfg.dmg * 0.0015 + (active === 'sniper' ? 0.05 : 0);

  // Build raycast from camera center, transformed into world space.
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  ray.set(_origin, _dir);
  ray.far = cfg.range;

  // Build candidate list: every enemy's mesh subtree.
  const candidates = [];
  const eMap = new Map();
  for (const [id, e] of enemies) {
    e.mesh.traverse(c => { if (c.isMesh) { candidates.push(c); eMap.set(c, id); } });
  }

  // Wider raycast against scene as fallback for surface hits — used to
  // place bullet holes when we miss enemies (we don't want to miss-trace
  // through the world). We cap recursive=true so building children count.
  const hits = ray.intersectObjects(candidates, false);
  let hitId = null;
  let isHeadshot = false;
  let hitPoint = null;
  if (hits.length > 0) {
    const hit = hits[0];
    hitPoint = hit.point;
    let obj = hit.object;
    while (obj && !eMap.has(obj)) obj = obj.parent;
    if (obj) {
      hitId = eMap.get(obj);
      const enemyEntry = enemies.get(hitId);
      if (enemyEntry) {
        const localY = hit.point.y - enemyEntry.mesh.position.y;
        isHeadshot = localY >= 1.45;
      }
    }
  } else {
    // No enemy hit — second raycast against the whole scene to place a
    // bullet hole on whatever the player shot.
    const rs = new THREE.Raycaster(_origin.clone(), _dir.clone(), 0.2, cfg.range);
    const sceneHits = rs.intersectObjects(worldScene.children, true);
    if (sceneHits.length > 0) {
      const sh = sceneHits[0];
      // Skip our own gun mesh + camera-attached helpers (they sit very close).
      if (sh.distance > 0.4 && sh.face) {
        const normal = sh.face.normal.clone();
        normal.transformDirection(sh.object.matrixWorld);
        spawnBulletHole(sh.point, normal);
      }
    }
  }

  // Final damage. Perks: gunDamageMult (gunslinger), headshotMult (eagle_eye).
  // Munición especial: AP +30% dmg, INC marca burn al server.
  const hsMul = (player.headshotMult || 2.0);
  const gunMul = (player.gunDamageMult || 1);
  const ammoDmgMul = ammoMeta.dmgMul || 1;
  const finalDmg = Math.round((isHeadshot ? cfg.dmg * hsMul : cfg.dmg) * gunMul * ammoDmgMul);
  // Manda flags al server: incendiary (DoT), silenced (sigilo).
  const silencedShot = silent;
  network.shoot(_origin, _dir, hitId, finalDmg, {
    incendiary: !!ammoMeta.burn,
    silenced: silencedShot,
  });

  // Damage number floats up at impact.
  if (hitId !== null && hitPoint) {
    spawnDamageNumber(hitPoint.x, hitPoint.y - 0.5, hitPoint.z, finalDmg, isHeadshot);
    if (isHeadshot) sfx.playKill();
  }

  // Tracer from muzzle to either the hit point or a far point along ray.
  const muzzleWorld = new THREE.Vector3();
  muzzle.getWorldPosition(muzzleWorld);
  let endPoint;
  if (hits.length > 0) {
    endPoint = hits[0].point.clone();
  } else {
    endPoint = _origin.clone().add(_dir.clone().multiplyScalar(cfg.range));
  }
  spawnTracer(muzzleWorld, endPoint);

  // Local muzzle flash + hit marker. Kill upgrade happens from main.js
  // when the server confirms the entity died within a short window.
  muzzle.intensity = 6;
  flashHitMarker(hitId !== null);
  if (hitId !== null) lastShotInfo = { hitId, t: performance.now() };
}

// Exported so main.js can detect a kill arriving shortly after a hit and
// upgrade the marker to red.
let lastShotInfo = { hitId: null, t: 0 };
export function lastShotWithinKillWindow(enemyId) {
  if (lastShotInfo.hitId !== enemyId) return false;
  return (performance.now() - lastShotInfo.t) < 350;
}

// Renamed: flashHitMarker now lives in hud.js. Kept the local function as
// a thin wrapper so existing call sites keep working without touching the
// fire path. `kill` is set later by main.js when an eDead arrives within
// ~250 ms of a shot.
import { flashHitMarker as hudFlashHitMarker } from './hud.js';
function flashHitMarker(hit, isKill = false) {
  if (!hit && !isKill) return;
  hudFlashHitMarker(isKill);
}

// =====================================================================
// Per-frame
// =====================================================================
export function updateWeapons(dt) {
  // Ocultar el arma de fuego cuando hay tool melee activa.
  gunGroup.visible = !getActiveTool();
  if (cooldown > 0) cooldown -= dt;
  if (muzzle.intensity > 0) muzzle.intensity = Math.max(0, muzzle.intensity - dt * 30);
  // Reload progress.
  if (reloading) {
    reloadTimer -= dt;
    // Slight visual sag of the gun while reloading.
    if (gunBody) gunBody.position.y = -0.18 - 0.06 * Math.sin(Math.PI * (1 - reloadTimer / WEAPONS[active].reloadTime));
    if (reloadTimer <= 0) {
      finishReload();
      if (gunBody) gunBody.position.y = -0.18;
    }
  }
  // Auto-fire (rifle only) while held.
  if (mouseDown && WEAPONS[active].auto && cooldown <= 0 && !reloading) tryFire();
}

export function activeWeaponName() { return WEAPONS[active].name; }
export function activeWeaponMeta() {
  const cfg = WEAPONS[active];
  const cap = inv.has('ext_mag', 1) ? Math.round(cfg.magazineSize * 1.5) : cfg.magazineSize;
  return { name: cfg.name, loaded: loaded[active] | 0, ammo: inv.get(cfg.ammo), cap };
}
// Allow main.js to drive weapon selection via the hotbar.
export function selectWeaponBySlot(slotIdx) {
  if (slotIdx === 0) selectWeapon('pistol');
  else if (slotIdx === 1) selectWeapon('rifle');
  else if (slotIdx === 7) selectWeapon('shotgun');
  else if (slotIdx === 8) selectWeapon('sniper');
  // Slots 2..6 reserved for non-firing tools (handled in main.js).
}

// Recoil exposed so main.js can drain it into the camera each frame.
let pendingRecoil = 0;
export function consumeRecoil() {
  const r = pendingRecoil;
  pendingRecoil = 0;
  return r;
}
