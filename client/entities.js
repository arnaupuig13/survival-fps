// Server-driven entities: peers (other players) and enemies (zombie / runner /
// tank / scientist / boss). All live in Maps keyed by server id; positions
// lerp toward a target updated by network snapshots. Mesh Y is snapped to
// the local heightmap every frame so nothing falls through or buries.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';

// =====================================================================
// Mesh factories — low-poly stylised. Different silhouettes per etype so
// the player can read the threat at a glance.
// =====================================================================
function makeZombieMesh(variant = 'zombie') {
  const g = new THREE.Group();
  let skin = 0x6f8a55, cloth = 0x303a25, scale = 1;
  if (variant === 'runner') { skin = 0x8a8055; cloth = 0x55452a; scale = 0.95; }
  if (variant === 'tank')   { skin = 0x4a5a3a; cloth = 0x222a18; scale = 1.25; }
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.85 });
  const clothMat = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), clothMat);
  torso.position.y = 1.05; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.4), skinMat);
  head.position.y = 1.75; g.add(head);
  const armGeom = new THREE.BoxGeometry(0.18, 0.85, 0.18);
  const armL = new THREE.Mesh(armGeom, skinMat); armL.position.set(-0.45, 1.1, 0.2); armL.rotation.x = -Math.PI / 3; g.add(armL);
  const armR = new THREE.Mesh(armGeom, skinMat); armR.position.set( 0.45, 1.1, 0.2); armR.rotation.x = -Math.PI / 3; g.add(armR);
  const legGeom = new THREE.BoxGeometry(0.22, 0.85, 0.22);
  const legL = new THREE.Mesh(legGeom, clothMat); legL.position.set(-0.18, 0.42, 0); g.add(legL);
  const legR = new THREE.Mesh(legGeom, clothMat); legR.position.set( 0.18, 0.42, 0); g.add(legR);
  g.userData.legs = [legL, legR]; g.userData.arms = [armL, armR];
  g.scale.setScalar(scale);
  return g;
}

function makeScientistMesh(weapon = 'rifle') {
  const g = new THREE.Group();
  const coatMat   = new THREE.MeshStandardMaterial({ color: 0xeeeeec, roughness: 0.55 });
  const trimMat   = new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.5 });
  const skinMat   = new THREE.MeshStandardMaterial({ color: 0xd9b896, roughness: 0.6 });
  const goggleMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.3, metalness: 0.7 });
  const gunMat    = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.4, metalness: 0.7 });
  // Sniper has a yellow scope cue, shotgun has a brown stock — quick visual reads.
  const scopeMat  = new THREE.MeshStandardMaterial({ color: 0xf0c060, roughness: 0.4, metalness: 0.6, emissive: 0x402810, emissiveIntensity: 0.5 });
  const stockMat  = new THREE.MeshStandardMaterial({ color: 0x6a4226, roughness: 0.85 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.05, 0.35), coatMat);
  torso.position.y = 1.0; g.add(torso);
  const hem = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.4), trimMat);
  hem.position.y = 0.46; g.add(hem);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.38), skinMat);
  head.position.y = 1.7; g.add(head);
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.05), goggleMat);
  goggles.position.set(0, 1.74, 0.18); g.add(goggles);

  // Weapon swappable per variant.
  if (weapon === 'shotgun') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.12, 0.45), gunMat);
    body.position.set(0.18, 1.05, 0.25); g.add(body);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.10, 0.25), stockMat);
    stock.position.set(0.18, 0.97, 0.55); g.add(stock);
    g.userData.weapon = body;
  } else if (weapon === 'sniper') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.95), gunMat);
    body.position.set(0.18, 1.10, 0.45); g.add(body);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.15, 8), scopeMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0.18, 1.18, 0.35); g.add(scope);
    g.userData.weapon = body;
  } else {
    // Rifle.
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.10, 0.6), gunMat);
    body.position.set(0.18, 1.05, 0.32); g.add(body);
    g.userData.weapon = body;
  }

  const armGeom = new THREE.BoxGeometry(0.16, 0.8, 0.16);
  const armL = new THREE.Mesh(armGeom, coatMat); armL.position.set(-0.38, 1.05, 0); g.add(armL);
  const armR = new THREE.Mesh(armGeom, coatMat); armR.position.set( 0.38, 1.05, 0.18); armR.rotation.x = -Math.PI / 6; g.add(armR);
  const legGeom = new THREE.BoxGeometry(0.2, 0.8, 0.2);
  const pantMat = new THREE.MeshStandardMaterial({ color: 0x303138, roughness: 0.85 });
  const legL = new THREE.Mesh(legGeom, pantMat); legL.position.set(-0.16, 0.4, 0); g.add(legL);
  const legR = new THREE.Mesh(legGeom, pantMat); legR.position.set( 0.16, 0.4, 0); g.add(legR);
  g.userData.legs = [legL, legR];
  return g;
}

