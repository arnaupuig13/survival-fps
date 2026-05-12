// Inventory state + persistence + recipes + rarity tagging.
//
// Rarity drives UI border colors and is a hint for game-feel:
//   common      → white  (basic ammo, food)
//   uncommon    → green  (bandage, water, melee tools)
//   rare        → blue   (rifle, vest, scope)
//   epic        → purple (shotgun, helmet, silencer)
//   legendary   → gold   (sniper, boss-only drops)
//
// v1.2 — content expansion: 4-tier armor (cloth/leather/iron/mil), weapon
// bodies como rare drops, AK/semi/grenade-launcher/gatling/nuke armas,
// foods nuevos crafteables, materiales (cloth/iron/coal/sulfur/etc).

import { setHP } from './hud.js';

export const RARITY = {
  common:    { color: '#bbbbbb' },
  uncommon:  { color: '#48d068' },
  rare:      { color: '#4a90e0' },
  epic:      { color: '#a060e0' },
  legendary: { color: '#f0c040' },
};

// `weight`: peso unitario en "kg" abstractos. La capacidad base del jugador
// es 30; el perk `sharp_senses` agrega +5. Sobrepeso = movimiento más lento.
// (Sistema "sin peso" — todos los items con weight 0 por feedback del usuario.)
export const ITEMS = {
  // ============== AMMO ==============
  bullet_p:        { label: 'BALAS PISTOLA',  max: 99, rarity: 'common', weight: 0 },
  bullet_r:        { label: 'BALAS RIFLE',    max: 99, rarity: 'common', weight: 0 },
  bullet_smg:      { label: 'BALAS SMG',      max: 99, rarity: 'common', weight: 0 },
  shell:           { label: 'CARTUCHOS',      max: 60, rarity: 'uncommon', weight: 0 },
  sniper_round:    { label: 'CAL .50',        max: 30, rarity: 'rare', weight: 0 },
  bullet_p_ap:     { label: 'BALAS .9 AP',    max: 60, rarity: 'rare', weight: 0 },
  bullet_r_ap:     { label: 'BALAS RIFLE AP', max: 60, rarity: 'rare', weight: 0 },
  bullet_r_inc:    { label: 'BALAS INCEND.',  max: 30, rarity: 'epic', weight: 0 },
  // Nuevas munis
  bullet_762:      { label: 'BALAS 7.62',     max: 99, rarity: 'uncommon', weight: 0 }, // AK
  bullet_marksman: { label: 'BALAS .308',     max: 60, rarity: 'rare',     weight: 0 }, // semi-auto
  gl_round:        { label: 'GRANADA 40MM',   max: 20, rarity: 'epic',     weight: 0 }, // grenade launcher
  nuke_round:      { label: 'OJIVA NUCLEAR',  max: 1,  rarity: 'legendary',weight: 0, noDrop: true }, // 1 only

  // ============== CONSUMABLES (meds + throwables) ==============
  bandage:         { label: 'VENDAJES',       max: 9,  rarity: 'uncommon', weight: 0 },
  grenade:         { label: 'GRANADAS',       max: 6,  rarity: 'rare',     weight: 0 },
  smoke_grenade:   { label: 'GRANADA HUMO',   max: 5,  rarity: 'uncommon', weight: 0 },
  flashbang:       { label: 'GRANADA CIEGA',  max: 5,  rarity: 'rare',     weight: 0 },
  antibiotics:     { label: 'ANTIBIOTICOS',   max: 5,  rarity: 'rare',     weight: 0 },
  // Meds nuevos
  medkit:          { label: 'BOTIQUIN',       max: 3,  rarity: 'epic',     weight: 0 }, // restaura full HP
  adrenaline:      { label: 'ADRENALINA',     max: 3,  rarity: 'epic',     weight: 0 }, // velocidad + dmg 30s
  painkillers:     { label: 'CALMANTES',      max: 5,  rarity: 'rare',     weight: 0 }, // resistencia dmg 60s
  morphine:        { label: 'MORFINA',        max: 3,  rarity: 'epic',     weight: 0 }, // -dolor +HP regen 30s

  // ============== WEAPONS (oneTime — pickup unlocks the slot) ==============
  pistol_pickup:   { label: 'PISTOLA',        max: 1, oneTime: true, rarity: 'common',    weight: 0, noDrop: true },
  rifle_pickup:    { label: 'RIFLE',          max: 1, oneTime: true, rarity: 'rare',      weight: 0 },
  shotgun_pickup:  { label: 'ESCOPETA',       max: 1, oneTime: true, rarity: 'epic',      weight: 0 },
  smg_pickup:      { label: 'SMG',            max: 1, oneTime: true, rarity: 'rare',      weight: 0 },
  sniper_pickup:   { label: 'RIFLE FRANCOTIRADOR', max: 1, oneTime: true, rarity: 'legendary', weight: 0 },
  crossbow_pickup: { label: 'BALLESTA',       max: 1, oneTime: true, rarity: 'rare',      weight: 0 },
  // Nuevas armas crafteables (requieren weapon body como input)
  ak_pickup:       { label: 'AK-47',          max: 1, oneTime: true, rarity: 'epic',      weight: 0 },
  semi_pickup:     { label: 'RIFLE SEMI-AUTO',max: 1, oneTime: true, rarity: 'rare',      weight: 0 },
  gl_pickup:       { label: 'LANZAGRANADAS',  max: 1, oneTime: true, rarity: 'epic',      weight: 0 },
  gatling_pickup:  { label: 'GATLING',        max: 1, oneTime: true, rarity: 'legendary', weight: 0 },
  nuke_pickup:     { label: 'CAÑON NUCLEAR',  max: 1, oneTime: true, rarity: 'legendary', weight: 0 },
  knife:           { label: 'CUCHILLO',       max: 1, oneTime: true, rarity: 'common',    weight: 0 },
  bolt:            { label: 'DARDOS',         max: 30, rarity: 'uncommon', weight: 0 },
  // Tools
  axe:             { label: 'HACHA',          max: 1, oneTime: true, rarity: 'uncommon', weight: 0 },
  pickaxe:         { label: 'PICO',           max: 1, oneTime: true, rarity: 'uncommon', weight: 0 },
  hammer:          { label: 'MARTILLO',       max: 1, oneTime: true, rarity: 'common',   weight: 0 },

  // ============== WEAPON BODIES (rare drops — only findable) ==============
  // Cuerpos de arma: solo se encuentran como loot raro. Permiten craftear
  // la arma correspondiente con materiales adicionales.
  rifle_body:      { label: 'CUERPO RIFLE',   max: 3, rarity: 'rare',      weight: 0 },
  shotgun_body:    { label: 'CUERPO ESCOPETA',max: 3, rarity: 'epic',      weight: 0 },
  smg_body:        { label: 'CUERPO SMG',     max: 3, rarity: 'rare',      weight: 0 },
  sniper_body:     { label: 'CUERPO SNIPER',  max: 2, rarity: 'legendary', weight: 0 },
  ak_body:         { label: 'CUERPO AK',      max: 3, rarity: 'epic',      weight: 0 },
  semi_body:       { label: 'CUERPO SEMI',    max: 3, rarity: 'rare',      weight: 0 },
  gl_body:         { label: 'CUERPO GL',      max: 2, rarity: 'epic',      weight: 0 },
  gatling_body:    { label: 'CUERPO GATLING', max: 1, rarity: 'legendary', weight: 0 },
  nuke_body:       { label: 'CUERPO NUKE',    max: 1, rarity: 'legendary', weight: 0, noDrop: true },

  // ============== ATTACHMENTS (oneTime) ==============
  scope:           { label: 'MIRILLA',        max: 1, oneTime: true, rarity: 'rare',     weight: 0 },
  silencer:        { label: 'SILENCIADOR',    max: 1, oneTime: true, rarity: 'epic',     weight: 0 },
  ext_mag:         { label: 'CARGADOR EXT.',  max: 1, oneTime: true, rarity: 'rare',     weight: 0 },
  grip:            { label: 'GRIP',           max: 1, oneTime: true, rarity: 'uncommon', weight: 0 },
  laser_sight:     { label: 'LASER',          max: 1, oneTime: true, rarity: 'rare',     weight: 0 },

  // ============== ARMOR — 4 TIERS x 7 SLOTS = 28 PIEZAS ==============
  // Cada pieza reduce daño un % según tier. Total max si todo tier 4:
  //   7 piezas * 8% = 56% reducción.
  // Tier 1 — CLOTH (tela, fácil de craftear).
  cloth_helmet:    { label: 'GORRO TELA',     max: 1, oneTime: true, rarity: 'common',    weight: 0, armor: { slot: 'helmet', tier: 1, reduce: 2 } },
  cloth_shirt:     { label: 'CAMISA TELA',    max: 1, oneTime: true, rarity: 'common',    weight: 0, armor: { slot: 'shirt',  tier: 1, reduce: 2 } },
  cloth_pants:     { label: 'PANTALON TELA',  max: 1, oneTime: true, rarity: 'common',    weight: 0, armor: { slot: 'pants',  tier: 1, reduce: 2 } },
  cloth_shoes:     { label: 'BOTAS TELA',     max: 1, oneTime: true, rarity: 'common',    weight: 0, armor: { slot: 'shoes',  tier: 1, reduce: 2 } },
  cloth_body:      { label: 'CHALECO TELA',   max: 1, oneTime: true, rarity: 'common',    weight: 0, armor: { slot: 'body',   tier: 1, reduce: 3 } },
  cloth_legs:      { label: 'GREBAS TELA',    max: 1, oneTime: true, rarity: 'common',    weight: 0, armor: { slot: 'legs',   tier: 1, reduce: 3 } },
  cloth_gloves:    { label: 'GUANTES TELA',   max: 1, oneTime: true, rarity: 'common',    weight: 0, armor: { slot: 'gloves', tier: 1, reduce: 1 } },
  // Tier 2 — LEATHER (cuero animal).
  leather_helmet:  { label: 'GORRO CUERO',    max: 1, oneTime: true, rarity: 'uncommon',  weight: 0, armor: { slot: 'helmet', tier: 2, reduce: 4 } },
  leather_shirt:   { label: 'CAMISA CUERO',   max: 1, oneTime: true, rarity: 'uncommon',  weight: 0, armor: { slot: 'shirt',  tier: 2, reduce: 4 } },
  leather_pants:   { label: 'PANTALON CUERO', max: 1, oneTime: true, rarity: 'uncommon',  weight: 0, armor: { slot: 'pants',  tier: 2, reduce: 4 } },
  leather_shoes:   { label: 'BOTAS CUERO',    max: 1, oneTime: true, rarity: 'uncommon',  weight: 0, armor: { slot: 'shoes',  tier: 2, reduce: 4 } },
  leather_body:    { label: 'CHALECO CUERO',  max: 1, oneTime: true, rarity: 'uncommon',  weight: 0, armor: { slot: 'body',   tier: 2, reduce: 5 } },
  leather_legs:    { label: 'GREBAS CUERO',   max: 1, oneTime: true, rarity: 'uncommon',  weight: 0, armor: { slot: 'legs',   tier: 2, reduce: 5 } },
  leather_gloves:  { label: 'GUANTES CUERO',  max: 1, oneTime: true, rarity: 'uncommon',  weight: 0, armor: { slot: 'gloves', tier: 2, reduce: 3 } },
  // Tier 3 — IRON (forjado).
  iron_helmet:     { label: 'CASCO HIERRO',   max: 1, oneTime: true, rarity: 'rare',      weight: 0, armor: { slot: 'helmet', tier: 3, reduce: 6 } },
  iron_shirt:      { label: 'COTA HIERRO',    max: 1, oneTime: true, rarity: 'rare',      weight: 0, armor: { slot: 'shirt',  tier: 3, reduce: 6 } },
  iron_pants:      { label: 'GREBAS HIERRO',  max: 1, oneTime: true, rarity: 'rare',      weight: 0, armor: { slot: 'pants',  tier: 3, reduce: 6 } },
  iron_shoes:      { label: 'BOTAS HIERRO',   max: 1, oneTime: true, rarity: 'rare',      weight: 0, armor: { slot: 'shoes',  tier: 3, reduce: 6 } },
  iron_body:       { label: 'CHALECO HIERRO', max: 1, oneTime: true, rarity: 'rare',      weight: 0, armor: { slot: 'body',   tier: 3, reduce: 7 } },
  iron_legs:       { label: 'PERNERAS HIERRO',max: 1, oneTime: true, rarity: 'rare',      weight: 0, armor: { slot: 'legs',   tier: 3, reduce: 7 } },
  iron_gloves:     { label: 'GUANTES HIERRO', max: 1, oneTime: true, rarity: 'rare',      weight: 0, armor: { slot: 'gloves', tier: 3, reduce: 5 } },
  // Tier 4 — MILITARY (solo se encuentra, no se craftea).
  mil_helmet:      { label: 'CASCO MILITAR',  max: 1, oneTime: true, rarity: 'legendary', weight: 0, armor: { slot: 'helmet', tier: 4, reduce: 8 } },
  mil_shirt:       { label: 'CAMISA MILITAR', max: 1, oneTime: true, rarity: 'legendary', weight: 0, armor: { slot: 'shirt',  tier: 4, reduce: 8 } },
  mil_pants:       { label: 'PANTALON MIL.',  max: 1, oneTime: true, rarity: 'legendary', weight: 0, armor: { slot: 'pants',  tier: 4, reduce: 8 } },
  mil_shoes:       { label: 'BOTAS MILITAR',  max: 1, oneTime: true, rarity: 'legendary', weight: 0, armor: { slot: 'shoes',  tier: 4, reduce: 8 } },
  mil_body:        { label: 'PLACA MILITAR',  max: 1, oneTime: true, rarity: 'legendary', weight: 0, armor: { slot: 'body',   tier: 4, reduce: 10 } },
  mil_legs:        { label: 'PERNERAS MIL.',  max: 1, oneTime: true, rarity: 'legendary', weight: 0, armor: { slot: 'legs',   tier: 4, reduce: 10 } },
  mil_gloves:      { label: 'GUANTES MIL.',   max: 1, oneTime: true, rarity: 'legendary', weight: 0, armor: { slot: 'gloves', tier: 4, reduce: 6 } },

  // ============== LEGACY ARMOR (chaleco / casco antibalas — se mantienen) ==============
  vest_armor:      { label: 'CHALECO',        max: 1, oneTime: true, rarity: 'rare', weight: 0, armor: { slot: 'body',   tier: 3, reduce: 8 } },
  helmet_armor:    { label: 'CASCO',          max: 1, oneTime: true, rarity: 'epic', weight: 0, armor: { slot: 'helmet', tier: 3, reduce: 8 } },

  // ============== FOOD / DRINK ==============
  meat_raw:        { label: 'CARNE CRUDA',    max: 9,  rarity: 'common',   weight: 0 },
  meat_cooked:     { label: 'CARNE COCIDA',   max: 9,  rarity: 'uncommon', weight: 0 },
  fish_raw:        { label: 'PESCADO CRUDO',  max: 9,  rarity: 'common',   weight: 0 },
  fish_cooked:     { label: 'PESCADO COCIDO', max: 9,  rarity: 'uncommon', weight: 0 },
  jerky:           { label: 'CECINA',         max: 12, rarity: 'uncommon', weight: 0 },
  bread:           { label: 'PAN',            max: 9,  rarity: 'uncommon', weight: 0 },
  soup:            { label: 'SOPA',           max: 5,  rarity: 'rare',     weight: 0 },
  stew:            { label: 'GUISO',          max: 5,  rarity: 'rare',     weight: 0 },
  canned_food:     { label: 'COMIDA LATA',    max: 12, rarity: 'uncommon', weight: 0 },
  energy_bar:      { label: 'BARRA ENERGIA',  max: 12, rarity: 'rare',     weight: 0 },
  mushroom:        { label: 'CHAMPI',         max: 12, rarity: 'common',   weight: 0 },
  herbs:           { label: 'HIERBAS',        max: 20, rarity: 'common',   weight: 0 },
  berry:           { label: 'BAYAS',          max: 20, rarity: 'common',   weight: 0 },
  honey:           { label: 'MIEL',           max: 5,  rarity: 'rare',     weight: 0 },
  // Drink
  water_bottle:    { label: 'BOTELLA AGUA',   max: 5,  rarity: 'common',   weight: 0 },
  dirty_water:     { label: 'AGUA SUCIA',     max: 8,  rarity: 'common',   weight: 0 },
  purified_water:  { label: 'AGUA PURA',      max: 8,  rarity: 'uncommon', weight: 0 },
  coffee:          { label: 'CAFE',           max: 5,  rarity: 'rare',     weight: 0 },
  milk:            { label: 'LECHE',          max: 5,  rarity: 'uncommon', weight: 0 },
  tea:             { label: 'TE',             max: 5,  rarity: 'uncommon', weight: 0 },

  // ============== RAW MATERIALS (basic — only findable, NOT craftable) ==============
  wood:            { label: 'MADERA',         max: 99, rarity: 'common', weight: 0 },
  stone:           { label: 'PIEDRA',         max: 99, rarity: 'common', weight: 0 },
  cloth:           { label: 'TELA',           max: 99, rarity: 'common', weight: 0 },
  iron:            { label: 'HIERRO',         max: 99, rarity: 'common', weight: 0 },
  coal:            { label: 'CARBON',         max: 50, rarity: 'common', weight: 0 },
  sulfur:          { label: 'AZUFRE',         max: 50, rarity: 'common', weight: 0 },
  copper:          { label: 'COBRE',          max: 50, rarity: 'uncommon', weight: 0 },
  rabbit_pelt:     { label: 'PIEL CONEJO',    max: 30, rarity: 'common', weight: 0 },
  deer_pelt:       { label: 'PIEL CIERVO',    max: 20, rarity: 'uncommon', weight: 0 },
  scrap:           { label: 'CHATARRA',       max: 99, rarity: 'common', weight: 0 },
  // Crafted intermediates (these ARE craftable from raw materials)
  leather:         { label: 'CUERO',          max: 50, rarity: 'uncommon', weight: 0 },
  nail:            { label: 'CLAVO',          max: 99, rarity: 'common',   weight: 0 },
  gunpowder:       { label: 'POLVORA',        max: 60, rarity: 'uncommon', weight: 0 },
  circuit:         { label: 'CIRCUITO',       max: 20, rarity: 'rare',     weight: 0 },
  battery:         { label: 'BATERIA',        max: 12, rarity: 'uncommon', weight: 0 },
  rope:            { label: 'CUERDA',         max: 20, rarity: 'common',   weight: 0 },

  // ============== PLACEABLES / BUILD ==============
  campfire:        { label: 'HOGUERAS',       max: 5,  rarity: 'uncommon', weight: 0 },
  furnace:         { label: 'HORNO',          max: 3,  rarity: 'rare',     weight: 0 },
  wall_piece:      { label: 'PARED',          max: 30, rarity: 'common',   weight: 0 },
  bedroll_item:    { label: 'CAMA',           max: 3,  rarity: 'uncommon', weight: 0 },
  bear_trap:       { label: 'CEPO',           max: 5,  rarity: 'uncommon', weight: 0 },
  spike_trap:      { label: 'PINCHOS',        max: 8,  rarity: 'uncommon', weight: 0 },
  stash_box:       { label: 'CAJA STASH',     max: 5,  rarity: 'uncommon', weight: 0 },

  // ============== UTILITY GEAR ==============
  flashlight:      { label: 'LINTERNA',       max: 1, oneTime: true, rarity: 'uncommon', weight: 0 },
  dog_collar:      { label: 'COLLAR PERRO',   max: 1, oneTime: true, rarity: 'epic',     weight: 0 },
  nvg:             { label: 'GAFAS NOCT.',    max: 1, oneTime: true, rarity: 'epic',     weight: 0 },
  fishing_rod:     { label: 'CAÑA DE PESCAR', max: 1, oneTime: true, rarity: 'uncommon', weight: 0 },
  seeds:           { label: 'SEMILLAS',       max: 20, rarity: 'common', weight: 0 },
  // Utility nuevos
  compass:         { label: 'BRUJULA',        max: 1, oneTime: true, rarity: 'uncommon', weight: 0 },
  binoculars:      { label: 'PRISMATICOS',    max: 1, oneTime: true, rarity: 'rare',     weight: 0 },
  lockpick:        { label: 'GANZUA',         max: 5,  rarity: 'rare',     weight: 0 },
  radio:           { label: 'RADIO',          max: 1, oneTime: true, rarity: 'epic',     weight: 0 },
  gas_mask:        { label: 'MASCARA GAS',    max: 1, oneTime: true, rarity: 'epic',     weight: 0 },
  parachute:       { label: 'PARACAIDAS',     max: 1, oneTime: true, rarity: 'epic',     weight: 0 },
  rope_climb:      { label: 'CUERDA ESCALAR', max: 3,  rarity: 'rare',     weight: 0 },
  molotov:         { label: 'MOLOTOV',        max: 5,  rarity: 'rare',     weight: 0 },
  c4:              { label: 'C4',             max: 3,  rarity: 'epic',     weight: 0 },
  mine:            { label: 'MINA',           max: 3,  rarity: 'rare',     weight: 0 },
};

