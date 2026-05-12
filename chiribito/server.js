// Chiribito - servidor multijugador (HTTP estatico + WebSocket).
// Sin frameworks: usa http nativo + ws.
//
// Protocolo cliente <-> servidor (JSON):
//   C->S { t:'hello', name:'Juan' }
//   S->C { t:'welcome', id:'P1', tables:[...resumen...] }
//   C->S { t:'createTable', name?, maxPlayers?, ante?, startingStack? }
//   C->S { t:'joinTable', tableId }
//   C->S { t:'leaveTable' }
//   C->S { t:'startHand' }   (cualquiera en la mesa puede iniciar si hay >=2)
//   C->S { t:'act', action:{ type, amount? } }
//   C->S { t:'chat', text }
//   S->C { t:'lobby', tables }
//   S->C { t:'state', state }   (vista publica para el jugador)
//   S->C { t:'chat', from, text, ts }
//   S->C { t:'error', message }

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Table } from './game/table.js';
import { decideBotAction, nextBotName, freeBotName } from './game/bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3030;
const STATE_FILE = path.join(__dirname, 'data', 'tables.json');

// ---------- HTTP estatico ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const fullPath = path.join(PUBLIC, urlPath);
  if (!fullPath.startsWith(PUBLIC)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(fullPath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fullPath)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server });

let PLAYER_SEQ = 1;
let BOT_ID_SEQ = 1;
const players = new Map(); // playerId -> { id, name, ws, tableId }
const tables = new Map();  // tableId -> Table
const tableBots = new Map(); // tableId -> Map<botId, botName>
const botTimers = new Map(); // tableId -> timeout id
const turnTimers = new Map(); // tableId -> timeout id (auto-fold humano)
const clientSessions = new Map(); // clientId -> { playerId, tableId, name, expiresAt, removeTimer }
const RECONNECT_GRACE_MS = 30_000;

// Logros desbloqueados por clientId (para que persistan reconexiones)
const achievements = new Map(); // clientId -> Set<achievementCode>
// Streaks de victorias por clientId (para "hot streak")
const winStreaks = new Map(); // clientId -> count
// Conteo de showdowns ganados (no folds) por clientId
const realShowdownWins = new Map(); // clientId -> count

const ACHIEVEMENTS = {
  FIRST_HAND:       { code: 'FIRST_HAND',       icon: '🃏', title: 'Primera mano',           desc: 'Jugaste tu primera mano' },
  FIRST_WIN:        { code: 'FIRST_WIN',        icon: '🏆', title: 'Primera victoria',       desc: 'Ganaste tu primera mano' },
  PERLA:            { code: 'PERLA',            icon: '💎', title: 'La Perla',                desc: 'Te llego par de 9s preflop' },
  HOT_STREAK:       { code: 'HOT_STREAK',       icon: '🔥', title: 'Hot streak',              desc: 'Ganaste 3 manos seguidas' },
  BIG_POT:          { code: 'BIG_POT',          icon: '💸', title: 'Bote gordo',              desc: 'Ganaste un bote >500' },
  SHOWDOWN_MASTER:  { code: 'SHOWDOWN_MASTER',  icon: '⚔',  title: 'Showdown master',         desc: 'Ganaste 5 showdowns reales' },
  ESCALERA_COLOR:   { code: 'ESCALERA_COLOR',   icon: '🌈', title: 'Escalera de color',       desc: 'Hiciste una escalera de color' },
  COLOR_BEATS_FULL: { code: 'COLOR_BEATS_FULL', icon: '⭐', title: 'Color > Full',            desc: 'Tu color le gano a un full' }
};

function unlock(player, code) {
  if (!player.clientId) return;
  let set = achievements.get(player.clientId);
  if (!set) { set = new Set(); achievements.set(player.clientId, set); }
  if (set.has(code)) return; // ya desbloqueado
  set.add(code);
  const ach = ACHIEVEMENTS[code];
  if (!ach) return;
  send(player.ws, { t: 'achievement', achievement: ach });
}

