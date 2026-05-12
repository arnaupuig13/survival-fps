// Cliente Chiribito - vanilla JS, sin frameworks.

import { Sound, unlockAudioOnce, isMuted, toggleMute } from '/sounds.js';
import { getDeckStyle, setDeckStyle, makeCardEl, prettyCardHTML, rankLabel } from '/cards.js';
import { t, setLang, getLang, applyTranslations } from '/i18n.js';

// Solo necesitamos los valores numericos y nombres de manos para evaluator local (mejor mano actual).
const RANK_VAL = { '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
const HAND_NAME_C = { 8: 'Escalera de color', 7: 'Poker', 6: 'Color', 5: 'Full', 4: 'Escalera', 3: 'Trio', 2: 'Doble pareja', 1: 'Pareja', 0: 'Carta alta' };

function combos(arr, k) {
  const out = []; const n = arr.length; if (k > n) return out;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    out.push(idx.map(i => arr[i]));
    let i = k - 1; while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) break;
    idx[i]++; for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}
function score5C(cards) {
  const vals = cards.map(c => RANK_VAL[c[0]]).sort((a, b) => b - a);
  const suits = cards.map(c => c[1]);
  const isFlush = suits.every(s => s === suits[0]);
  const freq = {};
  for (const v of vals) freq[v] = (freq[v] || 0) + 1;
  const groups = Object.entries(freq).map(([v, c]) => ({ v: +v, c })).sort((a, b) => (b.c - a.c) || (b.v - a.v));
  let isStraight = false;
  if (new Set(vals).size === 5 && vals[0] - vals[4] === 4) isStraight = true;
  if (isStraight && isFlush) return { rank: 8, tb: [vals[0]] };
  if (groups[0].c === 4) return { rank: 7, tb: [groups[0].v, groups[1].v] };
  if (isFlush) return { rank: 6, tb: vals };
  if (groups[0].c === 3 && groups[1].c === 2) return { rank: 5, tb: [groups[0].v, groups[1].v] };
  if (isStraight) return { rank: 4, tb: [vals[0]] };
  if (groups[0].c === 3) return { rank: 3, tb: [groups[0].v, ...vals.filter(v => v !== groups[0].v)] };
  if (groups[0].c === 2 && groups[1].c === 2) {
    const high = Math.max(groups[0].v, groups[1].v), low = Math.min(groups[0].v, groups[1].v);
    const k = vals.find(v => v !== groups[0].v && v !== groups[1].v);
    return { rank: 2, tb: [high, low, k] };
  }
  if (groups[0].c === 2) return { rank: 1, tb: [groups[0].v, ...vals.filter(v => v !== groups[0].v)] };
  return { rank: 0, tb: vals };
}
function bestHandClient(hole, community) {
  if (!hole || hole.length !== 2) return null;
  if (!community || community.length < 3) {
    // sin suficientes comunitarias, devolver "lectura" preflop usando labels actuales
    const r0 = rankLabel(hole[0]);
    const r1 = rankLabel(hole[1]);
    if (hole[0][0] === hole[1][0]) return { name: 'Pareja de ' + r0 + ' (preflop)' };
    if (hole[0][1] === hole[1][1]) return { name: r0 + r1 + ' suited' };
    return { name: r0 + r1 + ' offsuit' };
  }
  let best = null;
  for (const trio of combos(community, 3)) {
    const s = score5C([...hole, ...trio]);
    if (!best || s.rank > best.rank || (s.rank === best.rank && cmpTb(s.tb, best.tb) > 0)) best = s;
  }
  return { name: HAND_NAME_C[best.rank] };
}
function cmpTb(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0, bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
function isPerla(hole) {
  return hole && hole.length === 2 && hole[0][0] === '9' && hole[1][0] === '9';
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const ui = {
  meName: $('#meName'),
  meSet: $('#meSet'),
  meWho: $('#meWho'),
  lobby: $('#lobby'),
  table: $('#table'),
  newTableBtn: $('#newTableBtn'),
  newTableForm: $('#newTableForm'),
  ntName: $('#ntName'),
  ntMax: $('#ntMax'),
  ntAnte: $('#ntAnte'),
  ntStack: $('#ntStack'),
  ntCreate: $('#ntCreate'),
  ntCancel: $('#ntCancel'),
  tablesBody: $('#tablesBody'),
  tableName: $('#tableName'),
  tablePhase: $('#tablePhase'),
  tablePot: $('#tablePot'),
  startBtn: $('#startBtn'),
  addBotBtn: $('#addBotBtn'),
  removeBotBtn: $('#removeBotBtn'),
  leaveBtn: $('#leaveBtn'),
  meHand: $('#meHand'),
  community: $('#community'),
  seats: $('#seats'),
  winnerBanner: $('#winnerBanner'),
  meCards: $('#meCards'),
  meStack: $('#meStack'),
  meBet: $('#meBet'),
  meToCall: $('#meToCall'),
  actFold: $('#actFold'),
  actCheck: $('#actCheck'),
  actCall: $('#actCall'),
  actAmount: $('#actAmount'),
  actBet: $('#actBet'),
  actRaise: $('#actRaise'),
  actAllIn: $('#actAllIn'),
  log: $('#log'),
  chat: $('#chat'),
  chatForm: $('#chatForm'),
  chatInput: $('#chatInput'),
  toast: $('#toast'),
  muteBtn: $('#muteBtn'),
  deckStyle: $('#deckStyle'),
  potAmount: $('#potAmount'),
  potChips: $('#potChips'),
  perlaBadge: $('#perlaBadge'),
  actionTimerBar: $('#actionTimerBar'),
  actionTimerFill: document.querySelector('#actionTimerBar .action-timer-fill'),
  paCheckFold: $('#paCheckFold'),
  paCallAny: $('#paCallAny'),
  themePick: $('#themePick'),
  privacyBtn: $('#privacyBtn'),
  historyBtn: $('#historyBtn'),
  statsBtn: $('#statsBtn'),
  historyModal: $('#historyModal'),
  historyBody: $('#historyBody'),
  statsModal: $('#statsModal'),
  statsBody: $('#statsBody'),
  sidePotsBox: $('#sidePotsBox'),
  tipBox: $('#tipBox'),
  tourneyLeaderboard: $('#tourneyLeaderboard'),
  tourneyRanking: $('#tourneyRanking'),
  langPick: $('#langPick'),
  cinemaBtn: $('#cinemaBtn'),
  voiceBtn: $('#voiceBtn'),
  crowdBtn: $('#crowdBtn'),
  spotlight: $('#spotlight'),
  deck: $('#deck'),
  feltRim: $('#feltRim'),
  dealerHand: $('#dealerHand'),
  liveStats: $('#liveStats'),
  lsHph: $('#lsHph'),
  lsM: $('#lsM'),
  lsTime: $('#lsTime'),
  lobbySearch: $('#lobbySearch'),
  joinCodeInput: $('#joinCodeInput'),
  joinCodeBtn: $('#joinCodeBtn'),
  ntPrivate: $('#ntPrivate'),
  ntTournament: $('#ntTournament'),
  tournamentBox: $('#tournamentBox'),
  spectatorTag: $('#spectatorTag'),
  inviteBtn: $('#inviteBtn')
};

let me = { id: null, name: '' };
let lastState = null;
let ws = null;
let lastLogLen = 0;
let lastCommunityLen = 0;
let lastToAct = null;
let lastStateReceivedAt = 0;
// Diffing para animaciones
let prevPotShown = 0;          // ultimo bote pintado (para count-up)
let prevStacksByPid = new Map(); // pid -> ultimo stack pintado
let prevDealerSeat = null;
let prevPhase = null;
// Stats en vivo
let sessionStartedAt = Date.now();
const handTimestamps = []; // timestamps de inicio de cada mano (para hands/hour)
let lastSeenHandId = null;

// ----- nombre persistente -----
const savedName = localStorage.getItem('chiribito.name');
if (savedName) ui.meName.value = savedName;

// ----- websocket -----
function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host);
  ws.onopen = () => {
    sendHello();
  };
  ws.onmessage = (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    onMessage(msg);
  };
  ws.onclose = () => {
    showToast('Conexion perdida. Reintentando...');
    setTimeout(connect, 1500);
  };
  ws.onerror = () => {};
}

