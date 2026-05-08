// Proyectiles visuales del bilebomber — bolas verdes ácidas que viajan
// del enemy al target (player) con un arco. Puramente visuales — el
// daño lo aplica el server vía 'youHit' con source 'bilebomber'/'bile'.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { enemies } from './entities.js';

const balls = [];   // { mesh, sx, sz, ex, ez, sy, ey, t, dur }

const ballMat = new THREE.MeshStandardMaterial({
  color: 0x60ff30, emissive: 0x40c020, emissiveIntensity: 1.6,
  roughness: 0.3, metalness: 0.2,
});
const ballGeom = new THREE.SphereGeometry(0.18, 10, 8);

// Llamado cuando el server emite eShoot. Filtra por etype del shooter
// — solo el bilebomber spawnea visual de bola.
export function onEnemyShoot(msg) {
  const e = enemies.get(msg.id);
  if (!e) return;
  if (e.etype !== 'bilebomber') return;
  // Origen: posición del enemy + altura cuello.
  const sx = e.mesh.position.x;
  const sy = e.mesh.position.y + 1.6;
  const sz = e.mesh.position.z;
  const ex = msg.tx;
  const ey = (msg.ty != null ? msg.ty : sy);
  const ez = msg.tz;
  const dist = Math.hypot(ex - sx, ez - sz);
  const dur = Math.max(0.4, dist / 18);     // 18 m/s velocidad bile
  const mesh = new THREE.Mesh(ballGeom, ballMat);
  mesh.position.set(sx, sy, sz);
  scene.add(mesh);
  balls.push({ mesh, sx, sy, sz, ex, ey, ez, t: 0, dur });
}

export function tick(dt) {
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    b.t += dt;
    const u = Math.min(1, b.t / b.dur);
    // Arco parabólico — y aumenta + cae con (1 - 4*(u-0.5)^2).
    const arc = (1 - 4 * (u - 0.5) ** 2) * 1.5;
    b.mesh.position.x = b.sx + (b.ex - b.sx) * u;
    b.mesh.position.z = b.sz + (b.ez - b.sz) * u;
    b.mesh.position.y = b.sy + (b.ey - b.sy) * u + arc;
    // Pulse del emissive.
    if (b.mesh.material) {
      b.mesh.material.emissiveIntensity = 1.4 + Math.sin(b.t * 12) * 0.4;
    }
    if (u >= 1) {
      scene.remove(b.mesh);
      // No dispose — material/geom compartidos.
      balls.splice(i, 1);
    }
  }
}
