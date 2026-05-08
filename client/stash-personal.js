// Stash personal — cofres MÚLTIPLES crafteables que el jugador coloca
// donde quiera. Cada stash tiene su propio storage de 24 slots, y todos
// persisten en localStorage.
//
// Crafteo: 6 wood + 3 stone + 4 scrap → 1 stash_box.
// Use desde inventario (o tecla M): coloca al frente del player.
// E cerca: abre el modal con el grid del stash más cercano.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';
import * as inv from './inventory.js';
import { logLine, showBanner } from './hud.js';
import * as sfx from './sounds.js';

const STASH_RADIUS = 2.5;
const SLOT_COUNT = 24;
const STORAGE_KEY = 'survival-fps-v2-stashes';

// Estado: array de stashes. { id, x, z, slots: [{item, count} | null, ...] }
const state = {
  stashes: load(),
};
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s) => Number.isFinite(s?.x) && Number.isFinite(s?.z) && Array.isArray(s.slots));
  } catch { return []; }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.stashes)); } catch {}
}

const listeners = new Set();
function notify() { for (const fn of listeners) fn(state.stashes); }
export function onChange(fn) { listeners.add(fn); fn(state.stashes); return () => listeners.delete(fn); }
export function getAllStashes() { return state.stashes.slice(); }

// =====================================================================
// Mesh — cada stash es un cofre verde con tapa.
// =====================================================================
const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 0.85 });
const bandMat = new THREE.MeshStandardMaterial({ color: 0x60ff80, roughness: 0.4, metalness: 0.6, emissive: 0x40c060, emissiveIntensity: 0.7 });
const meshById = new Map();    // id → Group

function makeStashMesh() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), woodMat);
  box.position.y = 0.30; g.add(box);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.62), bandMat);
  lid.position.y = 0.62; g.add(lid);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.04), bandMat);
  lock.position.set(0, 0.40, 0.32); g.add(lock);
  return g;
}

function spawnMesh(stash) {
  if (meshById.has(stash.id)) return;
  const m = makeStashMesh();
  m.position.set(stash.x, heightAt(stash.x, stash.z), stash.z);
  scene.add(m);
  meshById.set(stash.id, m);
}

function removeMesh(id) {
  const m = meshById.get(id); if (!m) return;
  scene.remove(m);
  m.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
  meshById.delete(id);
}

// Spawn meshes para los stashes ya cargados.
for (const s of state.stashes) spawnMesh(s);

// =====================================================================
// Place — el player coloca un nuevo stash al frente.
// =====================================================================
export function placeAt(x, z) {
  if (!inv.consume('stash_box', 1)) {
    logLine('Necesitás 1 caja de stash (crafteable)');
    return false;
  }
  const id = `stash_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const stash = { id, x, z, slots: new Array(SLOT_COUNT).fill(null) };
  state.stashes.push(stash);
  spawnMesh(stash);
  save();
  notify();
  showBanner('★ STASH COLOCADO', 1500);
  logLine(`Stash colocado en (${x.toFixed(1)}, ${z.toFixed(1)})`);
  sfx.playPickup?.();
  return true;
}

// =====================================================================
// Lookup — el más cercano dentro del radio.
// =====================================================================
export function nearestInRange(playerPos) {
  let best = null, bestD = STASH_RADIUS;
  for (const s of state.stashes) {
    const d = Math.hypot(s.x - playerPos.x, s.z - playerPos.z);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

export function getById(id) {
  return state.stashes.find((s) => s.id === id) || null;
}

// =====================================================================
// Depositar / retirar al stash con `id`.
// =====================================================================
export function deposit(stashId, itemKey, count = 1) {
  const stash = getById(stashId);
  if (!stash) return false;
  if (!inv.ITEMS[itemKey]) return false;
  if (inv.ITEMS[itemKey].noDrop) {
    logLine(`No se puede guardar ${inv.ITEMS[itemKey].label}`);
    return false;
  }
  if (!inv.has(itemKey, count)) return false;
  const meta = inv.ITEMS[itemKey];
  const max = meta.max || 1;
  let placed = 0;
  while (placed < count) {
    let idx = stash.slots.findIndex((s) => s && s.item === itemKey && s.count < max);
    if (idx < 0) idx = stash.slots.findIndex((s) => !s);
    if (idx < 0) { logLine('Stash lleno'); break; }
    const cur = stash.slots[idx];
    const room = cur ? max - cur.count : max;
    const give = Math.min(room, count - placed);
    if (cur) cur.count += give;
    else stash.slots[idx] = { item: itemKey, count: give };
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

export function withdraw(stashId, slotIdx, count = null) {
  const stash = getById(stashId);
  if (!stash) return false;
  const cur = stash.slots[slotIdx];
  if (!cur) return false;
  const take = (count == null) ? cur.count : Math.min(count, cur.count);
  inv.add(cur.item, take);
  cur.count -= take;
  if (cur.count <= 0) stash.slots[slotIdx] = null;
  save();
  notify();
  sfx.playPickup?.();
  return true;
}

export function withdrawAll(stashId) {
  const stash = getById(stashId);
  if (!stash) return;
  for (let i = 0; i < stash.slots.length; i++) {
    const s = stash.slots[i];
    if (s) {
      inv.add(s.item, s.count);
      stash.slots[i] = null;
    }
  }
  save();
  notify();
  sfx.playPickup?.();
}

// =====================================================================
// Destruir — pickup el stash entero, devuelve el item al inventario y
// drops todo al inv (los slots quedan vacíos).
// =====================================================================
export function destroy(stashId) {
  const stash = getById(stashId);
  if (!stash) return;
  withdrawAll(stashId);
  inv.add('stash_box', 1);
  state.stashes = state.stashes.filter((s) => s.id !== stashId);
  removeMesh(stashId);
  save();
  notify();
  logLine('Stash recogido — devuelto al inventario');
}
