// Comerciante NPC fijo en la plaza de Westhaven. Cliente-side: el server
// no sabe del trader. Walking up + presionar E abre el panel de trade.
//
// Economía: el jugador junta CHATARRA (scrap) de cofres y enemigos. Las
// ofertas son fijas y siempre disponibles. Si el jugador trae algo que
// el trader compra (carne cocida, cuero, etc), también las cambia.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';
import * as inv from './inventory.js';
import { logLine, showBanner } from './hud.js';
import * as sfx from './sounds.js';

// Posición del trader en la plaza de Westhaven (centro-norte de la ciudad).
export const TRADER_POS = { x: -150, z: 130 };
export const TRADER_RADIUS = 3.0;     // distancia para interactuar

// Catálogo: lo que vende. Cost en scrap.
export const SHOP = [
  { id: 'bandage_x3',    label: '3 VENDAS',          cost: 4,  give: { bandage: 3 } },
  { id: 'water_x2',      label: '2 BOTELLAS AGUA',   cost: 3,  give: { water_bottle: 2 } },
  { id: 'meat_x2',       label: '2 CARNE COCIDA',    cost: 4,  give: { meat_cooked: 2 } },
  { id: 'pistol_ammo',   label: '36 BALAS PISTOLA',  cost: 6,  give: { bullet_p: 36 } },
  { id: 'rifle_ammo',    label: '30 BALAS RIFLE',    cost: 10, give: { bullet_r: 30 } },
  { id: 'smg_ammo',      label: '40 BALAS SMG',      cost: 8,  give: { bullet_smg: 40 } },
  { id: 'shells',        label: '12 CARTUCHOS',      cost: 10, give: { shell: 12 } },
  { id: 'sniper_ammo',   label: '5 CAL .50',         cost: 18, give: { sniper_round: 5 } },
  { id: 'grenade_x2',    label: '2 GRANADAS',        cost: 14, give: { grenade: 2 } },
  { id: 'antibiotics',   label: '1 ANTIBIOTICO',     cost: 12, give: { antibiotics: 1 } },
  { id: 'bear_trap',     label: '1 CEPO',            cost: 8,  give: { bear_trap: 1 } },
  { id: 'scope',         label: 'MIRILLA',           cost: 30, give: { scope: 1 }, oneTime: true },
  { id: 'silencer',      label: 'SILENCIADOR',       cost: 35, give: { silencer: 1 }, oneTime: true },
  { id: 'ext_mag',       label: 'CARGADOR EXT.',     cost: 25, give: { ext_mag: 1 }, oneTime: true },
  { id: 'vest',          label: 'CHALECO',           cost: 40, give: { vest_armor: 1 }, oneTime: true },
  { id: 'helmet',        label: 'CASCO',             cost: 35, give: { helmet_armor: 1 }, oneTime: true },
];

// Lo que compra (vende a cambio de scrap). Sirve para vaciar inventario.
export const BUY = [
  { id: 'sell_meat_raw',   label: 'CARNE CRUDA',     consume: { meat_raw: 1 },     payScrap: 1 },
  { id: 'sell_meat_cooked',label: 'CARNE COCIDA',    consume: { meat_cooked: 1 },  payScrap: 2 },
  { id: 'sell_berry',      label: '5 BAYAS',         consume: { berry: 5 },        payScrap: 1 },
  { id: 'sell_wood',       label: '10 MADERA',       consume: { wood: 10 },        payScrap: 2 },
  { id: 'sell_stone',      label: '10 PIEDRA',       consume: { stone: 10 },       payScrap: 3 },
];

// =====================================================================
// Mesh — humano alto con sombrero, color amarillo para destacar.
// =====================================================================
const trader = new THREE.Group();
const torso = new THREE.Mesh(
  new THREE.BoxGeometry(0.55, 1.05, 0.32),
  new THREE.MeshStandardMaterial({ color: 0x8a4a20, roughness: 0.85 }),
);
torso.position.y = 1.1;
trader.add(torso);
const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 10, 8),
  new THREE.MeshStandardMaterial({ color: 0xe0bf90, roughness: 0.9 }),
);
head.position.y = 1.85;
trader.add(head);
const hat = new THREE.Mesh(
  new THREE.CylinderGeometry(0.32, 0.32, 0.05, 12),
  new THREE.MeshStandardMaterial({ color: 0x2a2a2a }),
);
hat.position.y = 2.05;
trader.add(hat);
const hatTop = new THREE.Mesh(
  new THREE.CylinderGeometry(0.18, 0.18, 0.16, 12),
  new THREE.MeshStandardMaterial({ color: 0x2a2a2a }),
);
hatTop.position.y = 2.14;
trader.add(hatTop);
// Pequeño aura visible: glow dorado.
const aura = new THREE.PointLight(0xf0c060, 0.6, 4);
aura.position.set(0, 1.3, 0);
trader.add(aura);
trader.position.set(TRADER_POS.x, heightAt(TRADER_POS.x, TRADER_POS.z), TRADER_POS.z);
scene.add(trader);

// =====================================================================
// API
// =====================================================================
export function nearestInRange(playerPos) {
  const dx = TRADER_POS.x - playerPos.x;
  const dz = TRADER_POS.z - playerPos.z;
  const d = Math.hypot(dx, dz);
  return d < TRADER_RADIUS ? { x: TRADER_POS.x, z: TRADER_POS.z } : null;
}

export function tryBuy(offerId) {
  const o = SHOP.find((x) => x.id === offerId);
  if (!o) return false;
  if (o.oneTime) {
    // Si el item es oneTime y ya lo tenés, rechaza.
    for (const k of Object.keys(o.give)) {
      if (inv.ITEMS[k]?.oneTime && inv.has(k, 1)) {
        logLine('Ya tenés ese item');
        return false;
      }
    }
  }
  if (!inv.has('scrap', o.cost)) {
    logLine(`Necesitás ${o.cost} chatarra`);
    return false;
  }
  inv.remove('scrap', o.cost);
  inv.applyLoot(o.give);
  showBanner(`✓ COMPRA: ${o.label}`, 1500);
  sfx.playPickup?.();
  logLine(`✓ ${o.label} (-${o.cost} chatarra)`);
  return true;
}

export function trySell(offerId) {
  const o = BUY.find((x) => x.id === offerId);
  if (!o) return false;
  for (const [k, v] of Object.entries(o.consume)) {
    if (!inv.has(k, v)) {
      logLine(`No tenés suficiente ${inv.ITEMS[k]?.label || k}`);
      return false;
    }
  }
  for (const [k, v] of Object.entries(o.consume)) inv.remove(k, v);
  inv.add('scrap', o.payScrap);
  logLine(`+${o.payScrap} chatarra (vendido: ${o.label})`);
  sfx.playPickup?.();
  return true;
}

// Animación: el trader voltea levemente al jugador (yaw look-at).
const _lookV = new THREE.Vector3();
export function update(dt, playerPos) {
  _lookV.set(playerPos.x - TRADER_POS.x, 0, playerPos.z - TRADER_POS.z);
  if (_lookV.lengthSq() < 0.01) return;
  const targetYaw = Math.atan2(_lookV.x, _lookV.z);
  trader.rotation.y += (targetYaw - trader.rotation.y) * 2 * dt;
}
