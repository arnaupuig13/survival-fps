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
export const WORLD_HALF = 200; // 400x400 m playable

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263 + WORLD_SEED * 982451653) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function heightAt(x, z) {
  function octave(scale, amp) {
    const sx = x / scale, sz = z / scale;
    const x0 = Math.floor(sx), z0 = Math.floor(sz);
    const fx = sx - x0,        fz = sz - z0;
    const a = hash(x0,     z0);
    const b = hash(x0 + 1, z0);
    const c = hash(x0,     z0 + 1);
    const d = hash(x0 + 1, z0 + 1);
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    return (a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v) * amp;
  }
  return octave(28, 2.4) + octave(7, 0.6) - 1.5;
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
  // Three scientist variants. Same lab coat but different weapon profile.
  scientist:    { hp: 18,  speed: 1.4, dmg: 6,  range: 30,  cd: 1.0, aggro: 40, ranged: true,  weapon: 'rifle'   },
  sci_shotgun:  { hp: 26,  speed: 1.3, dmg: 22, range: 12,  cd: 1.5, aggro: 30, ranged: true,  weapon: 'shotgun' },
  sci_sniper:   { hp: 16,  speed: 1.0, dmg: 32, range: 60,  cd: 2.4, aggro: 60, ranged: true,  weapon: 'sniper'  },
  boss:         { hp: 240, speed: 1.7, dmg: 16, range: 32,  cd: 0.55, aggro: 50, ranged: true, weapon: 'ak', isBoss: true },
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
  // Deterministic PRNG so all clients agree on the layout.
  let s = seed;
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const buildings = [];
  // Grid jitter: place on a 12 m grid then jitter ±2 m per axis.
  const cols = Math.ceil(Math.sqrt(count));
  const cell = 12;
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = (col - (cols - 1) / 2) * cell + (rng() - 0.5) * 4;
    const oz = (row - (cols - 1) / 2) * cell + (rng() - 0.5) * 4;
    const w = 5.5 + rng() * 2.5;
    const h = 5.5 + rng() * 2.5;
    const ry = (rng() < 0.25) ? Math.PI / 2 : 0;
    buildings.push({ dx: ox, dz: oz, w, h, ry });
  }
  return buildings;
}

