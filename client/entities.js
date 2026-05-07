// Server-driven entities: peers (other players) and zombies.
// Each lives in a Map keyed by server id. Position lerps toward a target
// updated by network snapshots. Mesh Y is snapped to the local heightmap so
// nothing falls through the floor or buries underground (the v0 bug).

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';

// =====================================================================
// Mesh factories — kept simple, low-poly. Stylised enough to read.
// =====================================================================
function makeZombieMesh() {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x6f8a55, roughness: 0.85 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x303a25, roughness: 0.9 });
  // Body (torso)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), clothMat);
  torso.position.y = 1.05;
  g.add(torso);
  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.4), skinMat);
  head.position.y = 1.75;
  g.add(head);
  // Arms — pointing forward (zombie pose)
  const armGeom = new THREE.BoxGeometry(0.18, 0.85, 0.18);
  const armL = new THREE.Mesh(armGeom, skinMat); armL.position.set(-0.45, 1.1, 0.2); armL.rotation.x = -Math.PI / 3;
  const armR = new THREE.Mesh(armGeom, skinMat); armR.position.set( 0.45, 1.1, 0.2); armR.rotation.x = -Math.PI / 3;
  g.add(armL); g.add(armR);
  // Legs
  const legGeom = new THREE.BoxGeometry(0.22, 0.85, 0.22);
  const legL = new THREE.Mesh(legGeom, clothMat); legL.position.set(-0.18, 0.42, 0); g.add(legL);
  const legR = new THREE.Mesh(legGeom, clothMat); legR.position.set( 0.18, 0.42, 0); g.add(legR);
  g.userData.legs = [legL, legR];
  g.userData.arms = [armL, armR];
  return g;
}

function makePeerMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x375a78, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.6 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), bodyMat); torso.position.y = 1.0; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.4, 0.36), skinMat); head.position.y = 1.6; g.add(head);
  const armGeom = new THREE.BoxGeometry(0.16, 0.75, 0.16);
  const armL = new THREE.Mesh(armGeom, bodyMat); armL.position.set(-0.4, 1.05, 0); g.add(armL);
  const armR = new THREE.Mesh(armGeom, bodyMat); armR.position.set( 0.4, 1.05, 0); g.add(armR);
  const legGeom = new THREE.BoxGeometry(0.2, 0.8, 0.2);
  const legL = new THREE.Mesh(legGeom, bodyMat); legL.position.set(-0.16, 0.4, 0); g.add(legL);
  const legR = new THREE.Mesh(legGeom, bodyMat); legR.position.set( 0.16, 0.4, 0); g.add(legR);
  g.userData.legs = [legL, legR];
  return g;
}

// =====================================================================
// Per-entity state
// =====================================================================
export const peers = new Map();    // id → { mesh, target {x,y,z,ry}, walkPhase }
export const zombies = new Map();  // id → { mesh, target {x,y,z,ry,hp}, walkPhase, attackT }

export function spawnZombie(info) {
  if (zombies.has(info.id)) return;
  const mesh = makeZombieMesh();
  // Place using local heightmap immediately — eliminates the v0 buried-zombie bug.
  mesh.position.set(info.x, heightAt(info.x, info.z), info.z);
  mesh.rotation.y = info.ry || 0;
  scene.add(mesh);
  zombies.set(info.id, {
    mesh,
    target: { x: info.x, z: info.z, ry: info.ry || 0, hp: info.hp ?? 10 },
    walkPhase: 0,
    attackT: -1,
    lastX: info.x, lastZ: info.z,
  });
}
export function removeZombie(id) {
  const z = zombies.get(id); if (!z) return;
  scene.remove(z.mesh);
  z.mesh.traverse(c => { if (c.geometry) c.geometry.dispose?.(); });
  zombies.delete(id);
}

export function spawnPeer(info) {
  if (peers.has(info.id)) return;
  const mesh = makePeerMesh();
  mesh.position.set(info.x, heightAt(info.x, info.z), info.z);
  mesh.rotation.y = info.ry || 0;
  scene.add(mesh);
  peers.set(info.id, {
    mesh,
    target: { x: info.x, z: info.z, ry: info.ry || 0 },
    walkPhase: 0,
    lastX: info.x, lastZ: info.z,
  });
}
export function removePeer(id) {
  const p = peers.get(id); if (!p) return;
  scene.remove(p.mesh);
  p.mesh.traverse(c => { if (c.geometry) c.geometry.dispose?.(); });
  peers.delete(id);
}

// =====================================================================
// Update — lerp positions, snap Y to terrain, animate walk + attack lunge.
// =====================================================================
export function updateEntities(dt) {
  const lerp = 1 - Math.exp(-15 * dt);

  for (const z of zombies.values()) {
    const m = z.mesh;
    m.position.x += (z.target.x - m.position.x) * lerp;
    m.position.z += (z.target.z - m.position.z) * lerp;
    let dr = z.target.ry - m.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    m.rotation.y += dr * lerp;
    // Snap Y to local heightmap — never trust server Y; client owns terrain.
    m.position.y = heightAt(m.position.x, m.position.z);
    // Walk-cycle: oscillate legs based on horizontal speed.
    const speed = Math.hypot(m.position.x - z.lastX, m.position.z - z.lastZ) / Math.max(dt, 0.0001);
    z.lastX = m.position.x; z.lastZ = m.position.z;
    if (speed > 0.2) {
      z.walkPhase += dt * 6;
      const swing = Math.sin(z.walkPhase) * 0.5;
      z.mesh.userData.legs[0].rotation.x =  swing;
      z.mesh.userData.legs[1].rotation.x = -swing;
    }
    // Attack lunge (forward dip + arm raise).
    if (z.attackT >= 0) {
      z.attackT += dt;
      const t = z.attackT / 0.4;
      if (t > 1) {
        z.attackT = -1;
        z.mesh.userData.arms[0].rotation.x = -Math.PI / 3;
        z.mesh.userData.arms[1].rotation.x = -Math.PI / 3;
      } else {
        const lunge = Math.sin(t * Math.PI) * 0.5;
        z.mesh.userData.arms[0].rotation.x = -Math.PI / 3 - lunge;
        z.mesh.userData.arms[1].rotation.x = -Math.PI / 3 - lunge;
      }
    }
  }

  for (const p of peers.values()) {
    const m = p.mesh;
    m.position.x += (p.target.x - m.position.x) * lerp;
    m.position.z += (p.target.z - m.position.z) * lerp;
    let dr = p.target.ry - m.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    m.rotation.y += dr * lerp;
    m.position.y = heightAt(m.position.x, m.position.z);
    const speed = Math.hypot(m.position.x - p.lastX, m.position.z - p.lastZ) / Math.max(dt, 0.0001);
    p.lastX = m.position.x; p.lastZ = m.position.z;
    if (speed > 0.2) {
      p.walkPhase += dt * 6;
      const swing = Math.sin(p.walkPhase) * 0.5;
      p.mesh.userData.legs[0].rotation.x =  swing;
      p.mesh.userData.legs[1].rotation.x = -swing;
    }
  }
}

// Trigger the lunge animation for zombie `id` (called from network on zAttack).
export function triggerZombieAttack(id) {
  const z = zombies.get(id);
  if (z) z.attackT = 0;
}