function send(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

// clientId persistente para reconexion
let clientId = localStorage.getItem('chiribito.clientId');
if (!clientId) {
  clientId = 'C-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
  localStorage.setItem('chiribito.clientId', clientId);
}

function sendHello() {
  const name = (ui.meName.value || '').trim() || ('Jugador-' + Math.floor(Math.random() * 1000));
  me.name = name;
  ui.meWho.textContent = name;
  localStorage.setItem('chiribito.name', name);
  send({ t: 'hello', name, clientId });
  // Si la URL tiene ?code=ABC123, auto-join
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (code) {
    setTimeout(() => send({ t: 'joinByCode', code: code.toUpperCase() }), 200);
    history.replaceState({}, '', location.pathname);
  }
}

function onMessage(msg) {
  switch (msg.t) {
    case 'welcome':
      me.id = msg.id;
      renderLobbyTables(msg.tables || []);
      break;
    case 'lobby':
      renderLobbyTables(msg.tables || []);
      break;
    case 'state':
      lastState = msg.state;
      lastStateReceivedAt = Date.now();
      if (msg.state) renderTable(msg.state); else { showLobby(); }
      break;
    case 'chat':
      addChat(msg.from, msg.text);
      break;
    case 'history':
      renderHistory(msg.hands || []);
      break;
    case 'achievement':
      showAchievementPopup(msg.achievement);
      break;
    case 'reconnected':
      showToast('🔌 Reconectado a la mesa');
      break;
    case 'error':
      showToast(msg.message);
      break;
  }
}

// ----- lobby UI -----
let _lastLobbyTables = [];
function renderLobbyTables(tables) {
  _lastLobbyTables = tables;
  const filter = (ui.lobbySearch?.value || '').toLowerCase().trim();
  const filtered = filter ? tables.filter(t => t.name.toLowerCase().includes(filter)) : tables;
  ui.tablesBody.innerHTML = '';
  if (!filtered.length) {
    ui.tablesBody.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">No hay mesas que coincidan.</td></tr>';
    return;
  }
  for (const t of filtered) {
    const tr = document.createElement('tr');
    const tags = [];
    if (t.tournament) tags.push('<span class="tag-pill gold">TORNEO</span>');
    if (t.spectators > 0) tags.push(`<span class="tag-pill">👁 ${t.spectators}</span>`);
    tr.innerHTML = `
      <td><b>${escapeHTML(t.name)}</b> ${tags.join(' ')}</td>
      <td>${t.players}/${t.maxPlayers}</td>
      <td>${t.ante}</td>
      <td>${t.startingStack}</td>
      <td>${labelPhase(t.phase)}</td>
      <td>
        <button data-id="${t.id}" class="join">Entrar</button>
        <button data-id="${t.id}" class="spectate" data-tip="Observar sin sentarse">👁</button>
      </td>
    `;
    ui.tablesBody.appendChild(tr);
  }
  $$('.join').forEach(b => b.addEventListener('click', () => {
    send({ t: 'joinTable', tableId: b.dataset.id });
  }));
  $$('.spectate').forEach(b => b.addEventListener('click', () => {
    send({ t: 'spectate', tableId: b.dataset.id });
  }));
}

function labelPhase(p) {
  if (p === 'waiting') return t('phase.waiting');
  if (p === 'showdown') return t('phase.showdown');
  if (p === 'preflop') return t('phase.preflop');
  if (p && p.startsWith('street')) return t('phase.street') + p.slice(6);
  return p || '-';
}

// ----- table UI -----
function showLobby() {
  ui.lobby.classList.remove('hidden');
  ui.table.classList.add('hidden');
  lastState = null;
}

function showTable() {
  ui.lobby.classList.add('hidden');
  ui.table.classList.remove('hidden');
}

function renderTable(state) {
  showTable();
  ui.tableName.textContent = state.name;
  ui.tablePhase.textContent = labelPhase(state.phase);
  // Pot count-up animado
  animateNumber(ui.tablePot, prevPotShown, state.pot, 500);
  if (ui.potAmount) animateNumber(ui.potAmount, prevPotShown, state.pot, 500);
  prevPotShown = state.pot;
  renderPotChips(state.pot);

  // Espectador?
  ui.spectatorTag.classList.toggle('hidden', !state.iAmSpectator);

  // Invitar (solo si tengo codigo y no soy espectador-only)
  ui.inviteBtn.classList.toggle('hidden', !state.inviteCode);

  // Tournament info
  if (state.tournament && state.tournament.levels) {
    const lvl = state.tournament.currentLevel || 0;
    const cur = state.tournament.levels[lvl];
    const next = state.tournament.levels[lvl + 1];
    const remainMs = Math.max(0, (state.tournament.levelEndsAt || 0) - (state.serverNow || Date.now()));
    const mm = Math.floor(remainMs / 60000), ss = Math.floor((remainMs % 60000) / 1000);
    ui.tournamentBox.innerHTML = `
      <span class="t-label">Torneo</span>
      <span class="t-level">Nivel ${lvl+1}</span>
      <span class="t-ante">ante ${cur ? cur.ante : '-'}</span>
      <span class="t-time">${mm}:${ss.toString().padStart(2,'0')}</span>
      ${next ? `<span class="t-next" data-tip="Proximo nivel">→ ${next.ante}</span>` : ''}
    `;
    ui.tournamentBox.classList.remove('hidden');
  } else {
    ui.tournamentBox.classList.add('hidden');
  }

  // Si soy espectador, deshabilito acciones de mesa (start, bots, etc.)
  ui.startBtn.disabled = state.iAmSpectator || !(state.phase === 'waiting' && state.players.length >= 2);
  ui.addBotBtn.disabled = !!state.iAmSpectator;
  ui.removeBotBtn.disabled = !!state.iAmSpectator;

  // community: 5 placeholders + revealed
  ui.community.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    if (state.community[i]) ui.community.appendChild(makeCard(state.community[i]));
    else { const ph = makeCard(null, true); ui.community.appendChild(ph); }
  }

  // seats (alrededor del felt)
  ui.seats.innerHTML = '';
  const meP = state.players.find(p => p.id === me.id);
  const seatCount = Math.max(state.maxPlayers || 6, state.players.length);
  // Posiciona "yo" abajo-centro y los demas en circulo
  const meSeat = meP ? meP.seat : 0;
  const seatsSorted = [...state.players].sort((a, b) => a.seat - b.seat);

  for (const p of seatsSorted) {
    const offset = ((p.seat - meSeat) + seatCount) % seatCount;
    const angle = Math.PI / 2 + (offset / seatCount) * Math.PI * 2; // bottom = 90deg
    const cx = 50 + Math.cos(angle) * 38;
    const cy = 50 + Math.sin(angle) * 40;
    const div = document.createElement('div');
    div.className = 'seat';
    div.dataset.pid = p.id;
    if (p.id === state.toAct) div.classList.add('toact');
    if (p.folded) div.classList.add('folded');
    if (p.seat === state.dealerSeat) div.classList.add('dealer');
    if (p.isWinner) div.classList.add('winner');
    div.style.left = cx + '%';
    div.style.top = cy + '%';
    const showHole = p.hole && p.hole.length > 0;
    const isBot = String(p.id).startsWith('B');
    const isDealer = (p.seat === state.dealerSeat);
    const st = p.stats || { handsPlayed: 0, handsWon: 0 };
    const winPct = st.handsPlayed > 0 ? Math.round(st.handsWon / st.handsPlayed * 100) : 0;
    const statsBadge = st.handsPlayed > 0 ? `<div class="seat-stats" data-tip="Manos jugadas / ganadas">${st.handsPlayed}M · ${winPct}% W</div>` : '';
    // Bubble de accion solo si hay accion reciente y no es desconectado/sittingOut
    const showBubble = p.lastAction && !p.sittingOut;
    const bubbleClass = p.lastAction && /fold/i.test(p.lastAction) ? 'bubble-fold' :
                        p.lastAction && /allin/i.test(p.lastAction) ? 'bubble-allin' :
                        p.lastAction && /raise|bet/i.test(p.lastAction) ? 'bubble-raise' :
                        p.lastAction && /call/i.test(p.lastAction) ? 'bubble-call' :
                        p.lastAction && /check/i.test(p.lastAction) ? 'bubble-check' : 'bubble-default';
    div.innerHTML = `
      ${showBubble ? `<div class="speech-bubble ${bubbleClass}">${escapeHTML(p.lastAction)}</div>` : ''}
      ${avatarHTML(p.name, isBot)}
      <div class="nameplate">
        <div class="name">${escapeHTML(p.name)}${p.id === me.id ? ' (tu)' : ''}</div>
        <div class="stack"><span class="stack-num" data-pid="${p.id}">${p.stack}</span> ${p.allIn ? '· <span class="allin-tag">ALL-IN</span>' : ''}</div>
        ${p.handName ? `<div class="action gold-text">${escapeHTML(p.handName)}</div>` : (p.sittingOut ? '<div class="action">Sentado fuera</div>' : '')}
        ${statsBadge}
      </div>
      <div class="hole">
        ${showHole
          ? p.hole.map(c => makeCard(c, false, true).outerHTML).join('')
          : (p.folded || p.sittingOut ? '' : '<div class="card small back"></div><div class="card small back"></div>')}
      </div>
      <div class="bet">${p.bet ? '<span class="bet-chip"></span>' + p.bet : ''}</div>
      ${isDealer ? '<div class="dealer-button" title="Dealer">D</div>' : ''}
    `;
    ui.seats.appendChild(div);
  }

  // Stack count-down/up animado por jugador
  for (const p of state.players) {
    const prev = prevStacksByPid.get(p.id);
    const stackEl = document.querySelector(`.stack-num[data-pid="${p.id}"]`);
    if (stackEl) {
      if (prev !== undefined && prev !== p.stack) {
        animateNumber(stackEl, prev, p.stack, 500);
        if (p.stack < prev) {
          stackEl.classList.add('stack-down');
          setTimeout(() => stackEl.classList.remove('stack-down'), 600);
        } else if (p.stack > prev) {
          stackEl.classList.add('stack-up');
          setTimeout(() => stackEl.classList.remove('stack-up'), 600);
        }
      }
    }
    prevStacksByPid.set(p.id, p.stack);
  }

  // Dealer button: si cambio de seat, animar slide
  if (prevDealerSeat !== null && prevDealerSeat !== state.dealerSeat) {
    slideDealerButton(prevDealerSeat, state.dealerSeat);
  }
  prevDealerSeat = state.dealerSeat;

  // Empty seats si esta esperando: pintamos slots vacios con boton "Sentarse"
  if (state.phase === 'waiting' && state.players.length < (state.maxPlayers || 6)) {
    const occupied = new Set(state.players.map(p => p.seat));
    for (let s = 0; s < (state.maxPlayers || 6); s++) {
      if (occupied.has(s)) continue;
      const offset = ((s - meSeat) + seatCount) % seatCount;
      const angle = Math.PI / 2 + (offset / seatCount) * Math.PI * 2;
      const cx = 50 + Math.cos(angle) * 38;
      const cy = 50 + Math.sin(angle) * 40;
      const slot = document.createElement('div');
      slot.className = 'seat empty-seat';
      slot.dataset.seat = s;
      slot.style.left = cx + '%';
      slot.style.top = cy + '%';
      slot.setAttribute('data-tip', meP ? 'Cambiar a este asiento' : 'Sentarse aqui');
      slot.innerHTML = '<div class="empty-marker">+ asiento</div>';
      slot.addEventListener('click', () => {
        send({ t: 'sitAtSeat', tableId: state.id, seat: s });
      });
      ui.seats.appendChild(slot);
    }
  }

  // Side pots (solo en showdown con multiples pots)
  renderSidePots(state);
  // Highlight de cartas ganadoras en showdown
  highlightShowdown(state);
  // Tournament leaderboard
  renderTourneyLeaderboard(state);
  // Spotlight sobre el jugador en turno
  updateSpotlight(state);
  // Stats en vivo
  updateLiveStats(state);

  // winner banner
  if (state.lastWinSummary && state.phase === 'showdown') {
    const w = state.lastWinSummary.winners;
    const txt = w.map(x => `${x.name} +$${x.amount}${x.hand ? ' (' + x.hand.name + ')' : ''}`).join(' · ');
    ui.winnerBanner.textContent = 'Gana: ' + txt;
    ui.winnerBanner.classList.remove('hidden');
  } else {
    ui.winnerBanner.classList.add('hidden');
  }

  // me info & actions
  if (meP) {
    ui.meCards.innerHTML = '';
    if (meP.hole && meP.hole.length) {
      for (const c of meP.hole) ui.meCards.appendChild(makeCard(c));
    }
    ui.meStack.textContent = meP.stack;
    ui.meBet.textContent = meP.bet;
    const toCall = Math.max(0, state.currentBet - meP.bet);
    ui.meToCall.textContent = toCall;

    // Mejor mano actual + La Perla
    if (meP.hole && meP.hole.length === 2) {
      const bh = bestHandClient(meP.hole, state.community);
      let txt = bh ? bh.name : '-';
      const perla = isPerla(meP.hole);
      if (perla) txt = 'LA PERLA — ' + txt;
      ui.meHand.textContent = txt;
      ui.perlaBadge.classList.toggle('hidden', !perla);
    } else {
      ui.meHand.textContent = '-';
      ui.perlaBadge.classList.add('hidden');
    }

    const myTurn = state.toAct === me.id && !meP.folded;
    ui.actFold.disabled = !myTurn;
    ui.actCheck.disabled = !myTurn || toCall > 0;
    ui.actCall.disabled = !myTurn || toCall === 0;
    ui.actBet.disabled = !myTurn || state.currentBet > 0;
    ui.actRaise.disabled = !myTurn || state.currentBet === 0;
    ui.actAllIn.disabled = !myTurn || meP.stack === 0;
    if (myTurn) {
      ui.actCall.textContent = toCall > 0 ? `Call ${toCall}` : 'Call';
    }
  }

  // log
  ui.log.innerHTML = '';
  for (const l of (state.log || [])) {
    const li = document.createElement('li');
    li.innerHTML = formatLog(l);
    ui.log.appendChild(li);
  }
  ui.log.scrollTop = ui.log.scrollHeight;

  // ----- efectos: detectar lo nuevo desde el ultimo render -----
  processEffects(state);
  // Slow-mo si entramos a un showdown REAL (con manos reveladas)
  if (state.phase === 'showdown' && prevPhase !== 'showdown') {
    const realShowdown = state.players.some(p => p.handCards && p.handCards.length === 5);
    if (realShowdown) startSlowMo(2200);
    // Final hand flip: si TU eras el ultimo y el resto se fue (gana por fold-out),
    // dale un flip dramatico a tus hole cards (mostrar victoria).
    const aliveOthers = state.players.filter(p => p.id !== me.id && !p.folded && !p.sittingOut).length;
    const meWon = state.winners && state.winners.includes(me.id);
    if (meWon && aliveOthers === 0 && !realShowdown) {
      triumphFlip();
    }
  }
  prevPhase = state.phase;
  lastToAct = state.toAct;
}

