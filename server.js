// Survival FPS v1.1 — server: HTTP static + WS multiplayer + zombie/scientist
// AI + town streaming + boss.
//
// Design choices:
// - heightAt() shared with client; every entity is positioned AT terrain Y so
//   nothing buries underground (the v0 bug we eliminated).
// - Hardcoded TOWN_LOCATIONS — same world for every connected client.
// - Sleeping zombies live inside town buildings; they wake up when a player
//   gets close. A streaming system spawns/despawns them based on player
//   proximity so unvisited towns don't burn CPU.
// - The science city has scientists (ranged shooters with rifles). When 50%
//   are killed, a boss spawns to defend the loot.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// =====================================================================
// Static HTTP server.
// =====================================================================
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.md':   'text/markdown; charset=utf-8',
};

const httpServer = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  if (p.includes('..')) { res.writeHead(400); res.end('bad'); return; }
  const filePath = path.join(__dirname, p);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// =====================================================================
// Procedural world heightmap. MUST be byte-identical to client/world.js.
// =====================================================================
const WORLD_SEED = 1337;
export const WORLD_HALF = 400; // 800x800 m playable (4x área del original)

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263 + WORLD_SEED * 982451653) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// IMPORTANT: client/world.js usa este código byte-identical. Si cambiás
// algo acá, copialo exacto allá o el server y cliente verán terrenos
// distintos (zombies enterrados o flotando).
function _smoothstep(t) { return t * t * (3 - 2 * t); }

function _octave(x, z, scale, amp) {
  const sx = x / scale, sz = z / scale;
  const x0 = Math.floor(sx), z0 = Math.floor(sz);
  const fx = sx - x0, fz = sz - z0;
  const a = hash(x0,     z0);
  const b = hash(x0 + 1, z0);
  const c = hash(x0,     z0 + 1);
  const d = hash(x0 + 1, z0 + 1);
  const u = _smoothstep(fx);
  const v = _smoothstep(fz);
  return (a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v) * amp;
}

// Altura procedural sin flatten — usada como base + para calcular el
// nivel del centro de cada town.
function _rawHeight(x, z) {
  // 4 octavas: macro (montañas), hills (colinas), ridges (crestas), fine.
  const macro  = _octave(x, z, 220, 18);
  const hills  = _octave(x, z,  70,  7);
  const ridges = _octave(x, z,  22,  3);
  const fine   = _octave(x, z,   7, 0.6);
  let h = macro + hills + ridges + fine - 14.3;   // offset para centrar
  // Cliff factor — amplifica pendientes pronunciadas para crear acantilados.
  const sign = h >= 0 ? 1 : -1;
  const abs = Math.abs(h);
  if (abs > 5) h = sign * (5 + (abs - 5) * 1.7);
  return h;
}

// Town flat areas — el terreno se aplana dentro de estos radios.
// Se incluyen TOWNS, BUNKERS y POIs (cabins/heli/gas) para que ningún
// edificio quede atascado en pendiente.
const TOWN_FLAT = [
  { cx: -300, cz:  280, r: 38, transition: 18 },
  { cx:  310, cz:  300, r: 38, transition: 18 },
  { cx: -320, cz: -260, r: 38, transition: 18 },
  { cx:  280, cz: -320, r: 38, transition: 18 },
  { cx:    0, cz: -200, r: 95, transition: 25 },
  // Bunkers
  { cx:  150, cz:    0, r: 14, transition: 8 },
  { cx: -240, cz:  240, r: 14, transition: 8 },
  { cx:  100, cz: -260, r: 14, transition: 8 },
  // Helicópteros
  { cx: -160, cz:  120, r: 10, transition: 6 },
  { cx:  160, cz:  140, r: 10, transition: 6 },
  { cx:  -80, cz:   20, r: 10, transition: 6 },
  { cx:  220, cz: -100, r: 10, transition: 6 },
  { cx: -200, cz:  -50, r: 10, transition: 6 },
  // Gas stations
  { cx: -180, cz:  -80, r: 9, transition: 6 },
  { cx:  200, cz:  -60, r: 9, transition: 6 },
  { cx:    0, cz:  340, r: 9, transition: 6 },
  { cx: -350, cz:    0, r: 9, transition: 6 },
  // Cabins
  { cx:  120, cz:  200, r: 8, transition: 5 },
  { cx: -200, cz:  180, r: 8, transition: 5 },
  { cx:   60, cz: -100, r: 8, transition: 5 },
  { cx:  -80, cz: -100, r: 8, transition: 5 },
  { cx:  220, cz:  180, r: 8, transition: 5 },
  { cx: -260, cz:  100, r: 8, transition: 5 },
  { cx:  340, cz:   40, r: 8, transition: 5 },
  { cx: -100, cz:  340, r: 8, transition: 5 },
];

export function heightAt(x, z) {
  let h = _rawHeight(x, z);
  // Aplanar gradualmente dentro de towns.
  for (let i = 0; i < TOWN_FLAT.length; i++) {
    const t = TOWN_FLAT[i];
    const dx = x - t.cx, dz = z - t.cz;
    const outerR = t.r + t.transition;
    const d2 = dx * dx + dz * dz;
    if (d2 < outerR * outerR) {
      const d = Math.sqrt(d2);
      const flat = _rawHeight(t.cx, t.cz);
      const t01 = d <= t.r ? 1 : (outerR - d) / t.transition;
      const eased = _smoothstep(t01);
      h = h * (1 - eased) + flat * eased;
    }
  }
  return h;
}

// =====================================================================
// Enemy types. Stats authoritative on server. Client renders mesh per etype.
// =====================================================================
const ETYPES = {
  zombie:       { hp: 10,  speed: 1.6, dmg: 8,  range: 1.6, cd: 1.4, aggro: 30, ranged: false },
  runner:       { hp: 6,   speed: 3.0, dmg: 5,  range: 1.6, cd: 0.9, aggro: 35, ranged: false },
  tank:         { hp: 30,  speed: 0.9, dmg: 20, range: 1.8, cd: 2.0, aggro: 25, ranged: false },
  // Wolf — fast melee, predator. Lurks in the wilderness, aggro from far.
  wolf:         { hp: 14,  speed: 4.5, dmg: 10, range: 1.8, cd: 1.0, aggro: 40, ranged: false },
  // ---- Specials ----
  // Spitter — escupe ácido a media distancia. Daño moderado pero peligroso
  // si se ignora. weapon='spit' permite al cliente renderizar el escupitajo.
  spitter:      { hp: 14, speed: 1.5, dmg: 7,  range: 18, cd: 1.6, aggro: 32, ranged: true, weapon: 'spit', special: 'spitter' },
  // Screamer — frágil pero al detectar al jugador "grita" y atrae a todos
  // los zombies cercanos en 25m hacia esa posición. Server marca aggro.
  screamer:     { hp: 8,  speed: 2.0, dmg: 4,  range: 1.8, cd: 1.5, aggro: 38, ranged: false, special: 'screamer' },
  // Exploder — al morir explota en 5m haciendo 60 dmg. También explota si
  // se acerca demasiado al jugador (suicida).
  exploder:     { hp: 12, speed: 2.4, dmg: 30, range: 2.5, cd: 0.4, aggro: 28, ranged: false, special: 'exploder' },
  // Brute — mini-boss melee. Más resistente y dañino que el tank, raro.
  brute:        { hp: 80, speed: 1.4, dmg: 35, range: 2.4, cd: 1.8, aggro: 30, ranged: false, special: 'brute' },
  // Zombi alfa — boss random que aparece cada 15-25 min. Mucho HP, dmg
  // muy alto, persigue con aggro infinito (patrol-like). Drop boss-tier.
  alpha:        { hp: 220, speed: 2.5, dmg: 50, range: 2.8, cd: 1.4, aggro: 80, ranged: false, special: 'alpha', isBoss: false },
  // Three scientist variants. Same lab coat but different weapon profile.
  scientist:    { hp: 18,  speed: 1.4, dmg: 6,  range: 30,  cd: 1.0, aggro: 40, ranged: true,  weapon: 'rifle'   },
  sci_shotgun:  { hp: 26,  speed: 1.3, dmg: 22, range: 12,  cd: 1.5, aggro: 30, ranged: true,  weapon: 'shotgun' },
  sci_sniper:   { hp: 16,  speed: 1.0, dmg: 32, range: 60,  cd: 2.4, aggro: 60, ranged: true,  weapon: 'sniper'  },
  boss:         { hp: 240, speed: 1.7, dmg: 16, range: 32,  cd: 0.55, aggro: 50, ranged: true, weapon: 'ak', isBoss: true },
  // Hostile wildlife — bear is a slow tank with huge melee damage; boar is
  // a sprinter that charges and bowls the player over.
  bear:         { hp: 90,  speed: 3.4, dmg: 28, range: 2.2, cd: 1.6, aggro: 36, ranged: false },
  boar:         { hp: 26,  speed: 4.5, dmg: 14, range: 1.9, cd: 1.0, aggro: 28, ranged: false },
  // Passive animals — wander, flee when a player gets close. Killable for loot.
  deer:         { hp: 12,  speed: 5.0, dmg: 0,  range: 0,   cd: 0,    aggro: 0,  ranged: false, passive: true, fleeRange: 22 },
  rabbit:       { hp: 4,   speed: 6.0, dmg: 0,  range: 0,   cd: 0,    aggro: 0,  ranged: false, passive: true, fleeRange: 14 },
};

// =====================================================================
// Towns — fixed layout. Every connected client sees these in the same
// place. Each town has a type ('town' or 'city') and a list of buildings
// (relative offsets + size) that the client will render. Sleeping enemies
// live one-per-building; the type field of the town picks the enemy variant.
// =====================================================================
//
// Building geometry stored as: { dx, dz, w, h, ry } — offset from town
// center, footprint size in metres, and yaw rotation. Door faces +Z by
// convention so the client knows where to put openings.
//
// Layouts are computed once at boot (deterministic — same seed → same town).
// =====================================================================

function genTownBuildings(centerX, centerZ, count, seed) {
  let s = seed;
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const buildings = [];
  // Bigger cell for cities (>=12 buildings) so the compound feels spacious.
  const isCity = count >= 12;
  const cell = isCity ? 13 : 12;
  const cols = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = (col - (cols - 1) / 2) * cell + (rng() - 0.5) * 4;
    const oz = (row - (cols - 1) / 2) * cell + (rng() - 0.5) * 4;
    // Cities have slightly bigger lab buildings (8-11 m) vs town cabins (5-8 m).
    const w = isCity ? 7.5 + rng() * 3.0 : 5.5 + rng() * 2.5;
    const h = isCity ? 7.5 + rng() * 3.0 : 5.5 + rng() * 2.5;
    const ry = (rng() < 0.25) ? Math.PI / 2 : 0;
    buildings.push({ dx: ox, dz: oz, w, h, ry });
  }
  return buildings;
}

