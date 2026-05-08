// Sistema de tipos de munición. Cada arma tiene 1-3 tipos disponibles
// (ej. rifle: normal / AP / INC). Tecla Q rota entre los tipos que tengas
// stock > 0. Si no hay especial, queda fijo en normal.
//
// AP (perforante): +30% daño contra enemigos blindados (tank/brute/boss/
//   scientists). Aplicado client-side al calcular finalDmg.
// INC (incendiaria): aplica burn DoT al enemigo — flag al server, server
//   tickea -2 HP/s por 5s.

import * as inv from './inventory.js';
import { logLine } from './hud.js';
import * as sfx from './sounds.js';

// Por arma, lista ordenada de tipos posibles. weapons.js lee esto cuando
// dispara para saber qué item consumir y qué flag mandar al server.
export const AMMO_TYPES = {
  pistol: [
    { type: 'normal', item: 'bullet_p',    label: 'NORMAL' },
    { type: 'ap',     item: 'bullet_p_ap', label: 'AP',     dmgMul: 1.3 },
  ],
  rifle: [
    { type: 'normal', item: 'bullet_r',     label: 'NORMAL' },
    { type: 'ap',     item: 'bullet_r_ap',  label: 'AP',     dmgMul: 1.3 },
    { type: 'inc',    item: 'bullet_r_inc', label: 'INCEND.', burn: true },
  ],
  smg:     [{ type: 'normal', item: 'bullet_smg',   label: 'NORMAL' }],
  shotgun: [{ type: 'normal', item: 'shell',        label: 'NORMAL' }],
  sniper:  [{ type: 'normal', item: 'sniper_round', label: 'NORMAL' }],
};

// Estado: índice activo por arma.
const activeIdx = { pistol: 0, rifle: 0, smg: 0, shotgun: 0, sniper: 0 };

const listeners = new Set();
function notify() { for (const fn of listeners) fn(); }
export function onChange(fn) { listeners.add(fn); fn(); return () => listeners.delete(fn); }

// Devuelve el descriptor activo para `weaponName`. Si el item activo está
// en 0, cae a normal automáticamente al disparar (no rota).
export function getActiveAmmo(weaponName) {
  const list = AMMO_TYPES[weaponName] || [];
  if (list.length === 0) return null;
  const idx = activeIdx[weaponName] | 0;
  return list[Math.min(idx, list.length - 1)];
}

// Si el activo está vacío, cambia automáticamente al primer tipo con stock.
export function fallbackToAvailable(weaponName) {
  const list = AMMO_TYPES[weaponName] || [];
  if (list.length === 0) return;
  const cur = getActiveAmmo(weaponName);
  if (cur && inv.has(cur.item, 1)) return;
  for (let i = 0; i < list.length; i++) {
    if (inv.has(list[i].item, 1)) { activeIdx[weaponName] = i; notify(); return; }
  }
  // Si no hay nada, fija en 0 (normal).
  activeIdx[weaponName] = 0;
  notify();
}

// Q: rota al siguiente tipo con stock > 0.
export function cycleAmmo(weaponName) {
  const list = AMMO_TYPES[weaponName] || [];
  if (list.length <= 1) {
    logLine('Esa arma solo usa balas normales');
    return;
  }
  const start = activeIdx[weaponName] | 0;
  for (let off = 1; off <= list.length; off++) {
    const i = (start + off) % list.length;
    if (inv.has(list[i].item, 1)) {
      activeIdx[weaponName] = i;
      logLine(`Munición: ${list[i].label}`);
      sfx.playEmpty?.();
      notify();
      return;
    }
  }
  logLine('No tenés munición especial — solo normal disponible');
}
