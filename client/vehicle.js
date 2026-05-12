// Drivable vehicles. v1.4: 3 tipos distintos repartidos por el mapa.
//
//   BUGGY    — rapido, agil, sin proteccion (28 m/s, light)
//   TRUCK    — mediano, espacio, balance (18 m/s, +20% def)
//   APC      — blindado, lento, mucha proteccion (12 m/s, +60% def)
//
// Controles dentro del vehiculo:
//   W / S   acelerar / frenar
//   A / D   girar
//   F       bajar
//
// Spawn: ~15 vehiculos distribuidos en el mapa de 1600x1600m, mezcla
// de los 3 tipos. Variantes de color por tipo.

import * as THREE from 'three';
import { scene, camera } from './three-setup.js';
import { heightAt, WORLD_HALF } from './world.js';
import { player } from './player.js';
import { keys } from './player.js';

const ENTER_RANGE = 4.5;

// Tipos de vehiculo con stats distintas.
const VEHICLE_TYPES = {
  buggy: {
    label: 'BUGGY',
    topSpeed: 28,
    accel: 14,
    brake: 18,
    steer: 2.6,
    friction: 6,
    armorRed: 0.0,            // sin proteccion adicional
    color: 0x9a3a1a,
    seatY: 1.4,
  },
  truck: {
    label: 'CAMION',
    topSpeed: 20,
    accel: 9,
    brake: 14,
    steer: 1.6,
    friction: 5,
    armorRed: 0.20,           // +20% reduccion de daño al conducir
    color: 0x3a5a8a,
    seatY: 1.9,
  },
  apc: {
    label: 'APC BLINDADO',
    topSpeed: 13,
    accel: 6,
    brake: 12,
    steer: 1.2,
    friction: 4,
    armorRed: 0.60,           // +60% reduccion de daño
    color: 0x4a5a3a,
    seatY: 2.2,
  },
};

// =====================================================================
// MESHES — uno por tipo, look distinto.
// =====================================================================
function makeBuggyMesh(color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.4 });
  const cageMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.45, metalness: 0.7 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.85 });
  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xfff4cc, emissive: 0xfff4cc, emissiveIntensity: 0.7 });
  // Chassis.
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 2.4), bodyMat);
  hull.position.y = 0.55; g.add(hull);
  const engine = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.7), cageMat);
  engine.position.set(0, 0.92, -0.7); g.add(engine);
  // Roll cage.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), cageMat);
      post.position.set(sx * 0.6, 1.25, sz * 0.4); g.add(post);
    }
  }
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.06), cageMat);
  topBar.position.set(0, 1.75, 0); g.add(topBar);
  // Wheels.
  const wheelGeom = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeom, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * 0.85, 0.36, sz * 0.85); g.add(w);
    }
  }
  // Headlights.
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.05), headlightMat);
    hl.position.set(sx * 0.55, 0.55, 1.21); g.add(hl);
  }
  return g;
}

function makeTruckMesh(color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.3 });
  const cabMat = new THREE.MeshStandardMaterial({ color: darken(color, 0.85), roughness: 0.6, metalness: 0.4 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.85 });
  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xfff4cc, emissive: 0xfff4cc, emissiveIntensity: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a3a5a, roughness: 0.1, metalness: 0.8, opacity: 0.7, transparent: true });
  // Caja trasera (cargo bed).
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 3.0), bodyMat);
  cargo.position.set(0, 1.2, -1.0); g.add(cargo);
  // Cabina.
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 1.8), cabMat);
  cab.position.set(0, 1.4, 1.2); g.add(cab);
  // Parabrisas.
  const wind = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.7, 0.05), glassMat);
  wind.position.set(0, 1.8, 2.05); g.add(wind);
  // Wheels (6 — doble eje atras).
  const wheelGeom = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 14);
  const wheelPos = [
    [-1.05, 0.55,  1.5], [1.05, 0.55,  1.5],   // delante
    [-1.05, 0.55, -0.4], [1.05, 0.55, -0.4],   // medio
    [-1.05, 0.55, -1.7], [1.05, 0.55, -1.7],   // atras
  ];
  for (const [x, y, z] of wheelPos) {
    const w = new THREE.Mesh(wheelGeom, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z); g.add(w);
  }
  // Headlights.
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.05), headlightMat);
    hl.position.set(sx * 0.6, 1.0, 2.11); g.add(hl);
  }
  return g;
}