// Triumph flip: tus hole cards hacen un flip dramatico vertical, escalan y brillan.
function triumphFlip() {
  const cards = document.querySelectorAll('#meCards .card');
  cards.forEach((c, i) => {
    setTimeout(() => {
      c.classList.add('triumph-flip');
      setTimeout(() => c.classList.remove('triumph-flip'), 1400);
    }, i * 120);
  });
}

function processEffects(state) {
  const log = state.log || [];

  // Si la mano cambio (pot vuelve a antes y community vacia), reset + des-marcar pre-actions.
  if (state.community.length < lastCommunityLen) {
    lastLogLen = 0;
    lastCommunityLen = 0;
    if (ui.paCheckFold) ui.paCheckFold.checked = false;
    if (ui.paCallAny) ui.paCallAny.checked = false;
  }

  const newEvents = log.slice(lastLogLen);
  lastLogLen = log.length;

  for (const ev of newEvents) {
    triggerSoundFor(ev);
    triggerVisualFor(ev, state);
  }

  // flip de comunitarias nuevas
  if (state.community.length > lastCommunityLen) {
    const cards = ui.community.querySelectorAll('.card:not(.placeholder)');
    for (let i = lastCommunityLen; i < state.community.length; i++) {
      const c = cards[i];
      if (c) {
        c.classList.add('card-flip-in');
        setTimeout(() => c?.classList.remove('card-flip-in'), 600);
      }
    }
    lastCommunityLen = state.community.length;
  }

  // tu turno: pulso sonoro + pre-acciones
  if (state.toAct === me.id && lastToAct !== me.id) {
    Sound.yourTurn();
    handlePreActions(state);
  }
}

// Si el usuario tiene activado un pre-action, lo ejecuta automaticamente al llegar su turno.
function handlePreActions(state) {
  const meP = state.players.find(p => p.id === me.id);
  if (!meP) return;
  const toCall = Math.max(0, state.currentBet - meP.bet);
  if (ui.paCheckFold?.checked) {
    setTimeout(() => {
      if (toCall === 0) send({ t: 'act', action: { type: 'check' } });
      else send({ t: 'act', action: { type: 'fold' } });
    }, 250);
  } else if (ui.paCallAny?.checked) {
    setTimeout(() => {
      if (toCall === 0) send({ t: 'act', action: { type: 'check' } });
      else send({ t: 'act', action: { type: 'call' } });
    }, 250);
  }
}

