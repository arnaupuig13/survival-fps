// Loot crates rendered as 3D meshes. Each crate is the same wooden box +
// glowing band silhouette regardless of tier — the city/boss tiers just
// drop more loot, server-side. Crate id maps to the server entity.
//
// Pickup: when the local player walks within INTERACT_RANGE, an HUD
// prompt shows. Pressing E sends `openCrate` to the server.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';

export const INTERACT_RANGE = 3.0;

const MATS = {
  wood:    new THREE.MeshStandardMaterial({ color: 0x6a4a22, roughness: 0.85 }),
  band:    new THREE.MeshStandardMaterial({ color: 0xf0c060, roughness: 0.5, metalness: 0.5, emissive: 0x402810, emissiveIntensity: 0.7 }),
  cityBand:new THREE.MeshStandardMaterial({ color: 0x60b0f0, roughness: 0.4, metalness: 0.6, emissive: 0x1040a0, emissiveIntensity: 0.9 }),
  bossBand:new THREE.MeshStandardMaterial({ color: 0xff5050, roughness: 0.4, metalness: 0.6, emissive: 0xa01010, emissiveIntensity: 1.0 }),
};

export const crates = new Map(); // id → { mesh, x, z, tableKey }

function bandMatFor(tableKey) {
  if (tableKey === 'boss') return MATS.bossBand;
  if (tableKey === 'city') return MATS.cityBand;
  return MATS.band;
}

function makeCrateMesh(tableKey) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.65, 0.65), MATS.wood);
  box.position.y = 0.32; g.add(box);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.67), bandMatFor(tableKey));
  band.position.y = 0.5; g.add(band);
  // Tier marker — a small cube on top that hints at value (yellow/blue/red).
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.18), bandMatFor(tableKey));
  top.position.y = 0.7; g.add(top);
  return g;
}

export function spawnCrate(info) {
  if (crates.has(info.id)) return;
  const mesh = makeCrateMesh(info.tableKey);
  mesh.position.set(info.x, heightAt(info.x, info.z), info.z);
  scene.add(mesh);
  crates.set(info.id, { id: info.id, mesh, x: info.x, z: info.z, tableKey: info.tableKey });
}

export function removeCrate(id) {
  const c = crates.get(id); if (!c) return;
  scene.remove(c.mesh);
  c.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
  crates.delete(id);
}

// Returns the closest crate within INTERACT_RANGE, or null.
export function nearestInRange(playerPos) {
  let best = null, bestD = INTERACT_RANGE;
  for (const c of crates.values()) {
    const dx = c.x - playerPos.x, dz = c.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
