// Tier de armas — cuando obtenés un weapon_pickup, se le rolla un tier
// random. El tier afecta damage + magazine + tracer color.
//
//  común       → sin bonus (gris)
//  raro        → +15% damage (azul)
//  legendario  → +30% damage + +50% mag + tracer dorado (oro)

import * as inv from './inventory.js';
import { logLine, showBanner } from './hud.js';

const STORAGE_KEY = 'survival-fps-v1-weapon-tiers';
const WEAPONS = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper', 'crossbow'];
const TIERS = {
  common:    { dmgMul: 1.00, magMul: 1.00, label: 'COMÚN',     color: '#bbbbbb' },
  rare:      { dmgMul: 1.15, magMul: 1.20, label: 'RARO',      color: '#4a90e0' },
  legendary: { dmgMul: 1.30, magMul: 1.50, label: 'LEGENDARIO', color: '#f0c040' },
};

const state = load();
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch { return {}; }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// Pistola arranca con tier común por defecto.
if (!state.pistol) state.pistol = 'common';

// Rolea tier nuevo: 55% común, 30% raro, 15% legendario.
function rollTier() {
  const r = Math.random();
  if (r < 0.55) return 'common';
  if (r < 0.85) return 'rare';
  return 'legendary';
}

// Llamado al lootear un nuevo weapon_pickup. Si ya tenías ese arma con
// peor tier, te quedás con el mejor. Banner si es upgrade.
export function onWeaponPickup(weaponName) {
  const cur = state[weaponName];
  const newTier = rollTier();
  const order = { common: 0, rare: 1, legendary: 2 };
  if (cur && order[cur] >= order[newTier]) return;
  state[weaponName] = newTier;
  save();
  const meta = TIERS[newTier];
  if (newTier !== 'common') {
    showBanner(`★ ${weaponName.toUpperCase()} ${meta.label}`, 2200);
    logLine(`Conseguiste un ${weaponName} ${meta.label} (+${Math.round((meta.dmgMul - 1) * 100)}% dmg)`);
  }
}

export function getTier(weaponName) {
  return state[weaponName] || 'common';
}

export function getDmgMul(weaponName) {
  return TIERS[getTier(weaponName)].dmgMul;
}

export function getMagMul(weaponName) {
  return TIERS[getTier(weaponName)].magMul;
}

export function getTierMeta(weaponName) {
  return TIERS[getTier(weaponName)];
}

// Llamado en main.js cuando se reciben items via lootGranted.
export function applyLootTiers(loot) {
  const map = {
    rifle_pickup: 'rifle',
    shotgun_pickup: 'shotgun',
    smg_pickup: 'smg',
    sniper_pickup: 'sniper',
    crossbow_pickup: 'crossbow',
  };
  for (const item of Object.keys(loot || {})) {
    if (map[item]) onWeaponPickup(map[item]);
  }
}
