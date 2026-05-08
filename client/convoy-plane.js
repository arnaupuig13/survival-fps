// Visualización del avión de suministros. Cuando server manda 'convoy'
// con (x, z, dirX, dirZ), el cliente spawnea un avión militar que cruza
// el cielo en línea recta sobre los drops, y desaparece después.
//
// El avión es puramente visual — los crates se spawnean por el server
// con `crateSpawn` events normales. Acá solo creamos el sentido de
// "está pasando un avión".

import * as THREE from 'three';
import { scene } from './three-setup.js';

const CRUISE_HEIGHT = 90;       // metros sobre el centro
const CRUISE_SPEED = 60;        // m/s
const APPROACH_DIST = 240;      // m antes de pasar sobre el centro
const FADE_DIST = 300;          // m después que se elimina

let plane = null;               // { mesh, x, z, dirX, dirZ, traveled }

function makePlaneMesh() {
  const g = new THREE.Group();
  // Fuselaje militar.
  const fusMat = new THREE.MeshStandardMaterial({ color: 0x3a4528, roughness: 0.7 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.5 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xff5050, emissive: 0xff5050, emissiveIntensity: 1.5 });
  // Cuerpo principal — capsula alargada.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.6, 16, 12), fusMat);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  // Cabina vidriada.
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x223040, transparent: true, opacity: 0.6, metalness: 0.7, roughness: 0.2 }));
  cabin.scale.set(1.2, 0.8, 0.9);
  cabin.position.set(7.0, 0.4, 0);
  g.add(cabin);
  // Alas.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 14), fusMat);
  wing.position.set(0, 0, 0); g.add(wing);
  // Cola — vertical + horizontal stabs.
  const tailV = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.5, 0.3), fusMat);
  tailV.position.set(-7.0, 1.6, 0); g.add(tailV);
  const tailH = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.3, 5), fusMat);
  tailH.position.set(-7.5, 0.6, 0); g.add(tailH);
  // 4 motores en las alas.
  const engineMat = accentMat;
  for (const wx of [-3, 3]) for (const wz of [-4, 4]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.8, 8), engineMat);
    eng.rotation.z = Math.PI / 2;
    eng.position.set(wx * 0.7, -0.4, wz);
    g.add(eng);
  }
  // Luces parpadeantes en las puntas de alas.
  const lightL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), lightMat);
  lightL.position.set(0, 0, -7.2); g.add(lightL);
  const lightR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4),
    new THREE.MeshStandardMaterial({ color: 0x40ff40, emissive: 0x40ff40, emissiveIntensity: 1.5 }));
  lightR.position.set(0, 0, 7.2); g.add(lightR);
  g.userData.lights = [lightL, lightR];
  return g;
}

export function spawn(midX, midZ, dirX, dirZ) {
  // Despawn cualquier avión previo.
  if (plane) despawn();
  const mesh = makePlaneMesh();
  // Posición inicial: APPROACH_DIST antes del punto medio, en dirección.
  const startX = midX - dirX * APPROACH_DIST;
  const startZ = midZ - dirZ * APPROACH_DIST;
  mesh.position.set(startX, CRUISE_HEIGHT, startZ);
  mesh.rotation.y = Math.atan2(dirX, dirZ);
  scene.add(mesh);
  plane = {
    mesh,
    dirX, dirZ,
    midX, midZ,
    traveled: 0,
  };
}

export function despawn() {
  if (!plane) return;
  scene.remove(plane.mesh);
  plane.mesh.traverse((o) => {
    if (o.geometry) o.geometry.dispose?.();
    if (o.material) o.material.dispose?.();
  });
  plane = null;
}

let _blinkPhase = 0;
export function update(dt) {
  if (!plane) return;
  plane.traveled += dt * CRUISE_SPEED;
  plane.mesh.position.x += plane.dirX * CRUISE_SPEED * dt;
  plane.mesh.position.z += plane.dirZ * CRUISE_SPEED * dt;
  // Blink lights.
  _blinkPhase += dt * 4;
  if (plane.mesh.userData.lights) {
    for (const l of plane.mesh.userData.lights) {
      if (l.material) l.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(_blinkPhase)) * 1.5;
    }
  }
  // Despawn cuando pasó del extremo.
  if (plane.traveled > APPROACH_DIST + FADE_DIST) {
    despawn();
  }
}
