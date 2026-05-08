// Inventory state + persistence + recipes + rarity tagging.
//
// Rarity drives UI border colors and is a hint for game-feel:
//   common      → white  (basic ammo, food)
//   uncommon    → green  (bandage, water, melee tools)
//   rare        → blue   (rifle, vest, scope)
//   epic        → purple (shotgun, helmet, silencer)
//   legendary   → gold   (sniper, boss-only drops)

import { setHP } from './hud.js';

export const RARITY = {
  common:    { color: '#bbbbbb' },
  uncommon:  { color: '#48d068' },
  rare:      { color: '#4a90e0' },
  epic:      { color: '#a060e0' },
  legendary: { color: '#f0c040' },
};

// `weight`: peso unitario en "kg" abstractos. La capacidad base del jugador
// es 30; el perk `sharp_senses` agrega +5. Sobrepeso = movimiento más lento.
export const ITEMS = {
  // Ammo standard.
  bullet_p:        { label: 'BALAS PISTOLA',  max: 99, rarity: 'common', weight: 0.02 },
  bullet_r:        { label: 'BALAS RIFLE',    max: 99, rarity: 'common', weight: 0.03 },
  bullet_smg:      { label: 'BALAS SMG',      max: 99, rarity: 'common', weight: 0.025 },
  shell:           { label: 'CARTUCHOS',      max: 60, rarity: 'uncommon', weight: 0.06 },
  sniper_round:    { label: 'CAL .50',        max: 30, rarity: 'rare', weight: 0.12 },
  // Ammo especial — perforantes (AP) +30% dmg vs blindados, incendiarias
  // (INC) aplican burn DoT 5s. Loot raro en city/boss.
  bullet_p_ap:     { label: 'BALAS .9 AP',    max: 60, rarity: 'rare',      weight: 0.025 },
  bullet_r_ap:     { label: 'BALAS RIFLE AP', max: 60, rarity: 'rare',      weight: 0.035 },
  bullet_r_inc:    { label: 'BALAS INCEND.',  max: 30, rarity: 'epic',      weight: 0.04  },
  // Consumables.
  bandage:         { label: 'VENDAJES',       max: 9,  rarity: 'uncommon', weight: 0.15 },
  grenade:         { label: 'GRANADAS',       max: 6,  rarity: 'rare', weight: 0.6 },
  // Weapons (oneTime — pickup unlocks the slot). La pistola arranca con
  // el jugador (state.pistol_pickup = 1) y tiene noDrop:true para que no
  // se pueda perder al suelo accidentalmente.
  pistol_pickup:   { label: 'PISTOLA',        max: 1, oneTime: true, rarity: 'common', weight: 1.5, noDrop: true },
  rifle_pickup:    { label: 'RIFLE',          max: 1, oneTime: true, rarity: 'rare', weight: 4 },
  shotgun_pickup:  { label: 'ESCOPETA',       max: 1, oneTime: true, rarity: 'epic', weight: 4 },
  smg_pickup:      { label: 'SMG',            max: 1, oneTime: true, rarity: 'rare', weight: 3 },
  sniper_pickup:   { label: 'RIFLE FRANCOTIRADOR', max: 1, oneTime: true, rarity: 'legendary', weight: 6 },
  crossbow_pickup: { label: 'BALLESTA',       max: 1, oneTime: true, rarity: 'rare', weight: 3 },
  bolt:            { label: 'DARDOS',         max: 30, rarity: 'uncommon', weight: 0.04 },
  axe:             { label: 'HACHA',          max: 1, oneTime: true, rarity: 'uncommon', weight: 2 },
  pickaxe:         { label: 'PICO',           max: 1, oneTime: true, rarity: 'uncommon', weight: 2 },
  // Attachments (oneTime).
  scope:           { label: 'MIRILLA',        max: 1, oneTime: true, rarity: 'rare', weight: 0.3 },
  silencer:        { label: 'SILENCIADOR',    max: 1, oneTime: true, rarity: 'epic', weight: 0.4 },
  ext_mag:         { label: 'CARGADOR EXT.',  max: 1, oneTime: true, rarity: 'rare', weight: 0.5 },
  // Armor (oneTime).
  vest_armor:      { label: 'CHALECO',        max: 1, oneTime: true, rarity: 'rare', weight: 4 },
  helmet_armor:    { label: 'CASCO',          max: 1, oneTime: true, rarity: 'epic', weight: 1.5 },
  // Survival.
  meat_raw:        { label: 'CARNE CRUDA',    max: 9,  rarity: 'common', weight: 0.4 },
  meat_cooked:     { label: 'CARNE COCIDA',   max: 9,  rarity: 'uncommon', weight: 0.3 },
  berry:           { label: 'BAYAS',          max: 20, rarity: 'common', weight: 0.05 },
  water_bottle:    { label: 'BOTELLA AGUA',   max: 5,  rarity: 'common', weight: 0.5 },
  // Resources.
  wood:            { label: 'MADERA',         max: 50, rarity: 'common', weight: 0.3 },
  stone:           { label: 'PIEDRA',         max: 30, rarity: 'common', weight: 0.5 },
  scrap:           { label: 'CHATARRA',       max: 99, rarity: 'common', weight: 0.1 },
  campfire:        { label: 'HOGUERAS',       max: 5,  rarity: 'uncommon', weight: 1.5 },
  wall_piece:      { label: 'PARED',          max: 30, rarity: 'common', weight: 0.8 },
  bedroll_item:    { label: 'CAMA',           max: 3,  rarity: 'uncommon', weight: 2 },
  // Meds raros.
  antibiotics:     { label: 'ANTIBIOTICOS',   max: 5,  rarity: 'rare', weight: 0.1 },
  // Trampas.
  bear_trap:       { label: 'CEPO',           max: 5,  rarity: 'uncommon', weight: 3 },
  // Granadas de utilidad.
  smoke_grenade:   { label: 'GRANADA HUMO',   max: 5,  rarity: 'uncommon', weight: 0.4 },
  flashbang:       { label: 'GRANADA CIEGA',  max: 5,  rarity: 'rare', weight: 0.4 },
  // Survival gear nuevo.
  flashlight:      { label: 'LINTERNA',       max: 1, oneTime: true, rarity: 'uncommon', weight: 0.4 },
  dog_collar:      { label: 'COLLAR PERRO',   max: 1, oneTime: true, rarity: 'epic', weight: 0.3 },
  nvg:             { label: 'GAFAS NOCT.',    max: 1, oneTime: true, rarity: 'epic', weight: 0.5 },
  fishing_rod:     { label: 'CAÑA DE PESCAR', max: 1, oneTime: true, rarity: 'uncommon', weight: 1.5 },
  seeds:           { label: 'SEMILLAS',       max: 10, rarity: 'common', weight: 0.05 },
};

