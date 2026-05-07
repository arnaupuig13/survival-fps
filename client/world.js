// Procedural world: terrain mesh, trees, rocks, ground decoration.
//
// heightAt() and the noise primitive must be byte-identical to server.js.
// If they drift, server-side AI walks a different terrain than the client
// renders, and zombies clip into walls or float in the air.

import * as THREE from 'three';
import { scene } from './three-setup.js';

export const WORLD_HALF = 100;
const WORLD_SEED = 1337;
const TERRAIN_RES = 64;          // 64x64 grid → 65 vertices a side. Plenty for 200 m.
const TREE_COUNT = 80;
const ROCK_COUNT = 25;

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

// =====================================================================
// Terrain mesh — PlaneGeometry deformed by heightAt() at every vertex.
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

  // Vertex colors — green for grass, brown on slopes/peaks. Simple and reads well.
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x4a7a3a);
  const dirt  = new THREE.Color(0x6a5234);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // Higher = browner. Mix from grass at y=0 to dirt at y=2.
    const t = THREE.MathUtils.clamp((y + 1.5) / 3.5, 0, 1);
    tmp.copy(grass).lerp(dirt, t);
    colors[i * 3]     = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = false;
  return mesh;
}

// =====================================================================
// Trees — instanced for performance. Single trunk + canopy mesh per instance.
// =====================================================================
function buildTrees() {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.9 });
  const leafMat  = new THREE.MeshStandardMaterial({ color: 0x386428, roughness: 0.85 });
  const trunkGeom = new THREE.CylinderGeometry(0.18, 0.22, 2.6, 6);
  const leafGeom  = new THREE.ConeGeometry(1.4, 3.2, 7);

  const trees = [];
  // Deterministic PRNG so all clients see same tree layout.
  let s = WORLD_SEED;
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

  for (let i = 0; i < TREE_COUNT; i++) {
    const x = (rng() * 2 - 1) * (WORLD_HALF - 6);
    const z = (rng() * 2 - 1) * (WORLD_HALF - 6);
    // Avoid spawning on top of the player spawn (origin).
    if (x * x + z * z < 36) { i--; continue; }
    const y = heightAt(x, z);
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.set(x, y + 1.3, z);
    const leaf = new THREE.Mesh(leafGeom, leafMat);
    leaf.position.set(x, y + 3.8, z);
    group.add(trunk); group.add(leaf);
    trees.push({ x, z, r: 0.55 }); // for player collision
  }
  return { group, colliders: trees };
}

// =====================================================================
// Rocks — same idea, big gray clusters scattered.
// =====================================================================
function buildRocks() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.9 });
  const geom = new THREE.IcosahedronGeometry(1, 0);

  const rocks = [];
  let s = WORLD_SEED + 9999;
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

  for (let i = 0; i < ROCK_COUNT; i++) {
    const x = (rng() * 2 - 1) * (WORLD_HALF - 6);
    const z = (rng() * 2 - 1) * (WORLD_HALF - 6);
    if (x * x + z * z < 36) { i--; continue; }
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
// World boundary — simple invisible wall colliders + a fence ring.
// =====================================================================
function buildBoundaryFence() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
  const postGeom = new THREE.BoxGeometry(0.15, 1.6, 0.15);
  const step = 4;
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

export const obstacles = [...treeColliders, ...rockColliders];
