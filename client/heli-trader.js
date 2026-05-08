// Helicóptero comerciante itinerante. Server avisa con `heliTrader`
// arrive/leave. Mientras está, renderizamos un mesh y el jugador puede
// interactuar (E) para abrir un trader de stock random distinto.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';
import * as inv from './inventory.js';
import { logLine, showBanner } from './hud.js';
import * as sfx from './sounds.js';

const INTERACT_RADIUS = 5.0;

let heli = null;            // { mesh, x, z, expiresAt }

// Catálogo del heli — tiene cosas que el trader normal NO vende: armas
// raras, dog_collar, sniper rounds, etc. Precios un poco más altos.
export const HELI_SHOP = [
  { id: 'h_rifle',     label: 'RIFLE',           cost: 50, give: { rifle_pickup: 1 }, oneTime: true },
  { id: 'h_shotgun',   label: 'ESCOPETA',        cost: 55, give: { shotgun_pickup: 1 }, oneTime: true },
  { id: 'h_smg',       label: 'SMG',             cost: 50, give: { smg_pickup: 1 }, oneTime: true },
  { id: 'h_sniper',    label: 'RIFLE FRANCOTIRADOR', cost: 90, give: { sniper_pickup: 1 }, oneTime: true },
  { id: 'h_dog',       label: 'COLLAR DE PERRO', cost: 60, give: { dog_collar: 1 }, oneTime: true },
  { id: 'h_flash',     label: 'LINTERNA',        cost: 25, give: { flashlight: 1 }, oneTime: true },
  { id: 'h_ap_p',      label: '24 BALAS .9 AP',  cost: 18, give: { bullet_p_ap: 24 } },
  { id: 'h_ap_r',      label: '20 BALAS RIFLE AP', cost: 22, give: { bullet_r_ap: 20 } },
  { id: 'h_inc_r',     label: '10 BALAS INCEND.', cost: 30, give: { bullet_r_inc: 10 } },
  { id: 'h_50cal',     label: '8 CAL .50',       cost: 28, give: { sniper_round: 8 } },
  { id: 'h_grenade',   label: '3 GRANADAS',      cost: 22, give: { grenade: 3 } },
  { id: 'h_antibio',   label: '3 ANTIBIOTICOS',  cost: 30, give: { antibiotics: 3 } },
];
export const HELI_BUY = [];   // el heli no compra; solo vende

function makeHeliMesh() {
  const g = new THREE.Group();
  // Fuselaje militar
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3525, roughness: 0.7 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.6 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xff5050, emissive: 0xff5050, emissiveIntensity: 1.0 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 4.0), bodyMat);
  body.position.y = 1.4; g.add(body);
  // Cabina cristalada en frente.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x223040, transparent: true, opacity: 0.6, roughness: 0.2, metalness: 0.7 }));
  cabin.position.set(0, 1.5, 1.4); g.add(cabin);
  // Cola.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2.0), bodyMat);
  tail.position.set(0, 1.5, -2.7); g.add(tail);
  // Patines.
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.0), accentMat);
  skidL.position.set(-0.8, 0.05, 0); g.add(skidL);
  const skidR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.0), accentMat);
  skidR.position.set( 0.8, 0.05, 0); g.add(skidR);
  // Hélice principal (gira lentamente).
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.05, 0.2), accentMat);
  rotor.position.y = 2.2; g.add(rotor);
  // Luz roja parpadeante en la cola.
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lightMat);
  light.position.set(0, 1.6, -3.6); g.add(light);
  g.userData.rotor = rotor;
  g.userData.light = light;
  return g;
}

export function spawn(x, z, expiresAt) {
  if (heli) despawn();
  const mesh = makeHeliMesh();
  mesh.position.set(x, heightAt(x, z), z);
  scene.add(mesh);
  heli = { mesh, x, z, expiresAt };
  sfx.playBossSting?.();
}

export function despawn() {
  if (!heli) return;
  scene.remove(heli.mesh);
  heli.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
  heli = null;
}

export function nearestInRange(playerPos) {
  if (!heli) return null;
  const dx = heli.x - playerPos.x;
  const dz = heli.z - playerPos.z;
  return Math.hypot(dx, dz) < INTERACT_RADIUS ? { x: heli.x, z: heli.z } : null;
}

export function tryBuy(offerId) {
  const o = HELI_SHOP.find((x) => x.id === offerId);
  if (!o) return false;
  if (o.oneTime) {
    for (const k of Object.keys(o.give)) {
      if (inv.ITEMS[k]?.oneTime && inv.has(k, 1)) { logLine('Ya tenés ese item'); return false; }
    }
  }
  if (!inv.has('scrap', o.cost)) { logLine(`Necesitás ${o.cost} chatarra`); return false; }
  inv.remove('scrap', o.cost);
  inv.applyLoot(o.give);
  showBanner(`✓ COMPRA: ${o.label}`, 1500);
  sfx.playPickup?.();
  return true;
}

// Animación: rotor gira, luz parpadea, cuenta atrás.
let _blinkPhase = 0;
export function update(dt) {
  if (!heli) return;
  if (heli.mesh.userData.rotor) heli.mesh.userData.rotor.rotation.y += dt * 8;
  _blinkPhase += dt * 4;
  if (heli.mesh.userData.light) {
    heli.mesh.userData.light.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(_blinkPhase)) * 1.2;
  }
}

export function isActive() { return !!heli; }
