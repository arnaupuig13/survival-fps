// Local inventory state. Server is authoritative for crate contents but the
// client owns the consumption side (firing pistol/rifle decrements the right
// counter). Bandages heal +30 HP and are consumed on use.

import { setHP } from './hud.js';

export const ITEMS = {
  bullet_p:     { label: 'BALAS PISTOLA', max: 99 },
  bullet_r:     { label: 'BALAS RIFLE',   max: 99 },
  bandage:      { label: 'VENDAJES',      max: 9  },
  grenade:      { label: 'GRANADAS',      max: 6  },
  rifle_pickup: { label: 'RIFLE',         max: 1, oneTime: true },
  // Survival items.
  meat_raw:     { label: 'CARNE CRUDA',   max: 9  },
  meat_cooked:  { label: 'CARNE COCIDA',  max: 9  },
  berry:        { label: 'BAYAS',         max: 20 },
  water_bottle: { label: 'BOTELLA AGUA',  max: 5  },
  wood:         { label: 'MADERA',        max: 50 },
  stone:        { label: 'PIEDRA',        max: 30 },
  campfire:     { label: 'HOGUERAS',      max: 5  },
};

const state = {
  bullet_p: 12,
  bullet_r: 0,
  bandage:  1,
  grenade:  2,
  rifle_pickup: 0,
  meat_raw: 0,
  meat_cooked: 0,
  berry: 3,                 // start with a few berries so first hunger drop has a fix
  water_bottle: 1,
  wood: 0,
  stone: 0,
  campfire: 0,
  kills:    0,
};

// Crafting recipes — used by main.js / hud.js to render the recipe list.
// 'requires' = items consumed; 'produces' = item gained; 'needsFire' = must
// be standing near a campfire.
export const RECIPES = [
  { id: 'cook_meat',     label: 'COCINAR CARNE',  requires: { meat_raw: 1 },        produces: { meat_cooked: 1 }, needsFire: true },
  { id: 'craft_bandage', label: 'VENDA',          requires: { wood: 2 },            produces: { bandage: 1 } },
  { id: 'craft_campfire',label: 'HOGUERA',        requires: { wood: 5, stone: 2 },  produces: { campfire: 1 } },
  { id: 'craft_grenade', label: 'GRANADA',        requires: { stone: 3, wood: 1 },  produces: { grenade: 1 } },
  { id: 'craft_water',   label: 'BOTELLA AGUA',   requires: { water_bottle: 0 },    produces: { water_bottle: 0 }, special: 'fillWater' },
];

// Try to craft. Returns the produced item label if success, else null.
export function craft(recipeId, opts = {}) {
  const r = RECIPES.find(x => x.id === recipeId);
  if (!r) return null;
  if (r.needsFire && !opts.nearFire) return null;
  if (r.special === 'fillWater') {
    // Filling needs proximity to water. opts.nearWater tells us.
    if (!opts.nearWater) return null;
    add('water_bottle', 1);
    return ITEMS.water_bottle.label;
  }
  // Consume requires.
  for (const [item, count] of Object.entries(r.requires)) {
    if (!has(item, count)) return null;
  }
  for (const [item, count] of Object.entries(r.requires)) {
    remove(item, count);
  }
  // Produce.
  for (const [item, count] of Object.entries(r.produces)) {
    add(item, count);
  }
  return Object.keys(r.produces).map(k => ITEMS[k]?.label || k).join(', ');
}

const listeners = new Set();
function notify() { for (const fn of listeners) fn(state); }
export function onChange(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }

export function get(item) { return state[item] | 0; }
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

export function applyLoot(loot, lootedFrom = null) {
  const lines = [];
  for (const [item, count] of Object.entries(loot || {})) {
    if (!ITEMS[item]) continue;
    add(item, count);
    lines.push(`+${count} ${ITEMS[item].label}`);
  }
  return lines;
}

export function bumpKills() {
  state.kills = (state.kills | 0) + 1;
  notify();
}

// Use a bandage (key H). Returns true if it healed.
export function useBandage(player) {
  if (player.hp >= 100 || player.hp <= 0) return false;
  if (!consume('bandage', 1)) return false;
  player.hp = Math.min(100, player.hp + 30);
  setHP(player.hp);
  return true;
}
