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

// Town clearings — alineadas con server.TOWN_FLAT. Towns nuevas son más
// densas (18 edificios) por lo que el clearing es más grande.
const TOWN_CLEARINGS = [
  { cx: -300, cz:  280, r: 65 },
  { cx:  310, cz:  300, r: 65 },
  { cx: -320, cz: -260, r: 65 },
  { cx:  280, cz: -320, r: 65 },
  { cx:    0, cz: -200, r: 140 }, // Helix Lab — 40 edificios
];

// =====================================================================
// Heightmap — must mirror server.heightAt(). Two octaves of value noise.
// =====================================================================
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263 + WORLD_SEED * 982451653) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// =====================================================================
// BIOMAS — 4 cuadrantes byte-identical con server.
// =====================================================================
export function biomeAt(x, z) {
  if (x >= 0 && z >= 0)  return 'snow';
  if (x <  0 && z >= 0)  return 'forest';
  if (x >= 0 && z <  0)  return 'desert';
  return 'burnt';
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

// Town flat areas — debe matchear server.TOWN_FLAT byte-identical.
const TOWN_FLAT = [
  { cx: -300, cz:  280, r: 60, transition: 22 },
  { cx:  310, cz:  300, r: 60, transition: 22 },
  { cx: -320, cz: -260, r: 60, transition: 22 },
  { cx:  280, cz: -320, r: 60, transition: 22 },
  { cx:    0, cz: -200, r: 130, transition: 35 },
  { cx:  150, cz:    0, r: 14, transition: 8 },
  { cx: -240, cz:  240, r: 14, transition: 8 },
  { cx:  100, cz: -260, r: 14, transition: 8 },
  { cx: -160, cz:  120, r: 10, transition: 6 },
  { cx:  160, cz:  140, r: 10, transition: 6 },
  { cx:  -80, cz:   20, r: 10, transition: 6 },
  { cx:  220, cz: -100, r: 10, transition: 6 },
  { cx: -200, cz:  -50, r: 10, transition: 6 },
  { cx: -180, cz:  -80, r: 9, transition: 6 },
  { cx:  200, cz:  -60, r: 9, transition: 6 },
  { cx:    0, cz:  340, r: 9, transition: 6 },
  { cx: -350, cz:    0, r: 9, transition: 6 },
  { cx:  120, cz:  200, r: 8, transition: 5 },
  { cx: -200, cz:  180, r: 8, transition: 5 },
  { cx:   60, cz: -100, r: 8, transition: 5 },
  { cx:  -80, cz: -100, r: 8, transition: 5 },
  { cx:  220, cz:  180, r: 8, transition: 5 },
  { cx: -260, cz:  100, r: 8, transition: 5 },
  { cx:  340, cz:   40, r: 8, transition: 5 },
  { cx: -100, cz:  340, r: 8, transition: 5 },
  { cx: -260, cz:  340, r: 12, transition: 7 },
  { cx:  280, cz:  260, r: 12, transition: 7 },
  { cx:  340, cz: -200, r: 12, transition: 7 },
  { cx: -260, cz: -340, r: 12, transition: 7 },
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

  // Coloración por bioma + altura. Cada cuadrante tiene su paleta:
  //   forest: verde primaveral
  //   snow: blanco con tintes azulados
  //   desert: amarillo arena
  //   burnt: gris ceniza con marrón quemado
  const colors = new Float32Array(pos.count * 3);
  const palettes = {
    forest: { low: new THREE.Color(0x3a6a2c), mid: new THREE.Color(0x5a8044), high: new THREE.Color(0x6a5234), peak: new THREE.Color(0x8a8a90) },
    snow:   { low: new THREE.Color(0x6a8090), mid: new THREE.Color(0xb0c0d0), high: new THREE.Color(0xd8dce8), peak: new THREE.Color(0xf0f5ff) },
    desert: { low: new THREE.Color(0xa08850), mid: new THREE.Color(0xc4a868), high: new THREE.Color(0x9c8048), peak: new THREE.Color(0x7a5e30) },
    burnt:  { low: new THREE.Color(0x2a1f1a), mid: new THREE.Color(0x4a3a30), high: new THREE.Color(0x5a4a3e), peak: new THREE.Color(0x6a5e58) },
  };
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), pz = pos.getZ(i);
    const y = pos.getY(i);
    const biome = biomeAt(px, pz);
    const p = palettes[biome] || palettes.forest;
    if (y < -4) {
      const t = THREE.MathUtils.clamp((y + 12) / 8, 0, 1);
      tmp.copy(p.low).lerp(p.mid, t);
    } else if (y < 4) {
      const t = THREE.MathUtils.clamp((y + 4) / 8, 0, 1);
      tmp.copy(p.mid).lerp(p.high, t);
    } else if (y < 14) {
      const t = THREE.MathUtils.clamp((y - 4) / 10, 0, 1);
      tmp.copy(p.high).lerp(p.peak, t);
    } else {
      tmp.copy(p.peak);
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
  // Materials per bioma.
  const matsByBiome = {
    forest: {
      trunk: new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.9 }),
      leaf:  new THREE.MeshStandardMaterial({ color: 0x386428, roughness: 0.85 }),
    },
    snow: {
      trunk: new THREE.MeshStandardMaterial({ color: 0x2a2014, roughness: 0.9 }),
      leaf:  new THREE.MeshStandardMaterial({ color: 0xb0c8d4, roughness: 0.6 }),  // pino con nieve
    },
    desert: {
      // Desierto usa cactos, no árboles. Manejado abajo.
      trunk: new THREE.MeshStandardMaterial({ color: 0x4a6028, roughness: 0.85 }),
      leaf:  new THREE.MeshStandardMaterial({ color: 0x4a6028, roughness: 0.85 }),
    },
    burnt: {
      trunk: new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.95 }),
      leaf:  new THREE.MeshStandardMaterial({ color: 0x2a1f15, roughness: 0.95 }),
    },
  };
  const trunkGeom = new THREE.CylinderGeometry(0.18, 0.22, 2.6, 6);
  const leafGeomConical = new THREE.ConeGeometry(1.4, 3.2, 7);
  // Pino más alto y angosto para nieve.
  const pineGeom = new THREE.ConeGeometry(1.0, 4.5, 7);
  // Cacto: cilindro alargado.
  const cactusGeom = new THREE.CylinderGeometry(0.32, 0.36, 2.2, 6);
  // Tronco quemado: tronco grueso sin hojas, con tinte negro.
  const burntStumpGeom = new THREE.CylinderGeometry(0.22, 0.28, 1.8, 6);

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
    const biome = biomeAt(x, z);
    const m = matsByBiome[biome];

    // Density por bioma — desierto tiene 1/4 de la cantidad, burnt 60%.
    if (biome === 'desert' && rng() > 0.25) continue;
    if (biome === 'burnt' && rng() > 0.60) continue;

    if (biome === 'desert') {
      // Cacto vertical (sin trunk separado).
      const cactus = new THREE.Mesh(cactusGeom, m.trunk);
      cactus.position.set(x, y + 1.1, z);
      group.add(cactus);
      trees.push({ x, z, r: 0.45 });
      continue;
    }
    if (biome === 'burnt') {
      // Tronco quemado sin copa, mezcla de stumps y troncos.
      const isStump = rng() < 0.4;
      const trunk = new THREE.Mesh(isStump ? burntStumpGeom : trunkGeom, m.trunk);
      trunk.position.set(x, y + (isStump ? 0.9 : 1.3), z);
      group.add(trunk);
      // Sin hojas — está quemado.
      trees.push({ x, z, r: 0.55 });
      continue;
    }
    if (biome === 'snow') {
      // Tronco oscuro + pino angosto cubierto de nieve.
      const trunk = new THREE.Mesh(trunkGeom, m.trunk);
      trunk.position.set(x, y + 1.3, z);
      const pine = new THREE.Mesh(pineGeom, m.leaf);
      pine.position.set(x, y + 4.5, z);
      group.add(trunk); group.add(pine);
      trees.push({ x, z, r: 0.55 });
      continue;
    }
    // Bosque normal — verde primaveral.
    const trunk = new THREE.Mesh(trunkGeom, m.trunk);
    trunk.position.set(x, y + 1.3, z);
    const leaf = new THREE.Mesh(leafGeomConical, m.leaf);
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