const TOWNS = [
  // Four regular towns scattered around the map. Each has 6 buildings with
  // a sleeping zombie inside. Loot crate inside one random building per town.
  { id: 'westhaven', cx: -150, cz:  140, type: 'town', buildings: genTownBuildings(-150,  140, 6, 11), label: 'Westhaven' },
  { id: 'eastfield', cx:  155, cz:  150, type: 'town', buildings: genTownBuildings( 155,  150, 6, 22), label: 'Eastfield' },
  { id: 'pinecreek', cx: -160, cz: -130, type: 'town', buildings: genTownBuildings(-160, -130, 6, 33), label: 'Pinecreek' },
  { id: 'southridge', cx:  140, cz: -160, type: 'town', buildings: genTownBuildings( 140, -160, 6, 44), label: 'Southridge' },
  // The science city — bigger, in the middle-but-offset, with scientists
  // protecting valuable loot. Boss spawns when 50%+ scientists are dead.
  { id: 'helix-lab', cx:  0,   cz: -90,  type: 'city', buildings: genTownBuildings(  0,  -90, 12, 77), label: 'Helix Lab' },
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
// Loot tables — what kinds of items each crate type drops. Counts are
// [min, max] inclusive; rolled per-item when the crate is opened.
// Items the client knows: bullet_p (pistol), bullet_r (rifle), bandage,
// rifle_pickup (unlocks the rifle weapon).
// =====================================================================
const LOOT_TABLES = {
  town: [
    { item: 'bullet_p', range: [5, 10] },
    { item: 'bullet_r', range: [0, 4] },
    { item: 'bandage',  range: [0, 1] },
  ],
  city: [
    { item: 'bullet_p',    range: [8, 14] },
    { item: 'bullet_r',    range: [6, 12] },
    { item: 'bandage',     range: [1, 3] },
    { item: 'rifle_pickup', chance: 0.45 }, // ~45% per city crate
  ],
  boss: [
    { item: 'bullet_r', range: [25, 40] },
    { item: 'bullet_p', range: [15, 25] },
    { item: 'bandage',  range: [3, 6] },
    { item: 'rifle_pickup', chance: 1 },
  ],
  // Animal kill — small heal pickup, no ammo.
  animal: [
    { item: 'bandage', range: [1, 1] },
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
// World state — players, enemies, crates. Authoritative.
// =====================================================================
const players = new Map();   // id → player
const enemies = new Map();   // id → enemy
const crates = new Map();    // id → { id, x, z, townType, taken }
let nextPlayerId = 1;
let nextEnemyId = 1;
let nextCrateId = 1;

// Build crates at boot — one inside every building of every town. The
// crate's table key matches the town type ('town' or 'city'), so cities
// drop more loot.
function spawnTownCrates() {
  for (const t of TOWNS) {
    for (const b of t.buildings) {
      const id = nextCrateId++;
      crates.set(id, {
        id, x: b.wx, z: b.wz,
        y: heightAt(b.wx, b.wz),
        tableKey: t.type, // 'town' or 'city'
        townId: t.id,
        taken: false,
      });
    }
  }
}
spawnTownCrates();

// Per-town streaming state.
const townState = new Map(); // townId → { spawned, enemyIds: Set, scientistsDead, bossSpawned }
for (const t of TOWNS) {
  townState.set(t.id, { spawned: false, enemyIds: new Set(), scientistsDead: 0, bossSpawned: false });
}

const STREAM_RADIUS = 150;   // m — spawn town when any player closer
const DESPAWN_RADIUS = 260;  // m — despawn town when ALL players farther
const WAKE_RADIUS = 12;      // m — sleeping zombie wakes when player approaches

const MAX_AMBIENT_ZOMBIES = 18; // cap on the random-spawn zombies (not town-bound)
const AMBIENT_SPAWN_INTERVAL = 7.0;

function makeEnemy(opts) {
  const cfg = ETYPES[opts.etype] || ETYPES.zombie;
  const id = nextEnemyId++;
  const e = {
    id,
    etype: opts.etype || 'zombie',
    x: opts.x, z: opts.z, y: heightAt(opts.x, opts.z),
    ry: opts.ry ?? Math.random() * Math.PI * 2,
    hp: cfg.hp,
    maxHp: cfg.hp,
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
function streamTowns() {
  for (const t of TOWNS) {
    const ts = townState.get(t.id);
    // Find nearest player to this town.
    let nearestD = Infinity;
    for (const p of players.values()) {
      const dx = p.x - t.cx, dz = p.z - t.cz;
      const d = Math.hypot(dx, dz);
      if (d < nearestD) nearestD = d;
    }

    if (!ts.spawned && nearestD < STREAM_RADIUS) {
      // Spawn one sleeping enemy per building. Town type picks variant.
      ts.spawned = true;
      for (let i = 0; i < t.buildings.length; i++) {
        const b = t.buildings[i];
        let etype;
        if (t.type === 'city') {
          // Helix Lab — mix of three scientist variants. Distribution
          // chosen so the city feels different per visit and you have
          // to engage at different ranges. Bias toward rifle (most
          // standard), some shotgun guards and a couple snipers.
          const r = (i * 23 + 5) % 12;
          if (r < 7)       etype = 'scientist';      // 7/12 rifle
          else if (r < 10) etype = 'sci_shotgun';   // 3/12 shotgun
          else             etype = 'sci_sniper';    // 2/12 sniper
        } else {
          // Towns: mostly zombies, sprinkle of runner / tank.
          const r = (i * 17 + 3) % 10;
          if (r < 7) etype = 'zombie';
          else if (r < 9) etype = 'runner';
          else etype = 'tank';
        }
        const e = makeEnemy({
          etype, x: b.wx, z: b.wz,
          sleeping: t.type === 'town', // city scientists are awake patrolling
          townId: t.id,
        });
        ts.enemyIds.add(e.id);
        broadcast({ type: 'eSpawn', e: ePub(e) });
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
    // Mix per night/day. By day mostly zombies, sprinkle of others. At
    // night wolves and runners get more common — predators come out.
    const isNight = isNightHour(gameHour);
    let etype = 'zombie';
    const r2 = Math.random();
    if (isNight) {
      if (r2 > 0.85)      etype = 'tank';
      else if (r2 > 0.60) etype = 'wolf';
      else if (r2 > 0.35) etype = 'runner';
      else                etype = 'zombie';
    } else {
      if (r2 > 0.93)      etype = 'tank';
      else if (r2 > 0.85) etype = 'wolf';
      else if (r2 > 0.78) etype = 'runner';
      else                etype = 'zombie';
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

// =====================================================================
// Day / night cycle. The game hour wraps every DAY_LENGTH seconds. Night
// hours are 20..6 inclusive (10 hours of darkness, 14 of light).
// Broadcast hour to clients via a low-frequency message; clients drive
// the visual sun rotation off it.
// =====================================================================
const DAY_LENGTH = 360;          // seconds per in-game day
const NIGHT_FROM = 20, NIGHT_TO = 6;
let gameHour = 8;                // start in the morning
function isNightHour(h) {
  if (NIGHT_FROM > NIGHT_TO) return h >= NIGHT_FROM || h < NIGHT_TO;
  return h >= NIGHT_FROM && h < NIGHT_TO;
}
let lastTimeBroadcast = 0;

// =====================================================================
// AI tick — runs at 10 Hz. Dispatches per behavior (sleeping → wake,
// melee chase, ranged shooter, boss).
// =====================================================================
const AI_HZ = 10;
const AI_DT = 1 / AI_HZ;
let ambientSpawnAccum = 0;
let streamCheckAccum = 0;

setInterval(() => {
  // Advance day/night clock. 1 tick = 0.1 s real → DAY_LENGTH s = full day.
  gameHour = (gameHour + (24 / DAY_LENGTH) * AI_DT) % 24;

  // Broadcast hour every ~1 s (clients lerp).
  lastTimeBroadcast += AI_DT;
  if (lastTimeBroadcast >= 1) {
    lastTimeBroadcast = 0;
    broadcast({ type: 'time', h: +gameHour.toFixed(2), night: isNightHour(gameHour) });
  }

  // Town streaming check — every 0.8 s, not every tick.
  streamCheckAccum += AI_DT;
  if (streamCheckAccum >= 0.8) {
    streamCheckAccum = 0;
    streamTowns();
  }

  // Ambient (out-of-town) spawn ticker. At night spawn faster + cap higher.
  const night = isNightHour(gameHour);
  const spawnInterval = night ? AMBIENT_SPAWN_INTERVAL * 0.55 : AMBIENT_SPAWN_INTERVAL;
  const cap = night ? MAX_AMBIENT_ZOMBIES + 8 : MAX_AMBIENT_ZOMBIES;
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

  // Per-enemy AI.
  for (const e of enemies.values()) {
    if (e.attackCd > 0) e.attackCd -= AI_DT;
    const cfg = ETYPES[e.etype] || ETYPES.zombie;

    // Find nearest alive player.
    let nearest = null, nd2 = Infinity;
    for (const p of players.values()) {
      if (p.hp <= 0) continue;
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

    if (d > cfg.aggro) continue;

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
        nearest.hp = Math.max(0, nearest.hp - cfg.dmg);
        sendTo(nearest, { type: 'youHit', dmg: cfg.dmg, by: e.id, sx: e.x, sy: e.y, sz: e.z, source: e.etype });
        broadcast({ type: 'eShoot', id: e.id, tx: nearest.x, ty: nearest.y, tz: nearest.z });
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
        nearest.hp = Math.max(0, nearest.hp - cfg.dmg);
        sendTo(nearest, { type: 'youHit', dmg: cfg.dmg, by: e.id, sx: e.x, sy: e.y, sz: e.z, source: e.etype });
        broadcast({ type: 'eAttack', id: e.id });
      }
    }
  }
}, 1000 / AI_HZ);

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
    peers: [...players.values()].filter(p => p.id !== id).map(pPub),
    enemies: [...enemies.values()].map(ePub),
    towns: TOWNS.map(t => ({
      id: t.id, cx: t.cx, cz: t.cz, type: t.type, label: t.label,
      buildings: t.buildings.map(b => ({ dx: b.dx, dz: b.dz, w: b.w, h: b.h, ry: b.ry })),
    })),
    crates: [...crates.values()].filter(c => !c.taken).map(cPub),
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
      if (msg.hitId != null) {
        const e = enemies.get(msg.hitId);
        if (e && e.hp > 0) {
          e.hp -= msg.dmg | 0;
          // If shot wakes a sleeping enemy, flip the flag.
          if (e.sleeping) {
            e.sleeping = false;
            broadcast({ type: 'eWake', id: e.id });
          }
          broadcast({ type: 'eHit', id: e.id, hp: Math.max(0, e.hp) });
          if (e.hp <= 0) killEnemy(e, id);
        }
      }
    } else if (msg.type === 'respawn') {
      player.hp = 100;
      player.x = 0; player.z = 0;
      player.y = heightAt(0, 0);
      sendTo(player, { type: 'respawned', x: player.x, y: player.y, z: player.z });
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