function triggerSoundFor(ev) {
  // Voice synthesis (si esta activado)
  speakAction(ev);
  switch (ev.type) {
    case 'phase':
      Sound.deal();
      // Dealer prompt: "Cartas en el aire"
      dealerPrompt('deal');
      // Mano del dealer aparece brevemente justo antes del reparto
      showDealerHand(900);
      // Mano nueva: animacion de reparto
      setTimeout(() => dealAnimation(), 50);
      break;
    case 'street':
      // Dealer voicea la calle nueva
      dealerPrompt('street', ev.phase);
      break;
    case 'ante':
    case 'call':
    case 'bet': Sound.chip(); break;
    case 'raise': Sound.raise(); break;
    case 'allin': Sound.allin(); break;
    case 'check': Sound.check(); break;
    case 'fold': Sound.fold(); break;
    case 'street': Sound.flip(); break;
    case 'win': Sound.win(); break;
  }
}

function triggerVisualFor(ev, state) {
  const player = state.players.find(p => p.name === ev.player);

  // Avatar pulse + lean 3D cuando alguien actua
  if (player && ['call', 'check', 'bet', 'raise', 'allin', 'fold'].includes(ev.type)) {
    pulseAvatar(player.id);
    leanAvatar(player.id, ev.type);
  }

  if (['ante', 'call', 'bet', 'raise', 'allin'].includes(ev.type)) {
    if (player) flyChipFromPlayerToPot(player.id);
  }

  // Banner de accion en el felt
  if (ev.type === 'bet') showActionBanner(`${ev.player.toUpperCase()} APUESTA ${ev.amount}`, 'gold');
  else if (ev.type === 'raise') showActionBanner(`${ev.player.toUpperCase()} SUBE A ${ev.amount}`, 'gold');
  else if (ev.type === 'allin') {
    showActionBanner(`${ev.player.toUpperCase()} ALL-IN ${ev.amount}!`, 'red', 1800);
    // Shake parametrico: cuanto mas grande el monto vs ante, mas dramatico
    const ante = state.ante || 5;
    const ratio = (ev.amount || 0) / Math.max(ante, 1);
    const intensity = Math.min(28, 8 + Math.floor(ratio / 5));
    const dur = Math.min(700, 350 + Math.floor(ratio));
    screenShake(intensity, dur);
    // Camera swoop dramatica
    allinSwoop(800);
    // Rim light pulsante
    flashRim(2400);
  }
  else if (ev.type === 'fold') showActionBanner(`${ev.player.toUpperCase()} FOLD`, 'red', 1000);
  else if (ev.type === 'check') showActionBanner(`${ev.player.toUpperCase()} CHECK`, 'green', 900);

  if (ev.type === 'win') {
    if (player) {
      flyChipFromPotToPlayer(player.id);
      const seatEl = document.querySelector(`.seat[data-pid="${player.id}"]`);
      setTimeout(() => spawnConfetti(seatEl), 200);
      winnerBurst(player.id);
      const winText = ev.hand ? `${ev.player.toUpperCase()} GANA $${ev.amount} · ${ev.hand.toUpperCase()}` : `${ev.player.toUpperCase()} GANA $${ev.amount}`;
      showActionBanner(winText, 'gold', 2000);
    }
  }
  if (ev.type === 'fold') {
    if (player) {
      const seatEl = document.querySelector(`.seat[data-pid="${player.id}"]`);
      seatEl?.classList.add('fold-anim');
      setTimeout(() => seatEl?.classList.remove('fold-anim'), 500);
      spawnFoldSmoke(seatEl);
    }
  }
  if (ev.type === 'level') {
    showActionBanner(`NIVEL ${ev.level + 1} · ANTE ${ev.ante}`, 'gold', 1800);
  }
}

function flyChipFromPlayerToPot(playerId) {
  const seatEl = document.querySelector(`.seat[data-pid="${playerId}"]`);
  if (!seatEl) return;
  const pot = ui.tablePot.getBoundingClientRect();
  const start = seatEl.getBoundingClientRect();
  const chip = document.createElement('div');
  chip.className = 'chip-fly';
  chip.style.left = (start.left + start.width / 2) + 'px';
  chip.style.top = (start.top + start.height / 2) + 'px';
  document.body.appendChild(chip);
  requestAnimationFrame(() => {
    chip.style.transform = `translate(${pot.left + pot.width/2 - (start.left + start.width/2)}px, ${pot.top + pot.height/2 - (start.top + start.height/2)}px) scale(0.6)`;
    chip.style.opacity = '0.2';
  });
  setTimeout(() => chip.remove(), 700);
}

// ----- Animaciones in-game -----
// Anima un numero entre dos valores (ease-out)
function animateNumber(el, from, to, durMs = 600, suffix = '') {
  if (!el) return;
  if (from === to) { el.textContent = to + suffix; return; }
  const startT = performance.now();
  const delta = to - from;
  const step = (now) => {
    const t = Math.min(1, (now - startT) / durMs);
    const eased = 1 - Math.pow(1 - t, 3);
    const v = Math.round(from + delta * eased);
    el.textContent = v + suffix;
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = to + suffix;
  };
  requestAnimationFrame(step);
}

// Banner de accion ("JUAN SUBE 200") en medio del felt, fade in/out
function showActionBanner(text, color = 'gold', durMs = 1400) {
  const felt = document.querySelector('.felt');
  if (!felt) return;
  const banner = document.createElement('div');
  banner.className = 'action-banner';
  banner.style.color = color === 'gold' ? 'var(--gold)' :
                       color === 'red' ? '#e74c3c' :
                       color === 'green' ? '#3da76a' :
                       'var(--text)';
  banner.textContent = text;
  felt.appendChild(banner);
  // animacion de entrada
  requestAnimationFrame(() => banner.classList.add('show'));
  setTimeout(() => banner.classList.remove('show'), durMs - 400);
  setTimeout(() => banner.remove(), durMs);
}

// Pulso al avatar (rebote pequeno)
function pulseAvatar(playerId) {
  const seat = document.querySelector(`.seat[data-pid="${playerId}"]`);
  const avatar = seat?.querySelector('.avatar');
  if (!avatar) return;
  avatar.classList.remove('avatar-pulse');
  void avatar.offsetWidth; // reflow para reiniciar animacion
  avatar.classList.add('avatar-pulse');
  setTimeout(() => avatar.classList.remove('avatar-pulse'), 600);
}

// Avatar lean 3D segun accion (forward = agresion, back = retiro/duda)
function leanAvatar(playerId, type) {
  const seat = document.querySelector(`.seat[data-pid="${playerId}"]`);
  if (!seat) return;
  seat.classList.remove('lean-fwd', 'lean-back');
  if (['bet', 'raise', 'allin'].includes(type)) seat.classList.add('lean-fwd');
  else if (['fold', 'check'].includes(type)) seat.classList.add('lean-back');
  setTimeout(() => seat.classList.remove('lean-fwd', 'lean-back'), 700);
}

// Sacudida de pantalla
function screenShake(intensity = 8, durMs = 350) {
  const felt = document.querySelector('.felt');
  if (!felt) return;
  felt.style.setProperty('--shake-i', intensity + 'px');
  felt.classList.remove('shake');
  void felt.offsetWidth;
  felt.classList.add('shake');
  setTimeout(() => felt.classList.remove('shake'), durMs);
}

// All-in swoop: zoom + tilt dramatico breve
function allinSwoop(durMs = 600) {
  const felt = document.querySelector('.felt');
  if (!felt) return;
  felt.classList.add('allin-swoop');
  setTimeout(() => felt.classList.remove('allin-swoop'), durMs);
}

// Rim light pulsante en all-in (anillo rojo-dorado alrededor del felt)
function flashRim(durMs = 2400) {
  if (!ui.feltRim) return;
  ui.feltRim.classList.remove('active');
  void ui.feltRim.offsetWidth;
  ui.feltRim.classList.add('active');
  setTimeout(() => ui.feltRim.classList.remove('active'), durMs);
}

// Mano del dealer apareciendo entre manos
function showDealerHand(durMs = 1400) {
  if (!ui.dealerHand) return;
  ui.dealerHand.classList.remove('hidden');
  ui.dealerHand.classList.remove('show');
  void ui.dealerHand.offsetWidth;
  ui.dealerHand.classList.add('show');
  setTimeout(() => {
    ui.dealerHand.classList.remove('show');
    ui.dealerHand.classList.add('hidden');
  }, durMs);
}

// Whoosh sintetizado al cambiar de camara
function whooshSound() {
  if (!window.AudioContext && !window.webkitAudioContext) return;
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    if (c.state === 'suspended') c.resume();
    const t0 = c.currentTime;
    // Ruido filtrado con sweep de filtro lowpass
    const bufferSize = c.sampleRate * 0.4;
    const buf = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(200, t0);
    filter.frequency.exponentialRampToValueAtTime(3000, t0 + 0.18);
    filter.frequency.exponentialRampToValueAtTime(120, t0 + 0.4);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.18, t0 + 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 0.4);
    src.connect(filter).connect(g).connect(c.destination);
    src.start();
    src.stop(t0 + 0.42);
  } catch {}
}