const TOWNS = [
  // Cuatro towns regulares spread por el mapa expandido. Cada town tiene
  // 8 edificios (era 6) con 1-3 zombies durmiendo cada uno.
  { id: 'westhaven',  cx: -300, cz:  280, type: 'town', buildings: genTownBuildings(-300,  280, 8, 11), label: 'Westhaven' },
  { id: 'eastfield',  cx:  310, cz:  300, type: 'town', buildings: genTownBuildings( 310,  300, 8, 22), label: 'Eastfield' },
  { id: 'pinecreek',  cx: -320, cz: -260, type: 'town', buildings: genTownBuildings(-320, -260, 8, 33), label: 'Pinecreek' },
  { id: 'southridge', cx:  280, cz: -320, type: 'town', buildings: genTownBuildings( 280, -320, 8, 44), label: 'Southridge' },
  // The science city — más grande, científicos custodiando loot premium.
  { id: 'helix-lab',  cx:  0,   cz: -200, type: 'city', buildings: genTownBuildings(  0, -200, 28, 77), label: 'Helix Lab' },
];

// Compute world-space center of each building so spawn / wake checks
// don't need to recompute the offset every tick.
for (const t of TOWNS) {
  for (const b of t.buildings) {
    b.wx = t.cx + b.dx;
    b.wz = t.cz + b.dz;
  }
}

// =====================================================================
// POIs — Points of Interest scattered between towns. Each is a small
// landmark with its own visual identity, guards and loot. Streamed the
// same way towns are; the kind field controls mesh + loot tier + guards.
//
// kind:
//   helicopter — crashed military heli, 2 scientist guards, 2 city-tier
//                crates (high-end loot).
//   gas        — abandoned gas station, 1 zombie + 1 runner guard, 2
//                town-tier crates.
//   cabin      — lone wooden cabin, 1 zombie guard, 1 town-tier crate.
// =====================================================================
const POIS = [
  // Helicópteros militares estrellados — custodiados por científicos,
  // dropean loot militar (city tier).
  { id: 'heli-a',    kind: 'helicopter', cx: -160, cz:  120, ry: 0.4 },
  { id: 'heli-b',    kind: 'helicopter', cx:  160, cz:  140, ry: -0.3 },
  { id: 'heli-c',    kind: 'helicopter', cx:  -80, cz:   20, ry: 1.2 },
  { id: 'heli-d',    kind: 'helicopter', cx:  220, cz: -100, ry: 2.1 },
  { id: 'heli-e',    kind: 'helicopter', cx: -200, cz:  -50, ry: 0.8 },
  // Estaciones de gasolina — zombies guardia, town tier.
  { id: 'gas-a',     kind: 'gas',        cx: -180, cz:  -80, ry: 0 },
  { id: 'gas-b',     kind: 'gas',        cx:  200, cz:  -60, ry: Math.PI / 2 },
  { id: 'gas-c',     kind: 'gas',        cx:    0, cz:  340, ry: 0 },
  { id: 'gas-d',     kind: 'gas',        cx: -350, cz:    0, ry: Math.PI / 4 },
  // Cabañas en el bosque — zombies, town tier.
  { id: 'cabin-a',   kind: 'cabin',      cx:  120, cz:  200, ry: 0 },
  { id: 'cabin-b',   kind: 'cabin',      cx: -200, cz:  180, ry: Math.PI / 3 },
  { id: 'cabin-c',   kind: 'cabin',      cx:   60, cz: -100, ry: -0.5 },
  { id: 'cabin-d',   kind: 'cabin',      cx:  -80, cz: -100, ry: 0.8 },
  { id: 'cabin-e',   kind: 'cabin',      cx:  220, cz:  180, ry: 0 },
  { id: 'cabin-f',   kind: 'cabin',      cx: -260, cz:  100, ry: 1.5 },
  { id: 'cabin-g',   kind: 'cabin',      cx:  340, cz:   40, ry: -1.0 },
  { id: 'cabin-h',   kind: 'cabin',      cx: -100, cz:  340, ry: 0.3 },
  // BUNKERS — fortalezas con boss-tier loot, custodiadas por 4 científicos
  // awake. Lugares premium para grupos coordinados.
  { id: 'bunker-a',  kind: 'bunker',     cx:  150, cz:    0, ry: 0 },
  { id: 'bunker-b',  kind: 'bunker',     cx: -240, cz:  240, ry: Math.PI / 4 },
  { id: 'bunker-c',  kind: 'bunker',     cx:  100, cz: -260, ry: Math.PI / 2 },
];

const POI_GUARDS = {
  helicopter: ['scientist', 'sci_shotgun', 'scientist'],
  gas:        ['zombie', 'runner', 'zombie'],
  cabin:      ['zombie', 'zombie'],
  bunker:     ['scientist', 'sci_shotgun', 'sci_sniper', 'scientist'],  // 4 guards
};
const POI_CRATES = {
  helicopter: { count: 3, tier: 'military' },
  gas:        { count: 2, tier: 'town' },
  cabin:      { count: 2, tier: 'town' },
  bunker:     { count: 3, tier: 'boss' },   // ¡loot legendary!
};
const poiState = new Map();
for (const p of POIS) poiState.set(p.id, { spawned: false, enemyIds: new Set() });

// =====================================================================
// Loot tables — what kinds of items each crate type drops. Counts are
// [min, max] inclusive; rolled per-item when the crate is opened.
// Items the client knows: bullet_p (pistol), bullet_r (rifle), bandage,
// rifle_pickup (unlocks the rifle weapon).
// =====================================================================
const LOOT_TABLES = {
  // STREET — loot común desperdigado por el suelo. Sin custodios. Cantidad
  // mínima, calidad común. Recompensa de exploración.
  street: [
    { item: 'bullet_p',     range: [2, 6] },
    { item: 'wood',         range: [0, 2] },
    { item: 'stone',        range: [0, 1] },
    { item: 'bandage',      chance: 0.18 },
    { item: 'berry',        range: [0, 2] },
    { item: 'water_bottle', chance: 0.10 },
    { item: 'shell',        chance: 0.08 },
    { item: 'meat_raw',     chance: 0.10 },
    { item: 'scrap',        chance: 0.20 },
  ],
  // TOWN — casas custodiadas por zombies dormidos. Loot decente: ammo,
  // bandages, armas básicas, attachments uncommon.
  town: [
    { item: 'bullet_p',       range: [6, 12] },
    { item: 'bullet_r',       range: [2, 8] },
    { item: 'shell',          range: [0, 4] },
    { item: 'bullet_smg',     range: [0, 6] },
    { item: 'bandage',        range: [1, 3] },
    { item: 'wood',           range: [1, 3] },
    { item: 'stone',          range: [0, 2] },
    { item: 'meat_cooked',    chance: 0.25 },
    { item: 'water_bottle',   chance: 0.30 },
    { item: 'berry',          range: [0, 3] },
    { item: 'scrap',          range: [1, 3] },
    { item: 'rifle_pickup',   chance: 0.20 },
    { item: 'shotgun_pickup', chance: 0.15 },
    { item: 'smg_pickup',     chance: 0.10 },
    { item: 'crossbow_pickup',chance: 0.12 },
    { item: 'bolt',           range: [0, 4] },
    { item: 'vest_armor',     chance: 0.08 },
    { item: 'ext_mag',        chance: 0.07 },
    { item: 'axe',            chance: 0.10 },
    { item: 'pickaxe',        chance: 0.10 },
    { item: 'campfire',       chance: 0.20 },
    { item: 'bear_trap',      chance: 0.10 },
    { item: 'flashlight',     chance: 0.08 },
    { item: 'smoke_grenade',  chance: 0.18 },
    { item: 'flashbang',      chance: 0.10 },
    { item: 'fishing_rod',    chance: 0.12 },
    { item: 'seeds',          range: [0, 2] },
  ],
  // MILITARY — POIs militares (helicópteros) custodiados por científicos.
  // Cantidad similar a town pero bias a armas/ammo/AP, no comida ni recursos.
  military: [
    { item: 'bullet_r',       range: [10, 20] },
    { item: 'bullet_p',       range: [10, 20] },
    { item: 'bullet_smg',     range: [6, 14] },
    { item: 'shell',          range: [4, 10] },
    { item: 'bullet_r_ap',    range: [0, 8] },
    { item: 'bullet_p_ap',    range: [0, 6] },
    { item: 'sniper_round',   range: [0, 4] },
    { item: 'grenade',        chance: 0.45 },
    { item: 'bandage',        range: [1, 3] },
    { item: 'rifle_pickup',   chance: 0.45 },
    { item: 'shotgun_pickup', chance: 0.25 },
    { item: 'smg_pickup',     chance: 0.30 },
    { item: 'vest_armor',     chance: 0.25 },
    { item: 'helmet_armor',   chance: 0.15 },
    { item: 'scope',          chance: 0.20 },
    { item: 'silencer',       chance: 0.12 },
    { item: 'ext_mag',        chance: 0.18 },
    { item: 'flashlight',     chance: 0.50 },
    { item: 'nvg',            chance: 0.30 },        // NVG en convoy/heli
    { item: 'scrap',          range: [3, 7] },
  ],
  // Helix Lab + city POIs — strongly tilted toward attachments + armor.
  city: [
    { item: 'bullet_p',      range: [10, 18] },
    { item: 'bullet_r',      range: [10, 18] },
    { item: 'bullet_smg',    range: [6, 14] },
    { item: 'shell',         range: [4, 10] },
    { item: 'sniper_round',  range: [0, 4] },
    { item: 'bullet_p_ap',   range: [0, 6] },
    { item: 'bullet_r_ap',   range: [0, 8] },
    { item: 'bullet_r_inc',  chance: 0.35 },
    { item: 'bandage',       range: [2, 4] },
    { item: 'antibiotics',   chance: 0.20 },
    { item: 'flashlight',    chance: 0.30 },
    { item: 'rifle_pickup',  chance: 0.55 },
    { item: 'shotgun_pickup',chance: 0.30 },
    { item: 'smg_pickup',    chance: 0.30 },
    { item: 'crossbow_pickup',chance: 0.20 },
    { item: 'bolt',          range: [0, 6] },
    { item: 'vest_armor',    chance: 0.30 },
    { item: 'helmet_armor',  chance: 0.18 },
    { item: 'scope',         chance: 0.22 },
    { item: 'ext_mag',       chance: 0.18 },
    { item: 'smoke_grenade', chance: 0.25 },
    { item: 'flashbang',     chance: 0.18 },
    { item: 'nvg',           chance: 0.20 },
    { item: 'fishing_rod',   chance: 0.15 },
    { item: 'scrap',         range: [2, 6] },
  ],
  // Boss drop — guaranteed legendary plus full attachment kit.
  boss: [
    { item: 'bullet_r',       range: [40, 60] },
    { item: 'bullet_p',       range: [25, 40] },
    { item: 'shell',          range: [12, 18] },
    { item: 'sniper_round',   range: [10, 16] },
    { item: 'bullet_r_ap',    range: [10, 20] },
    { item: 'bullet_r_inc',   range: [4, 8] },
    { item: 'bullet_p_ap',    range: [10, 16] },
    { item: 'bandage',        range: [4, 7] },
    { item: 'antibiotics',    range: [1, 2] },
    { item: 'flashlight',     chance: 1.0 },
    { item: 'dog_collar',     chance: 0.5 },
    { item: 'sniper_pickup',  chance: 1.0 },
    { item: 'silencer',       chance: 1.0 },
    { item: 'scope',          chance: 0.9 },
    { item: 'helmet_armor',   chance: 0.85 },
    { item: 'vest_armor',     chance: 0.85 },
    { item: 'ext_mag',        chance: 0.7 },
    { item: 'rifle_pickup',   chance: 1.0 },
    { item: 'scrap',          range: [12, 24] },
  ],
  animal: [
    { item: 'meat_raw', range: [1, 2] },
    { item: 'bandage',  chance: 0.3 },
  ],
};

