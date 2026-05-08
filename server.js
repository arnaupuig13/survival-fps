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
// v1.3 — mapa 4x más grande (era 800x800, ahora 1600x1600).
// Más pueblos, carreteras amarillas conectándolos, Helix Lab mega-rework.
export const WORLD_HALF = 800; // 1600x1600 m playable

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
// v1.3: 10 pueblos repartidos por el mapa 1600x1600 + Helix Lab mega-grande.
const TOWN_FLAT = [
  // === 10 PUEBLOS ===
  { cx: -600, cz:  560, r: 65, transition: 25 },     // Westhaven NW
  { cx:  620, cz:  600, r: 65, transition: 25 },     // Eastfield NE
  { cx: -640, cz: -520, r: 65, transition: 25 },     // Pinecreek SW
  { cx:  560, cz: -640, r: 65, transition: 25 },     // Southridge SE
  { cx: -300, cz:  640, r: 60, transition: 22 },     // Northgate
  { cx:  300, cz: -680, r: 60, transition: 22 },     // Sandwell
  { cx: -700, cz:  100, r: 60, transition: 22 },     // Westmark
  { cx:  720, cz:  -80, r: 60, transition: 22 },     // Eastmark
  { cx:  100, cz:  680, r: 60, transition: 22 },     // Snowhold
  { cx: -180, cz: -700, r: 60, transition: 22 },     // Burntpoint
  // === HELIX LAB — mega ciudad central ===
  // 144 edificios x 17m cell = 204m span → ±102m. Necesitamos r >= 120
  // para que los edificios queden flat + margen para el muro.
  { cx:    0, cz: -200, r: 240, transition: 60 },
  // Bunkers
  { cx:  300, cz:    0, r: 14, transition: 8 },
  { cx: -480, cz:  480, r: 14, transition: 8 },
  { cx:  200, cz: -520, r: 14, transition: 8 },
  { cx:  480, cz:  300, r: 14, transition: 8 },
  { cx: -300, cz: -380, r: 14, transition: 8 },
  // Helicópteros — repartidos por el mapa expandido
  { cx: -320, cz:  240, r: 10, transition: 6 },
  { cx:  320, cz:  280, r: 10, transition: 6 },
  { cx: -160, cz:   40, r: 10, transition: 6 },
  { cx:  440, cz: -200, r: 10, transition: 6 },
  { cx: -400, cz: -100, r: 10, transition: 6 },
  { cx:  100, cz:  440, r: 10, transition: 6 },
  { cx: -100, cz: -440, r: 10, transition: 6 },
  // Gas stations
  { cx: -360, cz: -160, r: 9, transition: 6 },
  { cx:  400, cz: -120, r: 9, transition: 6 },
  { cx:    0, cz:  500, r: 9, transition: 6 },
  { cx: -700, cz:    0, r: 9, transition: 6 },
  { cx:  700, cz:  400, r: 9, transition: 6 },
  // Cabins
  { cx:  240, cz:  400, r: 8, transition: 5 },
  { cx: -400, cz:  360, r: 8, transition: 5 },
  { cx:  120, cz: -200, r: 8, transition: 5 },
  { cx: -160, cz: -200, r: 8, transition: 5 },
  { cx:  440, cz:  360, r: 8, transition: 5 },
  { cx: -520, cz:  200, r: 8, transition: 5 },
  { cx:  680, cz:   80, r: 8, transition: 5 },
  { cx: -200, cz:  680, r: 8, transition: 5 },
  // Cuevas
  { cx: -520, cz:  680, r: 12, transition: 7 },
  { cx:  560, cz:  520, r: 12, transition: 7 },
  { cx:  680, cz: -400, r: 12, transition: 7 },
  { cx: -520, cz: -680, r: 12, transition: 7 },
];

// =====================================================================
// ROADS — caminos amarillos antiguos que conectan pueblos entre sí y
// llevan a Helix Lab. Cada road es un segmento recto. El cliente los
// renderiza como tiras amarillas sobre el terreno. El server spawnea
// crates de "road tier" cada ~70m con loot bajo (balas, basura).
// =====================================================================
export const ROADS = [
  // Anillo exterior: conecta los 4 pueblos de las esquinas
  { x1: -600, z1:  560, x2: -300, z2:  640 },  // Westhaven → Northgate
  { x1: -300, z1:  640, x2:  100, z2:  680 },  // Northgate → Snowhold
  { x1:  100, z1:  680, x2:  620, z2:  600 },  // Snowhold → Eastfield
  { x1:  620, z1:  600, x2:  720, z2:  -80 },  // Eastfield → Eastmark
  { x1:  720, z1:  -80, x2:  560, z2: -640 },  // Eastmark → Southridge
  { x1:  560, z1: -640, x2:  300, z2: -680 },  // Southridge → Sandwell
  { x1:  300, z1: -680, x2: -180, z2: -700 },  // Sandwell → Burntpoint
  { x1: -180, z1: -700, x2: -640, z2: -520 },  // Burntpoint → Pinecreek
  { x1: -640, z1: -520, x2: -700, z2:  100 },  // Pinecreek → Westmark
  { x1: -700, z1:  100, x2: -600, z2:  560 },  // Westmark → Westhaven
  // Caminos radiales hacia Helix Lab (centro del mapa)
  { x1: -300, z1:  640, x2:    0, z2: -200 },  // Northgate → Helix
  { x1:  100, z1:  680, x2:    0, z2: -200 },  // Snowhold → Helix
  { x1:  720, z1:  -80, x2:    0, z2: -200 },  // Eastmark → Helix
  { x1:  300, z1: -680, x2:    0, z2: -200 },  // Sandwell → Helix
  { x1: -180, z1: -700, x2:    0, z2: -200 },  // Burntpoint → Helix
  { x1: -700, z1:  100, x2:    0, z2: -200 },  // Westmark → Helix
];