// Slide+roll del dealer button del seat anterior al nuevo
function slideDealerButton(fromSeatIdx, toSeatIdx) {
  const target = Array.from(document.querySelectorAll('.seat')).find(s => s.querySelector('.dealer-button'));
  if (!target) return;
  const r = target.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'dealer-button dealer-slide-ghost';
  ghost.textContent = 'D';
  // Spawn desde centro del felt
  const felt = document.querySelector('.felt');
  const fr = felt.getBoundingClientRect();
  const startX = fr.left + fr.width / 2;
  const startY = fr.top + fr.height / 2;
  ghost.style.left = startX + 'px';
  ghost.style.top = startY + 'px';
  // Variables CSS para que el keyframe rolling pueda usarlas
  const dx = r.left + r.width - 8 - startX;
  const dy = r.top - 2 - startY;
  ghost.style.setProperty('--rx', dx + 'px');
  ghost.style.setProperty('--ry', dy + 'px');
  document.body.appendChild(ghost);
  requestAnimationFrame(() => ghost.classList.add('rolling'));
  setTimeout(() => ghost.remove(), 700);
}

// ----- Voice synthesis (Web Speech API) -----
let voiceEnabled = localStorage.getItem('chiribito.voice') === '1';
function speak(text) {
  if (!voiceEnabled) return;
  if (!('speechSynthesis' in window)) return;
  // cancelar lo anterior
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  // Eligir voz segun idioma
  const lang = getLang();
  u.lang = lang === 'en' ? 'en-US' : lang === 'pt' ? 'pt-BR' : 'es-ES';
  u.rate = 1.05;
  u.pitch = 0.85;
  u.volume = 0.85;
  speechSynthesis.speak(u);
}
// Dealer voice: anuncios entre fases ("Cartas en el aire", "Showdown", "Calle 3")
function dealerPrompt(kind, phase) {
  if (!voiceEnabled) return;
  const lang = getLang();
  const dict = {
    es: {
      deal: 'Cartas en el aire',
      street1: 'Primera carta',
      street2: 'Segunda carta',
      street3: 'Tercera carta',
      street4: 'Cuarta carta',
      street5: 'Showdown',
      showdown: 'Showdown'
    },
    en: {
      deal: 'Cards in the air',
      street1: 'First card',
      street2: 'Second card',
      street3: 'Third card',
      street4: 'Fourth card',
      street5: 'Showdown',
      showdown: 'Showdown'
    },
    pt: {
      deal: 'Cartas no ar',
      street1: 'Primeira carta',
      street2: 'Segunda carta',
      street3: 'Terceira carta',
      street4: 'Quarta carta',
      street5: 'Showdown',
      showdown: 'Showdown'
    }
  };
  const set = dict[lang] || dict.es;
  let text = null;
  if (kind === 'deal') text = set.deal;
  else if (kind === 'street' && phase) text = set[phase];
  if (text) speak(text);
}

function speakAction(ev) {
  if (!voiceEnabled) return;
  const lang = getLang();
  const map = {
    es: { check: 'Paso', call: 'Igualo', bet: 'Apuesta', raise: 'Subo', allin: 'All-in', fold: 'Me retiro', win: 'Gana' },
    en: { check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All in', fold: 'Fold', win: 'Wins' },
    pt: { check: 'Mesa', call: 'Pago', bet: 'Aposta', raise: 'Subo', allin: 'All in', fold: 'Saio', win: 'Ganha' }
  };
  const dict = map[lang] || map.es;
  const phrase = dict[ev.type];
  if (!phrase) return;
  let text = phrase;
  if (ev.amount && (ev.type === 'bet' || ev.type === 'raise' || ev.type === 'allin')) {
    text += ' ' + ev.amount;
  }
  speak(text);
}

// Popup de logro desbloqueado
function showAchievementPopup(ach) {
  const div = document.createElement('div');
  div.className = 'achievement-popup';
  div.innerHTML = `
    <div class="ach-icon">${ach.icon}</div>
    <div class="ach-text">
      <div class="ach-title">${escapeHTML(ach.title)}</div>
      <div class="ach-desc">${escapeHTML(ach.desc)}</div>
    </div>
  `;
  document.body.appendChild(div);
  Sound.win();
  requestAnimationFrame(() => div.classList.add('show'));
  setTimeout(() => { div.classList.remove('show'); }, 4000);
  setTimeout(() => div.remove(), 4500);
  // Guardar en localStorage para mostrar trofeo en stats panel
  let unlocked = JSON.parse(localStorage.getItem('chiribito.achievements') || '{}');
  unlocked[ach.code] = { ...ach, unlockedAt: Date.now() };
  localStorage.setItem('chiribito.achievements', JSON.stringify(unlocked));
}

// Rebote de zoom sobre el ganador en showdown
function winnerBurst(playerId) {
  const seat = document.querySelector(`.seat[data-pid="${playerId}"]`);
  if (!seat) return;
  seat.classList.remove('winner-burst');
  void seat.offsetWidth;
  seat.classList.add('winner-burst');
  setTimeout(() => seat.classList.remove('winner-burst'), 1200);
}

// Particulas de humo al fold (la carta del que se retira "se desintegra")
function spawnFoldSmoke(seatEl) {
  if (!seatEl) return;
  const r = seatEl.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height * 0.7; // mas o menos donde estan las hole cards
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('div');
    p.className = 'fold-smoke';
    const sz = 6 + Math.random() * 12;
    p.style.width = p.style.height = sz + 'px';
    p.style.left = (cx + (Math.random() * 30 - 15)) + 'px';
    p.style.top = (cy + (Math.random() * 16 - 8)) + 'px';
    document.body.appendChild(p);
    const dx = (Math.random() * 80 - 40);
    const dy = -30 - Math.random() * 60;
    requestAnimationFrame(() => {
      p.style.transform = `translate(${dx}px, ${dy}px) scale(${0.3 + Math.random()})`;
      p.style.opacity = '0';
    });
    setTimeout(() => p.remove(), 1300);
  }
}

// Slow-mo: agrega clase al body que escala las duraciones de animacion
function startSlowMo(durMs = 1800) {
  document.body.classList.add('slow-mo');
  setTimeout(() => document.body.classList.remove('slow-mo'), durMs);
}

function spawnConfetti(seatEl) {
  const rect = (seatEl || document.querySelector('.felt')).getBoundingClientRect();
  const colors = ['#ffe45c', '#d4af37', '#c0392b', '#2c5d8f', '#2c7a4d', '#fff8d6'];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('div');
    p.className = 'confetti';
    p.style.background = colors[i % colors.length];
    p.style.left = (rect.left + rect.width / 2 + (Math.random() * 60 - 30)) + 'px';
    p.style.top = (rect.top + rect.height / 2) + 'px';
    document.body.appendChild(p);
    const dx = (Math.random() * 600 - 300);
    const dy = (Math.random() * -300 - 100);
    const rot = Math.random() * 720 - 360;
    requestAnimationFrame(() => {
      p.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
      p.style.opacity = '0';
    });
    setTimeout(() => p.remove(), 1700 + Math.random() * 400);
  }
}

function dealAnimation(state) {
  // Cada carta sale del MAZO VISIBLE y vuela en ARCO PARABOLICO al seat,
  // con flip 3D Y durante el viaje.
  const deck = document.querySelector('.deck');
  if (!deck) return;
  const dr = deck.getBoundingClientRect();
  const startX = dr.left + dr.width / 2;
  const startY = dr.top + dr.height / 2;
  const seats = Array.from(document.querySelectorAll('.seat:not(.empty-seat)'));
  if (!seats.length) return;
  deck.classList.add('dealing');
  setTimeout(() => deck.classList.remove('dealing'), 1500);
  let i = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const seat of seats) {
      const r = seat.getBoundingClientRect();
      const dx = r.left + r.width / 2 - startX;
      const dy = r.top + r.height / 2 - startY;
      const angle = Math.random() * 20 - 10;
      const isMe = seat.dataset.pid === me.id;
      // Punto medio elevado: arco con pico ~80px arriba del trayecto
      const midX = dx / 2;
      const midY = dy / 2 - 80 - Math.random() * 30;

      const ghost = document.createElement('div');
      ghost.className = 'deal-ghost';
      ghost.style.left = startX + 'px';
      ghost.style.top = startY + 'px';
      ghost.innerHTML = '<div class="deal-ghost-inner"><div class="back"></div><div class="face"></div></div>';
      document.body.appendChild(ghost);
      const delay = i++ * 90;

      // Animacion con 3 fases via setTimeout: ascender al midpoint, luego bajar al destino.
      setTimeout(() => {
        // fase 1: subir al apice del arco
        ghost.style.transition = 'transform .35s cubic-bezier(.18,.6,.42,1)';
        ghost.style.transform = `translate(${midX - 25}px, ${midY - 35}px) rotateZ(${angle/2}deg)`;
        const inner = ghost.querySelector('.deal-ghost-inner');
        // empezar el flip durante la subida
        inner.style.transform = isMe ? 'rotateY(90deg)' : 'rotateY(180deg)';
      }, delay);
      setTimeout(() => {
        // fase 2: bajar al seat
        ghost.style.transition = 'transform .4s cubic-bezier(.4,.0,.32,1)';
        ghost.style.transform = `translate(${dx - 25}px, ${dy - 35}px) rotateZ(${angle}deg)`;
        const inner = ghost.querySelector('.deal-ghost-inner');
        // completar el flip durante la bajada
        if (isMe) inner.style.transform = 'rotateY(180deg)';
        else inner.style.transform = 'rotateY(360deg)';
      }, delay + 350);
      setTimeout(() => ghost.remove(), delay + 800);
    }
  }
}

