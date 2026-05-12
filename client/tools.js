// Melee tools: cuchillo / hacha / pico. Three distinct meshes camera-attached
// with different swing animations and behaviors:
//
//   knife   → damages enemies (server-authoritative). Short range. NO harvest
//             of trees or stones (the player needs the right tool).
//   axe     → cuts trees (+wood). Slow swing. Light damage to enemies.
//   pickaxe → mines rocks (+stone). Slow swing. Light damage to enemies.
//
// Active tool is mutually exclusive — picking one hides the others. Hotbar
// slots: 5 cuchillo, 6 hacha, 7 pico. main.js wires the slot keys.

import * as THREE from 'three';
import { camera, scene } from './three-setup.js';
import { enemies } from './entities.js';
import { network } from './network.js';
import { player } from './player.js';
import { spawnDamageNumber } from './effects.js';
import * as sfx from './sounds.js';
import { scene as worldScene } from './three-setup.js';
import * as inv from './inventory.js';

const KNIFE_RANGE = 2.0;
const KNIFE_DMG = 8;
const AXE_RANGE = 2.4;
const AXE_DMG_ENEMY = 4;
const PICKAXE_RANGE = 2.4;
const PICKAXE_DMG_ENEMY = 4;
const FISTS_RANGE = 1.8;
const FISTS_DMG = 3;            // mucho menos que arma, pero algo es algo
const SWING_COOLDOWN = 0.6;
const FISTS_COOLDOWN = 0.45;    // mas rapido que herramientas

// =====================================================================
// Mesh factories — all parented to the camera.
// =====================================================================

const _bladeMat   = new THREE.MeshStandardMaterial({ color: 0xc8c8d4, roughness: 0.3, metalness: 0.85 });
const _handleMat  = new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.85 });
const _ironMat    = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.9 });
const _stoneMat   = new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.85 });

function makeKnife() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.5), _bladeMat);
  blade.position.set(0.18, -0.12, -0.55);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.16), _handleMat);
  handle.position.set(0.18, -0.16, -0.32);
  g.add(blade); g.add(handle);
  g.visible = false;
  return g;
}

function makeAxe() {
  const g = new THREE.Group();
  // Wooden shaft.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.7, 6), _handleMat);
  shaft.rotation.x = Math.PI / 2.4;
  shaft.position.set(0.22, -0.18, -0.35);
  g.add(shaft);
  // Iron head — wide blade.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.06), _ironMat);
  head.position.set(0.22, -0.05, -0.6);
  head.rotation.x = Math.PI / 2.4;
  g.add(head);
  // Edge highlight.
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.06), _bladeMat);
  edge.position.set(0.30, -0.05, -0.6);
  edge.rotation.x = Math.PI / 2.4;
  g.add(edge);
  g.visible = false;
  return g;
}

function makePickaxe() {
  const g = new THREE.Group();
  // Wooden shaft.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.75, 6), _handleMat);
  shaft.rotation.x = Math.PI / 2.4;
  shaft.position.set(0.22, -0.18, -0.35);
  g.add(shaft);
  // Stone head — pointed both ways.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.08), _stoneMat);
  head.position.set(0.22, -0.06, -0.6);
  head.rotation.x = Math.PI / 2.4;
  head.rotation.z = 0.2;
  g.add(head);
  // Tips — small cones marking the working ends.
  for (const sx of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 5), _stoneMat);
    tip.position.set(0.22 + sx * 0.18, -0.06, -0.6);
    tip.rotation.z = sx * Math.PI / 2;
    tip.rotation.x = Math.PI / 2.4;
    g.add(tip);
  }
  g.visible = false;
  return g;
}

function makeFists() {
  // Dos puños sin guantes — base flesh + nudillos.
  const g = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd0a070, roughness: 0.8 });
  const knuckleMat = new THREE.MeshStandardMaterial({ color: 0x8a5840, roughness: 0.85 });
  for (const sx of [-1, 1]) {
    // Antebrazo (parcial).
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.18), skinMat);
    arm.position.set(0.18 * sx, -0.22, -0.30);
    g.add(arm);
    // Puño cerrado.
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.10), skinMat);
    fist.position.set(0.18 * sx, -0.22, -0.42);
    g.add(fist);
    // Nudillos (linea).
    const kn = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.015, 0.015), knuckleMat);
    kn.position.set(0.18 * sx, -0.18, -0.46);
    g.add(kn);
  }
  g.visible = false;
  // Marca para que la animation pueda animarlos por separado al swing.
  g.userData.isFists = true;
  return g;
}

const knifeMesh = makeKnife();
const axeMesh = makeAxe();
const pickaxeMesh = makePickaxe();
const fistsMesh = makeFists();
camera.add(knifeMesh, axeMesh, pickaxeMesh, fistsMesh);

// =====================================================================
// State machine — one active tool at a time.
// =====================================================================
let active = null; // 'knife' | 'axe' | 'pickaxe' | null
let cooldown = 0;
let swingT = -1;

const ray = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

function meshFor(tool) {
  if (tool === 'knife')   return knifeMesh;
  if (tool === 'axe')     return axeMesh;
  if (tool === 'pickaxe') return pickaxeMesh;
  if (tool === 'fists')   return fistsMesh;
  return null;
}