export const BASE_WEIGHT_CAPACITY = 30;

const state = {
  bullet_p: 12,
  bullet_r: 0,
  bullet_smg: 0,
  shell: 0,
  sniper_round: 0,
  bullet_p_ap: 0,
  bullet_r_ap: 0,
  bullet_r_inc: 0,
  bullet_762: 0,
  bullet_marksman: 0,
  gl_round: 0,
  nuke_round: 0,
  flashlight: 0,
  dog_collar: 0,
  nvg: 0,
  fishing_rod: 0,
  seeds: 0,
  compass: 0,
  binoculars: 0,
  lockpick: 0,
  radio: 0,
  gas_mask: 0,
  parachute: 0,
  rope_climb: 0,
  molotov: 0,
  c4: 0,
  mine: 0,
  pistol_pickup: 1,
  crossbow_pickup: 0,
  bolt: 0,
  ak_pickup: 0,
  semi_pickup: 0,
  gl_pickup: 0,
  gatling_pickup: 0,
  nuke_pickup: 0,
  knife: 0,
  hammer: 0,
  // Bodies
  rifle_body: 0,
  shotgun_body: 0,
  smg_body: 0,
  sniper_body: 0,
  ak_body: 0,
  semi_body: 0,
  gl_body: 0,
  gatling_body: 0,
  nuke_body: 0,
  smoke_grenade: 0,
  flashbang: 0,
  bandage:  1,
  grenade:  2,
  medkit: 0,
  adrenaline: 0,
  painkillers: 0,
  morphine: 0,
  rifle_pickup: 0,
  shotgun_pickup: 0,
  smg_pickup: 0,
  sniper_pickup: 0,
  axe: 0,
  pickaxe: 0,
  scope: 0,
  silencer: 0,
  ext_mag: 0,
  grip: 0,
  laser_sight: 0,
  vest_armor: 0,
  helmet_armor: 0,
  // Armor 4-tier x 7 slots
  cloth_helmet: 0, cloth_shirt: 0, cloth_pants: 0, cloth_shoes: 0, cloth_body: 0, cloth_legs: 0, cloth_gloves: 0,
  leather_helmet: 0, leather_shirt: 0, leather_pants: 0, leather_shoes: 0, leather_body: 0, leather_legs: 0, leather_gloves: 0,
  iron_helmet: 0, iron_shirt: 0, iron_pants: 0, iron_shoes: 0, iron_body: 0, iron_legs: 0, iron_gloves: 0,
  mil_helmet: 0, mil_shirt: 0, mil_pants: 0, mil_shoes: 0, mil_body: 0, mil_legs: 0, mil_gloves: 0,
  // Food
  meat_raw: 0, meat_cooked: 0,
  fish_raw: 0, fish_cooked: 0,
  jerky: 0, bread: 0, soup: 0, stew: 0,
  canned_food: 0, energy_bar: 0,
  mushroom: 0, herbs: 0, berry: 3, honey: 0,
  water_bottle: 1, dirty_water: 0, purified_water: 0,
  coffee: 0, milk: 0, tea: 0,
  // Materials
  wood: 0, stone: 0, cloth: 0, iron: 0, coal: 0, sulfur: 0, copper: 0,
  rabbit_pelt: 0, deer_pelt: 0, scrap: 0,
  leather: 0, nail: 0, gunpowder: 0, circuit: 0, battery: 0, rope: 0,
  // Placeables
  campfire: 0, furnace: 0, wall_piece: 0, bedroll_item: 0,
  bear_trap: 0, spike_trap: 0, stash_box: 0,
  antibiotics: 0,
  kills: 0,
};