// Wolf: low quadruped silhouette. Body + head + 4 legs + tail.
function makeWolfMesh() {
  const g = new THREE.Group();
  const furMat   = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.95 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0x6a5e54, roughness: 0.95 });
  const noseMat  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
  const eyeMat   = new THREE.MeshStandardMaterial({ color: 0xff5050, emissive: 0xff2020, emissiveIntensity: 0.7 });

  // Body (longer than tall).
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 1.1), furMat);
  body.position.y = 0.65; g.add(body);
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.95), bellyMat);
  belly.position.set(0, 0.42, 0); g.add(belly);
  // Head with snout — facing +Z (forward), like other meshes.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), furMat);
  head.position.set(0, 0.78, 0.6); g.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.28), furMat);
  snout.position.set(0, 0.7, 0.85); g.add(snout);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.05), noseMat);
  nose.position.set(0, 0.7, 1.0); g.add(nose);
  // Glowing eyes — make wolves visible at night.
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), eyeMat);
    eye.position.set(sx * 0.1, 0.85, 0.78); g.add(eye);
  }
  // Ears (triangular pyramids approximated as boxes).
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.1), furMat);
    ear.position.set(sx * 0.13, 1.02, 0.55); ear.rotation.z = sx * 0.2; g.add(ear);
  }
  // Tail.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.45), furMat);
  tail.position.set(0, 0.62, -0.65); tail.rotation.x = -0.4; g.add(tail);
  // 4 legs (paired front/back).
  const legGeom = new THREE.BoxGeometry(0.13, 0.5, 0.13);
  const fL = new THREE.Mesh(legGeom, furMat); fL.position.set(-0.18, 0.25,  0.4); g.add(fL);
  const fR = new THREE.Mesh(legGeom, furMat); fR.position.set( 0.18, 0.25,  0.4); g.add(fR);
  const bL = new THREE.Mesh(legGeom, furMat); bL.position.set(-0.18, 0.25, -0.4); g.add(bL);
  const bR = new THREE.Mesh(legGeom, furMat); bR.position.set( 0.18, 0.25, -0.4); g.add(bR);
  g.userData.legs = [fL, fR, bL, bR];
  return g;
}

function makeBossMesh() {
  const g = new THREE.Group();
  const armorMat = new THREE.MeshStandardMaterial({ color: 0x8a2030, roughness: 0.5, metalness: 0.4, emissive: 0x300810, emissiveIntensity: 0.5 });
  const trimMat  = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.4, metalness: 0.7 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0xff5050, roughness: 0.1, metalness: 0.85, emissive: 0xff2020, emissiveIntensity: 0.9 });
  const akMat    = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.45, metalness: 0.85 });

  // Bigger torso.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.6), armorMat);
  torso.position.y = 1.3; g.add(torso);
  // Shoulder pauldrons.
  for (const sx of [-1, 1]) {
    const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.55), trimMat);
    pauldron.position.set(sx * 0.65, 1.85, 0); g.add(pauldron);
  }
  // Bigger head with red visor strip.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), trimMat);
  head.position.y = 2.25; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.13, 0.06), visorMat);
  visor.position.set(0, 2.32, 0.27); g.add(visor);
  // AK held at hip.
  const ak = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.85), akMat);
  ak.position.set(0.32, 1.2, 0.5); g.add(ak);
  // Legs (armored).
  const legGeom = new THREE.BoxGeometry(0.32, 1.0, 0.32);
  const legL = new THREE.Mesh(legGeom, armorMat); legL.position.set(-0.25, 0.5, 0); g.add(legL);
  const legR = new THREE.Mesh(legGeom, armorMat); legR.position.set( 0.25, 0.5, 0); g.add(legR);
  // Glowing point light so he reads even at night.
  const aura = new THREE.PointLight(0xff4040, 0.7, 8);
  aura.position.set(0, 1.6, 0); g.add(aura);

  g.userData.legs = [legL, legR]; g.userData.weapon = ak;
  g.scale.setScalar(1.05);
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

