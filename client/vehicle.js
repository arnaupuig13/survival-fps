// Drivable buggy. v1.5 spawns one per town center; client-side driving (no
// multiplayer sync yet — peers won't see other players' vehicles, but the
// driver gets the full handling experience).
//
// Controls while inside:
//   W / S   accelerate / brake
//   A / D   steer
//   F       exit
//
// Camera attaches behind/above the buggy. Player mesh stays hidden until
// they press F to leave (they pop out at the side of the buggy).

import * as THREE from 'three';
import { scene, camera } from './three-setup.js';
import { heightAt } from './world.js';
import { player } from './player.js';
import { keys } from './player.js';

const ENTER_RANGE = 3.0;
const TOP_SPEED = 22;            // m/s
const ACCEL = 12;                // m/s^2
const BRAKE = 18;                // m/s^2
const STEER_SPEED = 2.2;         // rad/s at full speed
const FRICTION = 6;              // m/s^2 with no input

const TOWN_VEHICLE_SPAWNS = [
  { x: -150 + 8, z:  140 - 4 },
  { x:  155 + 8, z:  150 - 4 },
  { x: -160 + 8, z: -130 - 4 },
  { x:  140 + 8, z: -160 - 4 },
];

// =====================================================================
// Mesh — chunky open-frame buggy. Body + 4 wheels + roll cage.
// =====================================================================
function makeBuggyMesh() {
  const g = new THREE.Group();
  const bodyMat   = new THREE.MeshStandardMaterial({ color: 0x9a3a1a, roughness: 0.55, metalness: 0.4 });
  const cageMat   = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.45, metalness: 0.7 });
  const wheelMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.85 });
  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xfff4cc, emissive: 0xfff4cc, emissiveIntensity: 0.7 });

  // Chassis / hull.
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 2.4), bodyMat);
  hull.position.y = 0.55; g.add(hull);
  // Engine bump on the rear.
  const engine = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.7), cageMat);
  engine.position.set(0, 0.92, -0.7); g.add(engine);
  // Roll cage — 4 vertical posts + a top bar.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), cageMat);
      post.position.set(sx * 0.6, 1.25, sz * 0.4); g.add(post);
    }
  }
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.06), cageMat);
  topBar.position.set(0, 1.75, 0); g.add(topBar);
  // Seats — visual cue.
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), cageMat);
  seat.position.set(0, 0.95, 0.15); g.add(seat);
  // Wheels.
  const wheelGeom = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeom, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * 0.85, 0.36, sz * 0.85); g.add(w);
    }
  }
  // Headlights at the front.
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.05), headlightMat);
    hl.position.set(sx * 0.55, 0.55, 1.21); g.add(hl);
  }
  return g;
}

// =====================================================================
// Vehicle list state.
// =====================================================================
const vehicles = []; // { mesh, x, z, ry, vx, vz, speed }
function buildVehicles() {
  for (const sp of TOWN_VEHICLE_SPAWNS) {
    const mesh = makeBuggyMesh();
    mesh.position.set(sp.x, heightAt(sp.x, sp.z), sp.z);
    scene.add(mesh);
    vehicles.push({ mesh, x: sp.x, z: sp.z, ry: 0, vx: 0, vz: 0, speed: 0 });
  }
}
buildVehicles();

let driving = null; // pointer to vehicle being driven, or null

export function nearestVehicle(playerPos) {
  let best = null, bestD = ENTER_RANGE;
  for (const v of vehicles) {
    const d = Math.hypot(v.x - playerPos.x, v.z - playerPos.z);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

export function isDriving() { return !!driving; }

export function enterNearest(playerPos) {
  const v = nearestVehicle(playerPos);
  if (!v) return false;
  driving = v;
  return true;
}

export function exit() {
  if (!driving) return;
  // Pop player out at the right side of the vehicle.
  const dx = Math.cos(driving.ry) * 1.4;
  const dz = -Math.sin(driving.ry) * 1.4;
  player.pos.set(driving.x + dx, heightAt(driving.x + dx, driving.z + dz) + 1.65, driving.z + dz);
  driving = null;
}

// Per-frame driving update. Called from main.js while driving=true. The
// player's pos rides the buggy so the existing camera-yokes-to-player code
// keeps working without changes.
export function updateDriving(dt) {
  if (!driving) return;
  const v = driving;
  // Steer via A/D — only effective at speed.
  const steerInput = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const speedFactor = Math.min(1, Math.abs(v.speed) / 6); // weak steer at standstill
  v.ry -= steerInput * STEER_SPEED * speedFactor * dt;
  // Forward unit vector.
  const fx = Math.sin(v.ry), fz = Math.cos(v.ry);
  // Throttle / brake.
  const throttle = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  if (throttle > 0) v.speed = Math.min(TOP_SPEED, v.speed + ACCEL * dt);
  else if (throttle < 0) v.speed = Math.max(-TOP_SPEED * 0.4, v.speed - BRAKE * dt);
  else {
    // Coast — friction toward 0.
    if (v.speed > 0) v.speed = Math.max(0, v.speed - FRICTION * dt);
    else if (v.speed < 0) v.speed = Math.min(0, v.speed + FRICTION * dt);
  }
  // Move.
  v.x += fx * v.speed * dt;
  v.z += fz * v.speed * dt;
  // Clamp to world bounds.
  const HALF = 198;
  if (v.x >  HALF) { v.x =  HALF; v.speed = 0; }
  if (v.x < -HALF) { v.x = -HALF; v.speed = 0; }
  if (v.z >  HALF) { v.z =  HALF; v.speed = 0; }
  if (v.z < -HALF) { v.z = -HALF; v.speed = 0; }
  // Hover above terrain.
  v.mesh.position.set(v.x, heightAt(v.x, v.z), v.z);
  v.mesh.rotation.y = v.ry;
  // Player camera rides the buggy seat (slightly up + back from center).
  const seatY = heightAt(v.x, v.z) + 1.4;
  player.pos.set(v.x, seatY, v.z);
  camera.position.set(v.x, seatY, v.z);
  // Override camera yaw when driving — point it down the buggy's heading.
  camera.rotation.order = 'YXZ';
  camera.rotation.y = v.ry;
  camera.rotation.x = -0.08;
  camera.rotation.z = 0;
}

// Active prompt label — main.js asks us what to display.
export function nearbyVehiclePrompt(playerPos) {
  if (driving) return '[F] bajar del buggy';
  const v = nearestVehicle(playerPos);
  return v ? '[F] subir al buggy' : null;
}