function rollLoot(tableKey) {
  const out = {};
  const table = LOOT_TABLES[tableKey] || [];
  for (const row of table) {
    if (row.chance != null) {
      if (Math.random() < row.chance) out[row.item] = (out[row.item] || 0) + 1;
    } else {
      const [a, b] = row.range;
      const n = a + Math.floor(Math.random() * (b - a + 1));
      if (n > 0) out[row.item] = (out[row.item] || 0) + n;
    }
  }
  return out;
}

// =====================================================================
// World state — players, enemies, crates, grenades. Authoritative.
// =====================================================================
const players = new Map();   // id → player
const enemies = new Map();   // id → enemy
const crates = new Map();    // id → { id, x, z, townType, taken }
const grenades = new Map();  // id → { id, ownerId, x,y,z, vx,vy,vz, fuse }
let nextPlayerId = 1;
let nextEnemyId = 1;
let nextCrateId = 1;
let nextGrenadeId = 1;
const GRENADE_DAMAGE = 70;
const GRENADE_RADIUS = 6;

// Build crates at boot — varios cofres por edificio. Towns: 2-4 cofres
// dispersos en esquinas del piso. Cities: 1-3 (más loot por cofre, ya
// están en city tier). El crate's table key matches the town type.
function spawnTownCrates() {
  for (const t of TOWNS) {
    for (const b of t.buildings) {
      const isCity = t.type === 'city';
      // Random count: town 2-4, city 1-3.
      const count = isCity ? (1 + Math.floor(Math.random() * 3))
                           : (2 + Math.floor(Math.random() * 3));
      // Posiciones dentro del footprint del edificio: esquinas + centro.
      // Footprint es w×h; convertimos a offsets locales y rotamos por b.ry.
      const half = 0.4; // 0.4 * tamaño = quedar dentro de las paredes
      const corners = [
        [-half, -half], [half, -half], [-half, half], [half, half], [0, 0],
      ];
      // Shuffle.
      for (let i = corners.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [corners[i], corners[j]] = [corners[j], corners[i]];
      }
      const cosR = Math.cos(b.ry || 0), sinR = Math.sin(b.ry || 0);
      for (let i = 0; i < count && i < corners.length; i++) {
        const [lx, lz] = corners[i];
        const ox = lx * b.w, oz = lz * b.h;
        // Rotar offset al world según b.ry.
        const rx = cosR * ox - sinR * oz;
        const rz = sinR * ox + cosR * oz;
        const x = b.wx + rx, z = b.wz + rz;
        const id = nextCrateId++;
        crates.set(id, {
          id, x, z, y: heightAt(x, z),
          tableKey: t.type, townId: t.id, taken: false,
        });
      }
    }
  }
  // POI crates — placed near each POI center with a small offset.
  for (const p of POIS) {
    const cfg = POI_CRATES[p.kind];
    if (!cfg) continue;
    for (let i = 0; i < cfg.count; i++) {
      const angle = (i / cfg.count) * Math.PI * 2;
      const r = 1.8;
      const x = p.cx + Math.cos(angle) * r;
      const z = p.cz + Math.sin(angle) * r;
      const id = nextCrateId++;
      crates.set(id, { id, x, z, y: heightAt(x, z), tableKey: cfg.tier, townId: p.id, taken: false });
    }
  }
}
spawnTownCrates();

// Ground loot — small street drops scattered across the wilderness. Same
// crate plumbing as the town/POI crates, just a smaller mesh client-side
// (mesh choice is by tableKey === 'street').
function spawnGroundLoot() {
  let s = 91011;
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const TARGET = 280;     // 4x el original (era 80) para densidad similar en mapa expandido
  let placed = 0, tries = 0;
  while (placed < TARGET && tries < TARGET * 25) {
    tries++;
    const x = (rng() * 2 - 1) * (WORLD_HALF - 8);
    const z = (rng() * 2 - 1) * (WORLD_HALF - 8);
    if (x * x + z * z < 64) continue;
    // Skip if inside any town clearing or near a POI.
    let nearStruct = false;
    for (const t of TOWNS) {
      const dx = t.cx - x, dz = t.cz - z;
      if (dx * dx + dz * dz < 70 * 70) { nearStruct = true; break; }
    }
    if (!nearStruct) for (const p of POIS) {
      const dx = p.cx - x, dz = p.cz - z;
      if (dx * dx + dz * dz < 18 * 18) { nearStruct = true; break; }
    }
    if (nearStruct) continue;
    const id = nextCrateId++;
    crates.set(id, { id, x, z, y: heightAt(x, z), tableKey: 'street', townId: null, taken: false });
    placed++;
  }
}
spawnGroundLoot();

// Per-town streaming state.
const townState = new Map(); // townId → { spawned, enemyIds: Set, scientistsDead, bossSpawned }
for (const t of TOWNS) {
  townState.set(t.id, { spawned: false, enemyIds: new Set(), scientistsDead: 0, bossSpawned: false });
}

const STREAM_RADIUS = 150;   // m — spawn town when any player closer
const DESPAWN_RADIUS = 260;  // m — despawn town when ALL players farther
const WAKE_RADIUS = 12;      // m — sleeping zombie wakes when player approaches

const MAX_AMBIENT_ZOMBIES = 30; // cap on the random-spawn zombies (not town-bound)
const AMBIENT_SPAWN_INTERVAL = 4.5;

function makeEnemy(opts) {
  const cfg = ETYPES[opts.etype] || ETYPES.zombie;
  const id = nextEnemyId++;
  // Difficulty scaling — animales pasivos NO escalan (son comida).
  const scale = (cfg.passive) ? 1 : difficultyMul();
  const id_ = id;
  const e = {
    id: id_,
    etype: opts.etype || 'zombie',
    x: opts.x, z: opts.z, y: heightAt(opts.x, opts.z),
    ry: opts.ry ?? Math.random() * Math.PI * 2,
    hp: Math.round(cfg.hp * scale),
    maxHp: Math.round(cfg.hp * scale),
    dmgScale: scale,            // usado en sendTo(youHit) para escalar dmg
    attackCd: 0,
    sleeping: !!opts.sleeping,
    townId: opts.townId || null,
    ambient: !!opts.ambient,
    isBoss: !!cfg.isBoss,
  };
  enemies.set(id, e);
  return e;
}

// Passive animal kill drops a tiny loot bundle on the ground (just one
// bandage from a deer, 50% chance from a rabbit). Same crate flow.
function dropAnimalLoot(e) {
  if (e.etype !== 'deer' && e.etype !== 'rabbit') return;
  const drop = e.etype === 'deer' || Math.random() < 0.5;
  if (!drop) return;
  const id = nextCrateId++;
  // We use a custom mini table — just bandage. Server cPub+open flow already
  // handles it without changes (LOOT_TABLES.animal).
  crates.set(id, { id, x: e.x, z: e.z, y: e.y, tableKey: 'animal', townId: null, taken: false });
  broadcast({ type: 'crateSpawn', c: cPub(crates.get(id)) });
}

function killEnemy(e, byId = null) {
  // Exploder muerto = explosión. Marcamos un flag para no caer en loop
  // infinito (detonateExploder llama a killEnemy de nuevo).
  if (e.etype === 'exploder' && !e._detonated) {
    e._detonated = true;
    // detonateExploder despawnea el enemy y manda el broadcast.
    detonateExploder(e);
    return;
  }
  // Animal drops are handled before scientist/boss bookkeeping.
  if (e.etype === 'deer' || e.etype === 'rabbit') {
    dropAnimalLoot(e);
  }
  // Any of the three scientist variants count toward the boss spawn.
  const isScientist = e.etype === 'scientist' || e.etype === 'sci_shotgun' || e.etype === 'sci_sniper';
  if (e.townId === 'helix-lab' && isScientist) {
    const ts = townState.get('helix-lab');
    ts.scientistsDead++;
    // Boss appears once half the lab's scientists have fallen.
    if (!ts.bossSpawned && ts.scientistsDead >= 6) {
      const t = TOWNS.find(x => x.id === 'helix-lab');
      ts.bossSpawned = true;
      const boss = makeEnemy({
        etype: 'boss', x: t.cx, z: t.cz + 4, townId: 'helix-lab',
      });
      ts.enemyIds.add(boss.id);
      broadcast({ type: 'eSpawn', e: ePub(boss) });
      broadcast({ type: 'banner', text: '⚠ EL DOCTOR ESTA EN EL LABORATORIO' });
    }
  }
  enemies.delete(e.id);
  if (e.townId) {
    const ts = townState.get(e.townId);
    if (ts) ts.enemyIds.delete(e.id);
  }
  broadcast({ type: 'eDead', id: e.id, by: byId, isBoss: !!e.isBoss });

  // Boss drop — server pushes a privileged crate at the boss's feet that
  // anyone can open. Same crate flow as town crates.
  if (e.isBoss) {
    const id = nextCrateId++;
    crates.set(id, { id, x: e.x, z: e.z, y: e.y, tableKey: 'boss', townId: 'helix-lab', taken: false });
    broadcast({ type: 'crateSpawn', c: cPub(crates.get(id)) });
  }
  // Alfa drop — boss-tier crate también.
  if (e.etype === 'alpha') {
    const id = nextCrateId++;
    crates.set(id, { id, x: e.x, z: e.z, y: e.y, tableKey: 'boss', townId: null, taken: false });
    broadcast({ type: 'crateSpawn', c: cPub(crates.get(id)) });
    broadcast({ type: 'banner', text: '★ ZOMBI ALFA DERROTADO — loot legendario disponible' });
    alphaActive = null;
  }
}

function ePub(e) {
  return {
    id: e.id, etype: e.etype,
    x: +e.x.toFixed(2), y: +e.y.toFixed(2), z: +e.z.toFixed(2),
    ry: +e.ry.toFixed(2), hp: e.hp, maxHp: e.maxHp,
    sleeping: !!e.sleeping, isBoss: !!e.isBoss,
    weapon: ETYPES[e.etype]?.weapon || null,
  };
}
function pPub(p) { return { id: p.id, x: p.x, y: p.y, z: p.z, ry: p.ry, hp: p.hp, name: p.name }; }
function cPub(c) {
  return { id: c.id, x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), tableKey: c.tableKey, townId: c.townId };
}

