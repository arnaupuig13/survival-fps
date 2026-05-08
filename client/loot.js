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
  wood:        new THREE.MeshStandardMaterial({ color: 0x6a4a22, roughness: 0.85 }),
  metal:       new THREE.MeshStandardMaterial({ color: 0x4a4a4e, roughness: 0.5, metalness: 0.85 }),
  metalGreen:  new THREE.MeshStandardMaterial({ color: 0x3a4a28, roughness: 0.55, metalness: 0.7 }),
  band:        new THREE.MeshStandardMaterial({ color: 0xf0c060, roughness: 0.5, metalness: 0.5, emissive: 0x402810, emissiveIntensity: 0.7 }),
  cityBand:    new THREE.MeshStandardMaterial({ color: 0x60b0f0, roughness: 0.4, metalness: 0.6, emissive: 0x1040a0, emissiveIntensity: 0.9 }),
  bossBand:    new THREE.MeshStandardMaterial({ color: 0xff5050, roughness: 0.4, metalness: 0.6, emissive: 0xa01010, emissiveIntensity: 1.0 }),
  streetBand:  new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.5, metalness: 0.4, emissive: 0x303030, emissiveIntensity: 0.4 }),
  militaryBand:new THREE.MeshStandardMaterial({ color: 0x80aa30, roughness: 0.4, metalness: 0.7, emissive: 0x305010, emissiveIntensity: 0.7 }),
};

export const crates = new Map(); // id → { mesh, x, z, tableKey }

function bandMatFor(tableKey) {
  if (tableKey === 'boss')     return MATS.bossBand;
  if (tableKey === 'city')     return MATS.cityBand;
  if (tableKey === 'military') return MATS.militaryBand;
  if (tableKey === 'street')   return MATS.streetBand;
  return MATS.band;
}

function makeCrateMesh(tableKey) {
  const g = new THREE.Group();
  // STREET — bolsa/cajita pequeña en el suelo (loot de exploración).
  if (tableKey === 'street') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.45), MATS.wood);
    box.position.y = 0.16; g.add(box);
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.47), MATS.streetBand);
    ribbon.position.y = 0.32; g.add(ribbon);
    return g;
  }
  // MILITARY — caja metálica VERDE militar grande con tres bandas
  // brillantes y stencils marcados.
  if (tableKey === 'military') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.8), MATS.metalGreen);
    box.position.y = 0.35; g.add(box);
    // Bandas inferior + superior + cierres laterales.
    const bandLow = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.06, 0.82), MATS.militaryBand);
    bandLow.position.y = 0.10; g.add(bandLow);
    const bandHigh = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.06, 0.82), MATS.militaryBand);
    bandHigh.position.y = 0.60; g.add(bandHigh);
    // Manija superior.
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 8), MATS.metal);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0, 0.78, 0); g.add(handle);
    // Cuatro patas/refuerzos.
    const refMat = MATS.metal;
    for (const dx of [-0.5, 0.5]) for (const dz of [-0.36, 0.36]) {
      const ref = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), refMat);
      ref.position.set(dx, 0.35, dz); g.add(ref);
    }
    return g;
  }
  // BOSS — caja roja más grande con ornamentos.
  if (tableKey === 'boss') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.85, 0.85), MATS.wood);
    box.position.y = 0.42; g.add(box);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.10, 0.87), MATS.bossBand);
    band.position.y = 0.62; g.add(band);
    // Cofre con tapa elevada.
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.18, 0.87), MATS.wood);
    lid.position.y = 0.94; g.add(lid);
    // Star ornament.
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.10, 0), MATS.bossBand);
    star.position.y = 1.10; g.add(star);
    return g;
  }
  // CITY — caja de laboratorio azul con luces emisivas.
  if (tableKey === 'city') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.7), MATS.metal);
    box.position.y = 0.35; g.add(box);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.10, 0.72), MATS.cityBand);
    band.position.y = 0.55; g.add(band);
    // Indicador LED arriba.
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x40c0ff, emissive: 0x40c0ff, emissiveIntensity: 1.5 }),
    );
    led.position.set(0.4, 0.74, 0); g.add(led);
    return g;
  }
  // TOWN (default) — caja de madera estándar.
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.65, 0.65), MATS.wood);
  box.position.y = 0.32; g.add(box);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.67), bandMatFor(tableKey));
  band.position.y = 0.5; g.add(band);
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
