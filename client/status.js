// Status effects del jugador. Por ahora: sangrado e infección.
//
// Sangrado: probabilidad al recibir daño melee (zombie cerca). Drena 1 HP/s
// hasta usar venda. Las vendas curan HP además de detener el sangrado.
//
// Infección: % chance al recibir mordedura de zombie. Drena 0.4 HP/s y baja
// hambre extra. Solo se cura con antibióticos (nuevo item).

import { player } from './player.js';
import { setHP, logLine, showBanner } from './hud.js';
import * as inv from './inventory.js';

const state = {
  bleeding: false,
  bleedTimer: 0,
  infected: false,
  infectTimer: 0,
  poisoned: false,
  poisonTimer: 0,
};

const listeners = new Set();
function notify() { for (const fn of listeners) fn(state); }
export function onChange(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
export function getState() { return state; }

// Llamado al recibir daño. `kind` puede ser 'melee', 'gunshot', 'fall',
// 'animal', 'bile' (bola verde del bilebomber).
export function onDamage(dmg, kind = 'gunshot') {
  if (player.invulnerable || player.godMode || player.hp <= 0) return;
  const bleedChance = kind === 'animal' ? 0.50
                    : kind === 'melee'  ? 0.35
                    : kind === 'gunshot'? 0.12 : 0;
  if (Math.random() < bleedChance && !state.bleeding) {
    state.bleeding = true;
    state.bleedTimer = 30;
    logLine('★ SANGRANDO — usá una venda (H)');
    showBanner('SANGRANDO', 1600);
    notify();
  }
  if (kind === 'melee' && !state.infected && Math.random() < 0.18) {
    state.infected = true;
    state.infectTimer = 60;
    logLine('☣ INFECTADO — necesitás antibióticos (loot raro)');
    showBanner('INFECCION', 1600);
    notify();
  }
  // Bilebomber bile = envenenamiento garantizado.
  if (kind === 'bile' && !state.poisoned) {
    state.poisoned = true;
    state.poisonTimer = 8;          // 8s de DoT
    logLine('☠ ENVENENADO — agua o antibióticos para curar');
    showBanner('ENVENENADO', 1600);
    notify();
  }
}

// Llamado cada frame desde main.js.
export function tick(dt) {
  if (player.hp <= 0 || player.godMode) return;
  if (state.bleeding) {
    state.bleedTimer -= dt;
    player.hp = Math.max(0, player.hp - 1.0 * dt);
    setHP(player.hp);
    if (state.bleedTimer <= 0) {
      // Sangrado se termina solo después de 30s, pero perdés mucho HP.
      state.bleeding = false;
      logLine('Dejás de sangrar (la herida cerró)');
      notify();
    }
  }
  if (state.infected) {
    state.infectTimer -= dt;
    player.hp = Math.max(0, player.hp - 0.4 * dt);
    player.hunger = Math.max(0, (player.hunger ?? 100) - 0.6 * dt);
    setHP(player.hp);
    if (state.infectTimer <= 0) {
      state.infected = false;
      logLine('La infección retrocede — sobreviviste por poco');
      notify();
    }
  }
  if (state.poisoned) {
    state.poisonTimer -= dt;
    player.hp = Math.max(0, player.hp - 1.5 * dt);
    setHP(player.hp);
    if (state.poisonTimer <= 0) {
      state.poisoned = false;
      logLine('El veneno se metabolizó — pero perdiste HP');
      notify();
    }
  }
}

// Curar veneno (agua / antibioticos).
export function cureBile() {
  if (!state.poisoned) return false;
  state.poisoned = false;
  state.poisonTimer = 0;
  logLine('Veneno curado');
  notify();
  return true;
}

// Llamado al usar venda — corta el sangrado además de curar HP.
export function stopBleeding() {
  if (!state.bleeding) return false;
  state.bleeding = false;
  state.bleedTimer = 0;
  logLine('Vendaje detuvo el sangrado');
  notify();
  return true;
}

// Antibióticos — nuevo item.
export function tryAntibiotics() {
  if (!state.infected) { logLine('No estás infectado'); return false; }
  if (!inv.consume('antibiotics', 1)) { logLine('No tenés antibióticos'); return false; }
  state.infected = false;
  state.infectTimer = 0;
  player.hp = Math.min(player.maxHp || 100, player.hp + 15);
  setHP(player.hp);
  logLine('✚ Antibióticos — infección curada (+15 HP)');
  notify();
  return true;
}