function meshFor(etype) {
  if (etype === 'scientist')   return makeScientistMesh('rifle');
  if (etype === 'sci_shotgun') return makeScientistMesh('shotgun');
  if (etype === 'sci_sniper')  return makeScientistMesh('sniper');
  if (etype === 'boss')        return makeBossMesh();
  if (etype === 'wolf')        return makeWolfMesh();
  if (etype === 'runner')      return makeZombieMesh('runner');
  if (etype === 'tank')        return makeZombieMesh('tank');
  return makeZombieMesh('zombie');
}

// =====================================================================
// State
// =====================================================================
export const peers = new Map();
export const enemies = new Map();

export function spawnEnemy(info) {
  if (enemies.has(info.id)) return;
  const mesh = meshFor(info.etype || 'zombie');
  const groundY = heightAt(info.x, info.z);
  mesh.position.set(info.x, groundY, info.z);
  mesh.rotation.y = info.ry || 0;
  if (info.sleeping) {
    // Sleeping: lying face-up on the ground.
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = groundY + 0.4;
  }
  scene.add(mesh);
  enemies.set(info.id, {
    mesh, etype: info.etype || 'zombie',
    sleeping: !!info.sleeping,
    isBoss: !!info.isBoss,
    target: { x: info.x, z: info.z, ry: info.ry || 0, hp: info.hp ?? 10 },
    walkPhase: 0, attackT: -1,
    lastX: info.x, lastZ: info.z,
  });
}

export function removeEnemy(id) {
  const e = enemies.get(id); if (!e) return;
  scene.remove(e.mesh);
  e.mesh.traverse(c => { if (c.geometry) c.geometry.dispose?.(); });
  enemies.delete(id);
}

export function wakeEnemy(id) {
  const e = enemies.get(id); if (!e) return;
  if (!e.sleeping) return;
  e.sleeping = false;
  e.mesh.rotation.x = 0;
  // Y will be re-snapped to terrain on the next update tick.
}

export function spawnPeer(info) {
  if (peers.has(info.id)) return;
  const mesh = makePeerMesh();
  mesh.position.set(info.x, heightAt(info.x, info.z), info.z);
  mesh.rotation.y = info.ry || 0;
  scene.add(mesh);
  peers.set(info.id, { mesh, target: { x: info.x, z: info.z, ry: info.ry || 0 }, walkPhase: 0, lastX: info.x, lastZ: info.z });
}
export function removePeer(id) {
  const p = peers.get(id); if (!p) return;
  scene.remove(p.mesh);
  p.mesh.traverse(c => { if (c.geometry) c.geometry.dispose?.(); });
  peers.delete(id);
}

// =====================================================================
// Per-frame update.
// =====================================================================
export function updateEntities(dt) {
  const lerp = 1 - Math.exp(-15 * dt);

  for (const e of enemies.values()) {
    const m = e.mesh;
    if (e.sleeping) {
      // Don't lerp/animate sleeping enemies — they're a corpse pose.
      const groundY = heightAt(m.position.x, m.position.z);
      m.position.y = groundY + 0.4;
      continue;
    }
    m.position.x += (e.target.x - m.position.x) * lerp;
    m.position.z += (e.target.z - m.position.z) * lerp;
    let dr = e.target.ry - m.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    m.rotation.y += dr * lerp;
    m.position.y = heightAt(m.position.x, m.position.z);

    const speed = Math.hypot(m.position.x - e.lastX, m.position.z - e.lastZ) / Math.max(dt, 0.0001);
    e.lastX = m.position.x; e.lastZ = m.position.z;
    if (speed > 0.2) {
      e.walkPhase += dt * 6;
      const swing = Math.sin(e.walkPhase) * 0.5;
      const legs = m.userData.legs;
      if (legs) { legs[0].rotation.x = swing; legs[1].rotation.x = -swing; }
    }

    if (e.attackT >= 0) {
      e.attackT += dt;
      const t = e.attackT / 0.4;
      if (t > 1) { e.attackT = -1; }
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
      const legs = m.userData.legs;
      if (legs) { legs[0].rotation.x = swing; legs[1].rotation.x = -swing; }
    }
  }
}

export function triggerEnemyAttack(id) {
  const e = enemies.get(id);
  if (e) e.attackT = 0;
}

// Backward-compat aliases (kept while migrating callers).
export const zombies = enemies;
export const spawnZombie = spawnEnemy;
export const removeZombie = removeEnemy;
export const triggerZombieAttack = triggerEnemyAttack;
