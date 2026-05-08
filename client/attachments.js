// Attachments por arma — sub-inventario de 4 slots por cada arma.
// El attachment se ARRANCA del inventario principal al adjuntarlo (queda
// en el sub-inv del arma) y vuelve al inv principal al desadjuntarlo.
//
// Reglas de compatibilidad por slot type (qué puede ir en qué arma):
//   scope: pistol, rifle, smg, shotgun, sniper, crossbow
//   silencer: pistol, smg, rifle, crossbow
//   ext_mag: pistol, rifle, smg, shotgun, sniper
//   grip: pistol, rifle, smg, shotgun
//   laser_sight: pistol, rifle, smg, shotgun
//
// Cada arma tiene 4 slots. Cualquier attachment cabe en cualquier slot
// (no hay slots por tipo) — pero un mismo type solo cuenta una vez por
// arma (no podés tener 2 silenciadores en el rifle).

import * as inv from './inventory.js';

const STORAGE_KEY = 'survival-fps-v2-weapon-attachments';
const SLOT_COUNT = 4;
export const WEAPONS = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper', 'crossbow'];
export const ATTACH_TYPES = ['scope', 'silencer', 'ext_mag', 'grip', 'laser_sight'];

// Compatibilidad: a qué armas se puede adjuntar cada type.
const COMPAT = {
  scope:       ['pistol', 'rifle', 'smg', 'shotgun', 'sniper', 'crossbow'],
  silencer:    ['pistol', 'smg', 'rifle', 'crossbow'],
  ext_mag:     ['pistol', 'rifle', 'smg', 'shotgun', 'sniper'],
  grip:        ['pistol', 'rifle', 'smg', 'shotgun'],
  laser_sight: ['pistol', 'rifle', 'smg', 'shotgun'],
};

function emptyState() {
  const out = {};
  for (const w of WEAPONS) out[w] = [null, null, null, null];
  return out;
}

const state = load();
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    const out = emptyState();
    for (const w of WEAPONS) {
      if (Array.isArray(data[w])) {
        for (let i = 0; i < SLOT_COUNT; i++) {
          if (typeof data[w][i] === 'string' && ATTACH_TYPES.includes(data[w][i])) {
            out[w][i] = data[w][i];
          }
        }
      }
    }
    return out;
  } catch { return emptyState(); }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

const listeners = new Set();
function notify() { for (const fn of listeners) fn(state); }
export function onChange(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }

// =====================================================================
// API
// =====================================================================
export function getSlots(weapon) {
  return (state[weapon] || [null, null, null, null]).slice();
}

// ¿El arma tiene ese type adjunto en cualquier slot?
export function has(weapon, type) {
  const slots = state[weapon];
  if (!slots) return false;
  return slots.includes(type);
}

// ¿En qué arma (si es que en alguna) está adjunto este type? Devuelve
// el primer match — útil porque solo tenés 1 instancia del attachment
// item a la vez (al adjuntar lo sacás del inventario).
export function whereEquipped(type) {
  for (const w of WEAPONS) {
    if (state[w] && state[w].includes(type)) return w;
  }
  return null;
}

export function isCompatible(weapon, type) {
  return (COMPAT[type] || []).includes(weapon);
}

// Adjuntar — saca del inv principal + asigna al slot. Si el slot ya
// tenía algo, ese algo vuelve al inv. Si el type ya estaba en otro slot
// del mismo arma, falla. Si la compat no permite, falla.
export function attach(weapon, slotIdx, itemKey) {
  if (!state[weapon]) return false;
  if (slotIdx < 0 || slotIdx >= SLOT_COUNT) return false;
  if (!ATTACH_TYPES.includes(itemKey)) return false;
  if (!isCompatible(weapon, itemKey)) return false;
  // No duplicar el mismo type en distintos slots del mismo arma.
  if (state[weapon].includes(itemKey)) return false;
  // Verificar que tenés el item en el inventario.
  if (!inv.has(itemKey, 1)) return false;
  // Si el slot tiene algo, devolverlo al inv.
  const prev = state[weapon][slotIdx];
  if (prev) inv.add(prev, 1);
  // Quitar item del inv y asignar al slot.
  inv.remove(itemKey, 1);
  state[weapon][slotIdx] = itemKey;
  // Si el item estaba adjunto en OTRA arma, sacarlo de ahí (defensive
  // — no debería poder pasar porque inv.has falla, pero por las dudas).
  for (const w of WEAPONS) {
    if (w === weapon) continue;
    const s = state[w];
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (s[i] === itemKey) s[i] = null;
    }
  }
  save();
  notify();
  return true;
}

// Desadjuntar — devuelve el item al inv y limpia el slot.
export function detach(weapon, slotIdx) {
  if (!state[weapon]) return false;
  const item = state[weapon][slotIdx];
  if (!item) return false;
  inv.add(item, 1);
  state[weapon][slotIdx] = null;
  save();
  notify();
  return true;
}

// Detach por type (cualquier slot de cualquier arma) — usado por la UI
// vieja si hace falta. Devuelve true si encontró + desadjuntó.
export function detachByType(type) {
  for (const w of WEAPONS) {
    const idx = state[w].indexOf(type);
    if (idx >= 0) return detach(w, idx);
  }
  return false;
}
