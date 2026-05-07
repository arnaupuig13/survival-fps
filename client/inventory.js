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

export const ITEMS = {
  // Ammo.
  bullet_p:        { label: 'BALAS PISTOLA',  max: 99, rarity: 'common' },
  bullet_r:        { label: 'BALAS RIFLE',    max: 99, rarity: 'common' },
  bullet_smg:      { label: 'BALAS SMG',      max: 99, rarity: 'common' },
  shell:           { label: 'CARTUCHOS',      max: 60, rarity: 'uncommon' },
  sniper_round:    { label: 'CAL .50',        max: 30, rarity: 'rare' },
  // Consumables.
  bandage:         { label: 'VENDAJES',       max: 9,  rarity: 'uncommon' },
  grenade:         { label: 'GRANADAS',       max: 6,  rarity: 'rare' },
  // Weapons (oneTime — pickup unlocks the slot).
  rifle_pickup:    { label: 'RIFLE',          max: 1, oneTime: true, rarity: 'rare' },
  shotgun_pickup:  { label: 'ESCOPETA',       max: 1, oneTime: true, rarity: 'epic' },
  smg_pickup:      { label: 'SMG',            max: 1, oneTime: true, rarity: 'rare' },
  sniper_pickup:   { label: 'RIFLE FRANCOTIRADOR', max: 1, oneTime: true, rarity: 'legendary' },
  axe:             { label: 'HACHA',          max: 1, oneTime: true, rarity: 'uncommon' },
  pickaxe:         { label: 'PICO',           max: 1, oneTime: true, rarity: 'uncommon' },
  // Attachments (oneTime).
  scope:           { label: 'MIRILLA',        max: 1, oneTime: true, rarity: 'rare' },
  silencer:        { label: 'SILENCIADOR',    max: 1, oneTime: true, rarity: 'epic' },
  ext_mag:         { label: 'CARGADOR EXT.',  max: 1, oneTime: true, rarity: 'rare' },
  // Armor (oneTime).
  vest_armor:      { label: 'CHALECO',        max: 1, oneTime: true, rarity: 'rare' },
  helmet_armor:    { label: 'CASCO',          max: 1, oneTime: true, rarity: 'epic' },
  // Survival.
  meat_raw:        { label: 'CARNE CRUDA',    max: 9,  rarity: 'common' },
  meat_cooked:     { label: 'CARNE COCIDA',   max: 9,  rarity: 'uncommon' },
  berry:           { label: 'BAYAS',          max: 20, rarity: 'common' },
  water_bottle:    { label: 'BOTELLA AGUA',   max: 5,  rarity: 'common' },
  // Resources.
  wood:            { label: 'MADERA',         max: 50, rarity: 'common' },
  stone:           { label: 'PIEDRA',         max: 30, rarity: 'common' },
  campfire:        { label: 'HOGUERAS',       max: 5,  rarity: 'uncommon' },
  wall_piece:      { label: 'PARED',          max: 30, rarity: 'common' },
  bedroll_item:    { label: 'CAMA',           max: 3,  rarity: 'uncommon' },
};

const state = {
  bullet_p: 12,
  bullet_r: 0,
  bullet_smg: 0,
  shell: 0,
  sniper_round: 0,
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
  campfire: 0,
  wall_piece: 0,
  bedroll_item: 0,
  kills: 0,
};

const listeners = new Set();
function notify() { for (const fn of listeners) fn(state); }
export function onChange(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }

export function get(item) { return state[item] | 0; }
export function getState() { return state; }
export function has(item, n = 1) { return get(item) >= n; }
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
  if (player.hp >= 100 || player.hp <= 0) return false;
  if (!consume('bandage', 1)) return false;
  player.hp = Math.min(100, player.hp + 30);
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