// =====================================================================
// BIOMAS — el mapa se divide en 4 cuadrantes:
//   NW (-x, +z): bosque (verde, primaveral)
//   NE (+x, +z): nieve (blanco, frío)
//   SE (+x, -z): desierto (amarillo, calor)
//   SW (-x, -z): bosque quemado (gris/negro, zombies más fuertes)
// IMPORTANT: client/world.js debe usar este código byte-identical.
// =====================================================================
export function biomeAt(x, z) {
  if (x >= 0 && z >= 0)  return 'snow';
  if (x <  0 && z >= 0)  return 'forest';
  if (x >= 0 && z <  0)  return 'desert';
  return 'burnt';
}

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
  // Bilebomber — zombi del bosque quemado. Dispara una bola verde a
  // distancia (proyectil ácido). Daño moderado pero hace DoT. Solo
  // spawnea en el bioma 'burnt'.
  bilebomber:   { hp: 50, speed: 1.6, dmg: 14, range: 22, cd: 2.0, aggro: 38, ranged: true, weapon: 'bile', special: 'bile' },
  // Three scientist variants. Same lab coat but different weapon profile.
  // Aggro subido para que detecten al player desde más lejos en el mapa
  // grande (era 30-60, ahora 60-90).
  // Cientificos AGRESIVOS — usuario reportó "cientificos siguen sin
  // matarme" porque solo los snipers (range 50) llegaban al player y
  // pegaban 14 cada 2.4s. Bumpeo todos los rangos+dmg para que entrar
  // a Helix Lab sea letal de verdad.
  scientist:    { hp: 18,  speed: 1.4, dmg: 10, range: 45,  cd: 0.8, aggro: 100, ranged: true,  weapon: 'rifle'   },
  sci_shotgun:  { hp: 26,  speed: 1.3, dmg: 25, range: 18,  cd: 1.2, aggro: 70,  ranged: true,  weapon: 'shotgun' },
  sci_sniper:   { hp: 16,  speed: 1.0, dmg: 22, range: 80,  cd: 1.6, aggro: 120, ranged: true,  weapon: 'sniper'  },
  // === ELITES — 4 guardias del boss en la torre central. Cada uno con
  //     un arma distinta. Mucho más HP que un cientifico normal pero
  //     no tanto como el boss. Aggro enorme: te detectan en cuanto
  //     entrás a la torre y nunca te pierden. ===
  sci_elite_rifle:   { hp: 110, speed: 1.5, dmg: 12, range: 40,  cd: 0.6, aggro: 200, ranged: true,  weapon: 'rifle',   special: 'elite' },
  sci_elite_shotgun: { hp: 130, speed: 1.4, dmg: 30, range: 14,  cd: 1.2, aggro: 200, ranged: true,  weapon: 'shotgun', special: 'elite' },
  sci_elite_sniper:  { hp:  90, speed: 1.2, dmg: 50, range: 80,  cd: 1.8, aggro: 250, ranged: true,  weapon: 'sniper',  special: 'elite' },
  sci_elite_ak:      { hp: 140, speed: 1.6, dmg: 18, range: 35,  cd: 0.18,aggro: 200, ranged: true,  weapon: 'ak',      special: 'elite' },
  // Boss — extremadamente fuerte, mucha vida. Aggro 250 = te ve desde
  // cualquier parte del tower. Drops nuke gun directamente.
  boss:         { hp: 1200, speed: 1.8, dmg: 30, range: 35,  cd: 0.40, aggro: 250, ranged: true, weapon: 'ak', isBoss: true },
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
  const isCity = count >= 80;
  // CELL — calles entre edificios. Bumpeado porque los edificios son
  // ahora más anchos (towns 9-12m, cities 12-16m) para tener habitaciones
  // internas. Antes con cell=11 y bldgs 12-16 los edificios overlap.
  //   towns: 14m (edificios ~10m → 4m de calle)
  //   cities: 17m (edificios ~14m → 3m de calle)
  const cell = isCity ? 17 : 14;
  const cols = Math.ceil(Math.sqrt(count));
  // 1 comisaría + 1 hospital obligatorios por town (no en city).
  const policeIdx = isCity ? -1 : 0;
  const hospitalIdx = isCity ? -1 : 1;
  // En city marcamos:
  //   - boss_tower en el CENTRO (índice central): torre de 3 plantas gigante
  //   - high_loot: 8 bloques con cofres premium custodiados
  //   - ruined: ~20% restantes con fachada rota
  const centerIdx = isCity ? Math.floor(cols / 2) * cols + Math.floor(cols / 2) : -1;
  const highLootIndices = isCity ? new Set([18, 32, 47, 65, 82, 98, 115, 130]) : new Set();
  // "Calles internas" — cada 4 filas y cada 4 columnas se deja un gap más
  // ancho entre celdas para simular avenidas dentro de la ciudad.
  function isStreetRow(row) { return isCity && row > 0 && row % 4 === 0; }
  function isStreetCol(col) { return isCity && col > 0 && col % 4 === 0; }
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Calle ancha cada 4 filas/cols → desplaza la posición lateralmente
    // para crear espacios visibles entre manzanas.
    const streetGap = 3;       // metros extra de calle
    const streetXOff = streetGap * (col >= cols / 2 ? Math.floor(col / 4) : -Math.floor((cols - col - 1) / 4));
    const streetZOff = streetGap * (row >= cols / 2 ? Math.floor(row / 4) : -Math.floor((cols - row - 1) / 4));
    const ox = (col - (cols - 1) / 2) * cell + streetXOff + (rng() - 0.5) * 1;
    const oz = (row - (cols - 1) / 2) * cell + streetZOff + (rng() - 0.5) * 1;
    let kind = 'normal';
    let floors = 1;
    let w, h;
    if (i === policeIdx) {
      kind = 'police';
      w = 8.5; h = 7.5; floors = 1;
    } else if (i === hospitalIdx) {
      kind = 'hospital';
      w = 9; h = 8.5; floors = 2;
    } else if (isCity && i === centerIdx) {
      // BOSS TOWER — edificio gigante de 3 plantas (cada planta = 5 pisos
      // visualmente, total 15 pisos = 45m de altura). Custodia al boss
      // y 4 elites. Footprint 24×24m para que lea dominante.
      kind = 'boss_tower';
      w = 24; h = 24; floors = 15;
    } else if (isCity) {
      // Helix Lab — skyline tipo ciudad real. Distribución muy variada
      // con rascacielos altos para que se vea desde lejos.
      const r = rng();
      if      (r > 0.85) floors = 12 + Math.floor(rng() * 8);    // 12-19 rascacielos (15%)
      else if (r > 0.65) floors = 7  + Math.floor(rng() * 5);    // 7-11 torres (20%)
      else if (r > 0.45) floors = 4  + Math.floor(rng() * 3);    // 4-6 pisos (20%)
      else if (r > 0.20) floors = 2  + Math.floor(rng() * 2);    // 2-3 pisos (25%)
      else               floors = 1;                              // 1 piso (20%)
      // Edificios MUCHO más anchos (12-16m) para meter habitaciones
      // dentro tipo flat/oficina. Antes 8-11m → vacíos.
      w = 12 + rng() * 4;
      h = 12 + rng() * 4;
      if (highLootIndices.has(i)) {
        kind = 'high_loot';
      } else if (rng() < 0.20) {
        kind = 'ruined';
      }
    } else {
      // Towns regulares — skyline más bajo pero con torres ocasionales.
      // 20% 1, 35% 2-3, 25% 4-6, 20% 7-12 (¡torres altas!) para que se
      // vean desde lejos como una ciudad de verdad.
      const r = rng();
      if      (r > 0.80) floors = 7 + Math.floor(rng() * 6);    // 7-12 torre (20%)
      else if (r > 0.55) floors = 4 + Math.floor(rng() * 3);    // 4-6 (25%)
      else if (r > 0.20) floors = 2 + Math.floor(rng() * 2);    // 2-3 (35%)
      else               floors = 1;                             // 1 piso (20%)
      // Edificios más anchos (9-12m) para que tengan habitaciones
      // adentro. Antes 6-8m era demasiado chico.
      w = 9 + rng() * 3;
      h = 9 + rng() * 3;
    }
    buildings.push({ dx: ox, dz: oz, w, h, ry: 0, floors, kind });
  }
  return buildings;
}

const TOWNS = [
  // === 10 PUEBLOS — 18 edificios c/u con torres altas para skyline real ===
  { id: 'westhaven',  cx: -600, cz:  560, type: 'town', buildings: genTownBuildings(-600,  560, 18, 11), label: 'Westhaven' },
  { id: 'eastfield',  cx:  620, cz:  600, type: 'town', buildings: genTownBuildings( 620,  600, 18, 22), label: 'Eastfield' },
  { id: 'pinecreek',  cx: -640, cz: -520, type: 'town', buildings: genTownBuildings(-640, -520, 18, 33), label: 'Pinecreek' },
  { id: 'southridge', cx:  560, cz: -640, type: 'town', buildings: genTownBuildings( 560, -640, 18, 44), label: 'Southridge' },
  { id: 'northgate',  cx: -300, cz:  640, type: 'town', buildings: genTownBuildings(-300,  640, 18, 55), label: 'Northgate' },
  { id: 'sandwell',   cx:  300, cz: -680, type: 'town', buildings: genTownBuildings( 300, -680, 18, 66), label: 'Sandwell' },
  { id: 'westmark',   cx: -700, cz:  100, type: 'town', buildings: genTownBuildings(-700,  100, 18, 88), label: 'Westmark' },
  { id: 'eastmark',   cx:  720, cz:  -80, type: 'town', buildings: genTownBuildings( 720,  -80, 18, 99), label: 'Eastmark' },
  { id: 'snowhold',   cx:  100, cz:  680, type: 'town', buildings: genTownBuildings( 100,  680, 18,123), label: 'Snowhold' },
  { id: 'burntpoint', cx: -180, cz: -700, type: 'town', buildings: genTownBuildings(-180, -700, 18,145), label: 'Burntpoint' },
  // === HELIX LAB — mega ciudad con boss tower central ===
  // 144 edificios (12x12 grid + boss tower al centro), ~135m de span,
  // skyline con rascacielos 12-19 pisos visibles desde lejos.
  { id: 'helix-lab',  cx:    0, cz: -200, type: 'city', buildings: genTownBuildings(    0, -200, 144, 77), label: 'Helix Lab' },
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
  // CUEVAS — entradas rocosas con sala interior. Boss-tier loot custodiado
  // por 2-3 zombies dormidos. 1 cueva por bioma.
  { id: 'cave-forest', kind: 'cave', cx: -260, cz:  340, ry: 0 },
  { id: 'cave-snow',   kind: 'cave', cx:  280, cz:  260, ry: Math.PI / 4 },
  { id: 'cave-desert', kind: 'cave', cx:  340, cz: -200, ry: -Math.PI / 4 },
  { id: 'cave-burnt',  kind: 'cave', cx: -260, cz: -340, ry: Math.PI },
];