// =====================================================================
// Town streaming — spawn / despawn enemies inside each town's buildings.
// =====================================================================
function streamPois() {
  for (const p of POIS) {
    const ps = poiState.get(p.id);
    let nearestD = Infinity;
    for (const pl of players.values()) {
      const d = Math.hypot(pl.x - p.cx, pl.z - p.cz);
      if (d < nearestD) nearestD = d;
    }
    if (!ps.spawned && nearestD < 110) {
      ps.spawned = true;
      const guards = POI_GUARDS[p.kind] || ['zombie'];
      for (let i = 0; i < guards.length; i++) {
        const angle = (i / guards.length) * Math.PI * 2;
        const r = 4 + Math.random() * 2;
        const x = p.cx + Math.cos(angle) * r;
        const z = p.cz + Math.sin(angle) * r;
        const e = makeEnemy({ etype: guards[i], x, z, townId: p.id });
        ps.enemyIds.add(e.id);
        broadcast({ type: 'eSpawn', e: ePub(e) });
      }
    } else if (ps.spawned && nearestD > 200) {
      for (const id of ps.enemyIds) {
        const e = enemies.get(id);
        if (!e || e.isBoss) continue;
        enemies.delete(id);
        broadcast({ type: 'eDead', id, despawn: true });
      }
      ps.enemyIds = new Set([...ps.enemyIds].filter(id => enemies.has(id)));
      ps.spawned = false;
    }
  }
}

function streamTowns() {
  for (const t of TOWNS) {
    const ts = townState.get(t.id);
    let nearestD = Infinity;
    for (const p of players.values()) {
      const dx = p.x - t.cx, dz = p.z - t.cz;
      const d = Math.hypot(dx, dz);
      if (d < nearestD) nearestD = d;
    }

    if (!ts.spawned && nearestD < STREAM_RADIUS) {
      // Spawn varios enemigos por edificio.
      // Towns: 1-3 zombies durmiendo en cada casa.
      // Cities: 1-2 científicos por edificio (igual que antes).
      ts.spawned = true;
      for (let i = 0; i < t.buildings.length; i++) {
        const b = t.buildings[i];
        const isCity = t.type === 'city';
        // City: 2-3 científicos por edificio (más densidad). Town: 1-3 zombies.
        const count = isCity ? (2 + Math.floor(Math.random() * 2))
                             : (1 + Math.floor(Math.random() * 3));
        for (let k = 0; k < count; k++) {
          let etype;
          if (isCity) {
            const r = (i * 23 + 5) % 12;
            if (r < 7)       etype = 'scientist';
            else if (r < 10) etype = 'sci_shotgun';
            else             etype = 'sci_sniper';
          } else {
            // Towns: 60% zombi, 18% runner, 8% tank, 5% spitter,
            // 5% screamer, 4% exploder.
            const r = Math.random();
            if      (r > 0.96) etype = 'exploder';
            else if (r > 0.91) etype = 'screamer';
            else if (r > 0.86) etype = 'spitter';
            else if (r > 0.78) etype = 'tank';
            else if (r > 0.60) etype = 'runner';
            else               etype = 'zombie';
          }
          // Posición: pequeño offset dentro del edificio para que no se
          // amontonen exactamente en el mismo punto.
          const offX = (Math.random() - 0.5) * b.w * 0.5;
          const offZ = (Math.random() - 0.5) * b.h * 0.5;
          const cosR = Math.cos(b.ry || 0), sinR = Math.sin(b.ry || 0);
          const wx = b.wx + cosR * offX - sinR * offZ;
          const wz = b.wz + sinR * offX + cosR * offZ;
          const e = makeEnemy({
            etype, x: wx, z: wz,
            sleeping: !isCity,         // town zombies start asleep
            townId: t.id,
          });
          ts.enemyIds.add(e.id);
          broadcast({ type: 'eSpawn', e: ePub(e) });
        }
      }
    } else if (ts.spawned && nearestD > DESPAWN_RADIUS) {
      // Despawn — release CPU on a town nobody's near. Keep the boss alive
      // even if despawned far (he stays around the lab).
      for (const id of ts.enemyIds) {
        const e = enemies.get(id);
        if (!e) continue;
        if (e.isBoss) continue;
        enemies.delete(id);
        broadcast({ type: 'eDead', id, despawn: true });
      }
      ts.enemyIds = new Set([...ts.enemyIds].filter(id => enemies.has(id)));
      ts.spawned = false;
    }
  }
}

// =====================================================================
// Ambient (random) zombie spawn — same as v1, but caps separately from
// town zombies. These spawn around players outside any town's radius.
// =====================================================================
function spawnAmbientHostile(minDist = 38, maxDist = 80) {
  if (players.size === 0) return null;
  for (let tries = 0; tries < 30; tries++) {
    const list = [...players.values()];
    const anchor = list[Math.floor(Math.random() * list.length)];
    const angle = Math.random() * Math.PI * 2;
    const r = minDist + Math.random() * (maxDist - minDist);
    const x = anchor.x + Math.cos(angle) * r;
    const z = anchor.z + Math.sin(angle) * r;
    if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) continue;
    // Reject if inside any town footprint — those are streamed separately.
    let insideTown = false;
    for (const t of TOWNS) {
      const dx = t.cx - x, dz = t.cz - z;
      if (dx * dx + dz * dz < 60 * 60) { insideTown = true; break; }
    }
    if (insideTown) continue;
    // Mix per night/day + escala con día. Día 1-2: mayoría zombies básicos.
    // Día 3-5: más runners/specials. Día 6+: tanks, brutes, specials suben.
    // El "specialBoost" suma a la chance de specials/elites con cada día.
    const isNight = isNightHour(gameHour);
    const specialBoost = Math.min(0.20, (gameDay - 1) * 0.025);   // hasta +20%
    const eliteBoost   = Math.min(0.15, (gameDay - 2) * 0.022);   // tanks/brutes
    let etype = 'zombie';
    const r2 = Math.random();
    if (isNight) {
      if      (r2 > 0.985 - eliteBoost)           etype = 'brute';
      else if (r2 > 0.96  - eliteBoost)           etype = 'bear';
      else if (r2 > 0.93  - specialBoost)         etype = 'exploder';
      else if (r2 > 0.90  - specialBoost)         etype = 'screamer';
      else if (r2 > 0.86  - specialBoost)         etype = 'spitter';
      else if (r2 > 0.80  - eliteBoost)           etype = 'tank';
      else if (r2 > 0.74)                         etype = 'boar';
      else if (r2 > 0.50)                         etype = 'wolf';
      else if (r2 > 0.25)                         etype = 'runner';
      else                                        etype = 'zombie';
    } else {
      if      (r2 > 0.992 - eliteBoost)           etype = 'brute';
      else if (r2 > 0.98  - eliteBoost)           etype = 'bear';
      else if (r2 > 0.965 - specialBoost)         etype = 'exploder';
      else if (r2 > 0.95  - specialBoost)         etype = 'screamer';
      else if (r2 > 0.93  - specialBoost)         etype = 'spitter';
      else if (r2 > 0.89  - eliteBoost)           etype = 'tank';
      else if (r2 > 0.85)                         etype = 'boar';
      else if (r2 > 0.80)                         etype = 'wolf';
      else if (r2 > 0.72)                         etype = 'runner';
      else                                        etype = 'zombie';
    }
    const e = makeEnemy({ etype, x, z, ambient: true });
    broadcast({ type: 'eSpawn', e: ePub(e) });
    return e;
  }
  return null;
}
// Backwards-compatible alias for any callsite still using the v1.2 name.
const spawnAmbientZombie = spawnAmbientHostile;

// Passive animal spawn — far from player + outside towns. Used by the
// dedicated animal ticker so they don't compete with hostile spawn cap.
let animalSpawnAccum = 0;
function spawnAmbientAnimal() {
  if (players.size === 0) return null;
  for (let tries = 0; tries < 20; tries++) {
    const list = [...players.values()];
    const anchor = list[Math.floor(Math.random() * list.length)];
    const angle = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 70;
    const x = anchor.x + Math.cos(angle) * r;
    const z = anchor.z + Math.sin(angle) * r;
    if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) continue;
    let insideTown = false;
    for (const t of TOWNS) {
      const dx = t.cx - x, dz = t.cz - z;
      if (dx * dx + dz * dz < 60 * 60) { insideTown = true; break; }
    }
    if (insideTown) continue;
    const etype = Math.random() < 0.55 ? 'rabbit' : 'deer';
    const e = makeEnemy({ etype, x, z, ambient: true });
    broadcast({ type: 'eSpawn', e: ePub(e) });
    return e;
  }
  return null;
}

// Supply drop timer — first one ~3 min after first player connects.
let supplyDropCountdown = 180;

// =====================================================================
// Day / night cycle. The game hour wraps every DAY_LENGTH seconds. Night
// hours are 20..6 inclusive (10 hours of darkness, 14 of light).
// Broadcast hour to clients via a low-frequency message; clients drive
// the visual sun rotation off it.
// =====================================================================
const DAY_LENGTH = 360;          // seconds per in-game day
const NIGHT_FROM = 20, NIGHT_TO = 6;
let gameHour = 8;                // start in the morning
let gameDay = 1;                 // counter de días (sube al cruzar 06:00)
function isNightHour(h) {
  if (NIGHT_FROM > NIGHT_TO) return h >= NIGHT_FROM || h < NIGHT_TO;
  return h >= NIGHT_FROM && h < NIGHT_TO;
}
let lastTimeBroadcast = 0;

// =====================================================================
// Difficulty scaling — sube con cada día. Día 1 = 1.0x, día 2 = 1.12x,
// día 3 = 1.24x, …, día 8 ≈ 1.84x. Aplicado a HP y dmg de TODOS los
// enemigos al spawn. El cap de zombies y composición de specials también
// escalan (más specials a mayor día).
// =====================================================================
function difficultyMul() {
  return 1 + 0.12 * Math.max(0, gameDay - 1);
}
function difficultyDay() { return gameDay; }

// =====================================================================
// AI tick — runs at 10 Hz. Dispatches per behavior (sleeping → wake,
// melee chase, ranged shooter, boss).
// =====================================================================
const AI_HZ = 10;
const AI_DT = 1 / AI_HZ;
let ambientSpawnAccum = 0;
let streamCheckAccum = 0;
let weatherCheckAccum = 60; // primer tick de clima a los 30s
let currentWeather = 'clear';
const thunderState = { nextStrikeAt: 0 };

// =====================================================================
// Smoke areas — los jugadores que tiran granadas de humo registran un
// área aquí. Los enemigos que están dentro pierden visión del jugador
// que la causó (su AI los ignora como "nearest").
// =====================================================================
const smokeAreas = [];   // { x, z, r, until }
function isInSmoke(x, z) {
  const now = Date.now();
  for (const s of smokeAreas) {
    if (s.until < now) continue;
    if (Math.hypot(x - s.x, z - s.z) < s.r) return true;
  }
  return false;
}
function cleanupSmoke() {
  const now = Date.now();
  for (let i = smokeAreas.length - 1; i >= 0; i--) {
    if (smokeAreas[i].until < now) smokeAreas.splice(i, 1);
  }
}

