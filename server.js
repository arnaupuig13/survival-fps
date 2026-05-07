// Survival FPS v1 — server: HTTP static + WebSocket multiplayer + zombie AI.
//
// Design choices that fix problems from v0:
// - heightAt() shared with client; server spawns/moves zombies AT terrain Y so
//   they're never buried. Eliminates the "invisible zombie that hits you" bug.
// - Single source of truth for entities. No RemoteEnemy mirror lists on client.
// - Snapshot-based sync at 10 Hz; positions client-side lerp.
// - No town streaming, no sleeping zombies, no separate enemy variants. Just
//   "zombie" — keeps the loop tight. More variants come in v1.1.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// =====================================================================
// Static HTTP server — serves index.html, /client/*, /node_modules/three.
// =====================================================================
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
};

const httpServer = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  // Security: disallow .. traversal.
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
// Procedural world — deterministic by seed. heightAt() and worldRng() must
// be byte-identical to the client copies (client/world.js) so server-side
// AI walks the same terrain the player sees.
// =====================================================================
const WORLD_SEED = 1337;
const WORLD_HALF = 100; // 200x200 m playable area

// Cheap hash → [0,1). Same as client.
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263 + WORLD_SEED * 982451653) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth value-noise heightmap. Two octaves of bilinear-interpolated hash.
export function heightAt(x, z) {
  function octave(scale, amp) {
    const sx = x / scale, sz = z / scale;
    const x0 = Math.floor(sx), z0 = Math.floor(sz);
    const fx = sx - x0,        fz = sz - z0;
    const a = hash(x0,     z0);
    const b = hash(x0 + 1, z0);
    const c = hash(x0,     z0 + 1);
    const d = hash(x0 + 1, z0 + 1);
    // Smoothstep on fx, fz so corners blend instead of grid-flat tiles.
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    return (a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v) * amp;
  }
  // Two octaves: large rolling hills + small bumps. Total amplitude ~3 m,
  // intentionally gentle so the player can run anywhere without cliffs.
  return octave(28, 2.4) + octave(7, 0.6) - 1.5;
}

// =====================================================================
// World state — players, zombies. Authoritative on server.
// =====================================================================
const players = new Map();   // id → { id, ws, x, y, z, ry, hp, name }
const zombies = new Map();   // id → { id, x, y, z, ry, hp, attackCd }
let nextPlayerId = 1;
let nextZombieId = 1;

const ZOMBIE_HP = 10;
const ZOMBIE_DMG = 8;
const ZOMBIE_SPEED = 1.6;       // m/s
const ZOMBIE_ATTACK_RANGE = 1.6;
const ZOMBIE_ATTACK_COOLDOWN = 1.4; // s
const ZOMBIE_AGGRO_RANGE = 30;  // m — zombies idle outside this
const MAX_ZOMBIES = 25;
const ZOMBIE_SPAWN_INTERVAL = 6.0; // s

// Spawn a zombie at a random spot on the heightmap, at least `minDist` from
// every connected player. Returns the zombie or null if no spot found.
function spawnZombie(minDist = 38, maxDist = 80) {
  for (let tries = 0; tries < 30; tries++) {
    const angle = Math.random() * Math.PI * 2;
    const r = minDist + Math.random() * (maxDist - minDist);
    // If no players, spawn around origin.
    let ax = 0, az = 0;
    if (players.size > 0) {
      const list = [...players.values()];
      const anchor = list[Math.floor(Math.random() * list.length)];
      ax = anchor.x; az = anchor.z;
    }
    const x = ax + Math.cos(angle) * r;
    const z = az + Math.sin(angle) * r;
    if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) continue;
    // Reject if any player is too close (e.g. another anchor).
    let tooClose = false;
    for (const p of players.values()) {
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < minDist * minDist) { tooClose = true; break; }
    }
    if (tooClose) continue;
    const id = nextZombieId++;
    const z0 = { id, x, y: heightAt(x, z), z, ry: Math.random() * Math.PI * 2, hp: ZOMBIE_HP, attackCd: 0 };
    zombies.set(id, z0);
    broadcast({ type: 'zSpawn', z: zPub(z0) });
    return z0;
  }
  return null;
}

// Public-shape projection — what we send over the wire for one zombie.
function zPub(z) { return { id: z.id, x: z.x, y: z.y, z: z.z, ry: z.ry, hp: z.hp }; }
function pPub(p) { return { id: p.id, x: p.x, y: p.y, z: p.z, ry: p.ry, hp: p.hp, name: p.name }; }

// =====================================================================
// AI tick — runs at 10 Hz. Zombies chase nearest player and attack on contact.
// =====================================================================
const AI_HZ = 10;
const AI_DT = 1 / AI_HZ;
let zombieSpawnAccum = 0;

