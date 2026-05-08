// Hotbar como cinturón de 6 slots (Rust-style). Cada slot guarda un
// itemKey del inventario. Las teclas 1-6 activan el slot correspondiente
// según el tipo de item:
//   - weapon_pickup (rifle/shotgun/smg/sniper) → equipá el arma
//   - axe / pickaxe / cuchillo (siempre disponible) → activá la tool
//   - bandage / antibiotics → usá el consumible
//   - meat_cooked / meat_raw / berry / water_bottle → comé/bebé
//   - grenade → seleccioná granada (G la tira realmente)
//   - campfire / bear_trap / bedroll_item → modo colocar
//
// El usuario asigna items dragueando desde el inventario (drop sobre el
// slot del hotbar). Persiste en localStorage entre sesiones.

import * as inv from './inventory.js';

const SLOT_COUNT = 6;
// Bump el versioning del storage para forzar reset cuando cambiamos los
// defaults. Si tenías el v1 con [bullet_p, null, bandage, grenade, ...],
// el v2 arranca todo en null como pidió el usuario.
const STORAGE_KEY = 'survival-fps-v2-hotbar';

// Default vacío — el jugador asigna lo que quiera arrastrando del inv.
const DEFAULT_SLOTS = [null, null, null, null, null, null];

// Limpieza del storage viejo (v1) si todavía estaba.
try { localStorage.removeItem('survival-fps-v1-hotbar'); } catch {}

const state = {
  slots: loadOrDefault(),
};

function loadOrDefault() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SLOTS.slice();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return DEFAULT_SLOTS.slice();
    // Padding o trim a SLOT_COUNT.
    const out = arr.slice(0, SLOT_COUNT);
    while (out.length < SLOT_COUNT) out.push(null);
    return out;
  } catch { return DEFAULT_SLOTS.slice(); }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.slots)); } catch {}
}

const listeners = new Set();
function notify() { for (const fn of listeners) fn(state.slots); }
export function onChange(fn) { listeners.add(fn); fn(state.slots); return () => listeners.delete(fn); }

export function getSlot(idx) { return state.slots[idx] || null; }
export function getSlots()    { return state.slots.slice(); }
export function slotCount()   { return SLOT_COUNT; }

export function setSlot(idx, itemKey) {
  if (idx < 0 || idx >= SLOT_COUNT) return false;
  if (itemKey && !inv.ITEMS[itemKey]) return false;
  // Si el item ya estaba en otro slot, lo movemos (1 slot por item).
  if (itemKey) {
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (state.slots[i] === itemKey && i !== idx) state.slots[i] = null;
    }
  }
  state.slots[idx] = itemKey || null;
  save();
  notify();
  return true;
}

export function clearSlot(idx) {
  if (idx < 0 || idx >= SLOT_COUNT) return;
  state.slots[idx] = null;
  save();
  notify();
}

// Devuelve true si el itemKey está asignado en algún slot del hotbar.
export function hasInHotbar(itemKey) {
  return state.slots.includes(itemKey);
}

// Reset opcional (debug).
export function resetToDefault() {
  state.slots = DEFAULT_SLOTS.slice();
  save();
  notify();
}
