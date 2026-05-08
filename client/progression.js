// Sistema de XP + niveles. Por-sesión (no persiste entre partidas — el
// objetivo es premiar el juego activo, no un grindeo offline).
//
// XP:
//   - Cada kill da XP según el tipo de enemigo (zombie común 10, runner 15,
//     tank 40, scientist 30, wolf 12, bear 60, boss 500).
//   - Cada cofre abierto da 5 XP (loot grant lo dispara).
//   - Quests diarias dan XP fuerte al completarse.
//
// Level up:
//   - Threshold por nivel: 80 * level^1.4 (lvl1→80, lvl2→210, lvl3→376…)
//   - Restaura HP a 100 + sube max HP en +5 (player.maxHp).
//   - Banner visual + sound + restablece hambre/sed parcialmente.

import { showBanner, logLine } from './hud.js';
import * as sfx from './sounds.js';
import { player } from './player.js';

// XP grants por tipo de enemigo. Default 10 si no está mapeado.
export const XP_PER_KILL = {
  zombie:      10,
  runner:      15,
  tank:        40,
  // Specials.
  spitter:     22,
  screamer:    18,
  exploder:    25,   // poco porque es fácil de matar a distancia
  brute:       80,   // mini-boss
  scientist:   30,
  sci_shotgun: 35,
  sci_sniper:  35,
  wolf:        12,
  boar:        18,
  bear:        60,
  boss:       500,
  deer:         4,
  rabbit:       2,
};

const state = {
  xp: 0,
  level: 1,
  xpThisLevel: 0,
};

const listeners = new Set();
function notify() { for (const fn of listeners) fn(state); }
export function onChange(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
export function getState() { return state; }
export function getLevel() { return state.level; }
export function getXp() { return state.xp; }

// Total XP requerido para alcanzar `level` desde lvl 1.
export function totalXpForLevel(level) {
  let total = 0;
  for (let i = 1; i < level; i++) total += xpForNext(i);
  return total;
}
// XP necesario para subir DEL nivel `lvl` al `lvl+1`.
export function xpForNext(lvl) {
  return Math.round(80 * Math.pow(lvl, 1.4));
}

export function addXp(amount, label = null) {
  if (amount <= 0) return { leveledUp: false };
  state.xp += amount;
  state.xpThisLevel += amount;
  if (label) logLine(`+${amount} XP · ${label}`);
  let leveledUp = false;
  while (state.xpThisLevel >= xpForNext(state.level)) {
    state.xpThisLevel -= xpForNext(state.level);
    state.level += 1;
    leveledUp = true;
    onLevelUp(state.level);
  }
  notify();
  return { leveledUp };
}

function onLevelUp(newLevel) {
  // Bonus al subir: +5 max HP, restaura HP completo, repone parcial hambre/sed.
  player.maxHp = (player.maxHp || 100) + 5;
  player.hp = player.maxHp;
  player.hunger = Math.min(100, (player.hunger ?? 100) + 30);
  player.thirst = Math.min(100, (player.thirst ?? 100) + 30);
  showBanner(`★ NIVEL ${newLevel} ★`, 2400);
  logLine(`Subiste al nivel ${newLevel} — HP máx +5, HP/hambre/sed restaurados`);
  sfx.playKill?.();
  sfx.playPickup?.();
}

// Conveniencia: dado un kind de enemigo, sumar el XP correspondiente.
export function awardKillXp(kind, isBoss = false) {
  const amt = isBoss ? XP_PER_KILL.boss : (XP_PER_KILL[kind] || 10);
  addXp(amt, `kill ${kind}${isBoss ? ' (BOSS)' : ''}`);
}
