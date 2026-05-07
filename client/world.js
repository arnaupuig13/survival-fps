// Procedural world: terrain mesh, trees, rocks, ground decoration.
//
// heightAt() and the noise primitive must be byte-identical to server.js.
// If they drift, server-side AI walks a different terrain than the client
// renders, and zombies clip into walls or float in the air.
//
// World is now 400x400 m (WORLD_HALF=200). Towns claim a clearing radius so
// trees and rocks don't spawn inside them — buildings need open ground.

import * as THREE from 'three';
import { scene } from './three-setup.js';

export const WORLD_HALF = 200;
const WORLD_SEED = 1337;
const TERRAIN_RES = 96;          // 96x96 grid → 97 vertices a side. Good for 400 m.
const TREE_COUNT = 220;
const ROCK_COUNT = 60;

// Town clearings — kept in sync with server's TOWN_LOCATIONS centers. World
// gen avoids spawning trees / rocks within `radius` metres of each. Buildings
// + sleeping zombies will be placed here later by towns.js.
const TOWN_CLEARINGS = [
  { cx: -150, cz:  140, r: 32 },  // Westhaven
  { cx:  155, cz:  150, r: 32 },  // Eastfield
  { cx: -160, cz: -130, r: 32 },  // Pinecreek
  { cx:  140, cz: -160, r: 32 },  // Southridge
  { cx:    0, cz:  -90, r: 50 },  // Helix Lab — bigger
];

// =====================================================================
// Heightmap — must mirror server.heightAt(). Two octaves of value noise.
// =====================================================================
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263 + WORLD_SEED * 982451653) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function heightAt(x, z) {
  function octave(scale, amp) {
    const sx = x / scale, sz = z / scale;
    const x0 = Math.floor(sx), z0 = Math.floor(sz);
    const fx = sx - x0,        fz = sz - z0;
    const a = hash(x0,     z0);
    const b = hash(x0 + 1, z0);
    const c = hash(x0,     z0 + 1);
    const d = hash(x0 + 1, z0 + 1);
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    return (a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v) * amp;
  }
  return octave(28, 2.4) + octave(7, 0.6) - 1.5;
}

function inAnyClearing(x, z) {
  for (const t of TOWN_CLEARINGS) {
    const dx = x - t.cx, dz = z - t.cz;
    if (dx * dx + dz * dz < t.r * t.r) return true;
  }
  return false;
}

// =====================================================================
// Terrain mesh.
// =====================================================================
function buildTerrain() {
  const size = WORLD_HALF * 2;
  const geom = new THREE.PlaneGeometry(size, size, TERRAIN_RES, TERRAIN_RES);
  geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();

  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x4a7a3a);
  const dirt  = new THREE.Color(0x6a5234);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp((y + 1.5) / 3.5, 0, 1);
    tmp.copy(grass).lerp(dirt, t);
    colors[i * 3]     = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geom, mat);
  return mesh;
}

// =====================================================================
// Trees (instanced via simple grouping — small enough to not need InstancedMesh).
// =====================================================================
function buildTrees() {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.9 });
  const leafMat  = new THREE.MeshStandardMaterial({ color: 0x386428, roughness: 0.85 });
  const trunkGeom = new THREE.CylinderGeometry(0.18, 0.22, 2.6, 6);
  const leafGeom  = new THREE.ConeGeometry(1.4, 3.2, 7);

  const trees = [];
  let s = WORLD_SEED;
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

  let tries = 0;
  while (trees.length < TREE_COUNT && tries < TREE_COUNT * 20) {
    tries++;
    const x = (rng() * 2 - 1) * (WORLD_HALF - 6);
    const z = (rng() * 2 - 1) * (WORLD_HALF - 6);
    if (x * x + z * z < 36) continue;        // skip player spawn
    if (inAnyClearing(x, z)) continue;       // skip town footprints
    const y = heightAt(x, z);
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.set(x, y + 1.3, z);
    const leaf = new THREE.Mesh(leafGeom, leafMat);
    leaf.position.set(x, y + 3.8, z);
    group.add(trunk); group.add(leaf);
    trees.push({ x, z, r: 0.55 });
  }
  return { group, colliders: trees };
}

// =====================================================================
// Rocks.
// =====================================================================
function buildRocks() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.9 });
  const geom = new THREE.IcosahedronGeometry(1, 0);

  const rocks = [];
  let s = WORLD_SEED + 9999;
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

  let tries = 0;
  while (rocks.length < ROCK_COUNT && tries < ROCK_COUNT * 20) {
    tries++;
    const x = (rng() * 2 - 1) * (WORLD_HALF - 6);
    const z = (rng() * 2 - 1) * (WORLD_HALF - 6);
    if (x * x + z * z < 36) continue;
    if (inAnyClearing(x, z)) continue;
    const y = heightAt(x, z);
    const sc = 0.7 + rng() * 0.9;
    const rock = new THREE.Mesh(geom, mat);
    rock.position.set(x, y + sc * 0.5, z);
    rock.scale.set(sc, sc * 0.8, sc);
    rock.rotation.y = rng() * Math.PI * 2;
    group.add(rock);
    rocks.push({ x, z, r: sc * 1.0 });
  }
  return { group, colliders: rocks };
}

// =====================================================================
// World boundary fence.
// =====================================================================
function buildBoundaryFence() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
  const postGeom = new THREE.BoxGeometry(0.15, 1.6, 0.15);
  const step = 5;
  for (let v = -WORLD_HALF; v <= WORLD_HALF; v += step) {
    for (const [x, z] of [[v, -WORLD_HALF], [v, WORLD_HALF], [-WORLD_HALF, v], [WORLD_HALF, v]]) {
      const post = new THREE.Mesh(postGeom, mat);
      post.position.set(x, heightAt(x, z) + 0.8, z);
      group.add(post);
    }
  }
  return group;
}

// =====================================================================
// Build everything. Returns colliders the player can use for collision.
// =====================================================================
const terrain = buildTerrain();
scene.add(terrain);
const { group: treeGroup, colliders: treeColliders } = buildTrees();
scene.add(treeGroup);
const { group: rockGroup, colliders: rockColliders } = buildRocks();
scene.add(rockGroup);
scene.add(buildBoundaryFence());

// Building colliders are appended to this array by towns.js when the welcome
// message arrives.
export const obstacles = [...treeColliders, ...rockColliders];
