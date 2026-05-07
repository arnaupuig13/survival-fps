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

// Each weapon names the inventory key it consumes per shot. magazineSize
// caps the loaded round count; reload pulls from the inventory pool. The
// rifle requires `rifle_pickup > 0` to be selectable (locked behind city
// loot).
const WEAPONS = {
  pistol: { dmg: 4,  cooldown: 0.5,  range: 50,  auto: false, name: 'PISTOLA', ammo: 'bullet_p', magazineSize: 12, reloadTime: 1.2 },
  rifle:  { dmg: 6,  cooldown: 0.12, range: 100, auto: true,  name: 'RIFLE',   ammo: 'bullet_r', requires: 'rifle_pickup', magazineSize: 30, reloadTime: 1.8 },
};

// =====================================================================
// State
// =====================================================================
let active = 'pistol';
let cooldown = 0;
let mouseDown = false;
// Per-weapon loaded magazine — independent from total ammo in inventory.
const loaded = { pistol: 12, rifle: 0 };
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
  if (e.code === 'Digit1') selectWeapon('pistol');
  else if (e.code === 'Digit2') selectWeapon('rifle');
  else if (e.code === 'KeyR') startReload();
});

function selectWeapon(name) {
  if (name === 'rifle' && !inv.has('rifle_pickup', 1)) return;
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
  reloadTimer = cfg.reloadTime;
  sfx.playEmpty?.(); // mechanical click stand-in
}
function cancelReload() { reloading = false; reloadTimer = 0; }
function finishReload() {
  const cfg = WEAPONS[active];
  if (!cfg) return;
  const need = cfg.magazineSize - (loaded[active] | 0);
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
  const cfg = WEAPONS[active];
  // God mode bypasses ammo entirely — never reload, never run dry.
  if (!player.godMode) {
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
  cooldown = cfg.cooldown;
  if (active === 'rifle') sfx.playRifle(0); else sfx.playPistol(0);

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

  // Final damage with headshot bonus.
  const finalDmg = isHeadshot ? Math.round(cfg.dmg * 1.6) : cfg.dmg;
  network.shoot(_origin, _dir, hitId, finalDmg);

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
export function activeWeaponMeta() { return { name: WEAPONS[active].name, loaded: loaded[active] | 0, ammo: inv.get(WEAPONS[active].ammo) }; }
// Allow main.js to drive weapon selection via the hotbar (1..3 etc).
export function selectWeaponBySlot(slotIdx) {
  if (slotIdx === 0) selectWeapon('pistol');
  else if (slotIdx === 1) selectWeapon('rifle');
  // Slots 2..8 = items / future weapons. main.js handles bandage etc.
}
