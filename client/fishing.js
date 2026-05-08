// Pesca — cerca de un lago + tenés `fishing_rod` + apretás E (con
// prioridad si tenés caña). Anim de 3-5s, después da meat_raw + bayas
// random. Bloquea movimiento durante la animación.

import * as inv from './inventory.js';
import { player } from './player.js';
import { logLine, showBanner } from './hud.js';
import * as sfx from './sounds.js';

const FISHING_DUR = 3.5;        // segundos
const PROGRESS_BANNER_AT = 1.5;

const state = {
  active: false,
  start: 0,
  result: null,
};

export function isFishing() { return state.active; }
export function getProgress() {
  if (!state.active) return 0;
  return (performance.now() / 1000 - state.start) / FISHING_DUR;
}

export function startFishing() {
  if (state.active) return false;
  if (!inv.has('fishing_rod', 1)) {
    logLine('Necesitás una caña de pescar');
    return false;
  }
  state.active = true;
  state.start = performance.now() / 1000;
  showBanner('PESCANDO...', 1500);
  sfx.playEmpty?.();
  return true;
}

export function tick() {
  if (!state.active) return;
  const t = performance.now() / 1000 - state.start;
  if (t >= FISHING_DUR) {
    finish();
  }
}

function finish() {
  state.active = false;
  // Resultado: 1-2 meat_raw + a veces una bandage extra (algas/limos).
  const meatCount = 1 + Math.floor(Math.random() * 2);
  inv.add('meat_raw', meatCount);
  let extra = '';
  if (Math.random() < 0.20) {
    inv.add('bandage', 1);
    extra = ' + 1 vendaje';
  }
  logLine(`✓ Pescaste ${meatCount} meat_raw${extra}`);
  sfx.playPickup?.();
}

export function cancel() {
  if (!state.active) return;
  state.active = false;
  logLine('Pesca cancelada');
}