const POI_GUARDS = {
  helicopter: ['scientist', 'sci_shotgun', 'scientist'],
  gas:        ['zombie', 'runner', 'zombie'],
  cabin:      ['zombie', 'zombie'],
  bunker:     ['scientist', 'sci_shotgun', 'sci_sniper', 'scientist'],
  cave:       ['zombie', 'tank', 'zombie'],          // 3 dormidos
};
const POI_CRATES = {
  helicopter: { count: 3, tier: 'military' },
  gas:        { count: 2, tier: 'town' },
  cabin:      { count: 2, tier: 'town' },
  bunker:     { count: 3, tier: 'boss' },
  cave:       { count: 2, tier: 'boss' },            // 2 boss-tier
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
    { item: 'cloth',        range: [0, 2] },
    { item: 'iron',         range: [0, 1] },
    { item: 'bandage',      chance: 0.18 },
    { item: 'berry',        range: [0, 2] },
    { item: 'mushroom',     chance: 0.15 },
    { item: 'herbs',        chance: 0.15 },
    { item: 'water_bottle', chance: 0.10 },
    { item: 'dirty_water',  chance: 0.20 },
    { item: 'shell',        chance: 0.08 },
    { item: 'meat_raw',     chance: 0.10 },
    { item: 'scrap',        chance: 0.20 },
    { item: 'rope',         chance: 0.10 },
    { item: 'nail',         range: [0, 3] },
  ],
  // TOWN — casas custodiadas por zombies dormidos. Loot decente: ammo,
  // bandages, armas básicas, attachments uncommon.
  town: [
    { item: 'bullet_p',       range: [6, 12] },
    { item: 'bullet_r',       range: [2, 8] },
    { item: 'shell',          range: [0, 4] },
    { item: 'bullet_smg',     range: [0, 6] },
    { item: 'bullet_762',     range: [0, 6] },
    { item: 'bandage',        range: [1, 3] },
    { item: 'wood',           range: [1, 3] },
    { item: 'stone',          range: [0, 2] },
    { item: 'cloth',          range: [1, 4] },
    { item: 'iron',           range: [0, 3] },
    { item: 'coal',           range: [0, 2] },
    { item: 'sulfur',         range: [0, 2] },
    { item: 'copper',         chance: 0.20 },
    { item: 'meat_cooked',    chance: 0.25 },
    { item: 'canned_food',    chance: 0.20 },
    { item: 'water_bottle',   chance: 0.30 },
    { item: 'dirty_water',    chance: 0.25 },
    { item: 'milk',           chance: 0.10 },
    { item: 'tea',            chance: 0.08 },
    { item: 'energy_bar',     chance: 0.12 },
    { item: 'berry',          range: [0, 3] },
    { item: 'mushroom',       chance: 0.15 },
    { item: 'herbs',          chance: 0.20 },
    { item: 'scrap',          range: [1, 3] },
    { item: 'nail',           range: [0, 4] },
    { item: 'gunpowder',      chance: 0.18 },
    { item: 'rifle_pickup',   chance: 0.20 },
    { item: 'shotgun_pickup', chance: 0.15 },
    { item: 'smg_pickup',     chance: 0.10 },
    { item: 'crossbow_pickup',chance: 0.12 },
    { item: 'rifle_body',     chance: 0.12 },
    { item: 'shotgun_body',   chance: 0.08 },
    { item: 'smg_body',       chance: 0.07 },
    { item: 'semi_body',      chance: 0.05 },
    { item: 'bolt',           range: [0, 4] },
    { item: 'vest_armor',     chance: 0.08 },
    // Cloth tier armor — drop común en pueblos.
    { item: 'cloth_helmet',   chance: 0.08 },
    { item: 'cloth_shirt',    chance: 0.10 },
    { item: 'cloth_pants',    chance: 0.10 },
    { item: 'cloth_shoes',    chance: 0.08 },
    { item: 'cloth_gloves',   chance: 0.08 },
    { item: 'leather_helmet', chance: 0.05 },
    { item: 'leather_shirt',  chance: 0.05 },
    { item: 'leather_pants',  chance: 0.05 },
    { item: 'ext_mag',        chance: 0.07 },
    { item: 'axe',            chance: 0.10 },
    { item: 'pickaxe',        chance: 0.10 },
    { item: 'hammer',         chance: 0.08 },
    { item: 'knife',          chance: 0.10 },
    { item: 'campfire',       chance: 0.20 },
    { item: 'bear_trap',      chance: 0.10 },
    { item: 'spike_trap',     chance: 0.10 },
    { item: 'flashlight',     chance: 0.08 },
    { item: 'compass',        chance: 0.06 },
    { item: 'smoke_grenade',  chance: 0.18 },
    { item: 'flashbang',      chance: 0.10 },
    { item: 'molotov',        chance: 0.10 },
    { item: 'mine',           chance: 0.04 },
    { item: 'lockpick',       range: [0, 2] },
    { item: 'fishing_rod',    chance: 0.12 },
    { item: 'seeds',          range: [0, 2] },
    { item: 'grip',           chance: 0.08 },
    { item: 'laser_sight',    chance: 0.06 },
    { item: 'rope',           range: [0, 2] },
    { item: 'painkillers',    chance: 0.10 },
    { item: 'battery',        chance: 0.10 },
  ],
  // MILITARY — POIs militares (helicópteros) custodiados por científicos.
  // Cantidad similar a town pero bias a armas/ammo/AP, no comida ni recursos.
  military: [
    { item: 'bullet_r',       range: [10, 20] },
    { item: 'bullet_p',       range: [10, 20] },
    { item: 'bullet_smg',     range: [6, 14] },
    { item: 'bullet_762',     range: [6, 14] },
    { item: 'bullet_marksman',range: [4, 10] },
    { item: 'shell',          range: [4, 10] },
    { item: 'bullet_r_ap',    range: [0, 8] },
    { item: 'bullet_p_ap',    range: [0, 6] },
    { item: 'sniper_round',   range: [0, 4] },
    { item: 'gl_round',       range: [0, 3] },
    { item: 'grenade',        chance: 0.45 },
    { item: 'c4',             chance: 0.10 },
    { item: 'mine',           chance: 0.18 },
    { item: 'bandage',        range: [1, 3] },
    { item: 'medkit',         chance: 0.20 },
    { item: 'morphine',       chance: 0.15 },
    { item: 'adrenaline',     chance: 0.15 },
    { item: 'rifle_pickup',   chance: 0.45 },
    { item: 'shotgun_pickup', chance: 0.25 },
    { item: 'smg_pickup',     chance: 0.30 },
    { item: 'rifle_body',     chance: 0.25 },
    { item: 'ak_body',        chance: 0.18 },
    { item: 'semi_body',      chance: 0.18 },
    { item: 'sniper_body',    chance: 0.10 },
    { item: 'gl_body',        chance: 0.06 },
    { item: 'vest_armor',     chance: 0.25 },
    { item: 'helmet_armor',   chance: 0.15 },
    // Mil tier armor — solo se encuentra (T4 best, no crafteable).
    { item: 'mil_helmet',     chance: 0.10 },
    { item: 'mil_shirt',      chance: 0.10 },
    { item: 'mil_pants',      chance: 0.10 },
    { item: 'mil_shoes',      chance: 0.08 },
    { item: 'mil_body',       chance: 0.08 },
    { item: 'mil_legs',       chance: 0.08 },
    { item: 'mil_gloves',     chance: 0.08 },
    { item: 'iron_helmet',    chance: 0.12 },
    { item: 'iron_body',      chance: 0.10 },
    { item: 'gas_mask',       chance: 0.08 },
    { item: 'binoculars',     chance: 0.15 },
    { item: 'radio',          chance: 0.12 },
    { item: 'scope',          chance: 0.20 },
    { item: 'silencer',       chance: 0.12 },
    { item: 'ext_mag',        chance: 0.18 },
    { item: 'flashlight',     chance: 0.50 },
    { item: 'nvg',            chance: 0.30 },
    { item: 'circuit',        chance: 0.18 },
    { item: 'gunpowder',      range: [3, 8] },
    { item: 'iron',           range: [2, 6] },
    { item: 'scrap',          range: [3, 7] },
  ],
  // Helix Lab + city POIs — strongly tilted toward attachments + armor + bodies.
  city: [
    { item: 'bullet_p',      range: [10, 18] },
    { item: 'bullet_r',      range: [10, 18] },
    { item: 'bullet_smg',    range: [6, 14] },
    { item: 'bullet_762',    range: [8, 16] },
    { item: 'bullet_marksman',range: [4, 10] },
    { item: 'shell',         range: [4, 10] },
    { item: 'sniper_round',  range: [0, 4] },
    { item: 'gl_round',      range: [0, 3] },
    { item: 'bullet_p_ap',   range: [0, 6] },
    { item: 'bullet_r_ap',   range: [0, 8] },
    { item: 'bullet_r_inc',  chance: 0.35 },
    { item: 'bandage',       range: [2, 4] },
    { item: 'medkit',        chance: 0.18 },
    { item: 'morphine',      chance: 0.18 },
    { item: 'adrenaline',    chance: 0.18 },
    { item: 'painkillers',   chance: 0.20 },
    { item: 'antibiotics',   chance: 0.20 },
    { item: 'flashlight',    chance: 0.30 },
    { item: 'rifle_pickup',  chance: 0.55 },
    { item: 'shotgun_pickup',chance: 0.30 },
    { item: 'smg_pickup',    chance: 0.30 },
    { item: 'crossbow_pickup',chance: 0.20 },
    // Weapon bodies — concentrados aquí (Helix Lab loot).
    { item: 'rifle_body',    chance: 0.30 },
    { item: 'ak_body',       chance: 0.22 },
    { item: 'semi_body',     chance: 0.22 },
    { item: 'sniper_body',   chance: 0.12 },
    { item: 'gl_body',       chance: 0.10 },
    { item: 'shotgun_body',  chance: 0.18 },
    { item: 'smg_body',      chance: 0.18 },
    { item: 'bolt',          range: [0, 6] },
    { item: 'vest_armor',    chance: 0.30 },
    { item: 'helmet_armor',  chance: 0.18 },
    // Mil tier armor — drop concentrado en city/Helix.
    { item: 'mil_helmet',    chance: 0.18 },
    { item: 'mil_shirt',     chance: 0.18 },
    { item: 'mil_pants',     chance: 0.18 },
    { item: 'mil_shoes',     chance: 0.15 },
    { item: 'mil_body',      chance: 0.15 },
    { item: 'mil_legs',      chance: 0.15 },
    { item: 'mil_gloves',    chance: 0.15 },
    { item: 'iron_helmet',   chance: 0.18 },
    { item: 'iron_body',     chance: 0.15 },
    { item: 'iron_legs',     chance: 0.12 },
    { item: 'gas_mask',      chance: 0.15 },
    { item: 'parachute',     chance: 0.05 },
    { item: 'binoculars',    chance: 0.18 },
    { item: 'radio',         chance: 0.15 },
    { item: 'c4',            chance: 0.15 },
    { item: 'mine',          chance: 0.18 },
    { item: 'scope',         chance: 0.22 },
    { item: 'ext_mag',       chance: 0.18 },
    { item: 'smoke_grenade', chance: 0.25 },
    { item: 'flashbang',     chance: 0.18 },
    { item: 'molotov',       chance: 0.15 },
    { item: 'nvg',           chance: 0.20 },
    { item: 'fishing_rod',   chance: 0.15 },
    { item: 'grip',          chance: 0.18 },
    { item: 'laser_sight',   chance: 0.15 },
    { item: 'circuit',       range: [1, 3] },
    { item: 'iron',          range: [3, 8] },
    { item: 'gunpowder',     range: [4, 10] },
    { item: 'copper',        range: [1, 4] },
    { item: 'scrap',         range: [2, 6] },
    { item: 'lockpick',      range: [0, 3] },
    { item: 'energy_bar',    chance: 0.15 },
    { item: 'canned_food',   chance: 0.20 },
  ],
  // Boss drop — guaranteed legendary plus full attachment kit + nuke body.
  // El nuke_body es drop EXCLUSIVO del boss (cientifico), garantizado al
  // 100% para que sí o sí salga al matarlo. Junto con 1 nuke_round.
  boss: [
    { item: 'bullet_r',       range: [40, 60] },
    { item: 'bullet_p',       range: [25, 40] },
    { item: 'bullet_762',     range: [30, 50] },
    { item: 'bullet_marksman',range: [15, 25] },
    { item: 'gl_round',       range: [4, 8] },
    { item: 'shell',          range: [12, 18] },
    { item: 'sniper_round',   range: [10, 16] },
    { item: 'bullet_r_ap',    range: [10, 20] },
    { item: 'bullet_r_inc',   range: [4, 8] },
    { item: 'bullet_p_ap',    range: [10, 16] },
    { item: 'bandage',        range: [4, 7] },
    { item: 'medkit',         range: [1, 3] },
    { item: 'antibiotics',    range: [1, 2] },
    { item: 'morphine',       range: [1, 2] },
    { item: 'adrenaline',     range: [1, 2] },
    { item: 'flashlight',     chance: 1.0 },
    { item: 'dog_collar',     chance: 0.5 },
    { item: 'sniper_pickup',  chance: 1.0 },
    { item: 'silencer',       chance: 1.0 },
    { item: 'scope',          chance: 0.9 },
    { item: 'helmet_armor',   chance: 0.85 },
    { item: 'vest_armor',     chance: 0.85 },
    { item: 'ext_mag',        chance: 0.7 },
    { item: 'rifle_pickup',   chance: 1.0 },
    // ★ DROP EXCLUSIVO BOSS ★ — nuke gun + ammo garantizado.
    // El usuario lo pidió directo: "el final boss cientifico dropea el nuke gun".
    { item: 'nuke_pickup',    chance: 1.0 },
    { item: 'nuke_body',      chance: 1.0 },   // por si querés re-craftear
    { item: 'nuke_round',     chance: 1.0 },
    { item: 'gatling_body',   chance: 0.6 },
    { item: 'gl_body',        chance: 0.8 },
    { item: 'ak_body',        chance: 0.9 },
    { item: 'semi_body',      chance: 0.9 },
    // Mil set garantizado parcial.
    { item: 'mil_helmet',     chance: 0.7 },
    { item: 'mil_body',       chance: 0.6 },
    { item: 'mil_shirt',      chance: 0.5 },
    { item: 'mil_pants',      chance: 0.5 },
    { item: 'mil_legs',       chance: 0.5 },
    { item: 'circuit',        range: [3, 6] },
    { item: 'iron',           range: [10, 20] },
    { item: 'gunpowder',      range: [10, 20] },
    { item: 'scrap',          range: [12, 24] },
    { item: 'gas_mask',       chance: 0.5 },
    { item: 'binoculars',     chance: 0.6 },
    { item: 'radio',          chance: 0.5 },
  ],
  animal: [
    { item: 'meat_raw',    range: [1, 2] },
    { item: 'bandage',     chance: 0.3 },
    { item: 'rabbit_pelt', chance: 0.6 },
    { item: 'deer_pelt',   chance: 0.4 },
  ],
  // Zombie drops — basura del bolsillo del que era. Mucho menor que town
  // crates pero acumula al matar muchos. Dropea solo a veces (no todos
  // los zombies) para no spammear el mundo de cofres.
  zombie: [
    { item: 'cloth',     chance: 0.30 },
    { item: 'scrap',     chance: 0.25 },
    { item: 'bullet_p',  chance: 0.20 },
    { item: 'wood',      chance: 0.15 },
    { item: 'bandage',   chance: 0.12 },
    { item: 'meat_raw',  chance: 0.08 },
    { item: 'berry',     chance: 0.10 },
    { item: 'nail',      chance: 0.10 },
    { item: 'stone',     chance: 0.10 },
  ],
  // Stronger zombie variants (tank, alpha, brute) drop a bit more.
  zombie_strong: [
    { item: 'cloth',     range: [1, 2] },
    { item: 'scrap',     range: [1, 2] },
    { item: 'bullet_p',  chance: 0.40 },
    { item: 'bullet_r',  chance: 0.20 },
    { item: 'bandage',   chance: 0.30 },
    { item: 'iron',      chance: 0.20 },
    { item: 'gunpowder', chance: 0.15 },
    { item: 'meat_raw',  chance: 0.20 },
  ],
  // ROAD — crates dejados a la vera de las carreteras amarillas. Loot
  // bajo: balas, basura, raramente una pistola. Sin custodios.
  // El usuario lo describió: "loot aceptable pero nada muy bueno
  // (dificilmente una pistola y algunas balas)".
  road: [
    { item: 'bullet_p',     range: [1, 4] },
    { item: 'wood',         range: [0, 2] },
    { item: 'stone',        range: [0, 1] },
    { item: 'cloth',        range: [0, 2] },
    { item: 'scrap',        chance: 0.30 },
    { item: 'bandage',      chance: 0.15 },
    { item: 'water_bottle', chance: 0.15 },
    { item: 'dirty_water',  chance: 0.25 },
    { item: 'berry',        range: [0, 2] },
    { item: 'mushroom',     chance: 0.10 },
    { item: 'meat_raw',     chance: 0.08 },
    { item: 'pistol_pickup',chance: 0.04 },   // raro: una pistola en la carretera
    { item: 'bullet_r',     chance: 0.10 },
    { item: 'shell',        chance: 0.05 },
    { item: 'iron',         chance: 0.10 },
    { item: 'nail',         range: [0, 2] },
    { item: 'rope',         chance: 0.08 },
    { item: 'cloth_helmet', chance: 0.03 },   // raro: ropa básica
  ],
};

