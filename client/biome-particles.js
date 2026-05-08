// Partículas por bioma — copos de nieve en snow, cenizas en burnt,
// polvo amarillento en desert. Visible solo cuando el player está en
// ese bioma. Particulas siguen al player (radius 30m) y wrappen.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { biomeAt } from './world.js';

const COUNT = 200;
const RADIUS = 30;
const FALL_SPEED = { snow: 1.5, burnt: 0.8, desert: 0.4 };
const COLORS = { snow: 0xeef0f8, burnt: 0x8a7060, desert: 0xd4b878 };
const SIZES  = { snow: 0.08, burnt: 0.06, desert: 0.05 };

const systems = {};       // biome → { points, positions, speeds }
let currentBiome = null;

function makeSystem(biome) {
  const positions = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3]     = (Math.random() * 2 - 1) * RADIUS;
    positions[i * 3 + 1] = Math.random() * 18;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * RADIUS;
    speeds[i] = (0.7 + Math.random() * 0.6);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: COLORS[biome],
    size: SIZES[biome],
    sizeAttenuation: true,
    transparent: true,
    opacity: biome === 'snow' ? 0.85 : 0.55,
    depthWrite: false,
  });
  const points = new THREE.Points(geom, mat);
  points.visible = false;
  scene.add(points);
  return { points, positions, speeds };
}

export function initBiomeParticles() {
  systems.snow   = makeSystem('snow');
  systems.burnt  = makeSystem('burnt');
  systems.desert = makeSystem('desert');
}

export function tick(dt, playerPos) {
  const biome = biomeAt(playerPos.x, playerPos.z);
  // Toggle visibilidad al cambiar bioma.
  if (currentBiome !== biome) {
    for (const k of Object.keys(systems)) {
      if (systems[k]) systems[k].points.visible = false;
    }
    if (systems[biome]) systems[biome].points.visible = true;
    currentBiome = biome;
  }
  const sys = systems[biome];
  if (!sys || !sys.points.visible) return;
  // Anclar el cluster cerca del player.
  sys.points.position.set(playerPos.x, 0, playerPos.z);
  const fall = FALL_SPEED[biome];
  const ar = sys.positions;
  for (let i = 0; i < COUNT; i++) {
    ar[i * 3 + 1] -= fall * sys.speeds[i] * dt;
    // Wind sutil en X+Z para que el polvo/ceniza no caiga recto.
    if (biome === 'desert') {
      ar[i * 3]     += dt * 0.6;
      ar[i * 3 + 2] += dt * 0.4;
    } else if (biome === 'burnt') {
      ar[i * 3]     += dt * 0.3;
      ar[i * 3 + 1] += dt * 0.2;        // ceniza también flota
    }
    // Wrap si toca suelo o sale del radio.
    if (ar[i * 3 + 1] < 0) {
      ar[i * 3 + 1] = 18;
      ar[i * 3]     = (Math.random() * 2 - 1) * RADIUS;
      ar[i * 3 + 2] = (Math.random() * 2 - 1) * RADIUS;
    }
    const dx = ar[i * 3], dz = ar[i * 3 + 2];
    if (Math.hypot(dx, dz) > RADIUS) {
      ar[i * 3]     = (Math.random() * 2 - 1) * RADIUS * 0.5;
      ar[i * 3 + 2] = (Math.random() * 2 - 1) * RADIUS * 0.5;
    }
  }
  sys.points.geometry.attributes.position.needsUpdate = true;
}