export const BASE_WEIGHT_CAPACITY = 30;

const state = {
  bullet_p: 12,
  bullet_r: 0,
  bullet_smg: 0,
  shell: 0,
  sniper_round: 0,
  bullet_p_ap: 0,
  bullet_r_ap: 0,
  bullet_r_inc: 0,
  flashlight: 0,
  dog_collar: 0,
  nvg: 0,
  fishing_rod: 0,
  seeds: 0,
  // La pistola arranca equipada con el jugador.
  pistol_pickup: 1,
  crossbow_pickup: 0,
  bolt: 0,
  smoke_grenade: 0,
  flashbang: 0,
  bandage:  1,
  grenade:  2,
  rifle_pickup: 0,
  shotgun_pickup: 0,
  smg_pickup: 0,
  sniper_pickup: 0,
  axe: 0,
  pickaxe: 0,
  scope: 0,
  silencer: 0,
  ext_mag: 0,
  vest_armor: 0,
  helmet_armor: 0,
  meat_raw: 0,
  meat_cooked: 0,
  berry: 3,
  water_bottle: 1,
  wood: 0,
  stone: 0,
  scrap: 0,
  campfire: 0,
  wall_piece: 0,
  bedroll_item: 0,
  antibiotics: 0,
  bear_trap: 0,
  kills: 0,
};