function makeApcMesh(color) {
  const g = new THREE.Group();
  const armorMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: darken(color, 0.7), roughness: 0.5, metalness: 0.6 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222224, roughness: 0.9 });
  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xffa040, emissiveIntensity: 0.6 });
  // Hull principal (caja blindada con ángulos).
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 4.5), armorMat);
  hull.position.set(0, 1.1, 0); g.add(hull);
  // Frente angular.
  const front = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.0), armorMat);
  front.position.set(0, 1.4, 2.3); g.add(front);
  front.rotation.x = -0.2;
  // Torreta superior.
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.5, 8), darkMat);
  turret.position.set(0, 2.0, -0.3); g.add(turret);
  // Cañon.
  const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.0, 8), darkMat);
  cannon.rotation.x = Math.PI / 2;
  cannon.position.set(0, 2.0, 0.8); g.add(cannon);
  // Visor (slit).
  const visor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 0.04), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x000000 }));
  visor.position.set(0, 1.55, 2.83); g.add(visor);
  // Ruedas grandes (6).
  const wheelGeom = new THREE.CylinderGeometry(0.7, 0.7, 0.5, 14);
  const wheelPos = [
    [-1.45, 0.65,  1.5], [1.45, 0.65,  1.5],
    [-1.45, 0.65,  0.0], [1.45, 0.65,  0.0],
    [-1.45, 0.65, -1.5], [1.45, 0.65, -1.5],
  ];
  for (const [x, y, z] of wheelPos) {
    const w = new THREE.Mesh(wheelGeom, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z); g.add(w);
  }
  // Headlights protegidos.
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.04), headlightMat);
    hl.position.set(sx * 0.85, 1.1, 2.86); g.add(hl);
  }
  return g;
}

function darken(hex, factor) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return (Math.floor(r * factor) << 16) | (Math.floor(g * factor) << 8) | Math.floor(b * factor);
}

function makeMesh(type) {
  const cfg = VEHICLE_TYPES[type];
  if (type === 'truck') return makeTruckMesh(cfg.color);
  if (type === 'apc')   return makeApcMesh(cfg.color);
  return makeBuggyMesh(cfg.color);
}

// =====================================================================
// Vehicle spawn — esparcidos por el mapa.
// =====================================================================
const SPAWNS = [
  // Cerca de pueblos (4 esquinas)
  { x: -580, z:  540, type: 'buggy' },
  { x:  600, z:  580, type: 'buggy' },
  { x: -620, z: -500, type: 'truck' },
  { x:  540, z: -620, type: 'truck' },
  // Pueblos medios
  { x: -280, z:  620, type: 'buggy' },
  { x:  280, z: -660, type: 'truck' },
  { x: -680, z:  120, type: 'buggy' },
  { x:  700, z:  -60, type: 'apc' },        // APC en Eastmark
  { x:   80, z:  660, type: 'truck' },
  { x: -160, z: -680, type: 'apc' },        // APC en Burntpoint
  // En caminos / puntos intermedios
  { x: -300, z:  200, type: 'buggy' },
  { x:  400, z: -250, type: 'truck' },
  { x: -250, z: -250, type: 'buggy' },
  { x:  250, z:  300, type: 'truck' },
  // Cerca de Helix (peligrosos — premio para los que se acerquen)
  { x:  150, z: -150, type: 'apc' },
  { x: -150, z: -150, type: 'apc' },
];

