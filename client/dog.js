// NPC perro aliado. Cliente-side: el server no sabe del perro; el daño
// se manda como un disparo ficticio cuando muerde. Sigue al jugador,
// ataca al enemigo más cercano dentro de 8m, hace 12 dmg cada 1s.
//
// Activación: USAR el item `dog_collar` desde el inventario. Solo 1 perro
// a la vez. Si te morís el perro queda donde está (puede que el server lo
// vuelva a hacer respawn — no, el server no lo conoce, queda visualmente
// hasta que cierres pestaña).

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';
import { player } from './player.js';
import { enemies } from './entities.js';
import { network } from './network.js';
import { logLine, showBanner } from './hud.js';
import * as sfx from './sounds.js';

const FOLLOW_DIST = 4.0;
const ATTACK_RANGE = 1.6;
const SCAN_RANGE   = 12;
const SPEED        = 6.0;
const BITE_DMG     = 14;
const BITE_CD      = 1.0;

let dog = null;     // { mesh, attackCd, target, _legPhase }
let summoned = false;

function makeDogMesh() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x7a6a4a, roughness: 0.95 });
  const eye = new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0xffaa20, emissiveIntensity: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.42, 1.0), fur);
  body.position.y = 0.45;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.36), fur);
  head.position.set(0, 0.6, 0.65);
  g.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.22), fur);
  snout.position.set(0, 0.5, 0.85);
  g.add(snout);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eye);
  eyeL.position.set(-0.1, 0.65, 0.78);
  g.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eye);
  eyeR.position.set( 0.1, 0.65, 0.78);
  g.add(eyeR);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), fur);
  tail.position.set(0, 0.55, -0.6);
  g.add(tail);
  const legGeom = new THREE.BoxGeometry(0.1, 0.4, 0.1);
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(legGeom, fur);
    const lx = i % 2 === 0 ? -0.18 : 0.18;
    const lz = i < 2 ? 0.32 : -0.32;
    leg.position.set(lx, 0.2, lz);
    g.add(leg);
    legs.push(leg);
  }
  g.userData.legs = legs;
  return g;
}

export function summon() {
  if (summoned) {
    logLine('Ya tenés un perro aliado');
    return false;
  }
  const mesh = makeDogMesh();
  const sx = player.pos.x + 1.5;
  const sz = player.pos.z + 0.5;
  mesh.position.set(sx, heightAt(sx, sz), sz);
  scene.add(mesh);
  dog = { mesh, attackCd: 0, target: null, _legPhase: 0 };
  summoned = true;
  showBanner('★ PERRO ALIADO ★', 1800);
  logLine('Tu perro está listo para pelear');
  sfx.playPickup?.();
  return true;
}

export function isSummoned() { return summoned; }

// Tick del perro — llamado desde main.js cada frame.
export function update(dt) {
  if (!dog) return;
  const m = dog.mesh;
  // Buscar enemigo más cercano.
  let bestId = null, bestE = null, bestD = SCAN_RANGE;
  for (const [id, e] of enemies) {
    if (e.etype === 'deer' || e.etype === 'rabbit') continue;
    const dx = e.mesh.position.x - m.position.x;
    const dz = e.mesh.position.z - m.position.z;
    const d = Math.hypot(dx, dz);
    if (d < bestD) { bestD = d; bestId = id; bestE = e; }
  }
  dog.target = bestE;

  // Movimiento: si hay enemigo cerca, perseguir. Si no, sigue al jugador.
  let tx, tz;
  if (bestE) {
    tx = bestE.mesh.position.x;
    tz = bestE.mesh.position.z;
  } else {
    const pdx = m.position.x - player.pos.x;
    const pdz = m.position.z - player.pos.z;
    const pd = Math.hypot(pdx, pdz);
    if (pd > FOLLOW_DIST) {
      tx = player.pos.x;
      tz = player.pos.z;
    } else {
      tx = m.position.x; tz = m.position.z;
    }
  }
  const dx = tx - m.position.x, dz = tz - m.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.1) {
    const moveD = Math.min(d, SPEED * dt);
    m.position.x += (dx / d) * moveD;
    m.position.z += (dz / d) * moveD;
    m.position.y = heightAt(m.position.x, m.position.z);
    m.rotation.y = Math.atan2(dx, dz);
    dog._legPhase += dt * 12;
    const sw = Math.sin(dog._legPhase) * 0.4;
    if (m.userData.legs) {
      m.userData.legs[0].rotation.x = sw;
      m.userData.legs[1].rotation.x = -sw;
      m.userData.legs[2].rotation.x = -sw;
      m.userData.legs[3].rotation.x = sw;
    }
  }
  // Ataque al enemigo si está en rango.
  if (dog.attackCd > 0) dog.attackCd -= dt;
  if (bestE && bestD < ATTACK_RANGE && dog.attackCd <= 0) {
    dog.attackCd = BITE_CD;
    // Daño vía network.shoot — server lo aplica al enemy.
    const origin = new THREE.Vector3(m.position.x, m.position.y + 0.5, m.position.z);
    const dir = new THREE.Vector3(0, 0, -1);
    network.shoot(origin, dir, bestId, BITE_DMG, { silenced: true });
  }
}

export function tryUseCollar() {
  return summon();
}