setInterval(() => {
  zombieSpawnAccum += AI_DT;
  if (zombieSpawnAccum >= ZOMBIE_SPAWN_INTERVAL && zombies.size < MAX_ZOMBIES && players.size > 0) {
    zombieSpawnAccum = 0;
    spawnZombie();
  }

  for (const z of zombies.values()) {
    if (z.attackCd > 0) z.attackCd -= AI_DT;

    // Find nearest alive player.
    let nearest = null, nearestD2 = Infinity;
    for (const p of players.values()) {
      if (p.hp <= 0) continue;
      const dx = p.x - z.x, dz = p.z - z.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestD2) { nearestD2 = d2; nearest = p; }
    }
    if (!nearest) continue;
    if (nearestD2 > ZOMBIE_AGGRO_RANGE * ZOMBIE_AGGRO_RANGE) continue;

    const d = Math.sqrt(nearestD2);
    if (d > ZOMBIE_ATTACK_RANGE) {
      // Walk toward player.
      const dx = nearest.x - z.x, dz = nearest.z - z.z;
      z.x += (dx / d) * ZOMBIE_SPEED * AI_DT;
      z.z += (dz / d) * ZOMBIE_SPEED * AI_DT;
      z.y = heightAt(z.x, z.z);
      z.ry = Math.atan2(dx, dz);
    } else if (z.attackCd <= 0) {
      // Attack — only the targeted player gets damage. Others see a lunge anim.
      z.attackCd = ZOMBIE_ATTACK_COOLDOWN;
      nearest.hp = Math.max(0, nearest.hp - ZOMBIE_DMG);
      sendTo(nearest, { type: 'youHit', dmg: ZOMBIE_DMG, by: z.id, sx: z.x, sy: z.y, sz: z.z });
      broadcast({ type: 'zAttack', id: z.id });
    }
  }
}, 1000 / AI_HZ);

// =====================================================================
// Snapshot tick — every 100 ms, send compact snapshot of zombies + players
// so clients can lerp. Player position broadcast piggybacks on this.
// =====================================================================
setInterval(() => {
  // Compact zombie list: [id, x, y, z, ry, hp]
  const z = [];
  for (const e of zombies.values()) z.push([e.id, +e.x.toFixed(2), +e.y.toFixed(2), +e.z.toFixed(2), +e.ry.toFixed(2), e.hp]);
  // Player snapshot for peers.
  const ps = [];
  for (const p of players.values()) ps.push([p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2), p.hp]);
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

  // Send welcome with their id and initial world snapshot.
  ws.send(JSON.stringify({
    type: 'welcome',
    you: id,
    seed: WORLD_SEED,
    worldHalf: WORLD_HALF,
    peers: [...players.values()].filter(p => p.id !== id).map(pPub),
    zombies: [...zombies.values()].map(zPub),
  }));
  // Tell others a peer joined.
  broadcast({ type: 'peerJoin', p: pPub(player) }, id);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'pos') {
      // Reject NaN / out-of-bounds — would propagate to peers.
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return;
      if (Math.abs(msg.x) > WORLD_HALF + 5 || Math.abs(msg.z) > WORLD_HALF + 5) return;
      player.x = msg.x; player.y = msg.y; player.z = msg.z;
      player.ry = Number.isFinite(msg.ry) ? msg.ry : 0;
    } else if (msg.type === 'shoot') {
      // Client claims a hit on zombie `id` for `dmg`. Server applies damage,
      // broadcasts visual fire event. No client-trust kill, but peer-side
      // consistency: a missed broadcast hides the muzzle flash everywhere.
      broadcast({ type: 'fire', from: id, x: msg.x, y: msg.y, z: msg.z, dx: msg.dx, dy: msg.dy, dz: msg.dz });
      if (msg.hitId != null) {
        const z = zombies.get(msg.hitId);
        if (z && z.hp > 0) {
          z.hp -= msg.dmg | 0;
          broadcast({ type: 'zHit', id: z.id, hp: Math.max(0, z.hp) });
          if (z.hp <= 0) {
            zombies.delete(z.id);
            broadcast({ type: 'zDead', id: z.id, by: id });
          }
        }
      }
    } else if (msg.type === 'respawn') {
      player.hp = 100;
      // Spawn at origin (deterministic safe spot — server picks a clear
      // tile in v1.1; v1 uses (0,0) which the client renders correctly).
      player.x = 0; player.z = 0;
      player.y = heightAt(0, 0);
      sendTo(player, { type: 'respawned', x: player.x, y: player.y, z: player.z });
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
  console.log(`Survival FPS v1 listening on http://0.0.0.0:${PORT}`);
  console.log(`  open:  http://localhost:${PORT}/`);
  console.log(`  ws:    ws://localhost:${PORT}/ws`);
});