// =====================================================================
// Zombi alfa boss — cada 15-25 min, 50% chance, spawnea un alfa cerca
// de un jugador random. Persigue sin aggro limit, dropea boss-tier
// crate al morir.
// =====================================================================
let alphaCd = 540;        // primer alfa a los 9 min
let alphaActive = null;   // id del alfa vivo, o null
function maybeTriggerAlpha() {
  if (players.size === 0) return;
  if (alphaActive != null) {
    if (!enemies.has(alphaActive)) alphaActive = null;
    return;
  }
  alphaCd -= AI_DT;
  if (alphaCd > 0) return;
  alphaCd = 900 + Math.random() * 600;  // 15-25 min
  if (Math.random() > 0.5) return;       // 50% chance, sino skip a la próxima
  // Spawn cerca de un player random.
  const list = [...players.values()];
  const anchor = list[Math.floor(Math.random() * list.length)];
  const angle = Math.random() * Math.PI * 2;
  const r = 35 + Math.random() * 25;
  const x = anchor.x + Math.cos(angle) * r;
  const z = anchor.z + Math.sin(angle) * r;
  if (Math.abs(x) > WORLD_HALF - 5 || Math.abs(z) > WORLD_HALF - 5) return;
  const e = makeEnemy({ etype: 'alpha', x, z });
  e.patrol = true;          // ignora aggro range
  alphaActive = e.id;
  broadcast({ type: 'eSpawn', e: ePub(e) });
  broadcast({ type: 'banner', text: '⚠⚠ ZOMBI ALFA HA APARECIDO ⚠⚠' });
}

// =====================================================================
// Convoy aéreo — cada 12-18 min anuncia "AVIÓN DE SUMINISTROS"
// y dropea 3 cajas en una línea recta a través del mapa.
// =====================================================================
let convoyCd = 360;       // primer convoy a los 6 min
function maybeTriggerConvoy() {
  if (players.size === 0) return;
  convoyCd -= AI_DT;
  if (convoyCd > 0) return;
  convoyCd = 720 + Math.random() * 360;  // 12-18 min entre convoys
  // Dirección random — vector unitario.
  const angle = Math.random() * Math.PI * 2;
  const dirX = Math.cos(angle), dirZ = Math.sin(angle);
  // Punto medio random cerca del centro.
  const mx = (Math.random() * 2 - 1) * (WORLD_HALF * 0.4);
  const mz = (Math.random() * 2 - 1) * (WORLD_HALF * 0.4);
  // 3 cajas en línea, espaciado 30m.
  const spacing = 30;
  for (let i = 0; i < 3; i++) {
    const offset = (i - 1) * spacing;
    const x = mx + dirX * offset;
    const z = mz + dirZ * offset;
    if (Math.abs(x) > WORLD_HALF - 5 || Math.abs(z) > WORLD_HALF - 5) continue;
    const id = nextCrateId++;
    // Tier military para convoy — armas/ammo militar premium.
    crates.set(id, { id, x, z, y: heightAt(x, z), tableKey: 'military', townId: null, taken: false });
    broadcast({ type: 'crateSpawn', c: cPub(crates.get(id)) });
  }
  broadcast({ type: 'banner', text: '✈ AVION DE SUMINISTROS — 3 cajas militares en linea' });
  broadcast({ type: 'convoy', x: mx, z: mz, dirX, dirZ });
}

// =====================================================================
// Tormenta radioactiva — battle-royale-ish. Cada 8-12 min se anuncia
// un círculo seguro. Después de 60s warning, players FUERA del círculo
// reciben 3 HP/s. Dura 90s, después se libera.
// =====================================================================
let stormCd = 360;        // primera tormenta a los 6 min
let stormState = 'idle';  // 'idle' | 'warning' | 'active'
let stormCenter = { x: 0, z: 0 };
let stormRadius = 0;
let stormEndsAt = 0;
let stormWarnEndsAt = 0;

function maybeTriggerStorm() {
  if (players.size === 0) return;
  if (stormState === 'idle') {
    stormCd -= AI_DT;
    if (stormCd > 0) return;
    // Nueva tormenta — elige centro random y radius proporcional a escala.
    stormCd = 480 + Math.random() * 240; // 8-12 min
    stormCenter.x = (Math.random() * 2 - 1) * (WORLD_HALF * 0.5);
    stormCenter.z = (Math.random() * 2 - 1) * (WORLD_HALF * 0.5);
    stormRadius = 110;   // safe zone radius
    stormState = 'warning';
    stormWarnEndsAt = Date.now() + 60 * 1000;  // 60s para llegar
    broadcast({ type: 'banner', text: '☢ TORMENTA RADIOACTIVA EN 60s — busquen zona segura' });
    broadcast({ type: 'storm', state: 'warning', x: stormCenter.x, z: stormCenter.z, r: stormRadius, until: stormWarnEndsAt });
  } else if (stormState === 'warning') {
    if (Date.now() >= stormWarnEndsAt) {
      stormState = 'active';
      stormEndsAt = Date.now() + 90 * 1000;
      broadcast({ type: 'banner', text: '☢ TORMENTA ACTIVA — daño fuera del círculo' });
      broadcast({ type: 'storm', state: 'active', x: stormCenter.x, z: stormCenter.z, r: stormRadius, until: stormEndsAt });
    }
  } else if (stormState === 'active') {
    // Daño 3 HP/s a players fuera del radio.
    for (const p of players.values()) {
      if (p.hp <= 0) continue;
      const d = Math.hypot(p.x - stormCenter.x, p.z - stormCenter.z);
      if (d > stormRadius) {
        const dmg = Math.round(3 * AI_DT * 10) / 10;
        p.hp = Math.max(0, p.hp - dmg);
        if (Math.random() < 0.05) {  // ~tick spo a 1/2s
          sendTo(p, { type: 'youHit', dmg: 1, by: 0, sx: p.x, sy: p.y, sz: p.z, source: 'storm' });
        }
      }
    }
    if (Date.now() >= stormEndsAt) {
      stormState = 'idle';
      broadcast({ type: 'banner', text: '✓ La tormenta pasó' });
      broadcast({ type: 'storm', state: 'end' });
    }
  }
}

// =====================================================================
// Wave system — every WAVE_INTERVAL seconds (with jitter), the server
// announces an inbound wave and bursts a horde of hostiles around each
// connected player. Banner broadcast lets clients sting + warn.
// =====================================================================
const WAVE_INTERVAL_MIN = 240; // 4 min
const WAVE_INTERVAL_MAX = 360; // 6 min
let waveCountdown = 90;        // first wave after 90 s of activity
let waveActive = false;
let waveEndsAt = 0;

function announceWave() {
  waveActive = true;
  waveEndsAt = Date.now() + 90 * 1000;
  broadcast({ type: 'banner', text: '⚠ OLEADA INMINENTE ⚠' });
  broadcast({ type: 'wave', state: 'start' });
  // Burst spawn 10-14 hostiles around each player. Más con cada día.
  const dayBoost = Math.floor((gameDay - 1) * 1.5);
  for (const p of players.values()) {
    const count = 10 + Math.floor(Math.random() * 5) + dayBoost;
    for (let i = 0; i < count; i++) {
      // 50% wolves at night, 30% runners, 15% zombies, 5% tanks.
      const r = Math.random();
      let etype = 'zombie';
      const night = isNightHour(gameHour);
      if (night) {
        if (r > 0.95) etype = 'tank';
        else if (r > 0.50) etype = 'wolf';
        else if (r > 0.20) etype = 'runner';
      } else {
        if (r > 0.95) etype = 'tank';
        else if (r > 0.80) etype = 'wolf';
        else if (r > 0.50) etype = 'runner';
      }
      const angle = Math.random() * Math.PI * 2;
      const r2 = 35 + Math.random() * 35;
      const x = p.x + Math.cos(angle) * r2;
      const z = p.z + Math.sin(angle) * r2;
      if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) continue;
      const e = makeEnemy({ etype, x, z, ambient: true });
      broadcast({ type: 'eSpawn', e: ePub(e) });
    }
  }
}

// =====================================================================
// Hordas nocturnas — desde día 3 en adelante, cada noche al cruzar las
// 22:00 spawneamos una horda BIG de zombies cerca de cada jugador. Más
// grande y mortal que las olas regulares: incluye specials (screamer +
// brute) y mucha más cantidad. Anunciada con banner rojo.
// =====================================================================
// Patrulla de científicos — desde día 4, cada 5-7 min se forma un trío
// que persigue al jugador más cercano hasta que muere todo el grupo o el
// jugador escapa muy lejos.
let scientistPatrolCd = 240;   // primera patrulla a los 4 min
function maybeTriggerScientistPatrol() {
  if (gameDay < 4) return;
  if (players.size === 0) return;
  scientistPatrolCd -= AI_DT;
  if (scientistPatrolCd > 0) return;
  scientistPatrolCd = 300 + Math.random() * 120;  // 5-7 min
  const list = [...players.values()];
  const target = list[Math.floor(Math.random() * list.length)];
  const angle = Math.random() * Math.PI * 2;
  const r = 60 + Math.random() * 25;
  const baseX = target.x + Math.cos(angle) * r;
  const baseZ = target.z + Math.sin(angle) * r;
  if (Math.abs(baseX) > WORLD_HALF - 5 || Math.abs(baseZ) > WORLD_HALF - 5) return;
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * 2;
    const types = ['scientist', 'sci_shotgun', 'sci_sniper'];
    const e = makeEnemy({
      etype: types[i], x: baseX + off, z: baseZ + off,
    });
    e.patrol = true;          // override aggro range siempre
    broadcast({ type: 'eSpawn', e: ePub(e) });
  }
  broadcast({ type: 'banner', text: '⚠ PATRULLA DE CIENTIFICOS EN MARCHA' });
}

// Helicóptero comerciante — cada 6-10 min aterriza en posición random,
// se queda 3 min, y al despegar deja un cofre boss-tier. Solo 1 a la vez.
let heliTraderCd = 360;       // primer heli a los 6 min
let heliTrader = null;        // { x, z, expiresAt }
function maybeTriggerHeliTrader() {
  if (players.size === 0) return;
  if (heliTrader) {
    if (Date.now() > heliTrader.expiresAt) {
      // Aterriza loot drop antes de despegar.
      const id = nextCrateId++;
      crates.set(id, {
        id, x: heliTrader.x, z: heliTrader.z, y: heightAt(heliTrader.x, heliTrader.z),
        tableKey: 'boss', townId: null, taken: false,
      });
      broadcast({ type: 'crateSpawn', c: cPub(crates.get(id)) });
      broadcast({ type: 'banner', text: '✦ El heli despegó — dejó loot' });
      broadcast({ type: 'heliTrader', state: 'leave' });
      heliTrader = null;
    }
    return;
  }
  heliTraderCd -= AI_DT;
  if (heliTraderCd > 0) return;
  heliTraderCd = 360 + Math.random() * 240;  // 6-10 min entre apariciones
  // Posición random entre los jugadores.
  const list = [...players.values()];
  const anchor = list[Math.floor(Math.random() * list.length)];
  const angle = Math.random() * Math.PI * 2;
  const r = 40 + Math.random() * 20;
  const x = anchor.x + Math.cos(angle) * r;
  const z = anchor.z + Math.sin(angle) * r;
  if (Math.abs(x) > WORLD_HALF - 10 || Math.abs(z) > WORLD_HALF - 10) return;
  heliTrader = { x, z, expiresAt: Date.now() + 180 * 1000 };
  broadcast({ type: 'banner', text: '✦ HELICOPTERO COMERCIANTE — interactúa con E' });
  broadcast({ type: 'heliTrader', state: 'arrive', x, z, expiresAt: heliTrader.expiresAt });
}