// Spotlight: posiciona el cono de luz sobre el seat del jugador en turno.
function updateSpotlight(state) {
  if (!ui.spotlight) return;
  const felt = document.querySelector('.felt');
  if (!felt || !state || !state.toAct) {
    ui.spotlight.classList.add('hidden');
    return;
  }
  const seat = document.querySelector(`.seat[data-pid="${state.toAct}"]`);
  if (!seat) { ui.spotlight.classList.add('hidden'); return; }
  const fr = felt.getBoundingClientRect();
  const sr = seat.getBoundingClientRect();
  // posicion relativa al felt en %
  const cx = (sr.left + sr.width/2 - fr.left) / fr.width * 100;
  const cy = (sr.top + sr.height/2 - fr.top) / fr.height * 100;
  ui.spotlight.style.left = cx + '%';
  ui.spotlight.style.top = cy + '%';
  ui.spotlight.classList.remove('hidden');
}

function flyChipFromPotToPlayer(playerId) {
  const seatEl = document.querySelector(`.seat[data-pid="${playerId}"]`);
  if (!seatEl) return;
  const pot = ui.tablePot.getBoundingClientRect();
  const end = seatEl.getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      const chip = document.createElement('div');
      chip.className = 'chip-fly chip-win';
      chip.style.left = (pot.left + pot.width / 2) + 'px';
      chip.style.top = (pot.top + pot.height / 2) + 'px';
      document.body.appendChild(chip);
      requestAnimationFrame(() => {
        const dx = (end.left + end.width/2 - (pot.left + pot.width/2)) + (Math.random() * 30 - 15);
        const dy = (end.top + end.height/2 - (pot.top + pot.height/2)) + (Math.random() * 20 - 10);
        chip.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
        chip.style.opacity = '0';
      });
      setTimeout(() => chip.remove(), 800);
    }, i * 60);
  }
}

function formatLog(l) {
  switch (l.type) {
    case 'phase': return `<b>${labelPhase(l.phase)}</b> · dealer: ${escapeHTML(l.dealer || '?')}`;
    case 'ante': return `<b>${escapeHTML(l.player)}</b> ante ${l.amount}`;
    case 'fold': return `<b>${escapeHTML(l.player)}</b> se retira`;
    case 'check': return `<b>${escapeHTML(l.player)}</b> pasa`;
    case 'call': return `<b>${escapeHTML(l.player)}</b> iguala ${l.amount}`;
    case 'bet': return `<b>${escapeHTML(l.player)}</b> apuesta ${l.amount}`;
    case 'raise': return `<b>${escapeHTML(l.player)}</b> sube a ${l.amount}`;
    case 'allin': return `<b>${escapeHTML(l.player)}</b> ALL-IN ${l.amount}`;
    case 'street':
      const c = l.card ? prettyCardHTML(l.card) : '';
      return `Comunitaria <b>${labelPhase(l.phase)}</b>: ${c}`;
    case 'win':
      return `<b>${escapeHTML(l.player)}</b> gana ${l.amount}${l.hand ? ' con ' + escapeHTML(l.hand) : ''}`;
    default: return JSON.stringify(l);
  }
}

function makeCard(card, placeholder = false, small = false) {
  return makeCardEl(card, { placeholder, small });
}

// Avatar: iniciales + color de fondo deterministico por nombre.
function avatarHTML(name, isBot) {
  const initials = (name || '?').split(/\s|-|_/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const bg = `hsl(${hue}, 55%, 38%)`;
  const ring = isBot ? 'rgba(212,175,55,.6)' : 'rgba(255,255,255,.4)';
  return `<div class="avatar" style="background:${bg};box-shadow: 0 0 0 2px ${ring}, 0 2px 4px rgba(0,0,0,.5)">${escapeHTML(initials)}</div>`;
}

// Visual del stack de fichas: descompongo el monto en denominaciones reales
// y dibujo varias columnas con colores distintos por valor.
function renderPotChips(amount) {
  if (!ui.potChips) return;
  ui.potChips.innerHTML = '';
  if (amount <= 0) return;
  // Denominaciones casino: 5 (rojo), 25 (verde), 100 (negro), 500 (morado), 1000 (oro)
  const DENOMS = [
    { value: 1000, color: '#c89b3a', highlight: '#fff8d6' },
    { value: 500,  color: '#6b3380', highlight: '#d4a3e6' },
    { value: 100,  color: '#1a1a1a', highlight: '#666' },
    { value: 25,   color: '#2c7a4d', highlight: '#7bd1a3' },
    { value: 5,    color: '#c0392b', highlight: '#ff8a6b' }
  ];
  // descomponer
  let remaining = amount;
  const stacks = [];
  for (const d of DENOMS) {
    const n = Math.floor(remaining / d.value);
    if (n > 0) { stacks.push({ d, count: Math.min(n, 8) }); remaining -= n * d.value; }
  }
  if (!stacks.length) stacks.push({ d: DENOMS[DENOMS.length - 1], count: 1 });
  // pintar varias columnas, max 5 visibles
  const totalCols = Math.min(5, stacks.length);
  const colW = 26 + 4; // ficha 26 + gap 4
  const startX = -(totalCols * colW) / 2 + colW / 2;
  for (let col = 0; col < totalCols; col++) {
    const { d, count } = stacks[col];
    for (let i = 0; i < count; i++) {
      const c = document.createElement('div');
      c.className = 'pot-chip';
      c.style.background = `radial-gradient(ellipse at center, ${d.highlight} 5%, ${d.color} 30%, ${d.color} 70%, rgba(0,0,0,.4) 100%)`;
      c.style.bottom = (i * 3.5) + 'px';
      c.style.left = (startX + col * colW) + 'px';
      // Z-depth: cada ficha mas arriba en la pila se acerca a la camara
      c.style.transform = `translateZ(${i * 3.5}px)`;
      ui.potChips.appendChild(c);
    }
  }
}

// ----- chat -----
function addChat(from, text) {
  const li = document.createElement('li');
  li.innerHTML = `<b>${escapeHTML(from)}:</b> ${escapeHTML(text)}`;
  ui.chat.appendChild(li);
  ui.chat.scrollTop = ui.chat.scrollHeight;
}

// ----- helpers -----
function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

let toastTimer = null;
function showToast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), 2500);
}

// ----- bindings -----
ui.meSet.addEventListener('click', () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  sendHello();
  showToast('Nombre actualizado');
});

ui.newTableBtn.addEventListener('click', () => ui.newTableForm.classList.remove('hidden'));
ui.ntCancel.addEventListener('click', () => ui.newTableForm.classList.add('hidden'));
ui.ntCreate.addEventListener('click', () => {
  send({
    t: 'createTable',
    name: ui.ntName.value,
    maxPlayers: +ui.ntMax.value,
    ante: +ui.ntAnte.value,
    startingStack: +ui.ntStack.value,
    isPrivate: ui.ntPrivate.checked,
    tournament: ui.ntTournament.checked
  });
  ui.newTableForm.classList.add('hidden');
});

// Lobby search
ui.lobbySearch.addEventListener('input', () => renderLobbyTables(_lastLobbyTables));
// Join by code
function tryJoinCode() {
  const code = (ui.joinCodeInput.value || '').toUpperCase().trim();
  if (!code) return;
  send({ t: 'joinByCode', code });
}
ui.joinCodeBtn.addEventListener('click', tryJoinCode);
ui.joinCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryJoinCode(); });