// Loot bonus por bioma — se aplica encima del tier base.
//   forest: +bayas, +seeds (vegetación abundante)
//   snow:   +meat (animales para cazar), +bandage extra (frío hiere)
//   desert: +water_bottle, +scrap (cosas perdidas en arena)
//   burnt:  +bullet_r_inc (incendiarias), bilebomber chance scrap
const BIOME_BONUS = {
  forest: [
    { item: 'berry',   range: [1, 3] },
    { item: 'seeds',   chance: 0.30 },
    { item: 'mushroom',chance: 0.25 },
    { item: 'herbs',   chance: 0.30 },
    { item: 'honey',   chance: 0.10 },
  ],
  snow: [
    { item: 'meat_raw',    range: [1, 2] },
    { item: 'bandage',     chance: 0.40 },
    { item: 'rabbit_pelt', chance: 0.30 },
    { item: 'deer_pelt',   chance: 0.20 },
  ],
  desert: [
    { item: 'water_bottle', range: [1, 2] },
    { item: 'scrap',        range: [1, 3] },
    { item: 'sulfur',       range: [0, 3] },
    { item: 'copper',       chance: 0.20 },
  ],
  burnt: [
    { item: 'bullet_r_inc', range: [0, 4] },
    { item: 'antibiotics',  chance: 0.20 },
    { item: 'coal',         range: [1, 3] },
    { item: 'gas_mask',     chance: 0.05 },
  ],
};