let lastHordeNightDay = 0;
function maybeTriggerNightHorde() {
  if (gameDay < 3) return;
  if (gameHour < 22 || gameHour >= 23) return;
  if (lastHordeNightDay === gameDay) return;
  lastHordeNightDay = gameDay;
  triggerNightHorde();
}
function triggerNightHorde() {
  const dayBoost = Math.floor((gameDay - 2) * 2.5);  // día 3 +2, día 5 +7, día 8 +15
  broadcast({ type: 'banner', text: `★★★ HORDA NOCTURNA — DIA ${gameDay} ★★★` });
  broadcast({ type: 'wave', state: 'start' });
  waveActive = true;
  waveEndsAt = Date.now() + 120 * 1000;
  for (const p of players.values()) {
    const count = 12 + Math.floor(Math.random() * 6) + dayBoost;
    let screamerSpawned = false, bruteSpawned = false;
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      let etype = 'zombie';
      // Asegurar al menos 1 screamer y 1 brute por horda desde día 4.
      if (gameDay >= 4 && !screamerSpawned && i === 2) { etype = 'screamer'; screamerSpawned = true; }
      else if (gameDay >= 5 && !bruteSpawned && i === 4) { etype = 'brute'; bruteSpawned = true; }
      else if (r > 0.97) etype = 'tank';
      else if (r > 0.93) etype = 'spitter';
      else if (r > 0.90) etype = 'exploder';
      else if (r > 0.55) etype = 'runner';
      else               etype = 'zombie';
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 25;
      const x = p.x + Math.cos(angle) * dist;
      const z = p.z + Math.sin(angle) * dist;
      if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) continue;
      const e = makeEnemy({ etype, x, z, ambient: true });
      broadcast({ type: 'eSpawn', e: ePub(e) });
    }
  }
}

