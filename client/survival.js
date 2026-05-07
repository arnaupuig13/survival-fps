// Survival systems — campfires (placed by player), berry bushes (ambient),
// resource harvesting helpers. Pure client-side; no multiplayer sync of
// fires/bushes (those persist locally per session).

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt, obstacles, WORLD_HALF } from './world.js';

// =====================================================================
// Campfires — placeable. Group of logs + glowing flame core + point light.
// Each fire emits warmth and lets the player cook within its radius.
// =====================================================================

const FIRE_RADIUS = 4.5;
const fires = [];

const FIRE_MATS = {
  log:    new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.9 }),
  ember:  new THREE.MeshBasicMaterial({ color: 0xff8030 }),
  flame:  new THREE.MeshBasicMaterial({ color: 0xffaa30, transparent: true, opacity: 0.85 }),
};

function makeFireMesh() {
  const g = new THREE.Group();
  // Three crossed logs.
  const logGeom = new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6);
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(logGeom, FIRE_MATS.log);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i * Math.PI) / 3;
    log.position.y = 0.08;
    g.add(log);
  }
  // Glowing ember disc at the base.
  const ember = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), FIRE_MATS.ember);
  ember.rotation.x = -Math.PI / 2;
  ember.position.y = 0.04;
  g.add(ember);
  // Animated flame cone.
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 6), FIRE_MATS.flame);
  flame.position.y = 0.45;
  g.add(flame);
  g.userData.flame = flame;
  // Point light.
  const light = new THREE.PointLight(0xffaa44, 1.4, 12, 1.6);
  light.position.y = 0.5;
  g.add(light);
  g.userData.light = light;
  return g;
}

export function placeFire(x, z) {
  if (Math.abs(x) > WORLD_HALF - 2 || Math.abs(z) > WORLD_HALF - 2) return null;
  const mesh = makeFireMesh();
  mesh.position.set(x, heightAt(x, z), z);
  scene.add(mesh);
  const fire = { mesh, x, z, flickerPhase: Math.random() * Math.PI * 2 };
  fires.push(fire);
  // Add a small collider so the player can't walk on top of it.
  obstacles.push({ x, z, r: 0.5 });
  return fire;
}

export function isNearAnyFire(x, z, radius = FIRE_RADIUS) {
  for (const f of fires) {
    const dx = f.x - x, dz = f.z - z;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

// =====================================================================
// Berry bushes — ambient pickups scattered in forests. Each bush has a
// charge counter; harvesting (E key when prompted) consumes one charge
// and adds a berry to the inventory. Deterministic seed so all clients
// see the same bushes.
// =====================================================================

const BERRY_COUNT = 90;
const BUSH_COLLIDER_R = 0.45;
const bushes = [];

const BERRY_MATS = {
  leaf:  new THREE.MeshStandardMaterial({ color: 0x2a5018, roughness: 0.9 }),
  berry: new THREE.MeshStandardMaterial({ color: 0xb02828, roughness: 0.6, emissive: 0x501010, emissiveIntensity: 0.4 }),
};

function makeBushMesh() {
  const g = new THREE.Group();
  // Leaf cluster — three overlapping spheres.
  const leafGeom = new THREE.SphereGeometry(0.45, 8, 6);
  for (const [ox, oy, oz] of [[0, 0.2, 0], [-0.25, 0.15, 0.1], [0.25, 0.15, -0.1]]) {
    const leaf = new THREE.Mesh(leafGeom, BERRY_MATS.leaf);
    leaf.position.set(ox, oy, oz);
    g.add(leaf);
  }
  // Berries — small red emissive spheres.
  const berryGeom = new THREE.SphereGeometry(0.06, 5, 4);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const berry = new THREE.Mesh(berryGeom, BERRY_MATS.berry);
    berry.position.set(Math.cos(angle) * 0.35, 0.18, Math.sin(angle) * 0.35);
    g.add(berry);
  }
  return g;
}

function spawnBushes() {
  let s = 7421;
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < BERRY_COUNT; i++) {
    const x = (rng() * 2 - 1) * (WORLD_HALF - 6);
    const z = (rng() * 2 - 1) * (WORLD_HALF - 6);
    if (x * x + z * z < 36) continue; // skip player spawn
    // Skip towns.
    let inTown = false;
    for (const t of [
      [-150, 140, 32], [155, 150, 32], [-160, -130, 32],
      [140, -160, 32], [0, -100, 80],
    ]) {
      const dx = t[0] - x, dz = t[1] - z;
      if (dx * dx + dz * dz < t[2] * t[2]) { inTown = true; break; }
    }
    if (inTown) continue;
    const mesh = makeBushMesh();
    mesh.position.set(x, heightAt(x, z), z);
    scene.add(mesh);
    bushes.push({ mesh, x, z, charges: 3 });
  }
}
spawnBushes();