function rollLoot(tableKey, x, z) {
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
  // Bonus por bioma — solo si el crate está dentro del map (x,z válidos).
  if (Number.isFinite(x) && Number.isFinite(z)) {
    const biome = biomeAt(x, z);
    const bonus = BIOME_BONUS[biome] || [];
    for (const row of bonus) {
      if (row.chance != null) {
        if (Math.random() < row.chance) out[row.item] = (out[row.item] || 0) + 1;
      } else {
        const [a, b] = row.range;
        const n = a + Math.floor(Math.random() * (b - a + 1));
        if (n > 0) out[row.item] = (out[row.item] || 0) + n;
      }
    }
  }
  return out;
}

// =====================================================================
// FACTIONS — los enemigos pelean entre sí.
//   zombie: zombie/runner/tank/spitter/screamer/exploder/brute/alpha
//   human:  scientist/sci_shotgun/sci_sniper/boss
//   wild:   wolf/bear/boar (animales hostiles)
//   passive: deer/rabbit (huyen, no atacan)
// Reglas:
//   zombie ↔ human: se atacan mutuamente
//   wild → todos los humanos (player y scientists)
//   wild → players solamente (no atacan zombies — los animales y los
//          zombies se ignoran; los lobos no son tan tontos)
// =====================================================================
// Helper para detectar TODOS los tipos de cientifico (incluyendo elites).
// IMPORTANTE: si te olvidás un etype acá, ese cientifico se va a faction
// 'zombie' por default y los demás cientificos lo van a atacar como
// enemigo (friendly fire). Esto pasaba con los 4 elites del boss tower —
// se mataban entre ellos antes de que el jugador llegara.
function isAnyScientist(etype) {
  return etype === 'scientist'
      || etype === 'sci_shotgun'
      || etype === 'sci_sniper'
      || etype === 'sci_elite_rifle'
      || etype === 'sci_elite_shotgun'
      || etype === 'sci_elite_sniper'
      || etype === 'sci_elite_ak'
      || etype === 'boss';
}

