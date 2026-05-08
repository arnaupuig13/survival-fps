// Misiones diarias. Al inicio del día se generan 3 quests random de un pool
// de plantillas. Completarlas da XP + un item de recompensa. Persistimos en
// localStorage por día para que cerrar la pestaña no borre el progreso.
//
// Tracking:
//   - "kill_zombies" / "kill_scientists" / "kill_animals" — main.js avisa al
//     network.onEnemyDead.
//   - "open_crates"  — main.js avisa al network.onLootGranted.
//   - "harvest_wood" / "harvest_stone" — tools.js avisa al cosechar.
//   - "drink_water" / "eat_food"       — KeyJ / KeyU disparan.

import * as inv from './inventory.js';
import { addXp } from './progression.js';
import { showBanner, logLine } from './hud.js';
import * as sfx from './sounds.js';

const TEMPLATES = [
  { id: 'kill_zombies_5',    label: 'Matá 5 zombies',           goal: 5,  track: 'kill_zombies',    xp: 150, reward: { bandage: 2 } },
  { id: 'kill_zombies_15',   label: 'Matá 15 zombies',          goal: 15, track: 'kill_zombies',    xp: 300, reward: { grenade: 1, bullet_r: 30 } },
  { id: 'kill_runners',      label: 'Matá 3 runners',           goal: 3,  track: 'kill_runners',    xp: 200, reward: { bullet_p: 24 } },
  { id: 'kill_tank',         label: 'Matá 1 tanque',            goal: 1,  track: 'kill_tank',       xp: 250, reward: { shell: 12 } },
  { id: 'kill_scientists',   label: 'Matá 3 científicos',       goal: 3,  track: 'kill_scientists', xp: 280, reward: { bullet_smg: 30 } },
  { id: 'kill_animals',      label: 'Cazá 3 animales',          goal: 3,  track: 'kill_animals',    xp: 150, reward: { meat_raw: 4 } },
  { id: 'open_crates_5',     label: 'Abrí 5 cofres',            goal: 5,  track: 'open_crates',     xp: 120, reward: { bandage: 1 } },
  { id: 'open_crates_city',  label: 'Saqueá el laboratorio',    goal: 1,  track: 'open_city_crate', xp: 350, reward: { bullet_r: 40 } },
  { id: 'harvest_wood',      label: 'Cortá 20 madera',          goal: 20, track: 'harvest_wood',    xp: 120, reward: { campfire: 1 } },
  { id: 'harvest_stone',     label: 'Picá 10 piedra',           goal: 10, track: 'harvest_stone',   xp: 130, reward: { stone: 5 } },
  { id: 'drink_5',           label: 'Bebé 5 veces',             goal: 5,  track: 'drink_water',     xp: 80,  reward: { water_bottle: 2 } },
  { id: 'eat_3',             label: 'Comé 3 veces',             goal: 3,  track: 'eat_food',        xp: 80,  reward: { meat_cooked: 2 } },
  { id: 'craft_3',           label: 'Crafteá 3 items',          goal: 3,  track: 'craft',           xp: 100, reward: { wood: 8 } },
  { id: 'survive_night',     label: 'Sobreviví una noche',      goal: 1,  track: 'survive_night',   xp: 200, reward: { bandage: 2, water_bottle: 1 } },
];

const STORAGE_KEY = 'survival-fps-v1-quests';

function todayKey() {
  // Día calendario local. No usamos `inSessionDay` porque el jugador puede
  // empezar varias partidas en un mismo día calendario y queremos que las
  // quests sean por sesión-día real.
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function pickThree() {
  const pool = TEMPLATES.slice();
  const out = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push({ ...pool[idx], progress: 0, completed: false });
    pool.splice(idx, 1);
  }
  return out;
}

function loadQuests() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.day !== todayKey()) return null;
    return data.quests;
  } catch { return null; }
}
function saveQuests() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ day: todayKey(), quests: state.quests }));
  } catch {}
}

const state = {
  quests: loadQuests() || pickThree(),
};
saveQuests();

const listeners = new Set();
function notify() { for (const fn of listeners) fn(state); }
export function onChange(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
export function getQuests() { return state.quests; }

export function track(eventName, amount = 1) {
  let any = false;
  for (const q of state.quests) {
    if (q.completed) continue;
    if (q.track !== eventName) continue;
    q.progress = Math.min(q.goal, (q.progress | 0) + amount);
    any = true;
    if (q.progress >= q.goal) {
      q.completed = true;
      grantReward(q);
    }
  }
  if (any) { saveQuests(); notify(); }
}

function grantReward(q) {
  addXp(q.xp, q.label);
  const lines = inv.applyLoot(q.reward || {});
  for (const ln of lines) logLine(`✓ ${ln.text}`);
  showBanner(`✓ MISION COMPLETA: ${q.label}`, 2800);
  sfx.playPickup?.();
  sfx.playKill?.();
}

// Forzar refrescar las quests (botón debug o cambio de día).
export function reroll() {
  state.quests = pickThree();
  saveQuests();
  notify();
}
