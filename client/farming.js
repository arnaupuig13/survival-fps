// Plantación — usá `seeds` desde el inventario para plantar un brote en
// el suelo frente al player. Después de 90s madura y muestra bayas
// rojas. E para cosechar (3-5 bayas + retira el planter).
//
// Persiste en localStorage para que las plantas vivan entre sesiones.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';
import * as inv from './inventory.js';
import { logLine, showBanner } from './hud.js';
import * as sfx from './sounds.js';

const GROW_TIME = 90;        // segundos hasta madurar
const HARVEST_RANGE = 2.0;   // distancia para cosechar
const STORAGE_KEY = 'survival-fps-v1-plants';

const state = { plants: load() };
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.z));
  } catch { return []; }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.plants)); } catch {}
}

const plantMeshes = new Map();      // id → group

const dirtMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.95 });
const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a8030, roughness: 0.85 });
const matureLeafMat = new THREE.MeshStandardMaterial({ color: 0x60a040, roughness: 0.85 });
const berryMat = new THREE.MeshStandardMaterial({ color: 0xc04030, roughness: 0.6, emissive: 0x401010, emissiveIntensity: 0.3 });

function makePlantMesh(matured) {
  const g = new THREE.Group();
  // Tierra base.
  const dirt = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.08, 8), dirtMat);
  dirt.position.y = 0.04;
  g.add(dirt);
  if (!matured) {
    // Brote pequeño verde.
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.18, 5), stemMat);
    stem.position.y = 0.17;
    g.add(stem);
    // 2 hojas pequeñas.
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.02, 0.08), stemMat);
      leaf.position.set(sx * 0.06, 0.20, 0);
      g.add(leaf);
    }
  } else {
    // Planta madura — tallo más alto + hojas más grandes + bayas rojas.
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.45, 6), stemMat);
    stem.position.y = 0.30;
    g.add(stem);
    // Múltiples hojas ramificadas.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.14), matureLeafMat);
      leaf.position.set(Math.cos(a) * 0.12, 0.30 + Math.random() * 0.15, Math.sin(a) * 0.12);
      leaf.rotation.y = a;
      leaf.rotation.z = (Math.random() - 0.5) * 0.4;
      g.add(leaf);
    }
    // 3-5 bayas rojas brillantes.
    const berryCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < berryCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.08 + Math.random() * 0.08;
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), berryMat);
      berry.position.set(Math.cos(a) * r, 0.42 + Math.random() * 0.10, Math.sin(a) * r);
      g.add(berry);
    }
  }
  return g;
}

function spawnMesh(plant) {
  if (plantMeshes.has(plant.id)) {
    scene.remove(plantMeshes.get(plant.id));
    plantMeshes.delete(plant.id);
  }
  const matured = (Date.now() - plant.plantedAt) >= GROW_TIME * 1000;
  const m = makePlantMesh(matured);
  m.position.set(plant.x, heightAt(plant.x, plant.z), plant.z);
  scene.add(m);
  plantMeshes.set(plant.id, m);
  return matured;
}

function removeMesh(id) {
  const m = plantMeshes.get(id);
  if (!m) return;
  scene.remove(m);
  m.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
  plantMeshes.delete(id);
}

// Spawn meshes para plantas existentes al cargar.
for (const p of state.plants) spawnMesh(p);

// =====================================================================
// Plantar — consume 1 semilla, crea planter al frente.
// =====================================================================
export function plantSeed(x, z) {
  if (!inv.consume('seeds', 1)) {
    logLine('Necesitás semillas');
    return false;
  }
  const id = `plant_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const plant = { id, x, z, plantedAt: Date.now(), matured: false };
  state.plants.push(plant);
  spawnMesh(plant);
  save();
  showBanner('SEMILLA PLANTADA', 1500);
  logLine(`Brote plantado — madura en ${GROW_TIME}s`);
  sfx.playPickup?.();
  return true;
}

export function nearestInRange(playerPos) {
  let best = null, bestD = HARVEST_RANGE;
  for (const p of state.plants) {
    const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

export function harvest(plantId) {
  const idx = state.plants.findIndex((p) => p.id === plantId);
  if (idx < 0) return false;
  const p = state.plants[idx];
  const matured = (Date.now() - p.plantedAt) >= GROW_TIME * 1000;
  if (!matured) {
    const remain = Math.ceil(GROW_TIME - (Date.now() - p.plantedAt) / 1000);
    logLine(`Aún no madura — ${remain}s restantes`);
    return false;
  }
  // Cosechar: 3-5 bayas + 30% chance de bonus seed.
  const berries = 3 + Math.floor(Math.random() * 3);
  inv.add('berry', berries);
  let bonus = '';
  if (Math.random() < 0.3) {
    inv.add('seeds', 1);
    bonus = ' + 1 semilla bonus';
  }
  logLine(`✓ Cosechaste ${berries} bayas${bonus}`);
  sfx.playPickup?.();
  state.plants.splice(idx, 1);
  removeMesh(plantId);
  save();
  return true;
}

// Tick — chequea cada planta para upgrade visual cuando madure.
export function tick() {
  for (const p of state.plants) {
    if (p.matured) continue;
    if (Date.now() - p.plantedAt >= GROW_TIME * 1000) {
      p.matured = true;
      // Re-spawn mesh con apariencia madura.
      spawnMesh(p);
      logLine('★ Una de tus plantas maduró — listas para cosechar');
      save();
    }
  }
}
