// Knife — melee weapon. Slot 5 in the hotbar. No ammo. Short range hit-scan
// (server still authoritative for the damage). Quick swing animation.

import * as THREE from 'three';
import { camera, scene } from './three-setup.js';
import { enemies } from './entities.js';
import { network } from './network.js';
import { player } from './player.js';
import { spawnDamageNumber } from './effects.js';
import * as sfx from './sounds.js';

const KNIFE_RANGE = 2.0;
const KNIFE_DMG = 8;
const KNIFE_COOLDOWN = 0.45;

// Mesh — short blade. Hidden by default; only visible while active.
const knifeGroup = new THREE.Group();
const blade = new THREE.Mesh(
  new THREE.BoxGeometry(0.04, 0.18, 0.5),
  new THREE.MeshStandardMaterial({ color: 0xc8c8d4, roughness: 0.3, metalness: 0.85 }),
);
const handle = new THREE.Mesh(
  new THREE.BoxGeometry(0.06, 0.16, 0.16),
  new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.8 }),
);
blade.position.set(0.18, -0.12, -0.55);
handle.position.set(0.18, -0.16, -0.32);
knifeGroup.add(blade, handle);
knifeGroup.visible = false;
camera.add(knifeGroup);

let active = false;
let cooldown = 0;
let swingT = -1;
const ray = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function setKnifeActive(on) {
  active = !!on;
  knifeGroup.visible = active;
}

export function isKnifeActive() { return active; }

addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !active || !player.locked || player.hp <= 0) return;
  trySwing();
});

function trySwing() {
  if (cooldown > 0) return;
  cooldown = KNIFE_COOLDOWN;
  swingT = 0;
  sfx.playEmpty?.(); // mechanical click stand-in for the swoosh
  // Raycast — find any enemy in range at center.
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  ray.set(_origin, _dir);
  ray.far = KNIFE_RANGE;
  const candidates = [];
  const eMap = new Map();
  for (const [id, e] of enemies) {
    e.mesh.traverse(c => { if (c.isMesh) { candidates.push(c); eMap.set(c, id); } });
  }
  const hits = ray.intersectObjects(candidates, false);
  if (hits.length === 0) return;
  let obj = hits[0].object;
  while (obj && !eMap.has(obj)) obj = obj.parent;
  if (!obj) return;
  const hitId = eMap.get(obj);
  network.shoot(_origin, _dir, hitId, KNIFE_DMG);
  spawnDamageNumber(hits[0].point.x, hits[0].point.y - 0.5, hits[0].point.z, KNIFE_DMG, false);
  sfx.playHit?.();
}

export function updateKnife(dt) {
  if (cooldown > 0) cooldown -= dt;
  if (!active) return;
  // Swing animation — quick rotation forward then back.
  if (swingT >= 0) {
    swingT += dt;
    const t = swingT / KNIFE_COOLDOWN;
    if (t > 1) {
      swingT = -1;
      knifeGroup.rotation.x = 0;
      knifeGroup.position.z = 0;
    } else {
      knifeGroup.rotation.x = -Math.sin(t * Math.PI) * 1.4;
      knifeGroup.position.z = -Math.sin(t * Math.PI) * 0.18;
    }
  }
}
