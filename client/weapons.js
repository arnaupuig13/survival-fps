// Weapons: pistol + rifle. Each is a raycast hit-scan weapon. On click,
// raycast against zombie meshes; if it hits, send `shoot` to server with
// hit zombie id and damage. Server applies the damage.

import * as THREE from 'three';
import { camera, scene } from './three-setup.js';
import { enemies } from './entities.js';
import { network } from './network.js';
import { player } from './player.js';

const WEAPONS = {
  pistol: { dmg: 4,  cooldown: 0.5,  range: 50,  auto: false, name: 'PISTOLA' },
  rifle:  { dmg: 6,  cooldown: 0.12, range: 100, auto: true,  name: 'RIFLE'   },
};

// =====================================================================
// State
// =====================================================================
let active = 'pistol';
let cooldown = 0;
let mouseDown = false;
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
  if (e.code === 'Digit1') { active = 'pistol'; updateGunVisual(); }
  if (e.code === 'Digit2') { active = 'rifle'; updateGunVisual(); }
});
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
  if (cooldown > 0) return;
  const cfg = WEAPONS[active];
  cooldown = cfg.cooldown;

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

  const hits = ray.intersectObjects(candidates, false);
  let hitId = null;
  if (hits.length > 0) {
    // Walk up to find which enemy the hit object belongs to.
    let obj = hits[0].object;
    while (obj && !eMap.has(obj)) obj = obj.parent;
    if (obj) hitId = eMap.get(obj);
  }

  network.shoot(_origin, _dir, hitId, cfg.dmg);

  // Local muzzle flash + recoil pulse.
  muzzle.intensity = 6;
  flashHitMarker(hitId !== null);
}

function flashHitMarker(hit) {
  const el = document.getElementById('hitMarker');
  if (!el) return;
  el.style.transition = 'none';
  el.style.opacity = hit ? '1' : '0.3';
  // Force reflow so the next transition kicks in.
  void el.offsetWidth;
  el.style.transition = 'opacity 0.4s';
  el.style.opacity = '0';
}

// =====================================================================
// Per-frame
// =====================================================================
export function updateWeapons(dt) {
  if (cooldown > 0) cooldown -= dt;
  if (muzzle.intensity > 0) muzzle.intensity = Math.max(0, muzzle.intensity - dt * 30);
  // Auto-fire (rifle only) while held.
  if (mouseDown && WEAPONS[active].auto && cooldown <= 0) tryFire();
}

export function activeWeaponName() { return WEAPONS[active].name; }