const vehicles = [];
function buildVehicles() {
  for (const sp of SPAWNS) {
    const mesh = makeMesh(sp.type);
    mesh.position.set(sp.x, heightAt(sp.x, sp.z), sp.z);
    scene.add(mesh);
    vehicles.push({
      mesh,
      type: sp.type,
      cfg: VEHICLE_TYPES[sp.type],
      x: sp.x, z: sp.z,
      ry: Math.random() * Math.PI * 2,
      speed: 0,
    });
  }
  console.log(`[vehicle] Spawned ${vehicles.length} vehicles (${SPAWNS.filter(s => s.type === 'buggy').length} buggies, ${SPAWNS.filter(s => s.type === 'truck').length} trucks, ${SPAWNS.filter(s => s.type === 'apc').length} APCs)`);
}
buildVehicles();

let driving = null;

export function nearestVehicle(playerPos) {
  let best = null, bestD = ENTER_RANGE;
  for (const v of vehicles) {
    const d = Math.hypot(v.x - playerPos.x, v.z - playerPos.z);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

export function isDriving() { return !!driving; }
export function getDrivingVehicle() { return driving; }

export function enterNearest(playerPos) {
  const v = nearestVehicle(playerPos);
  if (!v) return false;
  driving = v;
  // Buff de armor segun tipo.
  player._vehicleArmor = v.cfg.armorRed || 0;
  return true;
}

export function exit() {
  if (!driving) return;
  const dx = Math.cos(driving.ry) * 1.8;
  const dz = -Math.sin(driving.ry) * 1.8;
  player.pos.set(driving.x + dx, heightAt(driving.x + dx, driving.z + dz) + (player.eyeHeightCurrent || 1.65), driving.z + dz);
  driving = null;
  player._vehicleArmor = 0;
}

// Per-frame driving update.
export function updateDriving(dt) {
  if (!driving) return;
  const v = driving;
  const cfg = v.cfg;
  const steerInput = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const speedFactor = Math.min(1, Math.abs(v.speed) / 6);
  v.ry -= steerInput * cfg.steer * speedFactor * dt;
  const fx = Math.sin(v.ry), fz = Math.cos(v.ry);
  const throttle = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  if (throttle > 0) v.speed = Math.min(cfg.topSpeed, v.speed + cfg.accel * dt);
  else if (throttle < 0) v.speed = Math.max(-cfg.topSpeed * 0.4, v.speed - cfg.brake * dt);
  else {
    if (v.speed > 0) v.speed = Math.max(0, v.speed - cfg.friction * dt);
    else if (v.speed < 0) v.speed = Math.min(0, v.speed + cfg.friction * dt);
  }
  v.x += fx * v.speed * dt;
  v.z += fz * v.speed * dt;
  const HALF = WORLD_HALF - 5;
  if (v.x >  HALF) { v.x =  HALF; v.speed = 0; }
  if (v.x < -HALF) { v.x = -HALF; v.speed = 0; }
  if (v.z >  HALF) { v.z =  HALF; v.speed = 0; }
  if (v.z < -HALF) { v.z = -HALF; v.speed = 0; }
  v.mesh.position.set(v.x, heightAt(v.x, v.z), v.z);
  v.mesh.rotation.y = v.ry;
  const seatY = heightAt(v.x, v.z) + cfg.seatY;
  player.pos.set(v.x, seatY, v.z);
  camera.position.set(v.x, seatY, v.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = v.ry;
  camera.rotation.x = -0.08;
  camera.rotation.z = 0;
}

// Prompt para el HUD.
export function nearbyVehiclePrompt(playerPos) {
  if (driving) {
    return `[F] bajar del ${driving.cfg.label.toLowerCase()}`;
  }
  const v = nearestVehicle(playerPos);
  return v ? `[F] subir al ${v.cfg.label.toLowerCase()}` : null;
}