// Invite button: copia codigo / link al portapapeles
ui.inviteBtn.addEventListener('click', async () => {
  if (!lastState?.inviteCode) return;
  const url = location.origin + '/?code=' + lastState.inviteCode;
  const text = `Unite a mi mesa Chiribito: ${url}\nCodigo: ${lastState.inviteCode}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Invitacion copiada al portapapeles');
  } catch {
    showToast('Codigo: ' + lastState.inviteCode);
  }
});

ui.leaveBtn.addEventListener('click', () => send({ t: 'leaveTable' }));
ui.startBtn.addEventListener('click', () => send({ t: 'startHand' }));
ui.addBotBtn.addEventListener('click', () => send({ t: 'addBot' }));
ui.removeBotBtn.addEventListener('click', () => send({ t: 'removeBot' }));

ui.actFold.addEventListener('click', () => send({ t: 'act', action: { type: 'fold' } }));
ui.actCheck.addEventListener('click', () => send({ t: 'act', action: { type: 'check' } }));
ui.actCall.addEventListener('click', () => send({ t: 'act', action: { type: 'call' } }));
ui.actBet.addEventListener('click', () => send({ t: 'act', action: { type: 'bet', amount: +ui.actAmount.value } }));
ui.actRaise.addEventListener('click', () => send({ t: 'act', action: { type: 'raise', amount: +ui.actAmount.value } }));
ui.actAllIn.addEventListener('click', () => send({ t: 'act', action: { type: 'allin' } }));

// Quick-bet: rellena el input con la fraccion del bote y enfoca raise/bet.
$$('.qb').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!lastState) return;
    const frac = parseFloat(btn.dataset.frac);
    const pot = lastState.pot || 0;
    const meP = lastState.players.find(p => p.id === me.id);
    if (!meP) return;
    const minRaise = lastState.minRaise || lastState.ante || 5;
    let amount = Math.max(minRaise, Math.round(pot * frac));
    if (lastState.currentBet > 0) {
      // raise: el monto es "subir HASTA"; que sea al menos currentBet + minRaise
      amount = Math.max(amount + lastState.currentBet, lastState.currentBet + minRaise);
    }
    amount = Math.min(amount, meP.stack + meP.bet);
    ui.actAmount.value = amount;
    ui.actAmount.focus();
  });
});

ui.chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = ui.chatInput.value.trim();
  if (!text) return;
  send({ t: 'chat', text });
  ui.chatInput.value = '';
});

// Audio: desbloqueo con primer click (politica de browsers).
document.addEventListener('click', () => unlockAudioOnce(), { once: true });
ui.muteBtn.textContent = isMuted() ? '🔇' : '🔊';
ui.muteBtn.addEventListener('click', () => {
  unlockAudioOnce();
  const muted = toggleMute();
  ui.muteBtn.textContent = muted ? '🔇' : '🔊';
});

// Voice synthesis toggle
ui.voiceBtn.textContent = voiceEnabled ? '🎙' : '🔇';
ui.voiceBtn.style.color = voiceEnabled ? 'var(--gold)' : '';
ui.voiceBtn.addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  localStorage.setItem('chiribito.voice', voiceEnabled ? '1' : '0');
  ui.voiceBtn.textContent = voiceEnabled ? '🎙' : '🔇';
  ui.voiceBtn.style.color = voiceEnabled ? 'var(--gold)' : '';
  if (voiceEnabled) speak(getLang() === 'en' ? 'Voice on' : getLang() === 'pt' ? 'Voz ativa' : 'Voz activada');
});

// Crowd murmur toggle
let crowdEnabled = localStorage.getItem('chiribito.crowd') === '1';
ui.crowdBtn.style.color = crowdEnabled ? 'var(--gold)' : '';
function applyCrowd() {
  if (crowdEnabled) Sound.crowdOn();
  else Sound.crowdOff();
}
ui.crowdBtn.addEventListener('click', () => {
  unlockAudioOnce();
  crowdEnabled = !crowdEnabled;
  localStorage.setItem('chiribito.crowd', crowdEnabled ? '1' : '0');
  ui.crowdBtn.style.color = crowdEnabled ? 'var(--gold)' : '';
  applyCrowd();
});
// Activar crowd al entrar a una mesa si estaba activado
document.addEventListener('click', () => { if (crowdEnabled) applyCrowd(); }, { once: true });

// Cinema mode toggle
function enterCinema() {
  document.body.classList.add('cinema-mode');
  // boton de salida flotante
  if (!document.querySelector('.cinema-exit')) {
    const exit = document.createElement('button');
    exit.className = 'cinema-exit';
    exit.textContent = 'ESC · Salir cine';
    exit.addEventListener('click', exitCinema);
    document.body.appendChild(exit);
  }
}
function exitCinema() {
  document.body.classList.remove('cinema-mode');
  document.querySelector('.cinema-exit')?.remove();
}
ui.cinemaBtn.addEventListener('click', () => {
  if (document.body.classList.contains('cinema-mode')) exitCinema();
  else enterCinema();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('cinema-mode')) exitCinema();
  // Multi-camera: teclas 1/2/3 (no en inputs)
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  if (e.key === '1') setCameraAngle('low');
  else if (e.key === '2') setCameraAngle('normal');
  else if (e.key === '3') setCameraAngle('overhead');
});

function setCameraAngle(angle) {
  const felt = document.querySelector('.felt');
  if (!felt) return;
  // No whoosh si no cambio
  const cur = ['low','normal','overhead'].find(a => document.body.classList.contains('cam-' + a));
  document.body.classList.remove('cam-low', 'cam-normal', 'cam-overhead');
  document.body.classList.add('cam-' + angle);
  if (cur !== angle) whooshSound();
  showToast({
    low: 'Camara: vista baja',
    normal: 'Camara: estandar',
    overhead: 'Camara: cenital'
  }[angle] || '');
}

// Deck style selector
ui.deckStyle.value = getDeckStyle();
ui.deckStyle.addEventListener('change', () => {
  setDeckStyle(ui.deckStyle.value);
  // Re-render con el ultimo estado
  if (lastState) renderTable(lastState);
});

// Language selector
ui.langPick.value = getLang();
applyTranslations();
ui.langPick.addEventListener('change', () => {
  setLang(ui.langPick.value);
  if (lastState) renderTable(lastState);
  else if (_lastLobbyTables) renderLobbyTables(_lastLobbyTables);
});

// Loop de barra de tiempo: setInterval (robusto incluso headless)
function tickTimer() {
  if (!lastState || !lastState.toAct || lastState.toAct !== me.id || !lastState.turnStartedAt || !lastState.actionTimeoutMs) {
    ui.actionTimerBar.classList.add('hidden');
    return;
  }
  const elapsedAtBroadcast = (lastState.serverNow || 0) - lastState.turnStartedAt;
  const sinceReceipt = Date.now() - (lastStateReceivedAt || Date.now());
  const elapsed = elapsedAtBroadcast + sinceReceipt;
  const remain = Math.max(0, lastState.actionTimeoutMs - elapsed);
  const pct = Math.max(0, Math.min(100, (remain / lastState.actionTimeoutMs) * 100));
  ui.actionTimerBar.classList.remove('hidden');
  ui.actionTimerFill.style.width = pct + '%';
  ui.actionTimerFill.style.background = pct < 25 ? 'linear-gradient(90deg,#c0392b,#e74c3c)'
    : pct < 50 ? 'linear-gradient(90deg,#b8860b,#e8b441)'
    : 'linear-gradient(90deg,#2c7a4d,#3da76a)';
}
setInterval(tickTimer, 100);

// ----- Tema (3 temas via class en body) -----
function applyTheme(name) {
  document.body.classList.remove('theme-emerald', 'theme-cherry', 'theme-midnight');
  document.body.classList.add('theme-' + name);
  localStorage.setItem('chiribito.theme', name);
}
const savedTheme = localStorage.getItem('chiribito.theme') || 'emerald';
ui.themePick.value = savedTheme;
applyTheme(savedTheme);
ui.themePick.addEventListener('change', () => applyTheme(ui.themePick.value));

// ----- Privacy mode (ocultar tus cartas con blur, hover para ver) -----
let privacyOn = localStorage.getItem('chiribito.privacy') === '1';
function applyPrivacy() {
  document.body.classList.toggle('privacy-on', privacyOn);
  ui.privacyBtn.textContent = privacyOn ? '🙈' : '👁';
}
applyPrivacy();
ui.privacyBtn.addEventListener('click', () => {
  privacyOn = !privacyOn;
  localStorage.setItem('chiribito.privacy', privacyOn ? '1' : '0');
  applyPrivacy();
});

// ----- Tooltips (custom, basados en data-tip) -----
let tipTimer = null;
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-tip]');
  if (!el) return;
  const tip = el.getAttribute('data-tip');
  const r = el.getBoundingClientRect();
  ui.tipBox.textContent = tip;
  ui.tipBox.style.left = (r.left + r.width / 2) + 'px';
  ui.tipBox.style.top = (r.bottom + 8) + 'px';
  ui.tipBox.classList.remove('hidden');
  if (tipTimer) clearTimeout(tipTimer);
});
document.addEventListener('mouseout', (e) => {
  const el = e.target.closest('[data-tip]');
  if (!el) return;
  if (tipTimer) clearTimeout(tipTimer);
  tipTimer = setTimeout(() => ui.tipBox.classList.add('hidden'), 80);
});

// ----- Modal helpers -----
function openModal(modal) { modal.classList.remove('hidden'); }
function closeModal(modal) { modal.classList.add('hidden'); }
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) {
    e.target.closest('.modal').classList.add('hidden');
  }
  if (e.target.classList.contains('modal')) {
    e.target.classList.add('hidden');
  }
});

// ----- History -----
ui.historyBtn.addEventListener('click', () => {
  send({ t: 'getHistory' });
});

function renderHistory(hands) {
  if (!hands.length) {
    ui.historyBody.innerHTML = '<p class="muted">Aun no hay manos jugadas.</p>';
    openModal(ui.historyModal);
    return;
  }
  ui.historyBody.innerHTML = hands.map((h, i) => {
    const winners = h.winners.map(w => `<b>${escapeHTML(w.name)}</b> +$${w.amount}${w.handName ? ' ('+escapeHTML(w.handName)+')' : ''}`).join(', ');
    const players = h.players.map(p => {
      const cards = p.hole ? p.hole.map(c => prettyCardHTML(c)).join('') : '<span class="muted">tapado</span>';
      return `<div class="hist-player ${p.folded ? 'folded' : ''}">
        <span class="name">${escapeHTML(p.name)}</span>
        <span class="cards">${cards}</span>
        <span class="hand">${p.handName ? escapeHTML(p.handName) : (p.folded ? 'fold' : '-')}</span>
      </div>`;
    }).join('');
    const community = h.community.map(c => prettyCardHTML(c)).join('');
    return `<details class="hist-card" ${i === 0 ? 'open' : ''}>
      <summary><b>Mano ${escapeHTML(h.handId || '?')}</b> · ${winners}</summary>
      <div class="hist-detail">
        <div class="hist-row"><span class="label">Comunitarias:</span> ${community || '<span class="muted">no llego</span>'}</div>
        <div class="hist-players">${players}</div>
      </div>
    </details>`;
  }).join('');
  openModal(ui.historyModal);
}

// ----- Stats -----
ui.statsBtn.addEventListener('click', () => {
  if (!lastState) return showToast('Entra a una mesa primero');
  const players = lastState.players.slice().sort((a, b) => (b.stats?.handsWon || 0) - (a.stats?.handsWon || 0));
  ui.statsBody.innerHTML = `<table class="stats-table">
    <thead><tr><th>Jugador</th><th>Stack</th><th>Manos</th><th>Ganadas</th><th>Win %</th><th>VPIP %</th><th>Total ganado</th></tr></thead>
    <tbody>
    ${players.map(p => {
      const s = p.stats || { handsPlayed: 0, handsWon: 0, vpipCount: 0, totalWon: 0 };
      const winPct = s.handsPlayed ? Math.round(s.handsWon / s.handsPlayed * 100) : 0;
      const vpipPct = s.handsPlayed ? Math.round(s.vpipCount / s.handsPlayed * 100) : 0;
      return `<tr>
        <td>${escapeHTML(p.name)}${p.id === me.id ? ' (tu)' : ''}</td>
        <td>${p.stack}</td>
        <td>${s.handsPlayed}</td>
        <td>${s.handsWon}</td>
        <td>${winPct}%</td>
        <td>${vpipPct}%</td>
        <td class="gold">+${s.totalWon}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;
  openModal(ui.statsModal);
});

// ----- Side pots overlay -----
function renderSidePots(state) {
  if (!state.sidePots || !state.sidePots.length || state.sidePots.length === 1) {
    ui.sidePotsBox.classList.add('hidden');
    return;
  }
  ui.sidePotsBox.innerHTML = '<div class="sp-title">Side pots</div>' +
    state.sidePots.map((sp, i) => {
      const eligibles = sp.eligible.map(id => {
        const p = state.players.find(x => x.id === id);
        return p ? escapeHTML(p.name) : id;
      }).join(', ');
      return `<div class="sp-row"><b>#${i+1}</b> $${sp.amount} <span class="muted">(${eligibles})</span></div>`;
    }).join('');
  ui.sidePotsBox.classList.remove('hidden');
}

// ----- Tournament leaderboard -----
function renderTourneyLeaderboard(state) {
  if (!state.tournament) {
    ui.tourneyLeaderboard.classList.add('hidden');
    return;
  }
  // Ordenar por stack desc, eliminados (stack=0) al final
  const ranked = state.players.slice().sort((a, b) => {
    if (a.stack === 0 && b.stack > 0) return 1;
    if (b.stack === 0 && a.stack > 0) return -1;
    return b.stack - a.stack;
  });
  ui.tourneyRanking.innerHTML = ranked.map((p, i) => {
    const eliminated = p.stack === 0;
    const isMe = p.id === me.id;
    return `<li class="${eliminated ? 'tl-eliminated' : ''} ${isMe ? 'tl-me' : ''}">
      <span class="tl-pos">${i + 1}</span>
      <span class="tl-name">${escapeHTML(p.name)}${isMe ? ' (tu)' : ''}</span>
      <span class="tl-stack">${eliminated ? 'OUT' : p.stack}</span>
    </li>`;
  }).join('');
  ui.tourneyLeaderboard.classList.remove('hidden');
}

// ----- Live stats: hands/hour + M-ratio + session time -----
function updateLiveStats(state) {
  if (!ui.liveStats) return;
  // Mostrar siempre que estes en una mesa con mano comenzada al menos una vez
  if (!state || !state.handId) {
    ui.liveStats.classList.add('hidden');
    return;
  }
  // Registrar nueva mano si cambio handId
  if (state.handId !== lastSeenHandId && state.phase !== 'waiting' && state.phase !== 'showdown') {
    handTimestamps.push(Date.now());
    // mantener solo ultimos 60 min
    const cutoff = Date.now() - 60 * 60 * 1000;
    while (handTimestamps.length && handTimestamps[0] < cutoff) handTimestamps.shift();
    lastSeenHandId = state.handId;
  }
  // hands/hour: si tenemos N manos en T ms, extrapolamos a 1 hora
  let hph = 0;
  if (handTimestamps.length >= 2) {
    const span = Date.now() - handTimestamps[0];
    hph = Math.round((handTimestamps.length / span) * 3600 * 1000);
  } else if (handTimestamps.length === 1) {
    // Estimacion ruda: si solo hay 1 mano, asumir 60 por hora
    hph = 60;
  }
  ui.lsHph.textContent = hph;

  // M-ratio = stack / (ante * jugadores activos). Solo aplica si estas en torneo.
  const meP = state.players.find(p => p.id === me.id);
  if (state.tournament && meP) {
    const ante = state.ante || 5;
    const activePlayers = state.players.filter(p => p.stack > 0 && !p.sittingOut).length || 1;
    const cost = ante * activePlayers;
    const m = cost > 0 ? Math.round(meP.stack / cost * 10) / 10 : 0;
    ui.lsM.textContent = m.toFixed(1);
    ui.lsM.className = 'ls-val ' +
      (m < 5 ? 'm-red' : m < 10 ? 'm-yellow' : m < 20 ? 'm-green' : 'm-blue');
  } else {
    ui.lsM.textContent = '-';
    ui.lsM.className = 'ls-val';
  }

  // Tiempo de sesion
  const elapsed = Date.now() - sessionStartedAt;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  ui.lsTime.textContent = mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');

  ui.liveStats.classList.remove('hidden');
}

// ----- Showdown card highlights -----
function highlightShowdown(state) {
  if (state.phase !== 'showdown') return;
  // Para cada ganador, su handCards son las 5 que ganaron. Marcamos en community + sus hole.
  const winnerIds = state.winners || [];
  for (const wId of winnerIds) {
    const p = state.players.find(x => x.id === wId);
    if (!p || !p.handCards) continue;
    const winSet = new Set(p.handCards);
    // Comunitarias
    document.querySelectorAll('#community .card').forEach((el, idx) => {
      const c = state.community[idx];
      if (c && winSet.has(c)) el.classList.add('winning-card');
    });
    // Hole del ganador
    const seatEl = document.querySelector(`.seat[data-pid="${wId}"]`);
    if (seatEl) {
      const holeEls = seatEl.querySelectorAll('.hole .card');
      holeEls.forEach((el, idx) => {
        const c = p.hole[idx];
        if (c && winSet.has(c)) el.classList.add('winning-card');
      });
    }
  }
}

connect();