const listeners = new Set();
function notify() { for (const fn of listeners) fn(state); }
export function onChange(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }

export function get(item) { return state[item] | 0; }
export function getState() { return state; }
export function has(item, n = 1) { return get(item) >= n; }
// Suma del peso total que llevás. Usado para overweight slowdown.
export function getCurrentWeight() {
  let w = 0;
  for (const k of Object.keys(state)) {
    const meta = ITEMS[k];
    if (!meta) continue;
    w += (state[k] | 0) * (meta.weight || 0);
  }
  return w;
}
// Capacidad base + bonus de perks (sharp_senses).
export function getCapacity(player) {
  return BASE_WEIGHT_CAPACITY + (player?.weightCapBonus || 0);
}
export function add(item, n) {
  if (!ITEMS[item]) return;
  const max = ITEMS[item].max;
  state[item] = Math.min(max, (state[item] | 0) + n);
  notify();
}
export function remove(item, n) {
  state[item] = Math.max(0, (state[item] | 0) - n);
  notify();
}
export function consume(item, n = 1) {
  if (!has(item, n)) return false;
  remove(item, n);
  return true;
}

export function applyLoot(loot) {
  const lines = [];
  for (const [item, count] of Object.entries(loot || {})) {
    if (!ITEMS[item]) continue;
    add(item, count);
    const r = ITEMS[item].rarity || 'common';
    lines.push({ text: `+${count} ${ITEMS[item].label}`, rarity: r });
  }
  return lines;
}

export function bumpKills() {
  state.kills = (state.kills | 0) + 1;
  notify();
}

export function useBandage(player) {
  const max = player.maxHp || 100;
  if (player.hp >= max || player.hp <= 0) return false;
  if (!consume('bandage', 1)) return false;
  const heal = 30 + (player.bandageBonus || 0);
  player.hp = Math.min(max, player.hp + heal);
  setHP(player.hp);
  return true;
}

// =====================================================================
// Crafting recipes.
// =====================================================================
export const RECIPES = [
  { id: 'cook_meat',     label: 'COCINAR CARNE',  requires: { meat_raw: 1 },        produces: { meat_cooked: 1 }, needsFire: true },
  { id: 'craft_axe',     label: 'HACHA',          requires: { wood: 3, stone: 2 },  produces: { axe: 1 } },
  { id: 'craft_pickaxe', label: 'PICO',           requires: { wood: 2, stone: 4 },  produces: { pickaxe: 1 } },
  { id: 'craft_bandage', label: 'VENDA',          requires: { wood: 2 },            produces: { bandage: 1 } },
  { id: 'craft_campfire',label: 'HOGUERA',        requires: { wood: 5, stone: 2 },  produces: { campfire: 1 } },
  { id: 'craft_grenade', label: 'GRANADA',        requires: { stone: 3, wood: 1 },  produces: { grenade: 1 } },
  { id: 'craft_bear_trap', label: 'CEPO',         requires: { stone: 4, wood: 2, scrap: 3 }, produces: { bear_trap: 1 } },
  { id: 'craft_water',   label: 'BOTELLA AGUA',   requires: {},                     produces: {}, special: 'fillWater' },
];

export function craft(recipeId, opts = {}) {
  const r = RECIPES.find(x => x.id === recipeId);
  if (!r) return null;
  if (r.needsFire && !opts.nearFire) return null;
  if (r.special === 'fillWater') {
    if (!opts.nearWater) return null;
    add('water_bottle', 1);
    return ITEMS.water_bottle.label;
  }
  for (const item of Object.keys(r.produces)) {
    if (ITEMS[item]?.oneTime && state[item] > 0) return null;
  }
  for (const [item, count] of Object.entries(r.requires)) {
    if (!has(item, count)) return null;
  }
  for (const [item, count] of Object.entries(r.requires)) {
    remove(item, count);
  }
  for (const [item, count] of Object.entries(r.produces)) {
    add(item, count);
  }
  return Object.keys(r.produces).map(k => ITEMS[k]?.label || k).join(', ');
}