setInterval(() => {
  // Advance day/night clock. 1 tick = 0.1 s real → DAY_LENGTH s = full day.
  const prev = gameHour;
  gameHour = (gameHour + (24 / DAY_LENGTH) * AI_DT) % 24;
  // Roll de día — al cruzar las 06:00 (amanecer) sumamos un día.
  if (prev > 22 && gameHour < 1) {
    // Cruzó medianoche (mantenemos por compat).
  }
  if (prev < 6 && gameHour >= 6 && gameHour < 7) {
    gameDay++;
    // Fase lunar — ciclo de 8 días. day%8 = 0 luna nueva, day%8 = 4 luna llena.
    const moonPhase = ((gameDay - 1) % 8) / 8;   // 0..1
    broadcast({ type: 'banner', text: `★ DIA ${gameDay} — La amenaza crece` });
    broadcast({ type: 'difficulty', day: gameDay, mul: +difficultyMul().toFixed(2), moonPhase });
    // Luna llena: anuncio especial.
    const isFullMoon = ((gameDay - 1) % 8) === 4;
    if (isFullMoon) {
      broadcast({ type: 'banner', text: '🌕 LUNA LLENA — esta noche habrá más zombis' });
    }
  }
  // Trigger horda nocturna desde día 3 al cruzar las 22:00.
  if (players.size > 0) {
    maybeTriggerNightHorde();
    maybeTriggerScientistPatrol();
    maybeTriggerHeliTrader();
    maybeTriggerStorm();
    maybeTriggerConvoy();
    maybeTriggerAlpha();
  }

  // Clima: cada 90s real chequeamos si cambia. Lluvia 22%, niebla 12%
  // (solo de noche), tormenta eléctrica 8%, clear el resto.
  weatherCheckAccum += AI_DT;
  if (weatherCheckAccum >= 90) {
    weatherCheckAccum = 0;
    const r = Math.random();
    let next = 'clear';
    if (isNightHour(gameHour) && r < 0.20) next = 'fog';
    else if (r < 0.22) next = 'rain';
    else if (r < 0.30) next = 'thunder';   // 8%
    if (next !== currentWeather) {
      currentWeather = next;
      broadcast({ type: 'weather', kind: next });
      if (next === 'rain')         broadcast({ type: 'banner', text: '☂ Empezó a llover' });
      else if (next === 'fog')     broadcast({ type: 'banner', text: '✦ Niebla densa' });
      else if (next === 'thunder') broadcast({ type: 'banner', text: '⚡ TORMENTA ELECTRICA — cuidado con los rayos' });
      else                         broadcast({ type: 'banner', text: '☀ Cielo despejado' });
    }
  }
  // Rayos: durante thunder, cada 10-20s un rayo cae random. Daña 30 HP
  // si cae dentro de 12m de un player (con falloff).
  if (currentWeather === 'thunder' && players.size > 0) {
    if (!thunderState.nextStrikeAt) thunderState.nextStrikeAt = Date.now() + 10000 + Math.random() * 10000;
    if (Date.now() >= thunderState.nextStrikeAt) {
      thunderState.nextStrikeAt = Date.now() + 10000 + Math.random() * 10000;
      const list = [...players.values()];
      const anchor = list[Math.floor(Math.random() * list.length)];
      const angle = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 80;
      const lx = anchor.x + Math.cos(angle) * r;
      const lz = anchor.z + Math.sin(angle) * r;
      // Daño a players cerca del impacto.
      for (const p of players.values()) {
        if (p.hp <= 0) continue;
        const d = Math.hypot(p.x - lx, p.z - lz);
        if (d < 12) {
          const falloff = 1 - d / 12;
          const dmg = Math.round(30 * falloff);
          p.hp = Math.max(0, p.hp - dmg);
          sendTo(p, { type: 'youHit', dmg, by: 0, sx: lx, sy: heightAt(lx, lz), sz: lz, source: 'lightning' });
        }
      }
      broadcast({ type: 'lightning', x: lx, z: lz });
    }
  } else {
    thunderState.nextStrikeAt = 0;
  }

  // Wave countdown.
  if (players.size > 0) {
    waveCountdown -= AI_DT;
    if (waveCountdown <= 0) {
      announceWave();
      waveCountdown = WAVE_INTERVAL_MIN + Math.random() * (WAVE_INTERVAL_MAX - WAVE_INTERVAL_MIN);
    }
    if (waveActive && Date.now() > waveEndsAt) {
      waveActive = false;
      broadcast({ type: 'wave', state: 'end' });
    }
  }

  // Grenade physics + detonation.
  for (const g of grenades.values()) {
    g.fuse -= AI_DT;
    g.vy -= 22 * AI_DT;
    g.x += g.vx * AI_DT;
    g.y += g.vy * AI_DT;
    g.z += g.vz * AI_DT;
    const groundY = heightAt(g.x, g.z) + 0.15;
    if (g.y < groundY) {
      g.y = groundY;
      g.vy = -g.vy * 0.35;       // weak bounce
      g.vx *= 0.7; g.vz *= 0.7;  // ground friction
    }
    if (g.fuse <= 0) {
      // Detonate. Damage every enemy in radius. Damage scales with proximity.
      for (const e of enemies.values()) {
        if (e.sleeping) continue;
        const dx = e.x - g.x, dz = e.z - g.z;
        const d = Math.hypot(dx, dz);
        if (d > GRENADE_RADIUS) continue;
        const dmg = Math.round(GRENADE_DAMAGE * (1 - d / GRENADE_RADIUS));
        e.hp -= dmg;
        broadcast({ type: 'eHit', id: e.id, hp: Math.max(0, e.hp) });
        if (e.hp <= 0) killEnemy(e, g.ownerId);
      }
      // Damage players in radius (other than owner — friendly-fire light).
      for (const p of players.values()) {
        if (p.id === g.ownerId) continue;
        if (p.hp <= 0) continue;
        const dx = p.x - g.x, dz = p.z - g.z;
        const d = Math.hypot(dx, dz);
        if (d > GRENADE_RADIUS) continue;
        const dmg = Math.round(GRENADE_DAMAGE * 0.6 * (1 - d / GRENADE_RADIUS));
        p.hp = Math.max(0, p.hp - dmg);
        sendTo(p, { type: 'youHit', dmg, by: g.ownerId, sx: g.x, sy: g.y, sz: g.z, source: 'grenade' });
      }
      broadcast({ type: 'grenadeBoom', id: g.id, x: g.x, y: g.y, z: g.z });
      grenades.delete(g.id);
    }
  }

  // Broadcast hour every ~1 s (clients lerp).
  lastTimeBroadcast += AI_DT;
  if (lastTimeBroadcast >= 1) {
    lastTimeBroadcast = 0;
    broadcast({ type: 'time', h: +gameHour.toFixed(2), night: isNightHour(gameHour) });
  }

  // Town + POI streaming check — every 0.8 s, not every tick.
  streamCheckAccum += AI_DT;
  if (streamCheckAccum >= 0.8) {
    streamCheckAccum = 0;
    streamTowns();
    streamPois();
  }

  // Supply drop event — every 4-6 minutes a high-tier crate parachutes
  // somewhere in the playable map (away from towns). All clients get a
  // banner + a position so they can fight over it.
  supplyDropCountdown -= AI_DT;
  if (supplyDropCountdown <= 0 && players.size > 0) {
    supplyDropCountdown = 240 + Math.random() * 120;
    const sx = (Math.random() * 2 - 1) * (WORLD_HALF * 0.7);
    const sz = (Math.random() * 2 - 1) * (WORLD_HALF * 0.7);
    const id = nextCrateId++;
    crates.set(id, { id, x: sx, z: sz, y: heightAt(sx, sz), tableKey: 'boss', townId: null, taken: false });
    broadcast({ type: 'crateSpawn', c: cPub(crates.get(id)) });
    broadcast({ type: 'banner', text: '★ SUMINISTROS CAYERON ★' });
    broadcast({ type: 'supplyDrop', x: sx, z: sz });
  }

  // Ambient (out-of-town) spawn ticker. At night spawn faster + cap higher.
  const night = isNightHour(gameHour);
  const spawnInterval = night ? AMBIENT_SPAWN_INTERVAL * 0.55 : AMBIENT_SPAWN_INTERVAL;
  // Cap escala con el día. Día 1 base, día 2 +3, día 5 +12, día 8 +21.
  const dayBonus = Math.floor((gameDay - 1) * 3);
  // Luna llena (día % 8 == 4) → +50% cap de noche.
  const isFullMoon = ((gameDay - 1) % 8) === 4;
  const moonMul = (night && isFullMoon) ? 1.5 : 1.0;
  const cap = Math.round(((night ? MAX_AMBIENT_ZOMBIES + 12 : MAX_AMBIENT_ZOMBIES) + dayBonus) * moonMul);
  ambientSpawnAccum += AI_DT;
  if (ambientSpawnAccum >= spawnInterval && players.size > 0) {
    let ambientCount = 0;
    for (const e of enemies.values()) if (e.ambient && !e.dead) ambientCount++;
    if (ambientCount < cap) {
      ambientSpawnAccum = 0;
      spawnAmbientHostile();
    }
  }

  // Animal ambient — separate, slower spawner. Capped to ~6 alive at once.
  animalSpawnAccum += AI_DT;
  if (animalSpawnAccum >= 12 && players.size > 0) {
    let animalCount = 0;
    for (const e of enemies.values()) if (e.etype === 'deer' || e.etype === 'rabbit') animalCount++;
    if (animalCount < 6) {
      animalSpawnAccum = 0;
      spawnAmbientAnimal();
    }
  }

  // Limpieza de smoke areas expiradas (1 vez por tick).
  cleanupSmoke();

  // Per-enemy AI.
  const _now = Date.now();
  for (const e of enemies.values()) {
    // Stunned por flashbang — saltar todo el AI (no se mueve, no ataca).
    if (e._stunnedUntil && _now < e._stunnedUntil) continue;
    if (e.attackCd > 0) e.attackCd -= AI_DT;
    const cfg = ETYPES[e.etype] || ETYPES.zombie;
    // Burn DoT (incendiary bullets) — 2 HP cada 500ms hasta 5s.
    if (e._burnUntil && _now < e._burnUntil) {
      if (_now >= (e._burnNextTick || 0)) {
        e._burnNextTick = _now + 500;
        e.hp = Math.max(0, e.hp - 2);
        broadcast({ type: 'eHit', id: e.id, hp: e.hp });
        if (e.hp <= 0) { killEnemy(e, null); continue; }
      }
    } else if (e._burnUntil) {
      e._burnUntil = 0;
    }

    // Find nearest alive player. Players dentro de humo son invisibles
    // para el AI (los enemies pierden el target).
    let nearest = null, nd2 = Infinity;
    for (const p of players.values()) {
      if (p.hp <= 0) continue;
      if (isInSmoke(p.x, p.z)) continue;
      const dx = p.x - e.x, dz = p.z - e.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nd2) { nd2 = d2; nearest = p; }
    }
    if (!nearest) continue;
    const d = Math.sqrt(nd2);

    // Sleeping: don't move. Wake if a player crosses WAKE_RADIUS.
    if (e.sleeping) {
      if (d < WAKE_RADIUS) {
        e.sleeping = false;
        broadcast({ type: 'eWake', id: e.id });
      }
      continue;
    }

    // Passive animals — wander when alone, flee from any player within
    // fleeRange. No attack. Wander uses a slowly turning heading per entity.
    if (cfg.passive) {
      if (e._wander == null) e._wander = { heading: Math.random() * Math.PI * 2, t: 0 };
      e._wander.t -= AI_DT;
      if (e._wander.t <= 0) {
        e._wander.t = 2 + Math.random() * 3;
        e._wander.heading += (Math.random() - 0.5) * 1.4;
      }
      let speed = cfg.speed * 0.25; // amble
      // Flee if a player is too close.
      if (d < cfg.fleeRange) {
        const fdx = e.x - nearest.x, fdz = e.z - nearest.z;
        const fd = Math.sqrt(fdx * fdx + fdz * fdz) || 0.001;
        e._wander.heading = Math.atan2(fdx, fdz);
        speed = cfg.speed; // sprint away
      }
      e.x += Math.sin(e._wander.heading) * speed * AI_DT;
      e.z += Math.cos(e._wander.heading) * speed * AI_DT;
      // Clamp inside world.
      e.x = Math.max(-WORLD_HALF + 2, Math.min(WORLD_HALF - 2, e.x));
      e.z = Math.max(-WORLD_HALF + 2, Math.min(WORLD_HALF - 2, e.z));
      e.y = heightAt(e.x, e.z);
      e.ry = e._wander.heading;
      continue;
    }

    // Patrulla de scientists o aggro boost (por scream / disparo no
     // silenciado) ignora el aggro range normal.
    const aggroBoosted = e._aggroBoostUntil && Date.now() < e._aggroBoostUntil;
    const isScientist = e.etype === 'scientist' || e.etype === 'sci_shotgun' || e.etype === 'sci_sniper';
    if (!e.patrol && !aggroBoosted && d > cfg.aggro) {
      // IDLE WANDER para scientists del lab — patrullan cerca de su
      // posición de spawn (en el town de helix-lab) con heading aleatorio.
      if (isScientist && e.townId === 'helix-lab') {
        if (e._idleAnchor == null) e._idleAnchor = { x: e.x, z: e.z };
        if (e._idleHeading == null) e._idleHeading = { angle: Math.random() * Math.PI * 2, t: 0 };
        e._idleHeading.t -= AI_DT;
        if (e._idleHeading.t <= 0) {
          e._idleHeading.t = 2 + Math.random() * 3;
          e._idleHeading.angle += (Math.random() - 0.5) * 1.6;
          // Si se alejaron mucho del ancla, redirigir hacia el ancla.
          const dxa = e.x - e._idleAnchor.x, dza = e.z - e._idleAnchor.z;
          if (Math.hypot(dxa, dza) > 8) e._idleHeading.angle = Math.atan2(-dxa, -dza);
        }
        const speed = cfg.speed * 0.4;
        e.x += Math.sin(e._idleHeading.angle) * speed * AI_DT;
        e.z += Math.cos(e._idleHeading.angle) * speed * AI_DT;
        e.y = heightAt(e.x, e.z);
        e.ry = e._idleHeading.angle;
      }
      continue;
    }
    // ALERTA: si un scientist ENTRA en aggro y no estaba alertado
    // recientemente, alerta a otros scientists en 35m (boostea su aggro).
    if (isScientist && (!e._lastAlerted || Date.now() - e._lastAlerted > 30000)) {
      e._lastAlerted = Date.now();
      let alerted = 0;
      for (const other of enemies.values()) {
        if (other.id === e.id) continue;
        const otherIsSci = other.etype === 'scientist' || other.etype === 'sci_shotgun' || other.etype === 'sci_sniper';
        if (!otherIsSci) continue;
        const od = Math.hypot(other.x - e.x, other.z - e.z);
        if (od < 35) {
          other._aggroBoostUntil = Date.now() + 12000;  // 12s de alerta
          alerted++;
        }
      }
      if (alerted > 0) broadcast({ type: 'banner', text: `⚠ Te detectaron — ${alerted} científicos alertados` });
    }

    // Night buff — melee zombies/wolves move ~20% faster after dusk so the
    // night actually feels different from the day.
    const nightMul = (isNightHour(gameHour) && !cfg.ranged) ? 1.2 : 1.0;

    if (cfg.ranged) {
      // Shooter: keep optimal distance ~70% of range; circle-strafe slightly.
      const desired = cfg.range * 0.65;
      if (d > desired + 2) {
        const dx = nearest.x - e.x, dz = nearest.z - e.z;
        e.x += (dx / d) * cfg.speed * AI_DT;
        e.z += (dz / d) * cfg.speed * AI_DT;
      } else if (d < desired - 2) {
        const dx = nearest.x - e.x, dz = nearest.z - e.z;
        e.x -= (dx / d) * cfg.speed * AI_DT * 0.7;
        e.z -= (dz / d) * cfg.speed * AI_DT * 0.7;
      }
      e.y = heightAt(e.x, e.z);
      e.ry = Math.atan2(nearest.x - e.x, nearest.z - e.z);
      // Fire when in range.
      if (d < cfg.range && e.attackCd <= 0) {
        e.attackCd = cfg.cd;
        const dmg = Math.round(cfg.dmg * (e.dmgScale || 1));
        nearest.hp = Math.max(0, nearest.hp - dmg);
        sendTo(nearest, { type: 'youHit', dmg, by: e.id, sx: e.x, sy: e.y, sz: e.z, source: e.etype });
        broadcast({ type: 'eShoot', id: e.id, tx: nearest.x, ty: nearest.y, tz: nearest.z });
      }
    } else if (cfg.special === 'exploder') {
      // Suicida: corre hacia el player. Si está dentro de range, detona
      // explosión radial: 60 dmg en 5m, y muere él mismo.
      if (d > cfg.range) {
        const dx = nearest.x - e.x, dz = nearest.z - e.z;
        e.x += (dx / d) * cfg.speed * nightMul * AI_DT;
        e.z += (dz / d) * cfg.speed * nightMul * AI_DT;
        e.y = heightAt(e.x, e.z);
        e.ry = Math.atan2(dx, dz);
      } else {
        detonateExploder(e);
      }
    } else if (cfg.special === 'screamer') {
      // Frágil — corre hacia el jugador y "grita" cada 4s para aturdir y
      // boostear aggro de zombies cercanos. El grito hace que zombies en
      // 25m corran hacia la posición del jugador (override de aggro).
      if (e._screamCd == null) e._screamCd = 0;
      e._screamCd -= AI_DT;
      if (d > cfg.range) {
        const dx = nearest.x - e.x, dz = nearest.z - e.z;
        e.x += (dx / d) * cfg.speed * nightMul * AI_DT;
        e.z += (dz / d) * cfg.speed * nightMul * AI_DT;
        e.y = heightAt(e.x, e.z);
        e.ry = Math.atan2(dx, dz);
      } else if (e.attackCd <= 0) {
        e.attackCd = cfg.cd;
        const dmg = Math.round(cfg.dmg * (e.dmgScale || 1));
        nearest.hp = Math.max(0, nearest.hp - dmg);
        sendTo(nearest, { type: 'youHit', dmg, by: e.id, sx: e.x, sy: e.y, sz: e.z, source: e.etype });
        broadcast({ type: 'eAttack', id: e.id });
      }
      if (e._screamCd <= 0) {
        e._screamCd = 4.0;
        triggerScream(e, nearest);
      }
    } else {
      // Melee: chase + bite.
      if (d > cfg.range) {
        const dx = nearest.x - e.x, dz = nearest.z - e.z;
        e.x += (dx / d) * cfg.speed * nightMul * AI_DT;
        e.z += (dz / d) * cfg.speed * nightMul * AI_DT;
        e.y = heightAt(e.x, e.z);
        e.ry = Math.atan2(dx, dz);
      } else if (e.attackCd <= 0) {
        e.attackCd = cfg.cd;
        const dmg = Math.round(cfg.dmg * (e.dmgScale || 1));
        nearest.hp = Math.max(0, nearest.hp - dmg);
        sendTo(nearest, { type: 'youHit', dmg, by: e.id, sx: e.x, sy: e.y, sz: e.z, source: e.etype });
        broadcast({ type: 'eAttack', id: e.id });
      }
    }
  }
}, 1000 / AI_HZ);

