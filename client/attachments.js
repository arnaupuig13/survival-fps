// Attachments por arma — scope, silencer, ext_mag se equipan a un arma
// específica (no auto-aplicado). Estado persistido en localStorage.
// Como solo tenés UNO de cada attachment (oneTime), si lo equipás a otra
// arma se desequipa automáticamente de la anterior.

const STORAGE_KEY = 'survival-fps-v1-attachments';

const ATTACH_TYPES = ['scope', 'silencer', 'ext_mag'];
const WEAPONS = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper'];

function emptyState() {
  const out = {};
  for (const w of WEAPONS) {
    out[w] = { scope: false, silencer: false, ext_mag: false };
  }
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
      if (data[w]) {
        for (const t of ATTACH_TYPES) {
          if (data[w][t]) out[w][t] = true;
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

// Saber si un arma tiene un attachment equipado.
export function has(weapon, type) {
  return !!(state[weapon] && state[weapon][type]);
}

// Equipar a un arma — desequipa automáticamente de cualquier otra arma
// (solo tenés un scope, un silencer, un ext_mag a la vez).
export function equip(weapon, type) {
  if (!ATTACH_TYPES.includes(type) || !WEAPONS.includes(weapon)) return false;
  for (const w of WEAPONS) {
    if (state[w]) state[w][type] = (w === weapon);
  }
  save();
  notify();
  return true;
}

export function unequip(weapon, type) {
  if (!state[weapon]) return;
  state[weapon][type] = false;
  save();
  notify();
}

// Devuelve a qué arma está equipado un attachment (o null).
export function whereEquipped(type) {
  for (const w of WEAPONS) {
    if (state[w] && state[w][type]) return w;
  }
  return null;
}

export const ATTACHMENT_TYPES = ATTACH_TYPES;
export const WEAPON_KEYS = WEAPONS;
