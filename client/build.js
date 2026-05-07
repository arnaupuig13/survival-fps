// Player building — walls + bedroll. Tecla Z toggles build mode; while
// active, a translucent ghost preview follows the look direction at a
// fixed distance. Click izq places, Escape (or Z again) exits. Each
// placement consumes one item from the inventory.
//
// All buildings are client-side only — peers don't see your walls (a
// future server-side sync pass would add this). The bedroll, however,
// drives respawn locally: respawnBtn handler in main.js reads it.

import * as THREE from 'three';
import { camera, scene } from './three-setup.js';
import { heightAt, obstacles } from './world.js';
import { player } from './player.js';
import * as inv from './inventory.js';
import * as sfx from './sounds.js';

const PLACE_DIST = 3.5;
const GRID = 3.0;

const MATS = {
  wall:    new THREE.MeshStandardMaterial({ color: 0x807060, roughness: 0.85 }),
  wallTop: new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.85 }),
  bed:     new THREE.MeshStandardMaterial({ color: 0x6a4030, roughness: 0.9 }),
  pillow:  new THREE.MeshStandardMaterial({ color: 0xd0b090, roughness: 0.9 }),
  ghost:   new THREE.MeshBasicMaterial({ color: 0x40c0ff, transparent: true, opacity: 0.45, depthWrite: false }),
  ghostBad:new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.45, depthWrite: false }),
};

// =====================================================================
// Mesh factories.
// =====================================================================
function makeWallMesh() {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(GRID, 2.6, 0.25), MATS.wall);
  wall.position.y = 1.3; g.add(wall);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(GRID + 0.1, 0.18, 0.32), MATS.wallTop);
  cap.position.y = 2.7; g.add(cap);
  return g;
}

function makeBedrollMesh() {
  const g = new THREE.Group();
  const mat = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 1.85), MATS.bed);
  mat.position.y = 0.09; g.add(mat);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.4), MATS.pillow);
  pillow.position.set(0, 0.22, -0.65); g.add(pillow);
  return g;
}

function makeGhostFromMesh(m) {
  // Clone geometry list and replace materials with translucent ghost mat.
  const g = m.clone();
  g.traverse(o => { if (o.isMesh) o.material = MATS.ghost; });
  return g;
}

// =====================================================================
// State machine.
// =====================================================================
let active = false;
let activeKind = 'wall'; // 'wall' or 'bedroll'
let ghost = null;

const placedWalls = []; // for cleanup / debug
const placedBedrolls = []; // first one wins for respawn

function refreshGhost() {
  if (ghost) { scene.remove(ghost); ghost = null; }
  if (!active) return;
  const proto = activeKind === 'wall' ? makeWallMesh() : makeBedrollMesh();
  ghost = makeGhostFromMesh(proto);
  scene.add(ghost);
}

function snapToGrid(v) { return Math.round(v / GRID) * GRID; }

// Returns the world point in front of the camera at PLACE_DIST, snapped
// to the build grid for walls. Bedrolls are continuous.
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
function frontPoint() {
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  const out = _origin.clone().addScaledVector(_dir, PLACE_DIST);
  if (activeKind === 'wall') {
    out.x = snapToGrid(out.x);
    out.z = snapToGrid(out.z);
  }
  out.y = heightAt(out.x, out.z);
  return out;
}

export function isBuildingActive() { return active; }
export function setBuildKind(kind) {
  activeKind = kind === 'bedroll' ? 'bedroll' : 'wall';
  refreshGhost();
}
export function toggleBuild() {
  active = !active;
  refreshGhost();
  return active;
}

// Place at the ghost's current position. Returns true on success.
function tryPlace() {
  if (!ghost) return false;
  const p = frontPoint();
  const itemKey = activeKind === 'wall' ? 'wall_piece' : 'bedroll_item';
  if (!inv.consume(itemKey, 1)) return false;

  if (activeKind === 'wall') {
    const m = makeWallMesh();
    // Align rotation to camera yaw — round to 90° increments so walls fit grid.
    let yaw = player.yaw();
    yaw = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
    m.rotation.y = yaw;
    m.position.copy(p);
    scene.add(m);
    // Wall collider — rotated AABB matching the mesh footprint.
    obstacles.push({
      type: 'box',
      cx: p.x, cz: p.z,
      hw: GRID / 2, hh: 0.13,
      ry: yaw,
    });
    placedWalls.push(m);
  } else {
    const m = makeBedrollMesh();
    m.rotation.y = player.yaw();
    m.position.copy(p);
    scene.add(m);
    placedBedrolls.push({ mesh: m, x: p.x, y: p.y, z: p.z });
    // Bedrolls don't collide — you can walk on them.
  }
  sfx.playPickup?.();
  return true;
}

// Get the most-recently-placed bedroll for the respawn handler. null if none.
export function getBedrollSpawn() {
  if (placedBedrolls.length === 0) return null;
  const b = placedBedrolls[placedBedrolls.length - 1];
  return { x: b.x, y: b.y, z: b.z };
}

// =====================================================================
// Input — subscribed at module init.
// =====================================================================
addEventListener('mousedown', (e) => {
  if (!active || e.button !== 0 || !player.locked) return;
  tryPlace();
});

// Per-frame: move ghost to the front of the camera. Also colorise the
// ghost red if the inventory is empty.
export function updateBuild(dt) {
  if (!active || !ghost) return;
  const p = frontPoint();
  ghost.position.copy(p);
  let yaw = player.yaw();
  if (activeKind === 'wall') yaw = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
  ghost.rotation.y = yaw;
  const itemKey = activeKind === 'wall' ? 'wall_piece' : 'bedroll_item';
  const has = inv.has(itemKey, 1);
  ghost.traverse(o => { if (o.isMesh) o.material = has ? MATS.ghost : MATS.ghostBad; });
}