function factionOf(e) {
  const t = e.etype;
  if (isAnyScientist(t)) return 'human';
  if (t === 'wolf' || t === 'bear' || t === 'boar') return 'wild';
  if (t === 'deer' || t === 'rabbit') return 'passive';
  return 'zombie';
}
// ¿La faction A trata como enemigo a la faction B?
function isHostile(a, b) {
  if (a === 'passive' || b === 'passive') return false;
  if (a === b) return false;
  // wild ataca solo humanos (no zombies).
  if (a === 'wild' && b !== 'human') return false;
  if (b === 'wild' && a !== 'human') return false;
  return true;
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
// Estado de fin de juego — true cuando el jugador disparó el cañón
// nuclear contra Helix Lab. Bloquea respawn del boss/elites/cientificos
// del lab. El cliente recibe esto en welcome + via cityDestroyed
// broadcast cuando ocurre en vivo.
let helixDestroyed = false;

// Build crates at boot — varios cofres por edificio. Towns: 2-4 cofres
// dispersos en esquinas del piso. Cities: 1-3 (más loot por cofre, ya
// están en city tier). El crate's table key matches the town type.
function spawnTownCrates() {
  for (const t of TOWNS) {
    for (const b of t.buildings) {
      const isCity = t.type === 'city';
      const isHighLoot = b.kind === 'high_loot';
      const isRuined = b.kind === 'ruined';
      // Random count:
      //   high_loot: 5-7 cofres por bloque (zona controlada por cientificos)
      //   ruined: 1-2 cofres (abandonado, basura)
      //   city normal: 1-3
      //   town: 2-4
      let count;
      if (isHighLoot)      count = 5 + Math.floor(Math.random() * 3);
      else if (isRuined)   count = 1 + Math.floor(Math.random() * 2);
      else if (isCity)     count = 1 + Math.floor(Math.random() * 3);
      else                 count = 2 + Math.floor(Math.random() * 3);
      // Posiciones dentro del footprint del edificio: esquinas + medios.
      // Footprint es w×h; convertimos a offsets locales y rotamos por b.ry.
      // 9 slots para que high_loot (5-7 cofres) tenga espacio sin amontonar.
      const half = 0.4; // 0.4 * tamaño = quedar dentro de las paredes
      const corners = [
        [-half, -half], [half, -half], [-half, half], [half, half],
        [0, -half], [0, half], [-half, 0], [half, 0], [0, 0],
      ];
      // Shuffle.
      for (let i = corners.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [corners[i], corners[j]] = [corners[j], corners[i]];
      }
      const cosR = Math.cos(b.ry || 0), sinR = Math.sin(b.ry || 0);
      // High_loot blocks → loot tier "city" upgradeado (mejor que town).
      // Ruined → mismo tier que town (basura).
      const tableKey = isHighLoot ? 'city' : (isRuined ? 'town' : t.type);
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
          tableKey, townId: t.id, taken: false,
          highLoot: isHighLoot,
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

// Road crates — cofres pequeños distribuidos cada ~70m a lo largo de
// las carreteras amarillas que conectan los pueblos. Loot bajo (road tier).
// Pequeño jitter lateral para que no queden todos en el centro de la calle.
function spawnRoadCrates() {
  let s = 5511;
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const SPACING = 75;       // metros entre cofres
  const JITTER  = 4;        // m laterales
  for (const r of ROADS) {
    const dx = r.x2 - r.x1, dz = r.z2 - r.z1;
    const len = Math.hypot(dx, dz);
    if (len < SPACING) continue;
    const ux = dx / len, uz = dz / len;
    // Vector perpendicular para jitter lateral.
    const px = -uz, pz = ux;
    const count = Math.floor(len / SPACING);
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      const cx = r.x1 + dx * t;
      const cz = r.z1 + dz * t;
      const off = (rng() - 0.5) * JITTER;
      const x = cx + px * off;
      const z = cz + pz * off;
      // Skip si cae dentro de un town footprint.
      let inTown = false;
      for (const t2 of TOWNS) {
        const ddx = t2.cx - x, ddz = t2.cz - z;
        const radius = t2.type === 'city' ? 130 : 60;
        if (ddx * ddx + ddz * ddz < radius * radius) { inTown = true; break; }
      }
      if (inTown) continue;
      const id = nextCrateId++;
      crates.set(id, { id, x, z, y: heightAt(x, z), tableKey: 'road', townId: null, taken: false });
    }
  }
}
spawnRoadCrates();

// Per-town streaming state.
const townState = new Map(); // townId → { spawned, enemyIds: Set, scientistsDead, bossSpawned }
for (const t of TOWNS) {
  townState.set(t.id, { spawned: false, enemyIds: new Set(), scientistsDead: 0, bossSpawned: false });
}

const STREAM_RADIUS = 150;   // m — spawn town when any player closer
const DESPAWN_RADIUS = 260;  // m — despawn town when ALL players farther
const WAKE_RADIUS = 12;      // m — sleeping zombie wakes when player approaches

// Mapa 4x más grande → 90 zombies ambientales (era 30 en mapa más chico).
// Sumado a los zombies de los pueblos esto hace que el mapa se sienta vivo.
const MAX_AMBIENT_ZOMBIES = 90;
const AMBIENT_SPAWN_INTERVAL = 3.5;     // un poco más rápido

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

// Zombie loot drop — pequeño cofre al lado del cadaver. ~50% chance
// para zombies normales, 100% para variantes fuertes (tank/brute/alpha).
function dropZombieLoot(e) {
  const isZombieType = (
    e.etype === 'zombie' || e.etype === 'runner' || e.etype === 'tank' ||
    e.etype === 'spitter' || e.etype === 'screamer' || e.etype === 'exploder' ||
    e.etype === 'brute' || e.etype === 'alpha' || e.etype === 'bilebomber'
  );
  if (!isZombieType) return;
  const isStrong = e.etype === 'tank' || e.etype === 'brute' || e.etype === 'alpha' || e.etype === 'bilebomber';
  // Drop chance: 40% para basicos, 100% para fuertes.
  if (!isStrong && Math.random() > 0.40) return;
  const id = nextCrateId++;
  const tableKey = isStrong ? 'zombie_strong' : 'zombie';
  crates.set(id, { id, x: e.x, z: e.z, y: e.y, tableKey, townId: null, taken: false });
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
  // Zombie loot — basura/balas del bolsillo del zombi. ~40% drop rate
  // para zombies basicos, 100% para variantes fuertes.
  dropZombieLoot(e);
  // Boss + elites ya spawnean con la boss tower al aproximarse — no hay
  // threshold-based spawn como antes. Solo trackeamos kills de scientists
  // por si alguna mecánica futura lo necesita.
  if (e.townId === 'helix-lab' && isAnyScientist(e.etype) && !e.isBoss) {
    const ts = townState.get('helix-lab');
    ts.scientistsDead++;
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

    // Si el Helix Lab fue destruido por el nuke, ya no se spawna nada
    // dentro. Es la "victoria" — el lab queda en ruinas para siempre.
    if (t.id === 'helix-lab' && helixDestroyed) continue;
    if (!ts.spawned && nearestD < STREAM_RADIUS) {
      // Spawn varios enemigos por edificio.
      // Towns: 1-3 zombies durmiendo en cada casa.
      // Cities: 1-2 científicos por edificio (igual que antes).
      ts.spawned = true;
      for (let i = 0; i < t.buildings.length; i++) {
        const b = t.buildings[i];
        const isCity = t.type === 'city';
        const isHighLoot = b.kind === 'high_loot';
        const isRuined = b.kind === 'ruined';
        const isBossTower = b.kind === 'boss_tower';
        // === BOSS TOWER === — spawn 1 boss + 4 elites con armas distintas
        // y nada más. Ya están dentro de la torre desde que el player se
        // acerca. Cada elite tiene un arma específica (rifle/shotgun/
        // sniper/ak). NUNCA se llena con cientificos normales aunque el
        // jugador entre/salga (importante: skip normal spawn siempre).
        if (isBossTower) {
          if (!ts.bossSpawned) {
            ts.bossSpawned = true;
            const boss = makeEnemy({ etype: 'boss', x: b.wx, z: b.wz, townId: t.id });
            // Ancla del boss = posición del tower. Nunca se aleja > 8m.
            boss._anchor = { x: b.wx, z: b.wz };
            ts.enemyIds.add(boss.id);
            broadcast({ type: 'eSpawn', e: ePub(boss) });
            // 4 elites en las 4 esquinas, cada uno con un arma distinta.
            const eliteTypes = ['sci_elite_rifle', 'sci_elite_shotgun', 'sci_elite_sniper', 'sci_elite_ak'];
            const corners = [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]];
            for (let k = 0; k < 4; k++) {
              const [ox, oz] = corners[k];
              const ex = b.wx + ox * b.w;
              const ez = b.wz + oz * b.h;
              const elite = makeEnemy({ etype: eliteTypes[k], x: ex, z: ez, townId: t.id });
              elite._anchor = { x: ex, z: ez };  // ancla cada elite a su esquina
              ts.enemyIds.add(elite.id);
              broadcast({ type: 'eSpawn', e: ePub(elite) });
            }
            broadcast({ type: 'banner', text: '⚠ EL DOCTOR Y SUS 4 ELITES TE ESPERAN EN LA TORRE CENTRAL' });
          }
          continue;   // siempre skip spawn normal en boss_tower
        }
        // City spawns:
        //   high_loot: 4-6 cientificos guardia (zona controlada)
        //   ruined:    0-1 cientifico (abandonado)
        //   normal:    2-3 cientificos
        // Town: 4-8 zombies (eran 1-3 — usuario quiere las ciudades
        //   LLENAS de zombies como si vivieran ahí).
        let count;
        if (!isCity)            count = 4 + Math.floor(Math.random() * 5);
        else if (isHighLoot)    count = 4 + Math.floor(Math.random() * 3);
        else if (isRuined)      count = Math.random() < 0.5 ? 0 : 1;
        else                    count = 2 + Math.floor(Math.random() * 2);
        for (let k = 0; k < count; k++) {
          let etype;
          if (isCity) {
            // High_loot tiene ratio mas alto de sniper/shotgun (mejor armados).
            if (isHighLoot) {
              const r = (i * 23 + k * 7) % 10;
              if (r < 4)       etype = 'scientist';
              else if (r < 7)  etype = 'sci_shotgun';
              else             etype = 'sci_sniper';
            } else {
              const r = (i * 23 + 5) % 12;
              if (r < 7)       etype = 'scientist';
              else if (r < 10) etype = 'sci_shotgun';
              else             etype = 'sci_sniper';
            }
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
          // Anclamos al enemigo a la footprint de su edificio para que
          // su AI movement no lo deje atravesar paredes. El AI tick
          // checkea bldgBox y los vuelve adentro si el chase del player
          // los lleva fuera. Un poco de margen (1.0m) interno para que
          // no queden pegados a la pared.
          e._bldgBox = {
            cx: b.wx, cz: b.wz,
            hw: Math.max(0, b.w / 2 - 1.0),
            hh: Math.max(0, b.h / 2 - 1.0),
          };
          ts.enemyIds.add(e.id);
          broadcast({ type: 'eSpawn', e: ePub(e) });
        }
      }
    } else if (ts.spawned && nearestD > DESPAWN_RADIUS) {
      // Despawn — release CPU on a town nobody's near. Mantenemos vivos
      // al boss + sus 4 elites (son el endgame, no quemamos sus HP al
      // alejarse el player). Es importante que el progreso del fight no
      // se resetee al salir del lab.
      for (const id of ts.enemyIds) {
        const e = enemies.get(id);
        if (!e) continue;
        if (e.isBoss) continue;
        if (ETYPES[e.etype]?.special === 'elite') continue;
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
    // Mix per night/day + escala con día + ajuste por BIOMA.
    //   forest: spawn estándar
    //   snow: más tanks (resistentes al frío), menos animales hostiles
    //   desert: menos zombies en general (calor), más alpha/brute si día alto
    //   burnt: zombies más fuertes + BILEBOMBER exclusivo
    const isNight = isNightHour(gameHour);
    const specialBoost = Math.min(0.20, (gameDay - 1) * 0.025);
    const eliteBoost   = Math.min(0.15, (gameDay - 2) * 0.022);
    const biome = biomeAt(x, z);
    let etype = 'zombie';
    const r2 = Math.random();
    // BURNT — bioma quemado tiene su propia tabla con bilebomber + más specials.
    if (biome === 'burnt') {
      if      (r2 > 0.97 - eliteBoost) etype = 'brute';
      else if (r2 > 0.92 - specialBoost) etype = 'bilebomber';   // 8% base, exclusivo!
      else if (r2 > 0.85 - specialBoost) etype = 'exploder';
      else if (r2 > 0.78 - specialBoost) etype = 'screamer';
      else if (r2 > 0.70 - specialBoost) etype = 'spitter';
      else if (r2 > 0.60) etype = 'tank';
      else if (r2 > 0.30) etype = 'runner';
      else                etype = 'zombie';
    } else if (biome === 'snow') {
      // SNOW — tanks resistentes al frío + lobos comunes, menos specials.
      if      (r2 > 0.98 - eliteBoost) etype = 'brute';
      else if (r2 > 0.94) etype = 'bear';
      else if (r2 > 0.86) etype = 'tank';
      else if (r2 > 0.50) etype = 'wolf';        // lobos abundantes
      else if (r2 > 0.30) etype = 'runner';
      else                etype = 'zombie';
    } else if (biome === 'desert') {
      // DESERT — menos densidad. Animales escasos, zombies normales.
      if (Math.random() < 0.35) return null;     // 35% skip — desierto vacío
      if      (r2 > 0.985) etype = 'brute';
      else if (r2 > 0.96)  etype = 'tank';
      else if (r2 > 0.92)  etype = 'spitter';
      else if (r2 > 0.85)  etype = 'boar';
      else if (r2 > 0.50)  etype = 'runner';
      else                 etype = 'zombie';
    } else {
      // FOREST — tabla original primaveral.
      if (isNight) {
        if      (r2 > 0.985 - eliteBoost)   etype = 'brute';
        else if (r2 > 0.96  - eliteBoost)   etype = 'bear';
        else if (r2 > 0.93  - specialBoost) etype = 'exploder';
        else if (r2 > 0.90  - specialBoost) etype = 'screamer';
        else if (r2 > 0.86  - specialBoost) etype = 'spitter';
        else if (r2 > 0.80  - eliteBoost)   etype = 'tank';
        else if (r2 > 0.74)                 etype = 'boar';
        else if (r2 > 0.50)                 etype = 'wolf';
        else if (r2 > 0.25)                 etype = 'runner';
        else                                etype = 'zombie';
      } else {
        if      (r2 > 0.992 - eliteBoost)   etype = 'brute';
        else if (r2 > 0.98  - eliteBoost)   etype = 'bear';
        else if (r2 > 0.965 - specialBoost) etype = 'exploder';
        else if (r2 > 0.95  - specialBoost) etype = 'screamer';
        else if (r2 > 0.93  - specialBoost) etype = 'spitter';
        else if (r2 > 0.89  - eliteBoost)   etype = 'tank';
        else if (r2 > 0.85)                 etype = 'boar';
        else if (r2 > 0.80)                 etype = 'wolf';
        else if (r2 > 0.72)                 etype = 'runner';
        else                                etype = 'zombie';
      }
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
    const moonPhase = ((gameDay - 1) % 8) / 8;
    broadcast({ type: 'banner', text: `☀ AMANECE — DIA ${gameDay}. La amenaza crece` });
    broadcast({ type: 'difficulty', day: gameDay, mul: +difficultyMul().toFixed(2), moonPhase });
    const isFullMoon = ((gameDay - 1) % 8) === 4;
    if (isFullMoon) {
      broadcast({ type: 'banner', text: '🌕 LUNA LLENA — esta noche habrá más zombis' });
    }
  }
  // Banner de anochecer — cuando cruzamos 19:00 → 20:00 anunciamos noche.
  if (prev < 20 && gameHour >= 20 && gameHour < 21) {
    broadcast({ type: 'banner', text: '🌑 CAE LA NOCHE — los zombies se vuelven más rápidos y peligrosos' });
  }
  // Banner de amanecer — al cruzar 6:00 → 7:00.
  if (prev < 7 && gameHour >= 7 && gameHour < 8 && gameHour - prev < 0.5) {
    // Solo si recien amanece este tick (no en spawn inicial).
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
    // === CLAMP HELPER ===
    // Aplicado al final del tick para evitar que el AI movement deje al
    // enemigo atravesar paredes / salir de Helix Lab / abandonar el tower.
    // Ejecutado via `clampPos(e)` en cada code path que mueve al enemigo
    // (idle wander, chase, special) Y al final del iteration loop.
    const clampPos = (en) => {
      if (en._bldgBox) {
        const dxb = en.x - en._bldgBox.cx;
        const dzb = en.z - en._bldgBox.cz;
        if (Math.abs(dxb) > en._bldgBox.hw) en.x = en._bldgBox.cx + Math.sign(dxb) * en._bldgBox.hw;
        if (Math.abs(dzb) > en._bldgBox.hh) en.z = en._bldgBox.cz + Math.sign(dzb) * en._bldgBox.hh;
      }
      if (en.townId === 'helix-lab' && isAnyScientist(en.etype)) {
        const HCX = 0, HCZ = -200, HR = 110;
        const dxh = en.x - HCX, dzh = en.z - HCZ;
        const distH = Math.hypot(dxh, dzh);
        if (distH > HR) {
          const k = HR / distH;
          en.x = HCX + dxh * k;
          en.z = HCZ + dzh * k;
        }
      }
      if ((en.isBoss || ETYPES[en.etype]?.special === 'elite') && en._anchor) {
        const dxa = en.x - en._anchor.x, dza = en.z - en._anchor.z;
        const distA = Math.hypot(dxa, dza);
        if (distA > 8) {
          const k = 8 / distA;
          en.x = en._anchor.x + dxa * k;
          en.z = en._anchor.z + dza * k;
        }
      }
      en.y = heightAt(en.x, en.z);
    };

    // Find nearest target — players + enemigos de faction opuesta.
    // Players dentro de humo son invisibles. nearestKind dice si el
    // target es 'player' o 'enemy' (otro NPC).
    let nearest = null, nd2 = Infinity;
    let nearestKind = 'player';
    const myFaction = factionOf(e);
    // === BOSS + ELITES: solo atacan jugadores ===
    // No persiguen zombies que vagan cerca. Si no hay player vivo a tiro,
    // se quedan en el tower. Antes el boss caminaba hacia un zombie a 88m
    // y abandonaba la torre — ahora se queda esperando al jugador.
    const isBossOrElite = e.isBoss || cfg.special === 'elite';
    for (const p of players.values()) {
      if (p.hp <= 0) continue;
      if (isInSmoke(p.x, p.z)) continue;
      const dx = p.x - e.x, dz = p.z - e.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nd2) { nd2 = d2; nearest = p; nearestKind = 'player'; }
    }
    // Considerar otros NPCs como targets si son hostiles.
    // Boss + elites NO consideran NPCs (solo players) — defienden el tower.
    if (myFaction !== 'passive' && !isBossOrElite) {
      for (const o of enemies.values()) {
        if (o.id === e.id) continue;
        if (o.hp <= 0) continue;
        if (o.sleeping) continue;       // no atacar dormidos
        if (!isHostile(myFaction, factionOf(o))) continue;
        const dx = o.x - e.x, dz = o.z - e.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < nd2) { nd2 = d2; nearest = o; nearestKind = 'enemy'; }
      }
    }
    // Boss + elites sin player a la vista → idle wander en el tower.
    // Establece ancla la primera vez (posición inicial = tower).
    if (!nearest && isBossOrElite) {
      if (e._anchor == null) e._anchor = { x: e.x, z: e.z };
      // Wander suave dentro del tower (radio 4m).
      if (e._idleHeading == null) e._idleHeading = { angle: Math.random() * Math.PI * 2, t: 0 };
      e._idleHeading.t -= AI_DT;
      if (e._idleHeading.t <= 0) {
        e._idleHeading.t = 2 + Math.random() * 3;
        e._idleHeading.angle += (Math.random() - 0.5) * 1.6;
        const dxa = e.x - e._anchor.x, dza = e.z - e._anchor.z;
        if (Math.hypot(dxa, dza) > 4) e._idleHeading.angle = Math.atan2(-dxa, -dza);
      }
      const sp = cfg.speed * 0.3;
      e.x += Math.sin(e._idleHeading.angle) * sp * AI_DT;
      e.z += Math.cos(e._idleHeading.angle) * sp * AI_DT;
      e.ry = e._idleHeading.angle;
      clampPos(e);
      continue;
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
    const isScientist = isAnyScientist(e.etype);
    // === FORCE AGGRO EN HELIX LAB ===
    // Si sos cientifico (cualquier variante) Y estás en helix-lab Y hay
    // un jugador a < 250m del centro de la ciudad → aggro inmediato sin
    // importar tu cfg.aggro. Meterse en la ciudad = muerte asegurada.
    let cityForceAggro = false;
    if (isScientist && e.townId === 'helix-lab' && nearestKind === 'player') {
      const helix = TOWNS.find(x => x.id === 'helix-lab');
      if (helix) {
        const pdx = nearest.x - helix.cx, pdz = nearest.z - helix.cz;
        const playerInLab = (pdx * pdx + pdz * pdz) < (250 * 250);
        if (playerInLab) cityForceAggro = true;
      }
    }
    if (!e.patrol && !aggroBoosted && !cityForceAggro && d > cfg.aggro) {
      // IDLE WANDER — cientificos de bunkers/heli/poi patrullan en radio
      // pequeño (5m). Cientificos de helix-lab NO patrullan (se quedan
      // estacionarios en su building para no atravesar paredes).
      if (isScientist && e.townId !== 'helix-lab') {
        if (e._idleAnchor == null) e._idleAnchor = { x: e.x, z: e.z };
        if (e._idleHeading == null) e._idleHeading = { angle: Math.random() * Math.PI * 2, t: 0 };
        e._idleHeading.t -= AI_DT;
        if (e._idleHeading.t <= 0) {
          e._idleHeading.t = 2 + Math.random() * 3;
          e._idleHeading.angle += (Math.random() - 0.5) * 1.6;
          const dxa = e.x - e._idleAnchor.x, dza = e.z - e._idleAnchor.z;
          if (Math.hypot(dxa, dza) > 5) e._idleHeading.angle = Math.atan2(-dxa, -dza);
        }
        const speed = cfg.speed * 0.4;
        e.x += Math.sin(e._idleHeading.angle) * speed * AI_DT;
        e.z += Math.cos(e._idleHeading.angle) * speed * AI_DT;
        e.ry = e._idleHeading.angle;
      }
      clampPos(e);
      continue;
    }
    // ALERTA: si un scientist ENTRA en aggro y no estaba alertado
    // recientemente, alerta a otros scientists en 80m (era 35m). En
    // Helix Lab además se propaga a TODOS los cientificos del lab
    // (alarma de ciudad — entrar = todos van a por vos).
    if (isScientist && (!e._lastAlerted || Date.now() - e._lastAlerted > 30000)) {
      e._lastAlerted = Date.now();
      let alerted = 0;
      const isHelixSci = e.townId === 'helix-lab';
      for (const other of enemies.values()) {
        if (other.id === e.id) continue;
        if (!isAnyScientist(other.etype)) continue;
        // Helix Lab: alerta city-wide. Otros sites: 80m.
        if (isHelixSci && other.townId === 'helix-lab') {
          other._aggroBoostUntil = Date.now() + 60000;   // 60s
          alerted++;
          continue;
        }
        const od = Math.hypot(other.x - e.x, other.z - e.z);
        if (od < 80) {
          other._aggroBoostUntil = Date.now() + 30000;   // 30s
          alerted++;
        }
      }
      if (alerted > 0) broadcast({ type: 'banner', text: `⚠ Te detectaron — ${alerted} científicos alertados` });
    }

    // Night buff — melee zombies/wolves move ~20% faster after dusk so the
    // night actually feels different from the day.
    // Night buff — zombies de noche se vuelven mucho más rápidos (1.5x) y
    // hacen más daño (1.4x). Cientificos rangeados no se afectan (siempre
    // disparan a la misma cadencia).
    const isNight = isNightHour(gameHour);
    const nightMul = (isNight && !cfg.ranged) ? 1.5 : 1.0;
    const nightDmgMul = (isNight && !cfg.ranged) ? 1.4 : 1.0;

    if (cfg.ranged) {
      // Shooter: keep optimal distance ~70% of range; circle-strafe slightly.
      // ESTACIONARIO si esta en helix-lab — no se mueve, solo apunta y dispara.
      // Esto evita 100% que atraviesen paredes (era imposible de clampear bien
      // con tantos buildings y enemigos). Se quedan en su edificio/posicion
      // spawn y disparan desde ahi. Boss + elites tampoco se mueven (anclados).
      const isHelixStationary = e.townId === 'helix-lab' && (isAnyScientist(e.etype) || e.isBoss);
      if (!isHelixStationary) {
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
      }
      e.ry = Math.atan2(nearest.x - e.x, nearest.z - e.z);
      // Fire when in range.
      if (d < cfg.range && e.attackCd <= 0) {
        e.attackCd = cfg.cd;
        const rawDmg = Math.round(cfg.dmg * (e.dmgScale || 1));
        if (nearestKind === 'player') {
          // Aplica la misma reduccion de daño que el cliente para que
          // server.player.hp y client.player.hp queden sincronizados.
          // Si el player tiene godMode, no aplica daño ni se da por muerto.
          if (!nearest.godMode) {
            const red = nearest.dmgReduction || 0;
            const dmg = Math.max(1, Math.round(rawDmg * (1 - red)));
            nearest.hp = Math.max(0, nearest.hp - dmg);
            sendTo(nearest, { type: 'youHit', dmg: rawDmg, by: e.id, sx: e.x, sy: e.y, sz: e.z, source: e.etype });
          }
        } else {
          nearest.hp = Math.max(0, nearest.hp - rawDmg);
          broadcast({ type: 'eHit', id: nearest.id, hp: nearest.hp });
          if (nearest.hp <= 0) killEnemy(nearest, e.id);
        }
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
        if (nearestKind === 'player') {
          sendTo(nearest, { type: 'youHit', dmg, by: e.id, sx: e.x, sy: e.y, sz: e.z, source: e.etype });
        } else {
          broadcast({ type: 'eHit', id: nearest.id, hp: nearest.hp });
          if (nearest.hp <= 0) killEnemy(nearest, e.id);
        }
        broadcast({ type: 'eAttack', id: e.id });
      }
      if (e._screamCd <= 0) {
        e._screamCd = 4.0;
        triggerScream(e, nearest);
      }
    } else {
      // Melee: chase + bite. nearest puede ser player o NPC enemy.
      if (d > cfg.range) {
        const dx = nearest.x - e.x, dz = nearest.z - e.z;
        e.x += (dx / d) * cfg.speed * nightMul * AI_DT;
        e.z += (dz / d) * cfg.speed * nightMul * AI_DT;
        e.y = heightAt(e.x, e.z);
        e.ry = Math.atan2(dx, dz);
      } else if (e.attackCd <= 0) {
        e.attackCd = cfg.cd;
        // De noche zombies muerden con +40% de daño extra.
        const rawDmg = Math.round(cfg.dmg * (e.dmgScale || 1) * nightDmgMul);
        if (nearestKind === 'player') {
          if (!nearest.godMode) {
            const red = nearest.dmgReduction || 0;
            const dmg = Math.max(1, Math.round(rawDmg * (1 - red)));
            nearest.hp = Math.max(0, nearest.hp - dmg);
            sendTo(nearest, { type: 'youHit', dmg: rawDmg, by: e.id, sx: e.x, sy: e.y, sz: e.z, source: e.etype });
          }
        } else {
          nearest.hp = Math.max(0, nearest.hp - rawDmg);
          broadcast({ type: 'eHit', id: nearest.id, hp: nearest.hp });
          if (nearest.hp <= 0) killEnemy(nearest, e.id);
        }
        broadcast({ type: 'eAttack', id: e.id });
      }
    }

    // Final clamp para chase movement / melee chase. Idle wander ya
    // llamo clampPos antes del continue.
    clampPos(e);
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
      buildings: t.buildings.map(b => ({
        dx: b.dx, dz: b.dz, w: b.w, h: b.h, ry: b.ry,
        floors: b.floors || 1, kind: b.kind || 'normal',
      })),
    })),
    crates: [...crates.values()].filter(c => !c.taken).map(cPub),
    pois: POIS.map(p => ({ id: p.id, kind: p.kind, cx: p.cx, cz: p.cz, ry: p.ry || 0 })),
    roads: ROADS,
    helixDestroyed,
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
      // Sync de armor + god mode desde cliente para que server use la
      // misma formula de daño y no haya desync (server creyendo player
      // muerto cuando cliente lo ve vivo).
      if (Number.isFinite(msg.red)) player.dmgReduction = Math.max(0, Math.min(0.9, msg.red));
      if (msg.god) player.godMode = true; else player.godMode = false;
      // Re-sync hp si el cliente todavia esta vivo y el server lo daba
      // por muerto (caso del desync). Si cliente dice hp>0 y server tiene
      // hp=0, restauramos. Esto fuerza al server a respetar el HP del
      // cliente (cliente manda armor-reduced hp).
      if (Number.isFinite(msg.hp) && msg.hp > 0 && player.hp <= 0) {
        player.hp = Math.min(100, msg.hp);
      }
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
    } else if (msg.type === 'voiceSignal') {
      // Reenvía signaling SDP/ICE al peer destinatario.
      const target = players.get(msg.to);
      if (target && target.ws && target.ws.readyState === 1) {
        target.ws.send(JSON.stringify({
          type: 'voiceSignal',
          from: id,
          payload: msg.payload,
        }));
      }
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
    } else if (msg.type === 'nuke') {
      // El jugador disparó el cañón nuclear. Si el impacto cae dentro
      // del radio de Helix Lab → "te has pasado el juego": destruir la
      // ciudad, despawnear todos los enemigos del lab, broadcast al
      // resto. La ciudad queda como ruinas y el boss no respawnea.
      if (!helixDestroyed) {
        const helix = TOWNS.find(t => t.id === 'helix-lab');
        if (helix) {
          const dx = (msg.x ?? player.x) - helix.cx;
          const dz = (msg.z ?? player.z) - helix.cz;
          const dist = Math.hypot(dx, dz);
          if (dist < 200) {                // dentro del radio del lab
            helixDestroyed = true;
            // Despawnear todos los enemigos del lab.
            const ts = townState.get('helix-lab');
            if (ts) {
              for (const eid of ts.enemyIds) {
                const e = enemies.get(eid);
                if (!e) continue;
                enemies.delete(eid);
                broadcast({ type: 'eDead', id: eid, despawn: true });
              }
              ts.enemyIds.clear();
              ts.spawned = true;           // bloquea futuro spawn
              ts.bossSpawned = true;
            }
            broadcast({ type: 'cityDestroyed', townId: 'helix-lab', x: msg.x, z: msg.z });
            broadcast({ type: 'banner', text: '☢ HELIX LAB DESTRUIDO — TE HAS PASADO EL JUEGO ☢' });
          }
        }
      }
      // Daño colateral en cualquier caso: matar todos los enemigos en
      // 30m del impacto (incluyendo zombies si pegás en un pueblo).
      const ix = msg.x ?? player.x, iz = msg.z ?? player.z;
      for (const e of [...enemies.values()]) {
        if (Math.hypot(e.x - ix, e.z - iz) < 30) {
          enemies.delete(e.id);
          broadcast({ type: 'eDead', id: e.id, by: id });
        }
      }
    } else if (msg.type === 'openCrate') {
      // Player wants to open crate `id`. We accept if it exists, isn't
      // taken yet, and the player is reasonably close (within 3.5 m of
      // the crate position). Anti-cheat is best-effort, not strict.
      const c = crates.get(msg.id);
      if (!c || c.taken) return;
      const dx = player.x - c.x, dz = player.z - c.z;
      if (dx * dx + dz * dz > 5 * 5) return;
      c.taken = true;
      const loot = rollLoot(c.tableKey, c.x, c.z);
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