// =====================================================================
// Specials: detonación del exploder y grito del screamer.
// =====================================================================
function detonateExploder(e) {
  const RADIUS = 5;
  const DMG = 60;
  // Daño radial a jugadores y a otros enemigos cercanos.
  for (const p of players.values()) {
    if (p.hp <= 0) continue;
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    if (d <= RADIUS) {
      const falloff = 1 - (d / RADIUS);
      const dmg = Math.round(DMG * falloff);
      p.hp = Math.max(0, p.hp - dmg);
      sendTo(p, { type: 'youHit', dmg, by: e.id, sx: e.x, sy: e.y, sz: e.z, source: 'exploder' });
    }
  }
  for (const other of enemies.values()) {
    if (other.id === e.id) continue;
    if (other.isBoss) continue;
    const d = Math.hypot(other.x - e.x, other.z - e.z);
    if (d <= RADIUS) {
      other.hp = Math.max(0, other.hp - 40);
      if (other.hp <= 0) killEnemy(other, e.id);
    }
  }
  broadcast({ type: 'grenadeBoom', id: -e.id, x: e.x, y: e.y, z: e.z });
  killEnemy(e, null);
}

function triggerScream(screamer, nearestPlayer) {
  const RADIUS = 25;
  let n = 0;
  for (const z of enemies.values()) {
    if (z.id === screamer.id) continue;
    if (z.isBoss) continue;
    if (z.etype !== 'zombie' && z.etype !== 'runner' && z.etype !== 'tank') continue;
    const d = Math.hypot(z.x - screamer.x, z.z - screamer.z);
    if (d <= RADIUS) {
      // Despertar y empujar hacia el player (override de aggro): teleport
      // virtual de su "objetivo" actual seteando temporal aggro grande.
      z.sleeping = false;
      z._aggroBoostUntil = Date.now() + 8000;
      n++;
    }
  }
  broadcast({ type: 'banner', text: '✦ GRITO DEL SCREAMER — horda alertada' });
  broadcast({ type: 'eShoot', id: screamer.id, tx: nearestPlayer.x, ty: nearestPlayer.y, tz: nearestPlayer.z });
}

// =====================================================================
// Snapshot tick — compact arrays at 10 Hz.
// =====================================================================
setInterval(() => {
  // Compact enemy list: [id, x, y, z, ry, hp, sleeping]
  const z = [];
  for (const e of enemies.values()) {
    z.push([e.id, +e.x.toFixed(2), +e.y.toFixed(2), +e.z.toFixed(2), +e.ry.toFixed(2), e.hp, e.sleeping ? 1 : 0]);
  }
  const ps = [];
  for (const p of players.values()) {
    ps.push([p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2), p.hp]);
  }
  broadcast({ type: 'snapshot', z, p: ps });
}, 100);

// =====================================================================
// WebSocket — one connection per player.
// =====================================================================
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  const id = nextPlayerId++;
  const player = { id, ws, x: 0, y: heightAt(0, 0), z: 0, ry: 0, hp: 100, name: `P${id}` };
  players.set(id, player);
  console.log(`[+] player ${id} connected. total=${players.size}`);

  ws.send(JSON.stringify({
    type: 'welcome',
    you: id,
    seed: WORLD_SEED,
    worldHalf: WORLD_HALF,
    hour: +gameHour.toFixed(2),
    night: isNightHour(gameHour),
    day: gameDay,
    diffMul: +difficultyMul().toFixed(2),
    weather: currentWeather,
    peers: [...players.values()].filter(p => p.id !== id).map(pPub),
    enemies: [...enemies.values()].map(ePub),
    towns: TOWNS.map(t => ({
      id: t.id, cx: t.cx, cz: t.cz, type: t.type, label: t.label,
      buildings: t.buildings.map(b => ({ dx: b.dx, dz: b.dz, w: b.w, h: b.h, ry: b.ry })),
    })),
    crates: [...crates.values()].filter(c => !c.taken).map(cPub),
    pois: POIS.map(p => ({ id: p.id, kind: p.kind, cx: p.cx, cz: p.cz, ry: p.ry || 0 })),
  }));
  broadcast({ type: 'peerJoin', p: pPub(player) }, id);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'pos') {
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return;
      if (Math.abs(msg.x) > WORLD_HALF + 5 || Math.abs(msg.z) > WORLD_HALF + 5) return;
      player.x = msg.x; player.y = msg.y; player.z = msg.z;
      player.ry = Number.isFinite(msg.ry) ? msg.ry : 0;
    } else if (msg.type === 'shoot') {
      broadcast({ type: 'fire', from: id, x: msg.x, y: msg.y, z: msg.z, dx: msg.dx, dy: msg.dy, dz: msg.dz });
      // Sigilo: si NO está silenciado, despierta zombies cercanos al
      // jugador y bumpea su aggro temporalmente.
      if (!msg.silenced) {
        for (const z of enemies.values()) {
          if (z.isBoss || z.etype === 'deer' || z.etype === 'rabbit') continue;
          const d = Math.hypot(z.x - player.x, z.z - player.z);
          if (d < 35) {
            z.sleeping = false;
            z._aggroBoostUntil = Date.now() + 6000;
          }
        }
      }
      if (msg.hitId != null) {
        const e = enemies.get(msg.hitId);
        if (e && e.hp > 0) {
          e.hp -= msg.dmg | 0;
          // If shot wakes a sleeping enemy, flip the flag.
          if (e.sleeping) {
            e.sleeping = false;
            broadcast({ type: 'eWake', id: e.id });
          }
          // Incendiary: marca burn DoT 5s.
          if (msg.incendiary) {
            e._burnUntil = Date.now() + 5000;
            e._burnNextTick = Date.now() + 500;
          }
          broadcast({ type: 'eHit', id: e.id, hp: Math.max(0, e.hp) });
          if (e.hp <= 0) killEnemy(e, id);
        }
      }
    } else if (msg.type === 'respawn') {
      player.hp = 100;
      // Bedroll: cliente puede mandar (x, z) custom. Validamos rango y
      // que no esté dentro de mundo prohibido.
      let sx = 0, sz = 0;
      if (Number.isFinite(msg.x) && Number.isFinite(msg.z) &&
          Math.abs(msg.x) < WORLD_HALF - 5 && Math.abs(msg.z) < WORLD_HALF - 5) {
        sx = msg.x; sz = msg.z;
      } else if (Number.isFinite(player.spawnX) && Number.isFinite(player.spawnZ)) {
        sx = player.spawnX; sz = player.spawnZ;
      }
      player.x = sx; player.z = sz;
      player.y = heightAt(sx, sz);
      sendTo(player, { type: 'respawned', x: player.x, y: player.y, z: player.z });
    } else if (msg.type === 'setSpawn') {
      if (Number.isFinite(msg.x) && Number.isFinite(msg.z)) {
        player.spawnX = msg.x;
        player.spawnZ = msg.z;
      }
    } else if (msg.type === 'smokeArea') {
      // Cliente registró un área de humo. Validamos y la guardamos para
      // que los enemigos pierdan target ahí.
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return;
      const r = Math.min(8, Math.max(1, +msg.r || 6));
      const dur = Math.min(15000, Math.max(1000, +msg.dur || 9000));
      smokeAreas.push({ x: msg.x, z: msg.z, r, until: Date.now() + dur });
    } else if (msg.type === 'pvpToggle') {
      player.pvp = !player.pvp;
      sendTo(player, { type: 'pvpStatus', on: !!player.pvp });
      broadcast({ type: 'peerPvp', id, on: !!player.pvp });
    } else if (msg.type === 'pvpAttack') {
      // Player atacando a otro player. Solo procede si AMBOS tienen PvP on.
      const target = players.get(msg.targetId);
      if (!target || target.hp <= 0) return;
      if (!player.pvp || !target.pvp) return;
      const d = Math.hypot(target.x - player.x, target.z - player.z);
      if (d > 100) return;  // anti-cheat range
      const dmg = Math.max(1, msg.dmg | 0);
      target.hp = Math.max(0, target.hp - dmg);
      sendTo(target, { type: 'youHit', dmg, by: id, sx: player.x, sy: player.y, sz: player.z, source: 'player' });
    } else if (msg.type === 'flashbang') {
      // Detonación de flashbang en (x, z). Stunea enemigos cercanos 3s
      // y broadcast a todos para que clientes cerca apliquen white-out.
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return;
      const FLASH_R = 14;
      const FLASH_DUR = 3000;
      const until = Date.now() + FLASH_DUR;
      for (const e of enemies.values()) {
        if (e.isBoss) continue;
        const d = Math.hypot(e.x - msg.x, e.z - msg.z);
        if (d <= FLASH_R) e._stunnedUntil = until;
      }
      broadcast({ type: 'flashbang', x: msg.x, z: msg.z, dur: FLASH_DUR });
    } else if (msg.type === 'name') {
      const name = String(msg.name || '').slice(0, 14).replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || `P${id}`;
      player.name = name;
      broadcast({ type: 'peerName', id, name });
    } else if (msg.type === 'chat') {
      const text = String(msg.text || '').slice(0, 140);
      if (text) broadcast({ type: 'chat', id, name: player.name, text });
    } else if (msg.type === 'grenade') {
      // Client throws a grenade. Server tracks position + timer + radius
      // damage at detonation, broadcasts spawn for visualization.
      const gid = nextGrenadeId++;
      const g = {
        id: gid, ownerId: id,
        x: player.x, y: player.y + 1.0, z: player.z,
        vx: msg.dx * 16, vy: msg.dy * 16 + 4, vz: msg.dz * 16,
        fuse: 2.4,
      };
      grenades.set(gid, g);
      broadcast({ type: 'grenadeSpawn', g: { id: gid, x: g.x, y: g.y, z: g.z, vx: g.vx, vy: g.vy, vz: g.vz, fuse: g.fuse } });
    } else if (msg.type === 'openCrate') {
      // Player wants to open crate `id`. We accept if it exists, isn't
      // taken yet, and the player is reasonably close (within 3.5 m of
      // the crate position). Anti-cheat is best-effort, not strict.
      const c = crates.get(msg.id);
      if (!c || c.taken) return;
      const dx = player.x - c.x, dz = player.z - c.z;
      if (dx * dx + dz * dz > 5 * 5) return;
      c.taken = true;
      const loot = rollLoot(c.tableKey);
      sendTo(player, { type: 'lootGranted', crateId: c.id, loot });
      broadcast({ type: 'crateTaken', id: c.id, by: id });
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast({ type: 'peerLeave', id });
    console.log(`[-] player ${id} disconnected. total=${players.size}`);
  });
});

function broadcast(message, exceptId = null) {
  const json = JSON.stringify(message);
  for (const p of players.values()) {
    if (p.id === exceptId) continue;
    if (p.ws.readyState === 1) p.ws.send(json);
  }
}
function sendTo(player, message) {
  if (player.ws.readyState === 1) player.ws.send(JSON.stringify(message));
}

httpServer.listen(PORT, () => {
  console.log(`Survival FPS v1.1 listening on http://0.0.0.0:${PORT}`);
  console.log(`  open:  http://localhost:${PORT}/`);
  console.log(`  ws:    ws://localhost:${PORT}/ws`);
});
