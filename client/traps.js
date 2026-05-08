// Cepos (bear traps) — cliente-side. Por simplicidad no van por server:
// se ven solo localmente y solo afectan a enemigos del cliente que los
// puso. El daño se aplica vía network.shoot con un id ficticio (igual que
// las granadas locales lo harían). Para enemigos AOE el daño se manda
// como un disparo con id real del enemigo más cercano y damage de 60.
//
// Limitación conocida: el efecto de "inmovilizar" no se sincroniza con
// el AI server-side, así que el zombie sigue moviéndose en la simulación
// del server. Aceptable para vertical-slice — el daño fuerte es lo que
// importa.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';
import { enemies } from './entities.js';
import { network } from './network.js';
import { logLine, showBanner } from './hud.js';
import * as sfx from './sounds.js';

const TRAP_RADIUS = 1.0;
const TRAP_DAMAGE = 60;
const TRAP_LIFETIME = 90;     // 90s antes de desaparecer si no se activa

const traps = new Map();      // id → { mesh, x, z, life, armed }
let _seq = 0;

const matBase  = new THREE.MeshStandardMaterial({ color: 0x554422, roughness: 0.7, metalness: 0.5 });
const matTeeth = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.4, metalness: 0.9, emissive: 0x111111 });

function makeTrapMesh() {
  const g = new THREE.Group();
  // Plato base.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 12), matBase);
  base.position.y = 0.03;
  g.add(base);
  // Mandíbulas (8 dientes en círculo).
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), matTeeth);
    tooth.position.set(Math.cos(a) * 0.38, 0.14, Math.sin(a) * 0.38);
    tooth.rotation.x = Math.PI;
    g.add(tooth);
  }
  return g;
}

export function placeTrap(x, z) {
  const id = `trap_${++_seq}`;
  const mesh = makeTrapMesh();
  mesh.position.set(x, heightAt(x, z), z);
  scene.add(mesh);
  traps.set(id, { id, mesh, x, z, life: TRAP_LIFETIME, armed: true });
  logLine('Cepo armado en el suelo');
  sfx.playPickup?.();
  return id;
}

function trigger(trap, enemyId) {
  trap.armed = false;
  showBanner('¡CEPO ACTIVADO!', 1200);
  sfx.playKill?.();
  // Daño al enemigo más cercano detectado.
  if (enemyId != null) {
    const dir = new THREE.Vector3(0, -1, 0);
    const origin = new THREE.Vector3(trap.x, heightAt(trap.x, trap.z) + 0.5, trap.z);
    network.shoot(origin, dir, enemyId, TRAP_DAMAGE);
  }
  // Visual: hundir el plato + pequeño shake.
  trap.mesh.scale.y = 0.4;
  setTimeout(() => removeTrap(trap.id), 6000);
}

function removeTrap(id) {
  const t = traps.get(id);
  if (!t) return;
  scene.remove(t.mesh);
  t.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
  traps.delete(id);
}

// Tick — chequea cada cepo activo contra enemigos cercanos.
export function update(dt) {
  for (const t of traps.values()) {
    if (!t.armed) continue;
    t.life -= dt;
    if (t.life <= 0) { removeTrap(t.id); continue; }
    // Enemigo más cercano dentro del radio.
    let bestId = null, bestD = TRAP_RADIUS;
    for (const [id, e] of enemies) {
      const dx = e.mesh.position.x - t.x;
      const dz = e.mesh.position.z - t.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) { bestD = d; bestId = id; }
    }
    if (bestId != null) trigger(t, bestId);
  }
}
