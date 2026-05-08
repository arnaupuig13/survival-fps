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
  // Tambien aplicar a story quests.
  trackStory(eventName, amount);
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

// =====================================================================
// STORY QUESTS — progresion linear que guia al player desde spawn hasta
// destruir Helix Lab. Cada una se desbloquea al completar la anterior.
// Persistido aparte (otra storage key) para que no se rerolle por dia.
// =====================================================================
const STORY_KEY = 'survival-fps-v1-story';

export const STORY = [
  { id: 's1_food',      label: '★ Mata tu primera presa o come una baya',   track: 'eat_food',         goal: 1,  xp: 50,  reward: { bandage: 2 } },
  { id: 's2_drink',     label: '★ Bebe agua para sobrevivir',                track: 'drink_water',      goal: 1,  xp: 50,  reward: { water_bottle: 2 } },
  { id: 's3_wood',      label: '★ Corta 5 maderas',                          track: 'harvest_wood',     goal: 5,  xp: 80,  reward: { axe: 1 } },
  { id: 's4_stone',     label: '★ Pica 5 piedras',                           track: 'harvest_stone',    goal: 5,  xp: 80,  reward: { pickaxe: 1 } },
  { id: 's5_kills',     label: '★ Mata 5 zombies',                           track: 'kill_zombies',     goal: 5,  xp: 120, reward: { bullet_p: 30 } },
  { id: 's6_town',      label: '★ Visita un pueblo',                         track: 'reach_town',       goal: 1,  xp: 200, reward: { rifle_body: 1, bullet_r: 20 } },
  { id: 's7_loot',      label: '★ Saquea 5 cofres en pueblos',               track: 'open_crates',      goal: 5,  xp: 200, reward: { bandage: 3, scrap: 10 } },
  { id: 's8_armor',     label: '★ Equipa cualquier pieza de armor',          track: 'equip_armor',      goal: 1,  xp: 250, reward: { iron: 10, cloth: 10 } },
  { id: 's9_kill_sci',  label: '★ Mata 3 cientificos en el laboratorio',     track: 'kill_scientists',  goal: 3,  xp: 400, reward: { bullet_r: 60, bandage: 4 } },
  { id: 's10_helix',    label: '★ Entra a Helix Lab — muerte asegurada',     track: 'enter_helix',      goal: 1,  xp: 500, reward: { medkit: 2, mil_helmet: 1 } },
  { id: 's11_boss',     label: '★ Mata al doctor Helix',                     track: 'kill_boss',        goal: 1,  xp: 1500, reward: { mil_body: 1 } },
  { id: 's12_nuke',     label: '☢ DESTRUYE el laboratorio con el nuke gun',  track: 'nuke_helix',       goal: 1,  xp: 5000, reward: {} },
];

function loadStory() {
  try {
    const raw = localStorage.getItem(STORY_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveStory() {
  try { localStorage.setItem(STORY_KEY, JSON.stringify(state.story)); } catch {}
}

state.story = loadStory() || { idx: 0, progress: 0, completed: [] };
saveStory();

export function getStoryQuest() {
  if (state.story.idx >= STORY.length) return null;
  const q = STORY[state.story.idx];
  return { ...q, progress: state.story.progress };
}
export function getStoryDone() { return state.story.completed; }

export function trackStory(eventName, amount = 1) {
  if (state.story.idx >= STORY.length) return;
  const q = STORY[state.story.idx];
  if (q.track !== eventName) return;
  state.story.progress = Math.min(q.goal, state.story.progress + amount);
  if (state.story.progress >= q.goal) {
    // Complete!
    state.story.completed.push(q.id);
    addXp(q.xp, q.label);
    inv.applyLoot(q.reward || {});
    showBanner(`✓ ${q.label}`, 3500);
    sfx.playPickup?.();
    sfx.playKill?.();
    // Avanzar al siguiente.
    state.story.idx++;
    state.story.progress = 0;
    if (state.story.idx < STORY.length) {
      const next = STORY[state.story.idx];
      setTimeout(() => showBanner(`◆ NUEVA MISION: ${next.label}`, 4000), 3500);
    } else {
      setTimeout(() => showBanner('★★ HISTORIA COMPLETA — has destruido Helix Lab', 6000), 3500);
    }
  }
  saveStory();
  notify();
}

// Reroll story (debug).
export function resetStory() {
  state.story = { idx: 0, progress: 0, completed: [] };
  saveStory();
  notify();
}
