// Stash personal — cofre client-side que persiste entre sesiones via
// localStorage. Mesh visible en (0, 0) (cerca del spawn). E para abrir
// → modal con grid de slots. Drag&drop entre inventario y stash.
//
// Cada slot guarda { item: key, count: n }. 24 slots máximo.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';
import * as inv from './inventory.js';
import { logLine, showBanner } from './hud.js';
import * as sfx from './sounds.js';

export const STASH_POS = { x: 5, z: 5 };
export const STASH_RADIUS = 2.5;
const SLOT_COUNT = 24;
const STORAGE_KEY = 'survival-fps-v1-stash';

const state = {
  slots: load(),
};
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Array(SLOT_COUNT).fill(null);
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Array(SLOT_COUNT).fill(null);
    const out = arr.slice(0, SLOT_COUNT);
    while (out.length < SLOT_COUNT) out.push(null);
    return out;
  } catch { return new Array(SLOT_COUNT).fill(null); }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.slots)); } catch {}
}

const listeners = new Set();
function notify() { for (const fn of listeners) fn(state.slots); }
export function onChange(fn) { listeners.add(fn); fn(state.slots); return () => listeners.delete(fn); }
export function getSlots() { return state.slots.slice(); }

// =====================================================================
// Mesh — cofre verde visible en STASH_POS.
// =====================================================================
const stashGroup = new THREE.Group();
const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 0.85 });
const bandMat = new THREE.MeshStandardMaterial({ color: 0x60ff80, roughness: 0.4, metalness: 0.6, emissive: 0x40c060, emissiveIntensity: 0.7 });
const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.7), woodMat);
box.position.y = 0.35; stashGroup.add(box);
const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.10, 0.72), bandMat);
band.position.y = 0.55; stashGroup.add(band);
const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), bandMat);
lock.position.set(0, 0.45, 0.36); stashGroup.add(lock);
stashGroup.position.set(STASH_POS.x, heightAt(STASH_POS.x, STASH_POS.z), STASH_POS.z);
scene.add(stashGroup);

export function nearestInRange(playerPos) {
  const dx = STASH_POS.x - playerPos.x;
  const dz = STASH_POS.z - playerPos.z;
  return Math.hypot(dx, dz) < STASH_RADIUS ? { x: STASH_POS.x, z: STASH_POS.z } : null;
}

// =====================================================================
// Logic — depositar / retirar
// =====================================================================
export function deposit(itemKey, count = 1) {
  if (!inv.ITEMS[itemKey]) return false;
  if (inv.ITEMS[itemKey].noDrop) {
    logLine(`No se puede guardar ${inv.ITEMS[itemKey].label} en el stash`);
    return false;
  }
  if (!inv.has(itemKey, count)) {
    logLine(`No tenés ${count} de ese item`);
    return false;
  }
  const meta = inv.ITEMS[itemKey];
  const max = meta.max || 1;
  // Buscá un slot existente con el mismo item que no esté lleno; o usá vacío.
  let placed = 0;
  while (placed < count) {
    let slot = state.slots.findIndex((s) => s && s.item === itemKey && s.count < max);
    if (slot < 0) slot = state.slots.findIndex((s) => !s);
    if (slot < 0) {
      logLine('Stash lleno');
      break;
    }
    const cur = state.slots[slot];
    const room = cur ? max - cur.count : max;
    const give = Math.min(room, count - placed);
    if (cur) cur.count += give;
    else state.slots[slot] = { item: itemKey, count: give };
    placed += give;
  }
  if (placed > 0) {
    inv.remove(itemKey, placed);
    save();
    notify();
    sfx.playPickup?.();
    return true;
  }
  return false;
}

export function withdraw(slotIdx, count = null) {
  const cur = state.slots[slotIdx];
  if (!cur) return false;
  const take = (count == null) ? cur.count : Math.min(count, cur.count);
  inv.add(cur.item, take);
  cur.count -= take;
  if (cur.count <= 0) state.slots[slotIdx] = null;
  save();
  notify();
  sfx.playPickup?.();
  return true;
}

export function withdrawAll() {
  for (let i = 0; i < state.slots.length; i++) {
    const s = state.slots[i];
    if (s) {
      inv.add(s.item, s.count);
      state.slots[i] = null;
    }
  }
  save();
  notify();
  sfx.playPickup?.();
}
