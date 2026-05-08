// Sistema de perks. Al subir nivel cada 3 (lvl 3, 6, 9, …) aparece un
// modal con 3 perks random del pool. El jugador elige uno y queda activo
// para toda la sesión. Persisten en localStorage.
//
// Cada perk tiene un `apply(player)` que muta el state global del jugador
// (hp max, sprintMult, dmgMult, regen, etc) y un `desc` para la UI.

import { player } from './player.js';
import { logLine, showBanner } from './hud.js';
import * as sfx from './sounds.js';

// Pool de perks. `id` es único; `apply` se llama una sola vez al elegirlo.
export const PERK_POOL = [
  {
    id: 'tough',
    name: 'RESISTENTE',
    desc: '+20 HP máximo permanente',
    apply(p) { p.maxHp = (p.maxHp || 100) + 20; p.hp = Math.min(p.maxHp, p.hp + 20); },
  },
  {
    id: 'regen',
    name: 'REGENERACION',
    desc: '+50% regeneración de HP',
    apply(p) { p.regenMult = (p.regenMult || 1) * 1.5; },
  },
  {
    id: 'sprinter',
    name: 'SPRINTER',
    desc: '+30% stamina máxima + drena 30% más lento',
    apply(p) { p.staminaMult = (p.staminaMult || 1) * 1.3; p.staminaDrainMult = (p.staminaDrainMult || 1) * 0.7; },
  },
  {
    id: 'gunslinger',
    name: 'PISTOLERO',
    desc: '+15% daño con armas de fuego',
    apply(p) { p.gunDamageMult = (p.gunDamageMult || 1) * 1.15; },
  },
  {
    id: 'butcher',
    name: 'CARNICERO',
    desc: '+30% daño melee (cuchillo/hacha)',
    apply(p) { p.meleeDamageMult = (p.meleeDamageMult || 1) * 1.3; },
  },
  {
    id: 'scavenger',
    name: 'CARROÑERO',
    desc: 'Cofres dan +1 cantidad por item',
    apply(p) { p.lootBonus = (p.lootBonus || 0) + 1; },
  },
  {
    id: 'iron_stomach',
    name: 'ESTOMAGO DE HIERRO',
    desc: 'Hambre y sed drenan 35% más lento',
    apply(p) { p.hungerDrainMult = (p.hungerDrainMult || 1) * 0.65; p.thirstDrainMult = (p.thirstDrainMult || 1) * 0.65; },
  },
  {
    id: 'warm_blood',
    name: 'SANGRE CALIENTE',
    desc: 'No perdés calor de noche',
    apply(p) { p.warmthImmune = true; },
  },
  {
    id: 'medic',
    name: 'MEDICO',
    desc: 'Vendas curan +20 HP extra',
    apply(p) { p.bandageBonus = (p.bandageBonus || 0) + 20; },
  },
  {
    id: 'eagle_eye',
    name: 'OJO DE AGUILA',
    desc: '+25% daño en headshot (acumulable con base)',
    apply(p) { p.headshotMult = (p.headshotMult || 2.0) + 0.25; },
  },
  {
    id: 'engineer',
    name: 'INGENIERO',
    desc: 'Recargás 30% más rápido',
    apply(p) { p.reloadSpeedMult = (p.reloadSpeedMult || 1) * 0.7; },
  },
  {
    id: 'thick_skin',
    name: 'PIEL CURTIDA',
    desc: '+10% reducción de daño general',
    apply(p) { p.dmgReduction = (p.dmgReduction || 0) + 0.10; },
  },
];

const STORAGE_KEY = 'survival-fps-v1-perks';

const state = {
  taken: new Set(),    // ids de perks ya elegidos
  pending: 0,          // perks pendientes de elegir (uno por nivel x3)
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.taken = new Set(data.taken || []);
    state.pending = data.pending | 0;
    // Re-aplicar perks ya elegidos al iniciar.
    for (const id of state.taken) {
      const p = PERK_POOL.find((x) => x.id === id);
      if (p) p.apply(player);
    }
  } catch {}
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      taken: [...state.taken], pending: state.pending,
    }));
  } catch {}
}
load();

const listeners = new Set();
function notify() { for (const fn of listeners) fn(state); }
export function onChange(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
export function getState() { return state; }
export function getPendingCount() { return state.pending; }

// Llamado desde progression.js cuando se sube de nivel. Los niveles 3, 6,
// 9... otorgan un perk a elegir.
export function onLevelUp(newLevel) {
  if (newLevel % 3 === 0) {
    state.pending++;
    save();
    notify();
    showBanner('★ NUEVO PERK DISPONIBLE ★ — abrí el panel con K', 3500);
    sfx.playPickup?.();
  }
}

// Devuelve 3 perks random NO tomados todavía. Si quedan menos de 3
// disponibles devuelve los que haya.
export function pickThreeOptions() {
  const avail = PERK_POOL.filter((p) => !state.taken.has(p.id));
  const out = [];
  const pool = avail.slice();
  while (out.length < 3 && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

export function choosePerk(id) {
  if (state.pending <= 0) return false;
  if (state.taken.has(id)) return false;
  const perk = PERK_POOL.find((p) => p.id === id);
  if (!perk) return false;
  state.taken.add(id);
  state.pending = Math.max(0, state.pending - 1);
  perk.apply(player);
  save();
  notify();
  logLine(`✓ Perk activado: ${perk.name}`);
  showBanner(`✓ ${perk.name}`, 2000);
  sfx.playKill?.();
  return true;
}