function checkAchievementsAfterHand(table) {
  // Primera mano + primera victoria + perla + streaks + showdown master + escalera color
  const winnerSummary = table.lastWinSummary;
  const winnerIds = new Set((winnerSummary?.winners || []).map(w => w.id));
  const wasShowdown = winnerSummary && winnerSummary.winners.some(w => !!w.hand);

  for (const tp of table.players) {
    const player = players.get(tp.id);
    if (!player || !player.clientId) continue;
    const stats = table.stats.get(tp.id);
    if (!stats) continue;
    const wasInHand = stats.handsPlayed > 0;
    if (!wasInHand) continue;
    unlock(player, 'FIRST_HAND');
    const won = winnerIds.has(tp.id);
    const winRecord = won ? winnerSummary.winners.find(w => w.id === tp.id) : null;
    if (won) {
      unlock(player, 'FIRST_WIN');
      // streak
      const cur = (winStreaks.get(player.clientId) || 0) + 1;
      winStreaks.set(player.clientId, cur);
      if (cur >= 3) unlock(player, 'HOT_STREAK');
      // big pot
      if (winRecord && winRecord.amount >= 500) unlock(player, 'BIG_POT');
      // showdown wins
      if (winRecord && winRecord.hand) {
        const sd = (realShowdownWins.get(player.clientId) || 0) + 1;
        realShowdownWins.set(player.clientId, sd);
        if (sd >= 5) unlock(player, 'SHOWDOWN_MASTER');
        // escalera color
        if (winRecord.hand.name === 'Escalera de color') unlock(player, 'ESCALERA_COLOR');
        // color beats full: si gano con Color y entre los perdedores hubo Full
        if (winRecord.hand.name === 'Color') {
          const losersWithFull = table.players.find(p =>
            !winnerIds.has(p.id) && p.hand && p.hand.name === 'Full'
          );
          if (losersWithFull) unlock(player, 'COLOR_BEATS_FULL');
        }
      }
    } else if (wasInHand) {
      // perdio la mano: cortar streak
      winStreaks.set(player.clientId, 0);
    }
    // perla: par de 9s en hole
    if (tp.hole && tp.hole.length === 2 && tp.hole[0][0] === '9' && tp.hole[1][0] === '9') {
      unlock(player, 'PERLA');
    }
  }
}

// ----- Persistencia de mesas a disco -----
let saveTimer = null;
function saveTablesSoon() {
  if (saveTimer) return; // ya programado
  saveTimer = setTimeout(() => { saveTimer = null; saveTablesNow(); }, 5000);
}
function saveTablesNow() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const snapshot = Array.from(tables.values()).map(t => ({
      id: t.id, name: t.name, maxPlayers: t.maxPlayers, ante: t.ante,
      startingStack: t.startingStack, isPrivate: t.isPrivate, inviteCode: t.inviteCode,
      tournament: t.tournament,
      // Solo persistimos jugadores HUMANOS y sus stacks. Bots no se persisten.
      players: t.players.filter(p => !String(p.id).startsWith('B')).map(p => ({
        id: p.id, name: p.name, seat: p.seat, stack: p.stack
      })),
      stats: Array.from(t.stats.entries()).map(([id, s]) => ({ id, s }))
    }));
    fs.writeFileSync(STATE_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
  } catch (err) {
    console.error('saveTables error:', err.message);
  }
}
function loadTables() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    for (const rec of data) {
      // Recreamos la mesa pero sin jugadores conectados (estan offline);
      // sus stacks se recordaran si vuelven con el mismo nombre.
      const t = new Table({
        name: rec.name, maxPlayers: rec.maxPlayers, ante: rec.ante,
        startingStack: rec.startingStack, isPrivate: rec.isPrivate,
        tournament: rec.tournament
      });
      // sobrescribir id/inviteCode para preservar codigos
      t.id = rec.id;
      t.inviteCode = rec.inviteCode;
      // Stats restauradas
      if (rec.stats) for (const { id, s } of rec.stats) t.stats.set(id, s);
      // No restauramos players activos: vuelven al conectarse.
      tables.set(t.id, t);
    }
    console.log('Restauradas', data.length, 'mesas desde', STATE_FILE);
  } catch (err) {
    console.error('loadTables error:', err.message);
  }
}

loadTables();

// Crea una mesa por defecto para que siempre haya algo en la lobby.
function ensureDefaultTable() {
  // Buscamos por nombre, no por id (que puede haber cambiado tras restart).
  const existing = Array.from(tables.values()).find(t => t.name === 'Mesa Madrid');
  if (!existing) {
    const t = new Table({ name: 'Mesa Madrid', ante: 5, startingStack: 1000, maxPlayers: 6 });
    tables.set(t.id, t);
  }
}
ensureDefaultTable();

