// Ambient props — autos abandonados + cadáveres ambientales + dust particles.
// Spawned al inicio una vez en posiciones determinísticas.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';

// =====================================================================
// Auto abandonado — caja con techo + ruedas, color desaturado.
// =====================================================================
function makeAbandonedCar(seed) {
  const g = new THREE.Group();
  const colors = [0x6a5a4a, 0x4a4a52, 0x5a4040, 0x404a4a, 0x6a6a6a];
  const carColor = colors[Math.floor(seed * colors.length) % colors.length];
  const bodyMat = new THREE.MeshStandardMaterial({ color: carColor, roughness: 0.85, metalness: 0.3 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a1a26, roughness: 0.3, metalness: 0.7 });
  // Body lower.
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 3.6), bodyMat);
  body.position.y = 0.45; g.add(body);
  // Cabin top.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 1.8), bodyMat);
  cabin.position.set(0, 0.95, -0.1); g.add(cabin);
  // Front + rear glass.
  const fGlass = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 0.06), glassMat);
  fGlass.position.set(0, 0.95, 0.85); g.add(fGlass);
  const bGlass = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 0.06), glassMat);
  bGlass.position.set(0, 0.95, -1.05); g.add(bGlass);
  // 4 wheels.
  for (const wx of [-0.85, 0.85]) for (const wz of [-1.4, 1.4]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 10), wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.34, wz); g.add(w);
  }
  return g;
}

// =====================================================================
// Cadáver civil — mesh humanoide caído color desaturado.
// =====================================================================
function makeAmbientCorpse(seed) {
  const g = new THREE.Group();
  const colors = [0x4a3020, 0x3a2818, 0x2a1810, 0x504030, 0x382818];
  const cl = colors[Math.floor(seed * colors.length) % colors.length];
  const skin = new THREE.MeshStandardMaterial({ color: 0x6a5040, roughness: 0.9 });
  const clothMat = new THREE.MeshStandardMaterial({ color: cl, roughness: 0.95 });
  // Torso tumbado.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 1.2), clothMat);
  torso.position.y = 0.16; g.add(torso);
  // Cabeza al lado.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
  head.position.set(0, 0.18, 0.78); g.add(head);
  // Brazos tirados.
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.7), skin);
    arm.position.set(sx * 0.42, 0.08, 0.2); g.add(arm);
  }
  // Piernas.
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.85), clothMat);
    leg.position.set(sx * 0.18, 0.09, -0.5); g.add(leg);
  }
  return g;
}

// =====================================================================
// Spawn determinístico — autos en towns + corpses scattered.
// Llamado una vez al boot.
// =====================================================================
const TOWN_CENTERS = [
  [-300, 280], [310, 300], [-320, -260], [280, -320],
];
const POI_CENTERS = [
  [-160, 120], [160, 140], [-80, 20], [220, -100], [-200, -50],
  [-180, -80], [200, -60], [0, 340], [-350, 0],
];

export function spawnAmbientProps() {
  let s = 12345;
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  // Autos en towns — 2-3 cada una.
  for (const [tx, tz] of TOWN_CENTERS) {
    const count = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const r = 24 + rng() * 14;
      const cx = tx + Math.cos(angle) * r;
      const cz = tz + Math.sin(angle) * r;
      const car = makeAbandonedCar(rng());
      car.position.set(cx, heightAt(cx, cz), cz);
      car.rotation.y = rng() * Math.PI * 2;
      scene.add(car);
    }
  }
  // Corpses en POIs (gas + cabin) — 1-2 cada uno.
  for (const [px, pz] of POI_CENTERS) {
    const count = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const r = 4 + rng() * 6;
      const cx = px + Math.cos(angle) * r;
      const cz = pz + Math.sin(angle) * r;
      const corpse = makeAmbientCorpse(rng());
      corpse.position.set(cx, heightAt(cx, cz) + 0.05, cz);
      corpse.rotation.y = rng() * Math.PI * 2;
      scene.add(corpse);
    }
  }
}

// =====================================================================
// Dust particles — pequeños puntos que flotan alrededor del player con
// densidad sutil. Useful para atmósfera + visual feedback de "outdoor".
// =====================================================================
const DUST_COUNT = 80;
const DUST_RADIUS = 30;
let dustPoints = null;

export function spawnDust() {
  const positions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    positions[i * 3]     = (Math.random() * 2 - 1) * DUST_RADIUS;
    positions[i * 3 + 1] = Math.random() * 8;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * DUST_RADIUS;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xc0b89a,
    size: 0.08,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  dustPoints = new THREE.Points(geom, mat);
  scene.add(dustPoints);
}

// Dust drift — los puntos siguen al player y se mueven lentamente.
export function tickDust(dt, playerPos) {
  if (!dustPoints) return;
  const pos = dustPoints.geometry.attributes.position;
  const ar = pos.array;
  for (let i = 0; i < DUST_COUNT; i++) {
    // Drift up + horizontal slow.
    ar[i * 3 + 1] += dt * 0.3;
    ar[i * 3]     += dt * 0.1;
    // Wrap si sale del radio.
    if (ar[i * 3 + 1] > 8) ar[i * 3 + 1] = 0;
    const dx = ar[i * 3]     + dustPoints.position.x - playerPos.x;
    const dz = ar[i * 3 + 2] + dustPoints.position.z - playerPos.z;
    if (Math.hypot(dx, dz) > DUST_RADIUS) {
      // Re-randomize cerca del player.
      ar[i * 3]     = playerPos.x - dustPoints.position.x + (Math.random() * 2 - 1) * DUST_RADIUS * 0.5;
      ar[i * 3 + 2] = playerPos.z - dustPoints.position.z + (Math.random() * 2 - 1) * DUST_RADIUS * 0.5;
    }
  }
  pos.needsUpdate = true;
}
