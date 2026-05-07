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
};

const state = {
  bullet_p: 12,
  bullet_r: 0,
  bandage:  1,
  grenade:  2,            // start with a couple so the player can try slot 4
  rifle_pickup: 0,
  kills:    0,
};

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