// Auto-save periodico
setInterval(() => saveTablesNow(), 30_000);
process.on('SIGINT', () => { saveTablesNow(); process.exit(0); });
process.on('SIGTERM', () => { saveTablesNow(); process.exit(0); });

function lobbySummary() {
  return Array.from(tables.values())
    .filter(t => !t.isPrivate) // solo publicas en el lobby
    .map(t => ({
      id: t.id,
      name: t.name,
      players: t.players.length,
      maxPlayers: t.maxPlayers,
      phase: t.phase,
      ante: t.ante,
      startingStack: t.startingStack,
      tournament: !!t.tournament,
      spectators: t.spectators.size
    }));
}

function findTableByCode(code) {
  if (!code) return null;
  const norm = String(code).toUpperCase().trim();
  for (const t of tables.values()) {
    if (t.inviteCode === norm) return t;
  }
  return null;
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcastLobby() {
  const msg = { t: 'lobby', tables: lobbySummary() };
  for (const p of players.values()) send(p.ws, msg);
}

function broadcastTable(tableId) {
  const table = tables.get(tableId);
  if (!table) return;
  for (const tp of table.players) {
    const player = players.get(tp.id);
    if (player) send(player.ws, { t: 'state', state: table.publicState(tp.id) });
  }
  for (const [specId] of table.spectators) {
    const player = players.get(specId);
    if (player) send(player.ws, { t: 'state', state: table.publicState(specId) });
  }
}

function broadcastChat(tableId, from, text) {
  const table = tables.get(tableId);
  if (!table) return;
  const msg = { t: 'chat', from, text, ts: Date.now() };
  for (const tp of table.players) {
    const player = players.get(tp.id);
    if (player) send(player.ws, msg);
  }
  for (const [specId] of table.spectators) {
    const player = players.get(specId);
    if (player) send(player.ws, msg);
  }
}

function leaveCurrentTable(player) {
  if (!player.tableId) return;
  const table = tables.get(player.tableId);
  if (table) {
    table.removePlayer(player.id);
    table.removeSpectator(player.id);
    // Si solo quedan bots (o nada) sin espectadores y no es la mesa por defecto, recoger.
    const human = table.players.some(p => !String(p.id).startsWith('B'));
    const hasSpectators = table.spectators.size > 0;
    if (!human && !hasSpectators && table.name !== 'Mesa Madrid') {
      cleanupTable(table.id);
    } else {
      broadcastTable(table.id);
      tickBots(table.id);
    }
  }
  player.tableId = null;
  player.isSpectator = false;
}

function cleanupTable(tableId) {
  const bots = tableBots.get(tableId);
  if (bots) for (const name of bots.values()) freeBotName(name);
  tableBots.delete(tableId);
  const tm = botTimers.get(tableId);
  if (tm) { clearTimeout(tm); botTimers.delete(tableId); }
  clearTurnTimer(tableId);
  tables.delete(tableId);
}

function addBotToTable(tableId) {
  const t = tables.get(tableId);
  if (!t) throw new Error('Mesa no existe');
  if (t.players.length >= t.maxPlayers) throw new Error('Mesa llena');
  const id = 'B' + (BOT_ID_SEQ++);
  const name = nextBotName();
  const r = t.addPlayer(id, name);
  if (!r.ok) { freeBotName(name); throw new Error(r.error); }
  let map = tableBots.get(tableId);
  if (!map) { map = new Map(); tableBots.set(tableId, map); }
  map.set(id, name);
  return { id, name };
}

function removeBotFromTable(tableId) {
  const t = tables.get(tableId);
  const map = tableBots.get(tableId);
  if (!t || !map || map.size === 0) throw new Error('No hay bots para quitar');
  const [botId] = map.keys();
  const name = map.get(botId);
  t.removePlayer(botId);
  map.delete(botId);
  freeBotName(name);
}

function isBot(playerId) { return String(playerId).startsWith('B'); }

function clearTurnTimer(tableId) {
  const tm = turnTimers.get(tableId);
  if (tm) { clearTimeout(tm); turnTimers.delete(tableId); }
}

function scheduleNextAction(tableId) {
  clearTurnTimer(tableId);
  const t = tables.get(tableId);
  if (!t || !t.toAct) return;
  if (isBot(t.toAct)) {
    tickBots(tableId);
  } else {
    scheduleAutoFold(tableId);
  }
}

function scheduleAutoFold(tableId) {
  const t = tables.get(tableId);
  if (!t || !t.toAct || isBot(t.toAct)) return;
  const handle = setTimeout(() => {
    turnTimers.delete(tableId);
    const table = tables.get(tableId);
    if (!table || !table.toAct) return;
    const playerId = table.toAct;
    if (isBot(playerId)) return;
    // intentar check (gratis), si no, fold
    let r = table.act(playerId, { type: 'check' });
    if (!r.ok) r = table.act(playerId, { type: 'fold' });
    broadcastTable(tableId);
    if (table.phase === 'showdown') {
      checkAchievementsAfterHand(table);
      setTimeout(() => {
        if (!tables.has(tableId)) return;
        if (table.canStart()) { table.startHand(); broadcastTable(tableId); broadcastLobby(); scheduleNextAction(tableId); }
        else { table.phase = 'waiting'; broadcastTable(tableId); broadcastLobby(); }
      }, 5000);
    } else {
      scheduleNextAction(tableId);
    }
  }, t.actionTimeoutMs);
  turnTimers.set(tableId, handle);
}

function tickBots(tableId) {
  const t = tables.get(tableId);
  if (!t) return;
  const tm = botTimers.get(tableId);
  if (tm) { clearTimeout(tm); botTimers.delete(tableId); }
  if (t.phase === 'waiting' || t.phase === 'showdown') return;
  if (!t.toAct || !isBot(t.toAct)) return;
  const delay = 700 + Math.floor(Math.random() * 800);
  const handle = setTimeout(() => {
    botTimers.delete(tableId);
    const table = tables.get(tableId);
    if (!table || !table.toAct || !isBot(table.toAct)) return;
    const bot = { id: table.toAct };
    let action;
    try { action = decideBotAction(table, bot); }
    catch { action = { type: 'fold' }; }
    const r = table.act(bot.id, action);
    if (!r || !r.ok) {
      // fallback: si el bot no pudo, intenta check, luego fold.
      const fb = table.act(bot.id, { type: 'check' });
      if (!fb.ok) table.act(bot.id, { type: 'fold' });
    }
    broadcastTable(tableId);
    if (table.phase === 'showdown') {
      checkAchievementsAfterHand(table);
      // auto-restart si todavia hay >=2 con stack
      setTimeout(() => {
        if (!tables.has(tableId)) return;
        if (table.canStart()) { table.startHand(); broadcastTable(tableId); broadcastLobby(); scheduleNextAction(tableId); }
        else { table.phase = 'waiting'; broadcastTable(tableId); broadcastLobby(); }
      }, 5000);
    } else {
      scheduleNextAction(tableId);
    }
  }, delay);
  botTimers.set(tableId, handle);
}

wss.on('connection', (ws) => {
  const id = 'P' + (PLAYER_SEQ++);
  const player = { id, name: 'Anonimo', ws, tableId: null, clientId: null };
  players.set(id, player);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    handleMessage(player, msg).catch(err => send(ws, { t: 'error', message: err.message }));
  });

  ws.on('close', () => {
    handleDisconnect(player);
    players.delete(id);
    broadcastLobby();
  });

  send(ws, { t: 'welcome', id, tables: lobbySummary() });
});