export function setActiveTool(tool) {
  active = tool;
  knifeMesh.visible = active === 'knife';
  axeMesh.visible = active === 'axe';
  pickaxeMesh.visible = active === 'pickaxe';
  fistsMesh.visible = active === 'fists';
  // Reset swing.
  swingT = -1;
  cooldown = 0;
  for (const m of [knifeMesh, axeMesh, pickaxeMesh, fistsMesh]) {
    m.rotation.x = 0;
    m.position.z = 0;
  }
}

// Backwards-compat helpers (older code calls these directly).
export function setKnifeActive(on) { setActiveTool(on ? 'knife' : null); }
export function isKnifeActive() { return active === 'knife'; }
export function getActiveTool() { return active; }

// =====================================================================
// Swing on click. Behavior splits per tool: knife hits enemies, axe hits
// trees (and weakly enemies), pickaxe hits stones (and weakly enemies).
// =====================================================================
addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !active || !player.locked || player.hp <= 0) return;
  trySwing();
});

function trySwing() {
  if (cooldown > 0) return;
  cooldown = active === 'fists' ? FISTS_COOLDOWN : SWING_COOLDOWN;
  swingT = 0;
  sfx.playEmpty?.();

  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  ray.set(_origin, _dir);

  const range = active === 'knife' ? KNIFE_RANGE
              : active === 'fists' ? FISTS_RANGE
              : AXE_RANGE;
  ray.far = range;

  // 1) Try enemy hit.
  const candidates = [];
  const eMap = new Map();
  for (const [id, e] of enemies) {
    e.mesh.traverse(c => { if (c.isMesh) { candidates.push(c); eMap.set(c, id); } });
  }
  const enemyHits = ray.intersectObjects(candidates, false);
  if (enemyHits.length > 0) {
    let obj = enemyHits[0].object;
    while (obj && !eMap.has(obj)) obj = obj.parent;
    if (obj) {
      const hitId = eMap.get(obj);
      const dmg = active === 'knife' ? KNIFE_DMG
                : active === 'axe' ? AXE_DMG_ENEMY
                : active === 'fists' ? FISTS_DMG
                : PICKAXE_DMG_ENEMY;
      network.shoot(_origin, _dir, hitId, dmg);
      spawnDamageNumber(enemyHits[0].point.x, enemyHits[0].point.y - 0.5, enemyHits[0].point.z, dmg, false);
      sfx.playHit?.();
      return;
    }
  }

  // 2) Knife/fists stop here — no harvest.
  if (active === 'knife' || active === 'fists') return;

  // 3) Axe / Pickaxe — harvest if scene hit matches the right material.
  const wRay = new THREE.Raycaster(_origin.clone(), _dir.clone(), 0.2, range);
  const sceneHits = wRay.intersectObjects(worldScene.children, true);
  if (sceneHits.length === 0) return;
  const sh = sceneHits[0];
  let kind = null;
  let m = sh.object;
  while (m && !kind) {
    const c = m.material?.color?.getHex?.();
    if (c === 0x6a6a6a) kind = 'stone';
    else if (c === 0x4a3018 || c === 0x386428) kind = 'wood';
    m = m.parent;
  }
  if (active === 'axe' && kind === 'wood') {
    inv.add('wood', 1);
    spawnDamageNumber(sh.point.x, sh.point.y, sh.point.z, '+MADERA', false);
    sfx.playHit?.();
  } else if (active === 'pickaxe' && kind === 'stone') {
    inv.add('stone', 1);
    spawnDamageNumber(sh.point.x, sh.point.y, sh.point.z, '+PIEDRA', false);
    sfx.playHit?.();
  }
  // Wrong tool on resource — small empty click hint.
  else if ((active === 'axe' && kind === 'stone') || (active === 'pickaxe' && kind === 'wood')) {
    sfx.playEmpty?.();
  }
}

// =====================================================================
// Per-frame swing animation.
// =====================================================================
let punchAlt = 0;   // alterna manos del punch (0 = derecha, 1 = izquierda)
export function updateTools(dt) {
  if (cooldown > 0) cooldown -= dt;
  const m = meshFor(active);
  if (!m) return;
  if (swingT >= 0) {
    swingT += dt;
    const cd = active === 'fists' ? FISTS_COOLDOWN : SWING_COOLDOWN;
    const t = swingT / cd;
    if (t > 1) {
      swingT = -1;
      m.rotation.x = 0;
      m.position.z = 0;
      m.position.x = 0;
      punchAlt = 1 - punchAlt;
      // Reset fists per-arm offsets.
      if (active === 'fists') {
        for (const child of m.children) {
          child.userData._punching = false;
        }
      }
    } else if (active === 'fists') {
      // Punch animation: el brazo activo se extiende hacia adelante.
      // Solo afecta a 3 meshes (arm, fist, knuckle) del lado activo.
      const sign = punchAlt === 0 ? 1 : -1;   // 0 = derecha, 1 = izquierda
      const punchDepth = Math.sin(t * Math.PI) * 0.18;
      for (const child of m.children) {
        // Right side (sx=1 → x positivo) vs Left side (sx=-1).
        const onRight = child.position.x > 0;
        const isActiveSide = (sign > 0 && onRight) || (sign < 0 && !onRight);
        if (isActiveSide) {
          if (!child.userData._baseZ) child.userData._baseZ = child.position.z;
          child.position.z = child.userData._baseZ - punchDepth;
        }
      }
    } else {
      m.rotation.x = -Math.sin(t * Math.PI) * 1.4;
      m.position.z = -Math.sin(t * Math.PI) * 0.18;
    }
  }
}

// Backwards-compat alias for the older knife.js export name.
export const updateKnife = updateTools;