export function nearestBushInRange(playerPos, range = 2.5) {
  let best = null, bestD = range;
  for (const b of bushes) {
    if (b.charges <= 0) continue;
    const d = Math.hypot(b.x - playerPos.x, b.z - playerPos.z);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

export function harvestBush(bush) {
  if (!bush || bush.charges <= 0) return 0;
  bush.charges -= 1;
  if (bush.charges <= 0) {
    // Hide the berries on the mesh by tinting them dark — bush regrows after a while.
    bush.mesh.children.forEach(c => { if (c.material === BERRY_MATS.berry) c.visible = false; });
    setTimeout(() => {
      bush.charges = 3;
      bush.mesh.children.forEach(c => c.visible = true);
    }, 90 * 1000);
  }
  return 1;
}

// =====================================================================
// Lakes — small water plates scattered around. Walk close, press E to
// fill a water bottle. Static, deterministic seed.
// =====================================================================

const lakes = [];
const LAKE_MAT = new THREE.MeshStandardMaterial({
  color: 0x2860a0, roughness: 0.1, metalness: 0.0,
  emissive: 0x103060, emissiveIntensity: 0.18, transparent: true, opacity: 0.78,
});

function spawnLakes() {
  // 6 lakes in deterministic positions across the map.
  const places = [
    [-60, 70, 6.0], [50, -60, 5.5], [-110, -20, 7.0],
    [120, 40, 5.0], [-30, -110, 6.5], [90, 110, 5.8],
  ];
  for (const [cx, cz, r] of places) {
    // Skip if inside any town clearing.
    let inTown = false;
    for (const t of [
      [-150, 140, 32], [155, 150, 32], [-160, -130, 32],
      [140, -160, 32], [0, -100, 80],
    ]) {
      const dx = t[0] - cx, dz = t[1] - cz;
      if (dx * dx + dz * dz < t[2] * t[2]) { inTown = true; break; }
    }
    if (inTown) continue;
    const geom = new THREE.CircleGeometry(r, 24);
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, LAKE_MAT);
    // Sit just above terrain to avoid z-fight.
    mesh.position.set(cx, heightAt(cx, cz) - 0.15, cz);
    scene.add(mesh);
    lakes.push({ mesh, x: cx, z: cz, r });
  }
}
spawnLakes();

export function nearestLakeInRange(playerPos, range = 3.5) {
  let best = null, bestD = range;
  for (const l of lakes) {
    const d = Math.hypot(l.x - playerPos.x, l.z - playerPos.z) - l.r;
    if (d < bestD) { bestD = d; best = l; }
  }
  return best;
}

// =====================================================================
// Medicinal plants — emissive green leaf cluster, +20 HP on pickup.
// 50 spawned in forests away from towns.
// =====================================================================

const PLANT_COUNT = 50;
const plants = [];
const PLANT_MATS = {
  leaf:   new THREE.MeshStandardMaterial({ color: 0x40d060, roughness: 0.7, emissive: 0x10501a, emissiveIntensity: 0.4 }),
  flower: new THREE.MeshStandardMaterial({ color: 0xf0f0e0, roughness: 0.5, emissive: 0xc0c0a0, emissiveIntensity: 0.3 }),
};

function makePlantMesh() {
  const g = new THREE.Group();
  // Leaf cluster.
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.18), PLANT_MATS.leaf);
    leaf.position.set(Math.cos(angle) * 0.12, 0.22, Math.sin(angle) * 0.12);
    leaf.rotation.z = Math.cos(angle) * 0.4;
    leaf.rotation.x = Math.sin(angle) * 0.4;
    g.add(leaf);
  }
  // Single white flower on top.
  const flower = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), PLANT_MATS.flower);
  flower.position.y = 0.5; g.add(flower);
  return g;
}

function spawnPlants() {
  let s = 13579;
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  let tries = 0;
  while (plants.length < PLANT_COUNT && tries < PLANT_COUNT * 20) {
    tries++;
    const x = (rng() * 2 - 1) * (WORLD_HALF - 6);
    const z = (rng() * 2 - 1) * (WORLD_HALF - 6);
    if (x * x + z * z < 36) continue;
    let inTown = false;
    for (const t of [
      [-150, 140, 32], [155, 150, 32], [-160, -130, 32],
      [140, -160, 32], [0, -100, 80],
    ]) {
      const dx = t[0] - x, dz = t[1] - z;
      if (dx * dx + dz * dz < t[2] * t[2]) { inTown = true; break; }
    }
    if (inTown) continue;
    const mesh = makePlantMesh();
    mesh.position.set(x, heightAt(x, z), z);
    scene.add(mesh);
    plants.push({ mesh, x, z, taken: false });
  }
}
spawnPlants();

export function nearestPlantInRange(playerPos, range = 1.8) {
  let best = null, bestD = range;
  for (const p of plants) {
    if (p.taken) continue;
    const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
export function harvestPlant(plant) {
  if (!plant || plant.taken) return false;
  plant.taken = true;
  plant.mesh.visible = false;
  // Regrow after 2 minutes.
  setTimeout(() => { plant.taken = false; plant.mesh.visible = true; }, 120 * 1000);
  return true;
}

// =====================================================================
// Per-frame update — flame flicker + light pulse on fires.
// =====================================================================
export function updateSurvival(dt) {
  for (const f of fires) {
    f.flickerPhase += dt * 9;
    const k = 0.85 + Math.sin(f.flickerPhase) * 0.15 + Math.sin(f.flickerPhase * 2.7) * 0.1;
    if (f.mesh.userData.flame) f.mesh.userData.flame.scale.y = k;
    if (f.mesh.userData.light) f.mesh.userData.light.intensity = 1.0 + k * 0.5;
  }
}