// Tras cierre WS: si el jugador estaba en mesa con clientId, ponemos
// gracia de 30s para reconectar. Si no llega, lo sacamos de verdad.
function handleDisconnect(player) {
  if (!player.tableId || !player.clientId) {
    leaveCurrentTable(player);
    return;
  }
  const table = tables.get(player.tableId);
  if (!table) { leaveCurrentTable(player); return; }
  const tp = table.players.find(p => p.id === player.id);
  const isSpec = table.spectators.has(player.id);
  if (!tp && !isSpec) { leaveCurrentTable(player); return; }
  // Marcamos sittingOut para que el game loop no se atasque
  if (tp) { tp.sittingOut = true; tp.lastAction = 'desconectado...'; }
  // Si era su turno, pasar al siguiente para no bloquear
  if (table.toAct === player.id) {
    table.act(player.id, { type: 'check' });
    if (table.toAct === player.id) table.act(player.id, { type: 'fold' });
  }
  const tableId = player.tableId;
  const playerId = player.id;
  const clientId = player.clientId;
  const wasSpec = isSpec;
  const removeTimer = setTimeout(() => {
    const sess = clientSessions.get(clientId);
    if (!sess || sess.expiresAt > Date.now()) return;
    // Quitar definitivamente
    const t = tables.get(tableId);
    if (t) {
      if (wasSpec) t.removeSpectator(playerId);
      else t.removePlayer(playerId);
      const human = t.players.some(p => !String(p.id).startsWith('B'));
      const hasSpec = t.spectators.size > 0;
      if (!human && !hasSpec && t.name !== 'Mesa Madrid') cleanupTable(tableId);
      else { broadcastTable(tableId); broadcastLobby(); scheduleNextAction(tableId); }
    }
    clientSessions.delete(clientId);
  }, RECONNECT_GRACE_MS);
  clientSessions.set(clientId, {
    playerId, tableId, name: player.name, isSpec: wasSpec,
    expiresAt: Date.now() + RECONNECT_GRACE_MS,
    removeTimer
  });
  broadcastTable(tableId);
  scheduleNextAction(tableId);
}