const listeners = new Set();
function notify() { for (const fn of listeners) fn(state); }
export function onChange(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }

export function get(item) { return state[item] | 0; }
export function getState() { return state; }
export function has(item, n = 1) { return get(item) >= n; }
// Sin peso (todos los items con weight 0 ahora). Funciones se mantienen
// por compatibilidad con callers que esperan ver "0".
export function getCurrentWeight() { return 0; }
export function getCapacity() { return BASE_WEIGHT_CAPACITY; }

// ============================================================
// ARMOR EQUIP SYSTEM
// 7 slots (helmet/shirt/pants/shoes/body/legs/gloves). Cada slot
// guarda la KEY del armor equipado (o null). Persistido en localStorage.
// SOLO el armor equipado cuenta hacia getArmorReduction.
// ============================================================
const ARMOR_SLOTS = ['helmet', 'shirt', 'pants', 'shoes', 'body', 'legs', 'gloves'];
const ARMOR_STORAGE_KEY = 'survival-fps-v1-armor-equipped';

function loadEquipped() {
  try {
    const raw = localStorage.getItem(ARMOR_STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    const out = {};
    for (const slot of ARMOR_SLOTS) {
      if (typeof data[slot] === 'string' && ITEMS[data[slot]]?.armor?.slot === slot) {
        out[slot] = data[slot];
      } else {
        out[slot] = null;
      }
    }
    return out;
  } catch { return {}; }
}
function saveEquipped() {
  try { localStorage.setItem(ARMOR_STORAGE_KEY, JSON.stringify(state._equipped)); } catch {}
}

state._equipped = loadEquipped();
for (const s of ARMOR_SLOTS) if (!(s in state._equipped)) state._equipped[s] = null;

export function getEquipped() { return { ...state._equipped }; }
export function getEquippedBySlot() { return { ...state._equipped }; }

// Equipar una pieza de armor. El item se quita del inventario (no esta
// disponible para tirarlo o usarlo). Si ya habia algo en ese slot, se
// devuelve al inventario primero.
export function equipArmor(itemKey) {
  const meta = ITEMS[itemKey];
  if (!meta?.armor) return false;
  if ((state[itemKey] | 0) <= 0) return false;
  const slot = meta.armor.slot;
  // Si ya hay algo equipado en ese slot, devolverlo al inventario.
  const prev = state._equipped[slot];
  if (prev) {
    state[prev] = (state[prev] | 0) + 1;
  }
  // Quitar el nuevo del inv y ponerlo en el slot.
  state[itemKey] = (state[itemKey] | 0) - 1;
  state._equipped[slot] = itemKey;
  saveEquipped();
  notify();
  return true;
}

export function unequipArmor(slot) {
  if (!ARMOR_SLOTS.includes(slot)) return false;
  const k = state._equipped[slot];
  if (!k) return false;
  state[k] = (state[k] | 0) + 1;
  state._equipped[slot] = null;
  saveEquipped();
  notify();
  return true;
}

export function isArmorSlot(slot) { return ARMOR_SLOTS.includes(slot); }
export { ARMOR_SLOTS };

// Total damage reduction: suma solo de los 7 slots equipados (no toda
// la armor que tengas en el inv). Cap 80%.
export function getArmorReduction() {
  let total = 0;
  for (const slot of ARMOR_SLOTS) {
    const k = state._equipped[slot];
    if (!k) continue;
    const meta = ITEMS[k];
    if (meta?.armor) total += meta.armor.reduce;
  }
  return Math.min(80, total);
}

export function add(item, n) {
  if (!ITEMS[item]) return;
  const meta = ITEMS[item];
  // v1.4: sin limites para items stackeables (ammo, materiales, comida, etc).
  // SOLO oneTime items (armas, armor, attachments) tienen cap de 1 — no
  // tiene sentido tener 3 pistolas. Para el resto, sumar libremente.
  if (meta.oneTime) {
    state[item] = Math.min(meta.max || 1, (state[item] | 0) + n);
  } else {
    state[item] = (state[item] | 0) + n;
  }
  // AUTO-EQUIP: si es armor y el slot esta vacio, equipar automaticamente.
  // Mejora UX para que al craftear/recoger ya se este usando.
  if (meta.armor && state[item] > 0) {
    const slot = meta.armor.slot;
    if (!state._equipped[slot]) {
      state[item] -= 1;
      state._equipped[slot] = item;
      saveEquipped();
    }
  }
  notify();
}
export function remove(item, n) {
  state[item] = Math.max(0, (state[item] | 0) - n);
  notify();
}
export function consume(item, n = 1) {
  if (!has(item, n)) return false;
  remove(item, n);
  return true;
}

export function applyLoot(loot) {
  const lines = [];
  for (const [item, count] of Object.entries(loot || {})) {
    if (!ITEMS[item]) continue;
    add(item, count);
    const r = ITEMS[item].rarity || 'common';
    lines.push({ text: `+${count} ${ITEMS[item].label}`, rarity: r });
  }
  return lines;
}

export function bumpKills() {
  state.kills = (state.kills | 0) + 1;
  notify();
}

export function useBandage(player) {
  const max = player.maxHp || 100;
  if (player.hp >= max || player.hp <= 0) return false;
  if (!consume('bandage', 1)) return false;
  const heal = 30 + (player.bandageBonus || 0);
  player.hp = Math.min(max, player.hp + heal);
  setHP(player.hp);
  return true;
}

// =====================================================================
// Crafting recipes. Categorías:
//   tools       — hacha, pico, martillo, cuchillo
//   weapons     — armas crafteables (necesitan body como input)
//   ammo        — munición
//   consumables — meds, food, drink, throwables
//   armor       — 3 tiers crafteables (cloth/leather/iron). Tier 4 mil = solo loot.
//   materials   — leather, nail, gunpowder, rope (intermediates)
//   placeables  — campfire, furnace, wall, traps
//   utility     — compass, lockpick, etc.
// needsFire: true → solo si player.nearFire
// needsFurnace: true → solo si player cerca de horno (preprocesar minerales)
// =====================================================================
export const RECIPES = [
  // ---- INTERMEDIATES ----
  { id: 'craft_leather',   label: 'CUERO',          requires: { rabbit_pelt: 2 },                       produces: { leather: 1 } },
  { id: 'craft_leather2',  label: 'CUERO (CIERVO)', requires: { deer_pelt: 1 },                         produces: { leather: 3 } },
  { id: 'craft_nail',      label: 'CLAVOS x5',      requires: { iron: 1 },                              produces: { nail: 5 } },
  { id: 'craft_gunpowder', label: 'POLVORA x5',     requires: { sulfur: 1, coal: 1 },                   produces: { gunpowder: 5 } },
  { id: 'craft_rope',      label: 'CUERDA',         requires: { cloth: 4 },                             produces: { rope: 1 } },
  { id: 'craft_battery',   label: 'BATERIA',        requires: { copper: 2, scrap: 2 },                  produces: { battery: 1 } },

  // ---- TOOLS ----
  { id: 'craft_axe',       label: 'HACHA',          requires: { wood: 3, stone: 2 },                    produces: { axe: 1 } },
  { id: 'craft_pickaxe',   label: 'PICO',           requires: { wood: 2, stone: 4 },                    produces: { pickaxe: 1 } },
  { id: 'craft_hammer',    label: 'MARTILLO',       requires: { wood: 2, iron: 2 },                     produces: { hammer: 1 } },
  { id: 'craft_knife',     label: 'CUCHILLO',       requires: { iron: 2, wood: 1 },                     produces: { knife: 1 } },

  // ---- AMMO ----
  { id: 'craft_bullet_p',  label: 'BALAS PISTOLA x10', requires: { iron: 1, gunpowder: 2 },             produces: { bullet_p: 10 } },
  { id: 'craft_bullet_r',  label: 'BALAS RIFLE x10',   requires: { iron: 2, gunpowder: 3 },             produces: { bullet_r: 10 } },
  { id: 'craft_bullet_smg',label: 'BALAS SMG x15',     requires: { iron: 1, gunpowder: 2 },             produces: { bullet_smg: 15 } },
  { id: 'craft_shell',     label: 'CARTUCHOS x5',      requires: { iron: 1, gunpowder: 2, scrap: 1 },   produces: { shell: 5 } },
  { id: 'craft_sniper_r',  label: 'CAL .50 x3',        requires: { iron: 3, gunpowder: 5 },             produces: { sniper_round: 3 } },
  { id: 'craft_762',       label: 'BALAS 7.62 x10',    requires: { iron: 2, gunpowder: 4 },             produces: { bullet_762: 10 } },
  { id: 'craft_marksman',  label: 'BALAS .308 x5',     requires: { iron: 2, gunpowder: 4 },             produces: { bullet_marksman: 5 } },
  { id: 'craft_p_ap',      label: 'BALAS .9 AP x6',    requires: { iron: 2, gunpowder: 3, copper: 1 },  produces: { bullet_p_ap: 6 } },
  { id: 'craft_r_ap',      label: 'BALAS RIFLE AP x6', requires: { iron: 3, gunpowder: 4, copper: 1 },  produces: { bullet_r_ap: 6 } },
  { id: 'craft_r_inc',     label: 'BALAS INCEND. x4',  requires: { iron: 2, gunpowder: 3, sulfur: 2 },  produces: { bullet_r_inc: 4 } },
  { id: 'craft_gl_round',  label: 'GRANADA 40MM x2',   requires: { scrap: 4, gunpowder: 6, iron: 2 },   produces: { gl_round: 2 } },
  { id: 'craft_bolt',      label: 'DARDOS x5',         requires: { wood: 2, iron: 1 },                  produces: { bolt: 5 } },

  // ---- WEAPONS (requieren body como input — body solo se encuentra) ----
  { id: 'craft_rifle',     label: 'RIFLE',          requires: { rifle_body: 1, iron: 15, nail: 5 },         produces: { rifle_pickup: 1 } },
  { id: 'craft_shotgun',   label: 'ESCOPETA',       requires: { shotgun_body: 1, iron: 12, wood: 5 },       produces: { shotgun_pickup: 1 } },
  { id: 'craft_smg',       label: 'SMG',            requires: { smg_body: 1, iron: 12, nail: 6 },           produces: { smg_pickup: 1 } },
  { id: 'craft_sniper',    label: 'SNIPER',         requires: { sniper_body: 1, iron: 25, copper: 4, scope: 1 }, produces: { sniper_pickup: 1 } },
  { id: 'craft_crossbow',  label: 'BALLESTA',       requires: { wood: 8, iron: 4, rope: 2 },                produces: { crossbow_pickup: 1 } },
  { id: 'craft_ak',        label: 'AK-47',          requires: { ak_body: 1, iron: 30, nail: 10, wood: 4 },  produces: { ak_pickup: 1 } },
  { id: 'craft_semi',      label: 'SEMI-AUTO',      requires: { semi_body: 1, iron: 25, nail: 8 },          produces: { semi_pickup: 1 } },
  { id: 'craft_gl',        label: 'LANZAGRANADAS',  requires: { gl_body: 1, iron: 40, circuit: 5, scrap: 10 }, produces: { gl_pickup: 1 } },
  { id: 'craft_gatling',   label: 'GATLING',        requires: { gatling_body: 1, iron: 60, circuit: 10, nail: 20, scrap: 15 }, produces: { gatling_pickup: 1 } },
  { id: 'craft_nuke',      label: 'CAÑON NUCLEAR',  requires: { nuke_body: 1, iron: 50, circuit: 8, gunpowder: 100, scrap: 30 }, produces: { nuke_pickup: 1, nuke_round: 1 } },

  // ---- ATTACHMENTS ----
  { id: 'craft_scope',     label: 'MIRILLA',        requires: { iron: 4, scrap: 3, circuit: 1 },        produces: { scope: 1 } },
  { id: 'craft_silencer',  label: 'SILENCIADOR',    requires: { iron: 6, scrap: 2, cloth: 2 },          produces: { silencer: 1 } },
  { id: 'craft_ext_mag',   label: 'CARGADOR EXT.',  requires: { iron: 5, scrap: 4 },                    produces: { ext_mag: 1 } },
  { id: 'craft_grip',      label: 'GRIP',           requires: { wood: 2, cloth: 2 },                    produces: { grip: 1 } },
  { id: 'craft_laser',     label: 'LASER',          requires: { iron: 3, circuit: 2, battery: 1 },      produces: { laser_sight: 1 } },

  // ---- ARMOR T1 — CLOTH ----
  { id: 'craft_c_helmet',  label: 'GORRO TELA',     requires: { cloth: 3 },                             produces: { cloth_helmet: 1 } },
  { id: 'craft_c_shirt',   label: 'CAMISA TELA',    requires: { cloth: 5 },                             produces: { cloth_shirt: 1 } },
  { id: 'craft_c_pants',   label: 'PANTALON TELA',  requires: { cloth: 5 },                             produces: { cloth_pants: 1 } },
  { id: 'craft_c_shoes',   label: 'BOTAS TELA',     requires: { cloth: 3 },                             produces: { cloth_shoes: 1 } },
  { id: 'craft_c_body',    label: 'CHALECO TELA',   requires: { cloth: 8 },                             produces: { cloth_body: 1 } },
  { id: 'craft_c_legs',    label: 'GREBAS TELA',    requires: { cloth: 6 },                             produces: { cloth_legs: 1 } },
  { id: 'craft_c_gloves',  label: 'GUANTES TELA',   requires: { cloth: 2 },                             produces: { cloth_gloves: 1 } },

  // ---- ARMOR T2 — LEATHER ----
  { id: 'craft_l_helmet',  label: 'GORRO CUERO',    requires: { leather: 2, cloth: 1 },                 produces: { leather_helmet: 1 } },
  { id: 'craft_l_shirt',   label: 'CAMISA CUERO',   requires: { leather: 4, cloth: 2 },                 produces: { leather_shirt: 1 } },
  { id: 'craft_l_pants',   label: 'PANTALON CUERO', requires: { leather: 4, cloth: 2 },                 produces: { leather_pants: 1 } },
  { id: 'craft_l_shoes',   label: 'BOTAS CUERO',    requires: { leather: 3 },                           produces: { leather_shoes: 1 } },
  { id: 'craft_l_body',    label: 'CHALECO CUERO',  requires: { leather: 6, cloth: 3 },                 produces: { leather_body: 1 } },
  { id: 'craft_l_legs',    label: 'GREBAS CUERO',   requires: { leather: 5, cloth: 2 },                 produces: { leather_legs: 1 } },
  { id: 'craft_l_gloves',  label: 'GUANTES CUERO',  requires: { leather: 2 },                           produces: { leather_gloves: 1 } },

  // ---- ARMOR T3 — IRON (necesita martillo + horno) ----
  { id: 'craft_i_helmet',  label: 'CASCO HIERRO',   requires: { iron: 5, leather: 2, nail: 3 },         produces: { iron_helmet: 1 } },
  { id: 'craft_i_shirt',   label: 'COTA HIERRO',    requires: { iron: 8, leather: 3, nail: 5 },         produces: { iron_shirt: 1 } },
  { id: 'craft_i_pants',   label: 'GREBAS HIERRO',  requires: { iron: 7, leather: 3, nail: 5 },         produces: { iron_pants: 1 } },
  { id: 'craft_i_shoes',   label: 'BOTAS HIERRO',   requires: { iron: 4, leather: 2, nail: 3 },         produces: { iron_shoes: 1 } },
  { id: 'craft_i_body',    label: 'CHALECO HIERRO', requires: { iron: 10, leather: 4, nail: 6 },        produces: { iron_body: 1 } },
  { id: 'craft_i_legs',    label: 'PERNERAS HIE.',  requires: { iron: 9, leather: 3, nail: 5 },         produces: { iron_legs: 1 } },
  { id: 'craft_i_gloves',  label: 'GUANTES HIERRO', requires: { iron: 3, leather: 2, nail: 2 },         produces: { iron_gloves: 1 } },

  // ---- CONSUMABLES — meds & food ----
  { id: 'craft_bandage',   label: 'VENDA',          requires: { cloth: 2 },                             produces: { bandage: 1 } },
  { id: 'craft_medkit',    label: 'BOTIQUIN',       requires: { bandage: 3, antibiotics: 1, cloth: 2 }, produces: { medkit: 1 } },
  { id: 'craft_painkiller',label: 'CALMANTES',      requires: { herbs: 4, cloth: 1 },                   produces: { painkillers: 1 } },
  { id: 'craft_grenade',   label: 'GRANADA',        requires: { stone: 3, gunpowder: 4 },               produces: { grenade: 1 } },
  { id: 'craft_smoke',     label: 'GRANADA HUMO',   requires: { scrap: 2, gunpowder: 2, cloth: 1 },     produces: { smoke_grenade: 1 } },
  { id: 'craft_flashbang', label: 'GRANADA CIEGA',  requires: { scrap: 3, gunpowder: 3, copper: 1 },    produces: { flashbang: 1 } },
  { id: 'craft_molotov',   label: 'MOLOTOV',        requires: { cloth: 1, gunpowder: 1, water_bottle: 1 }, produces: { molotov: 1 } },
  { id: 'craft_c4',        label: 'C4',             requires: { gunpowder: 20, scrap: 5, circuit: 3 },  produces: { c4: 1 } },
  { id: 'craft_mine',      label: 'MINA',           requires: { iron: 4, gunpowder: 8, scrap: 3 },      produces: { mine: 1 } },

  // ---- FOOD ----
  { id: 'cook_meat',       label: 'COCINAR CARNE',  requires: { meat_raw: 1 },                          produces: { meat_cooked: 1 }, needsFire: true },
  { id: 'cook_fish',       label: 'COCINAR PESCADO',requires: { fish_raw: 1 },                          produces: { fish_cooked: 1 }, needsFire: true },
  { id: 'craft_jerky',     label: 'CECINA x2',      requires: { meat_cooked: 2 },                       produces: { jerky: 2 }, needsFire: true },
  { id: 'craft_bread',     label: 'PAN',            requires: { seeds: 2, water_bottle: 1 },            produces: { bread: 1 }, needsFire: true },
  { id: 'craft_soup',      label: 'SOPA',           requires: { meat_cooked: 1, water_bottle: 1, herbs: 1 }, produces: { soup: 1 }, needsFire: true },
  { id: 'craft_stew',      label: 'GUISO',          requires: { meat_cooked: 2, berry: 2, herbs: 1, water_bottle: 1 }, produces: { stew: 1 }, needsFire: true },
  { id: 'craft_tea',       label: 'TE',             requires: { herbs: 2, water_bottle: 1 },            produces: { tea: 1 }, needsFire: true },
  { id: 'craft_coffee',    label: 'CAFE',           requires: { berry: 3, water_bottle: 1 },            produces: { coffee: 1 }, needsFire: true },
  // Purificar agua (necesita fuego — hervir).
  { id: 'craft_purify',    label: 'AGUA PURA',      requires: { dirty_water: 1 },                       produces: { purified_water: 1 }, needsFire: true },
  { id: 'craft_water',     label: 'BOTELLA AGUA',   requires: {},                                       produces: {}, special: 'fillWater' },

  // ---- PLACEABLES / BUILD ----
  { id: 'craft_campfire',  label: 'HOGUERA',        requires: { wood: 5, stone: 2 },                    produces: { campfire: 1 } },
  { id: 'craft_furnace',   label: 'HORNO',          requires: { stone: 12, wood: 4, iron: 2 },          produces: { furnace: 1 } },
  { id: 'craft_wall',      label: 'PARED',          requires: { wood: 4, stone: 2 },                    produces: { wall_piece: 1 } },
  { id: 'craft_bedroll',   label: 'CAMA',           requires: { cloth: 5, wood: 3 },                    produces: { bedroll_item: 1 } },
  { id: 'craft_bear_trap', label: 'CEPO',           requires: { iron: 4, scrap: 3, nail: 3 },           produces: { bear_trap: 1 } },
  { id: 'craft_spike',     label: 'PINCHOS',        requires: { wood: 5, iron: 2 },                     produces: { spike_trap: 1 } },
  { id: 'craft_stash',     label: 'CAJA STASH',     requires: { wood: 6, iron: 3, scrap: 4 },           produces: { stash_box: 1 } },

  // ---- UTILITY GEAR ----
  { id: 'craft_flashlight',label: 'LINTERNA',       requires: { iron: 2, battery: 1, scrap: 2 },        produces: { flashlight: 1 } },
  { id: 'craft_compass',   label: 'BRUJULA',        requires: { iron: 2, copper: 2, circuit: 1 },       produces: { compass: 1 } },
  { id: 'craft_binocs',    label: 'PRISMATICOS',    requires: { iron: 3, copper: 2, scrap: 2 },         produces: { binoculars: 1 } },
  { id: 'craft_fishing',   label: 'CAÑA DE PESCAR', requires: { wood: 4, rope: 2, nail: 1 },            produces: { fishing_rod: 1 } },
  { id: 'craft_lockpick',  label: 'GANZUA x3',      requires: { iron: 2, scrap: 1 },                    produces: { lockpick: 3 } },
  { id: 'craft_rope_climb',label: 'CUERDA ESCALAR', requires: { rope: 3, iron: 1 },                     produces: { rope_climb: 1 } },
  { id: 'craft_gas_mask',  label: 'MASCARA GAS',    requires: { cloth: 4, scrap: 3, copper: 1 },        produces: { gas_mask: 1 } },
];

export function craft(recipeId, opts = {}) {
  const r = RECIPES.find(x => x.id === recipeId);
  if (!r) return null;
  if (r.needsFire && !opts.nearFire) return null;
  if (r.special === 'fillWater') {
    if (!opts.nearWater) return null;
    add('water_bottle', 1);
    return ITEMS.water_bottle.label;
  }
  for (const item of Object.keys(r.produces)) {
    if (ITEMS[item]?.oneTime && state[item] > 0) return null;
  }
  for (const [item, count] of Object.entries(r.requires)) {
    if (!has(item, count)) return null;
  }
  for (const [item, count] of Object.entries(r.requires)) {
    remove(item, count);
  }
  for (const [item, count] of Object.entries(r.produces)) {
    add(item, count);
  }
  return Object.keys(r.produces).map(k => ITEMS[k]?.label || k).join(', ');
}
