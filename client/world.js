// Procedural world: terrain mesh, trees, rocks, ground decoration.
//
// heightAt() and the noise primitive must be byte-identical to server.js.
// If they drift, server-side AI walks a different terrain than the client
// renders, and zombies clip into walls or float in the air.
//
// World es ahora 800x800 m (WORLD_HALF=400, 4x área del original). Towns
// reclaman un clearing radius para que árboles/rocas no spawnen dentro.

import * as THREE from 'three';
import { scene } from './three-setup.js';

export const WORLD_HALF = 400;
const WORLD_SEED = 1337;
const TERRAIN_RES = 144;         // grid resolución, mantiene buen detalle a 800m
const TREE_COUNT = 800;          // 4x árboles → densidad similar al mapa viejo
const ROCK_COUNT = 240;          // 4x rocas

// Town clearings — alineadas con server. Posiciones nuevas más spread.
const TOWN_CLEARINGS = [
  { cx: -300, cz:  280, r: 40 },  // Westhaven (8 edificios)
  { cx:  310, cz:  300, r: 40 },  // Eastfield
  { cx: -320, cz: -260, r: 40 },  // Pinecreek
  { cx:  280, cz: -320, r: 40 },  // Southridge
  { cx:    0, cz: -200, r: 100 }, // Helix Lab — walled compound, 28 edificios
];

// =====================================================================
// Heightmap — must mirror server.heightAt(). Two octaves of value noise.
// =====================================================================
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263 + WORLD_SEED * 982451653) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// IMPORTANT: server.js usa este código byte-identical. Si cambiás
// algo acá, copialo exacto allá o el server y cliente verán terrenos
// distintos (zombies enterrados o flotando).
function _smoothstep(t) { return t * t * (3 - 2 * t); }

function _octave(x, z, scale, amp) {
  const sx = x / scale, sz = z / scale;
  const x0 = Math.floor(sx), z0 = Math.floor(sz);
  const fx = sx - x0, fz = sz - z0;
  const a = hash(x0,     z0);
  const b = hash(x0 + 1, z0);
  const c = hash(x0,     z0 + 1);
  const d = hash(x0 + 1, z0 + 1);
  const u = _smoothstep(fx);
  const v = _smoothstep(fz);
  return (a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v) * amp;
}

// Altura procedural sin flatten — usada como base + para calcular el
// nivel del centro de cada town.
function _rawHeight(x, z) {
  const macro  = _octave(x, z, 220, 18);
  const hills  = _octave(x, z,  70,  7);
  const ridges = _octave(x, z,  22,  3);
  const fine   = _octave(x, z,   7, 0.6);
  let h = macro + hills + ridges + fine - 14.3;
  const sign = h >= 0 ? 1 : -1;
  const abs = Math.abs(h);
  if (abs > 5) h = sign * (5 + (abs - 5) * 1.7);
  return h;
}

// Town flat areas — el terreno se aplana dentro de estos radios.
const TOWN_FLAT = [
  { cx: -300, cz:  280, r: 38, transition: 18 },
  { cx:  310, cz:  300, r: 38, transition: 18 },
  { cx: -320, cz: -260, r: 38, transition: 18 },
  { cx:  280, cz: -320, r: 38, transition: 18 },
  { cx:    0, cz: -200, r: 95, transition: 25 },
];

export function heightAt(x, z) {
  let h = _rawHeight(x, z);
  for (let i = 0; i < TOWN_FLAT.length; i++) {
    const t = TOWN_FLAT[i];
    const dx = x - t.cx, dz = z - t.cz;
    const outerR = t.r + t.transition;
    const d2 = dx * dx + dz * dz;
    if (d2 < outerR * outerR) {
      const d = Math.sqrt(d2);
      const flat = _rawHeight(t.cx, t.cz);
      const t01 = d <= t.r ? 1 : (outerR - d) / t.transition;
      const eased = _smoothstep(t01);
      h = h * (1 - eased) + flat * eased;
    }
  }
  return h;
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

  // Coloración por altura — valles verdes, colinas marrones, cumbres
  // grises rocosas, picos nevados. Acompaña el relieve dramático.
  const colors = new Float32Array(pos.count * 3);
  const valley = new THREE.Color(0x3a6a2c);   // verde valle profundo
  const grass  = new THREE.Color(0x5a8044);   // verde grass
  const dirt   = new THREE.Color(0x6a5234);   // marrón colina
  const stone  = new THREE.Color(0x6a6a72);   // gris roca
  const snow   = new THREE.Color(0xe0e0e8);   // nieve picos
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < -4) {
      const t = THREE.MathUtils.clamp((y + 12) / 8, 0, 1);
      tmp.copy(valley).lerp(grass, t);
    } else if (y < 4) {
      const t = THREE.MathUtils.clamp((y + 4) / 8, 0, 1);
      tmp.copy(grass).lerp(dirt, t);
    } else if (y < 14) {
      const t = THREE.MathUtils.clamp((y - 4) / 10, 0, 1);
      tmp.copy(dirt).lerp(stone, t);
    } else {
      const t = THREE.MathUtils.clamp((y - 14) / 10, 0, 1);
      tmp.copy(stone).lerp(snow, t);
    }
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