async function handleMessage(player, msg) {
  switch (msg.t) {
    case 'hello': {
      const name = String(msg.name || '').trim().slice(0, 20) || ('Jugador' + player.id);
      player.name = name;
      const clientId = String(msg.clientId || '').slice(0, 64) || null;
      player.clientId = clientId;
      // Reconexion: si tenemos sesion abierta para este clientId, rebindeamos.
      if (clientId) {
        const sess = clientSessions.get(clientId);
        if (sess && sess.expiresAt > Date.now()) {
          clearTimeout(sess.removeTimer);
          const t = tables.get(sess.tableId);
          if (t) {
            if (sess.isSpec) {
              t.removeSpectator(sess.playerId);
              t.addSpectator(player.id, player.name);
              player.tableId = t.id;
              player.isSpectator = true;
            } else {
              const oldPlayer = t.players.find(p => p.id === sess.playerId);
              if (oldPlayer) {
                // Rebind: cambiar id en lugar
                oldPlayer.id = player.id;
                oldPlayer.sittingOut = false;
                oldPlayer.lastAction = null;
                player.tableId = t.id;
                // migrar stats
                const oldStat = t.stats.get(sess.playerId);
                if (oldStat) { t.stats.set(player.id, oldStat); t.stats.delete(sess.playerId); }
                // toAct/lastAggressor
                if (t.toAct === sess.playerId) t._setToAct(player.id);
                if (t.lastAggressor === sess.playerId) t.lastAggressor = player.id;
                if (Array.isArray(t.winners)) t.winners = t.winners.map(w => w === sess.playerId ? player.id : w);
              }
            }
            broadcastTable(t.id);
            scheduleNextAction(t.id);
            send(player.ws, { t: 'reconnected', tableId: t.id });
          }
          clientSessions.delete(clientId);
        }
      }
      send(player.ws, { t: 'lobby', tables: lobbySummary() });
      break;
    }
    case 'createTable': {
      leaveCurrentTable(player);
      // Torneo: si el cliente pide modo torneo, definimos niveles por defecto
      let tournament = null;
      if (msg.tournament) {
        tournament = {
          levels: [
            { ante: 5,   durationMs: 3 * 60_000 },
            { ante: 10,  durationMs: 3 * 60_000 },
            { ante: 20,  durationMs: 3 * 60_000 },
            { ante: 40,  durationMs: 3 * 60_000 },
            { ante: 80,  durationMs: 3 * 60_000 },
            { ante: 160, durationMs: 5 * 60_000 },
            { ante: 320, durationMs: 5 * 60_000 }
          ],
          currentLevel: 0,
          startedAt: 0,
          levelEndsAt: 0
        };
      }
      const t = new Table({
        name: String(msg.name || '').trim().slice(0, 30) || ('Mesa de ' + player.name),
        maxPlayers: Math.min(9, Math.max(2, +msg.maxPlayers || 6)),
        ante: Math.max(1, +msg.ante || 5),
        startingStack: Math.max(50, +msg.startingStack || 1000),
        isPrivate: !!msg.isPrivate,
        tournament
      });
      tables.set(t.id, t);
      const r = t.addPlayer(player.id, player.name);
      if (!r.ok) { tables.delete(t.id); throw new Error(r.error); }
      player.tableId = t.id;
      broadcastLobby();
      broadcastTable(t.id);
      saveTablesSoon();
      break;
    }
    case 'joinByCode': {
      const t = findTableByCode(msg.code);
      if (!t) throw new Error('Codigo invalido o mesa no existe');
      leaveCurrentTable(player);
      const r = t.addPlayer(player.id, player.name);
      if (!r.ok) throw new Error(r.error);
      player.tableId = t.id;
      broadcastLobby();
      broadcastTable(t.id);
      saveTablesSoon();
      break;
    }
    case 'spectate': {
      const t = tables.get(msg.tableId) || findTableByCode(msg.code);
      if (!t) throw new Error('Mesa no existe');
      leaveCurrentTable(player);
      const r = t.addSpectator(player.id, player.name);
      if (!r.ok) throw new Error(r.error);
      player.tableId = t.id;
      player.isSpectator = true;
      broadcastLobby();
      broadcastTable(t.id);
      break;
    }
    case 'joinTable': {
      const t = tables.get(msg.tableId);
      if (!t) throw new Error('Mesa no existe');
      leaveCurrentTable(player);
      const seatReq = (typeof msg.seat === 'number') ? msg.seat : null;
      const r = t.addPlayer(player.id, player.name, seatReq);
      if (!r.ok) throw new Error(r.error);
      player.tableId = t.id;
      broadcastLobby();
      broadcastTable(t.id);
      break;
    }
    case 'sitAtSeat': {
      // Si ya esta en la mesa, mover de asiento solo si la fase es waiting.
      const t = tables.get(msg.tableId || player.tableId);
      if (!t) throw new Error('Mesa no existe');
      const seatReq = +msg.seat;
      const existing = t.players.find(p => p.id === player.id);
      if (existing) {
        if (t.phase !== 'waiting') throw new Error('No puedes cambiar de asiento durante una mano');
        const taken = t.players.some(p => p.seat === seatReq);
        if (taken) throw new Error('Ese asiento esta ocupado');
        existing.seat = seatReq;
        t.players.sort((a, b) => a.seat - b.seat);
      } else {
        leaveCurrentTable(player);
        const r = t.addPlayer(player.id, player.name, seatReq);
        if (!r.ok) throw new Error(r.error);
        player.tableId = t.id;
      }
      broadcastTable(t.id);
      broadcastLobby();
      break;
    }
    case 'getHistory': {
      const t = tables.get(player.tableId);
      if (!t) throw new Error('No estas en una mesa');
      send(player.ws, { t: 'history', tableId: t.id, hands: t.getHistory() });
      break;
    }
    case 'leaveTable': {
      leaveCurrentTable(player);
      broadcastLobby();
      send(player.ws, { t: 'state', state: null });
      break;
    }
    case 'startHand': {
      const t = tables.get(player.tableId);
      if (!t) throw new Error('No estas en una mesa');
      const r = t.startHand();
      if (!r.ok) throw new Error(r.error);
      broadcastTable(t.id);
      broadcastLobby();
      scheduleNextAction(t.id);
      break;
    }
    case 'act': {
      const t = tables.get(player.tableId);
      if (!t) throw new Error('No estas en una mesa');
      clearTurnTimer(t.id);
      const r = t.act(player.id, msg.action || {});
      if (!r.ok) throw new Error(r.error);
      broadcastTable(t.id);
      // Si se acabo la mano, programa siguiente arranque automatico tras 6s.
      if (t.phase === 'showdown') {
        checkAchievementsAfterHand(t);
        setTimeout(() => {
          if (!tables.has(t.id)) return;
          if (t.canStart()) { t.startHand(); broadcastTable(t.id); broadcastLobby(); scheduleNextAction(t.id); }
          else { t.phase = 'waiting'; broadcastTable(t.id); broadcastLobby(); }
        }, 6000);
      } else {
        scheduleNextAction(t.id);
      }
      break;
    }
    case 'addBot': {
      const t = tables.get(player.tableId);
      if (!t) throw new Error('No estas en una mesa');
      addBotToTable(t.id);
      broadcastTable(t.id);
      broadcastLobby();
      break;
    }
    case 'removeBot': {
      const t = tables.get(player.tableId);
      if (!t) throw new Error('No estas en una mesa');
      removeBotFromTable(t.id);
      broadcastTable(t.id);
      broadcastLobby();
      break;
    }
    case 'chat': {
      const text = String(msg.text || '').trim().slice(0, 200);
      if (!text || !player.tableId) return;
      broadcastChat(player.tableId, player.name, text);
      break;
    }
    default:
      throw new Error('Mensaje desconocido: ' + msg.t);
  }
}

const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log('Chiribito server escuchando en ' + HOST + ':' + PORT);
});
