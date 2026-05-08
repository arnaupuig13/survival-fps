// Visual: cuando recargás, un cargador (mag) cae al suelo desde la
// posición del arma. Spawn de mesh chico que cae con gravedad,
// rotación durante caída, vida 6s.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { camera } from './three-setup.js';
import { heightAt } from './world.js';
import { player } from './player.js';

const mags = [];   // { mesh, vy, rotV, life }
const MAG_LIFE = 6.0;
const CAP = 8;     // máximo en pantalla

const magMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.7 });
const magGeom = new THREE.BoxGeometry(0.06, 0.18, 0.04);

export function spawnMagDrop() {
  if (mags.length >= CAP) {
    // Reuse the oldest.
    const old = mags.shift();
    scene.remove(old.mesh);
  }
  const mesh = new THREE.Mesh(magGeom, magMat);
  // Spawn cerca de la mano del player. Convertimos local del gun a world.
  const localPos = new THREE.Vector3(0.18, -0.24, -0.45);
  const worldPos = localPos.clone().applyMatrix4(camera.matrixWorld);
  mesh.position.copy(worldPos);
  // Initial random rotation.
  mesh.rotation.set(Math.random(), Math.random(), Math.random());
  scene.add(mesh);
  mags.push({
    mesh,
    vy: -0.5,
    rotV: { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 4 },
    life: MAG_LIFE,
  });
}

export function tick(dt) {
  for (let i = mags.length - 1; i >= 0; i--) {
    const m = mags[i];
    m.life -= dt;
    if (m.life <= 0) {
      scene.remove(m.mesh);
      mags.splice(i, 1);
      continue;
    }
    // Gravity hasta tocar suelo.
    m.vy -= 14 * dt;
    m.mesh.position.y += m.vy * dt;
    const ground = heightAt(m.mesh.position.x, m.mesh.position.z) + 0.05;
    if (m.mesh.position.y <= ground) {
      m.mesh.position.y = ground;
      m.vy = 0;
      // Stop rotation cuando toca suelo.
      m.rotV.x *= 0.5;
      m.rotV.y *= 0.5;
      m.rotV.z *= 0.5;
    }
    m.mesh.rotation.x += m.rotV.x * dt;
    m.mesh.rotation.y += m.rotV.y * dt;
    m.mesh.rotation.z += m.rotV.z * dt;
    // Fade out últimos 1.5s.
    if (m.life < 1.5 && m.mesh.material) {
      m.mesh.material.transparent = true;
      m.mesh.material.opacity = m.life / 1.5;
    }
  }
}
