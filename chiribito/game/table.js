// Maquina de estado de una mesa Chiribito.
//
// Reglas adoptadas:
//   - 28 cartas (8..A). 32 si la mesa tiene >=10 jugadores.
//   - Cada jugador recibe 2 cartas tapadas (uso obligatorio).
//   - 5 cartas comunitarias reveladas una a una. 6 rondas de apuestas:
//       Ronda 1: tras hole cards (sin comunitarias).
//       Rondas 2..6: tras revelar la 1a, 2a, 3a, 4a y 5a comunitaria.
//   - Sin ciegas. Cada jugador paga un ANTE (configurable) para alimentar el bote.
//   - Reparto antihorario. En la ronda 1 el repartidor habla ULTIMO.
//   - En rondas siguientes habla primero el ultimo agresor de la ronda previa
//     (si nadie subio, el primer jugador activo despues del dealer en sentido antihorario).
//   - Color GANA al Full.
//   - Side-pots cuando hay all-in.

import { buildDeck, shuffle } from './deck.js';
import { bestHand, compareHands } from './evaluator.js';

const PHASES = ['waiting', 'preflop', 'street1', 'street2', 'street3', 'street4', 'street5', 'showdown'];
const COMMUNITY_AT = { preflop: 0, street1: 1, street2: 2, street3: 3, street4: 4, street5: 5 };

let TABLE_SEQ = 1;
let HAND_SEQ = 1;

function genInviteCode() {
  // 6 chars alphanumericos, sin chars confusos
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}

export class Table {
  constructor({ name, maxPlayers = 9, ante = 5, startingStack = 1000, isPrivate = false, tournament = null } = {}) {
    this.id = 'T' + (TABLE_SEQ++);
    this.name = name || 'Mesa ' + this.id;
    // Chiribito: maximo 9 jugadores (28 cartas / 2 hole + 5 comunitarias = 19 minimo).
    this.maxPlayers = Math.min(9, Math.max(2, maxPlayers));
    this.ante = ante;
    this.startingStack = startingStack;
    this.isPrivate = !!isPrivate;
    this.inviteCode = this.isPrivate ? genInviteCode() : null;
    // Torneo: { levels: [{ante, durationMs}, ...], currentLevel: 0, levelStartedAt: 0 }
    this.tournament = tournament || null;
    this.spectators = new Map(); // playerId -> name (no sentados, solo miran)
    this.players = []; // { id, name, seat, stack, hole, bet, totalBet, folded, allIn, sittingOut, lastAction }
    this.dealerSeat = 0;
    this.phase = 'waiting';
    this.deck = [];
    this.community = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = 0;
    this.toAct = null; // playerId que debe actuar
    this.turnStartedAt = 0; // timestamp ms cuando empezo el turno actual
    this.actionTimeoutMs = 25000; // tiempo para actuar antes de auto-fold (humanos)
    this.lastAggressor = null; // playerId que subio por ultimo
    this.handId = null;
    this.handLog = []; // historial de la mano para mostrar en UI
    this.sidePots = []; // [{ amount, eligible: [playerIds] }]
    this.actedThisRound = new Set();
    this.winners = []; // tras showdown
    this.lastWinSummary = null;
    this.history = []; // ultimas 20 manos completas para replay
    this.stats = new Map(); // playerId -> { handsPlayed, handsWon, vpip, totalWon }
  }

  _ensureStats(playerId) {
    if (!this.stats.has(playerId)) {
      this.stats.set(playerId, { handsPlayed: 0, handsWon: 0, vpipCount: 0, totalWon: 0, vpipFlagThisHand: false });
    }
    return this.stats.get(playerId);
  }

  // ---------- gestion de jugadores ----------
  addPlayer(id, name, requestedSeat = null) {
    if (this.players.length >= this.maxPlayers) return { ok: false, error: 'Mesa llena' };
    if (this.players.find(p => p.id === id)) return { ok: false, error: 'Ya estas en la mesa' };
    let seat;
    if (requestedSeat !== null && requestedSeat >= 0 && requestedSeat < this.maxPlayers) {
      const taken = this.players.some(p => p.seat === requestedSeat);
      if (taken) return { ok: false, error: 'Ese asiento esta ocupado' };
      seat = requestedSeat;
    } else {
      seat = this._nextFreeSeat();
    }
    this.players.push({
      id, name, seat,
      stack: this.startingStack,
      hole: [],
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      sittingOut: this.phase !== 'waiting',
      lastAction: null,
      hand: null
    });
    this.players.sort((a, b) => a.seat - b.seat);
    return { ok: true };
  }

  removePlayer(id) {
    const p = this.players.find(p => p.id === id);
    if (!p) return;
    // Si la mano esta en curso, lo plegamos.
    if (this.phase !== 'waiting' && !p.folded) {
      p.folded = true;
      p.lastAction = 'fold';
      this.handLog.push({ type: 'fold', player: p.name, reason: 'left' });
    }
    this.players = this.players.filter(x => x.id !== id);
    if (this.phase !== 'waiting') {
      // Si era su turno, avanza.
      if (this.toAct === id) this._advanceTurn();
      // Si solo queda 1, terminar mano.
      this._maybeEndHandEarly();
    }
  }

  _nextFreeSeat() {
    const taken = new Set(this.players.map(p => p.seat));
    for (let i = 0; i < this.maxPlayers; i++) if (!taken.has(i)) return i;
    return this.players.length;
  }

  addSpectator(id, name) {
    if (this.players.find(p => p.id === id)) return { ok: false, error: 'Ya estas sentado' };
    this.spectators.set(id, name);
    return { ok: true };
  }
  removeSpectator(id) {
    this.spectators.delete(id);
  }

  // ---------- inicio de mano ----------
  canStart() {
    return this.phase === 'waiting' && this.players.filter(p => p.stack > 0).length >= 2;
  }

  // Torneo: actualiza el nivel actual segun tiempo transcurrido. Si avanza, sube el ante.
  _updateTournamentLevel() {
    if (!this.tournament || !this.tournament.levels?.length) return;
    if (!this.tournament.startedAt) this.tournament.startedAt = Date.now();
    const elapsed = Date.now() - this.tournament.startedAt;
    let totalSoFar = 0;
    let lvl = 0;
    for (let i = 0; i < this.tournament.levels.length; i++) {
      totalSoFar += this.tournament.levels[i].durationMs;
      if (elapsed < totalSoFar) { lvl = i; break; }
      lvl = i; // si paso del ultimo, queda en el ultimo
    }
    if (this.tournament.currentLevel !== lvl) {
      this.tournament.currentLevel = lvl;
      const newAnte = this.tournament.levels[lvl].ante;
      this.ante = newAnte;
      this.handLog.push({ type: 'level', level: lvl, ante: newAnte });
    }
    this.tournament.levelStartedAt = this.tournament.startedAt + (totalSoFar - this.tournament.levels[lvl].durationMs);
    this.tournament.levelEndsAt = this.tournament.startedAt + totalSoFar;
  }

  startHand() {
    if (!this.canStart()) return { ok: false, error: 'Necesitas al menos 2 jugadores con fichas' };
    this._updateTournamentLevel();
    this.handId = 'H' + (HAND_SEQ++);
    this.handLog = [];
    this.community = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = this.ante; // tope minimo de subida inicial
    this.sidePots = [];
    this.winners = [];
    this.lastWinSummary = null;
    this.lastAggressor = null;
    this.actedThisRound = new Set();

    // Reset jugadores
    for (const p of this.players) {
      p.hole = [];
      p.bet = 0;
      p.totalBet = 0;
      p.folded = p.stack <= 0; // sin fichas, fuera
      p.allIn = false;
      p.sittingOut = p.stack <= 0;
      p.lastAction = null;
      p.hand = null;
      // Stats: marcar handsPlayed se hace al cierre de la mano (cuando p ya jugo)
      const st = this._ensureStats(p.id);
      st.vpipFlagThisHand = false;
    }

    // Mover dealer al siguiente con fichas (antihorario = -1 en seats ordenados).
    if (this.handId !== 'H1') this.dealerSeat = this._nextActiveSeat(this.dealerSeat, -1);

    // Antes
    for (const p of this.players) {
      if (p.sittingOut) continue;
      const ante = Math.min(this.ante, p.stack);
      p.stack -= ante;
      p.totalBet += ante;
      this.pot += ante;
      this.handLog.push({ type: 'ante', player: p.name, amount: ante });
      if (p.stack === 0) p.allIn = true;
    }

    // Repartir 2 cartas tapadas (antihorario). La direccion no cambia el juego, pero la respetamos.
    this.deck = shuffle(buildDeck());
    for (let r = 0; r < 2; r++) {
      let seat = this.dealerSeat;
      for (let n = 0; n < this.players.length; n++) {
        seat = this._nextActiveSeat(seat, -1);
        const p = this._playerAtSeat(seat);
        if (!p || p.sittingOut) continue;
        p.hole.push(this.deck.pop());
      }
    }

    this.phase = 'preflop';
    // Ronda 1: el primero en hablar es el siguiente al dealer en sentido antihorario;
    // el dealer habla ULTIMO. Eso = empezar por el jugador despues del dealer.
    const firstSeat = this._nextActiveSeat(this.dealerSeat, -1);
    const firstPlayer = this._playerAtSeat(firstSeat);
    this._setToAct(firstPlayer ? firstPlayer.id : null);
    this.currentBet = 0; // tras antes, no se considera "apuesta a igualar" (los antes no se igualan)
    this.minRaise = this.ante;
    this.handLog.push({ type: 'phase', phase: this.phase, dealer: this._playerAtSeat(this.dealerSeat)?.name });
    return { ok: true };
  }

  // ---------- acciones ----------
  // action: { type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin', amount?: number }
  act(playerId, action) {
    if (this.phase === 'waiting' || this.phase === 'showdown') return { ok: false, error: 'Mano no activa' };
    if (this.toAct !== playerId) return { ok: false, error: 'No es tu turno' };
    const p = this.players.find(x => x.id === playerId);
    if (!p || p.folded || p.sittingOut) return { ok: false, error: 'No puedes actuar' };
    const toCall = Math.max(0, this.currentBet - p.bet);

    switch (action.type) {
      case 'fold': {
        p.folded = true;
        p.lastAction = 'fold';
        this.handLog.push({ type: 'fold', player: p.name });
        break;
      }
      case 'check': {
        if (toCall > 0) return { ok: false, error: 'No puedes pasar, hay apuesta de ' + toCall };
        p.lastAction = 'check';
        this.handLog.push({ type: 'check', player: p.name });
        break;
      }
      case 'call': {
        if (toCall <= 0) return { ok: false, error: 'No hay nada que igualar' };
        const pay = Math.min(toCall, p.stack);
        p.stack -= pay;
        p.bet += pay;
        p.totalBet += pay;
        this.pot += pay;
        if (p.stack === 0) p.allIn = true;
        p.lastAction = 'call';
        this.handLog.push({ type: 'call', player: p.name, amount: pay });
        if (this.phase === 'preflop') this._ensureStats(p.id).vpipFlagThisHand = true;
        break;
      }
      case 'bet': {
        if (this.currentBet > 0) return { ok: false, error: 'Ya hay apuesta, usa raise' };
        const amount = Math.floor(action.amount || 0);
        if (amount < this.minRaise) return { ok: false, error: 'Apuesta minima: ' + this.minRaise };
        if (amount > p.stack) return { ok: false, error: 'No tienes suficiente' };
        p.stack -= amount;
        p.bet += amount;
        p.totalBet += amount;
        this.pot += amount;
        if (p.stack === 0) p.allIn = true;
        this.currentBet = p.bet;
        this.minRaise = amount;
        this.lastAggressor = p.id;
        this._resetActedExcept(p.id);
        p.lastAction = 'bet ' + amount;
        this.handLog.push({ type: 'bet', player: p.name, amount });
        if (this.phase === 'preflop') this._ensureStats(p.id).vpipFlagThisHand = true;
        break;
      }
      case 'raise': {
        if (this.currentBet <= 0) return { ok: false, error: 'No hay apuesta, usa bet' };
        const total = Math.floor(action.amount || 0); // "subir hasta" total
        const raiseBy = total - this.currentBet;
        if (raiseBy < this.minRaise) return { ok: false, error: 'Subida minima: ' + this.minRaise + ' (total ' + (this.currentBet + this.minRaise) + ')' };
        const need = total - p.bet;
        if (need > p.stack) return { ok: false, error: 'No tienes suficiente para subir hasta ' + total };
        p.stack -= need;
        p.bet += need;
        p.totalBet += need;
        this.pot += need;
        if (p.stack === 0) p.allIn = true;
        this.currentBet = p.bet;
        this.minRaise = raiseBy;
        this.lastAggressor = p.id;
        this._resetActedExcept(p.id);
        p.lastAction = 'raise ' + total;
        this.handLog.push({ type: 'raise', player: p.name, amount: total });
        if (this.phase === 'preflop') this._ensureStats(p.id).vpipFlagThisHand = true;
        break;
      }
      case 'allin': {
        const pay = p.stack;
        p.stack = 0;
        p.bet += pay;
        p.totalBet += pay;
        this.pot += pay;
        p.allIn = true;
        if (p.bet > this.currentBet) {
          const raiseBy = p.bet - this.currentBet;
          this.currentBet = p.bet;
          if (raiseBy >= this.minRaise) {
            this.minRaise = raiseBy;
            this.lastAggressor = p.id;
            this._resetActedExcept(p.id);
          }
        }
        p.lastAction = 'all-in ' + pay;
        this.handLog.push({ type: 'allin', player: p.name, amount: pay });
        if (this.phase === 'preflop') this._ensureStats(p.id).vpipFlagThisHand = true;
        break;
      }
      default:
        return { ok: false, error: 'Accion desconocida' };
    }

    this.actedThisRound.add(p.id);
    if (this._onlyOneActive()) return this._maybeEndHandEarly() || { ok: true };
    if (this._roundComplete()) {
      this._advanceStreet();
    } else {
      this._advanceTurn();
    }
    return { ok: true };
  }

  _setToAct(playerId) {
    this.toAct = playerId;
    this.turnStartedAt = playerId ? Date.now() : 0;
  }

  // ---------- helpers ----------
  _playerAtSeat(seat) { return this.players.find(p => p.seat === seat); }

  _nextActiveSeat(fromSeat, dir = -1) {
    if (!this.players.length) return 0;
    const seats = this.players.filter(p => !p.sittingOut && !p.folded).map(p => p.seat).sort((a, b) => a - b);
    if (!seats.length) return fromSeat;
    // dir = -1 antihorario: buscamos el seat estrictamente "anterior" (menor) ciclico.
    if (dir === -1) {
      const lower = seats.filter(s => s < fromSeat);
      if (lower.length) return lower[lower.length - 1];
      return seats[seats.length - 1];
    }
    const higher = seats.filter(s => s > fromSeat);
    if (higher.length) return higher[0];
    return seats[0];
  }

  _activePlayers() {
    return this.players.filter(p => !p.folded && !p.sittingOut);
  }

  _onlyOneActive() {
    return this._activePlayers().length <= 1;
  }

  _resetActedExcept(playerId) {
    this.actedThisRound = new Set([playerId]);
  }

  _roundComplete() {
    const inHand = this._activePlayers();
    if (inHand.length <= 1) return true;
    // Todos los activos no all-in tienen que haber actuado y ademas su apuesta = currentBet.
    const needAct = inHand.filter(p => !p.allIn);
    if (needAct.length === 0) return true; // todos all-in
    for (const p of needAct) {
      if (p.bet !== this.currentBet) return false;
      if (!this.actedThisRound.has(p.id)) return false;
    }
    return true;
  }

  _advanceTurn() {
    const inHand = this._activePlayers().filter(p => !p.allIn);
    if (inHand.length === 0) { this._advanceStreet(); return; }
    let cur = this.players.find(x => x.id === this.toAct);
    let seat = cur ? cur.seat : this.dealerSeat;
    for (let i = 0; i < this.players.length; i++) {
      seat = this._nextActiveSeat(seat, -1);
      const p = this._playerAtSeat(seat);
      if (p && !p.folded && !p.sittingOut && !p.allIn) { this._setToAct(p.id); return; }
    }
    this._setToAct(null);
  }

  _advanceStreet() {
    // reset apuestas por jugador
    for (const p of this.players) p.bet = 0;
    this.currentBet = 0;
    this.minRaise = this.ante;
    this.actedThisRound = new Set();

    const order = ['preflop', 'street1', 'street2', 'street3', 'street4', 'street5', 'showdown'];
    const idx = order.indexOf(this.phase);
    const next = order[idx + 1];
    if (!next) return;
    this.phase = next;

    if (next !== 'showdown' && next !== 'preflop') {
      // revela una comunitaria
      this.community.push(this.deck.pop());
      this.handLog.push({ type: 'street', phase: next, card: this.community[this.community.length - 1] });
    }

    if (next === 'showdown') { this._showdown(); return; }

    // Si todos los activos estan all-in, no hay accion: vamos directo a la siguiente street.
    const needAct = this._activePlayers().filter(p => !p.allIn);
    if (needAct.length <= 1) {
      // quedan revelaciones automaticas hasta showdown
      this._advanceStreet();
      return;
    }

    // Definir quien habla primero en la nueva ronda.
    let firstId = this.lastAggressor;
    let firstPlayer = firstId ? this.players.find(p => p.id === firstId && !p.folded && !p.sittingOut && !p.allIn) : null;
    if (!firstPlayer) {
      // Default: primer jugador despues del dealer en antihorario.
      let seat = this._nextActiveSeat(this.dealerSeat, -1);
      // saltar all-in / folded
      for (let i = 0; i < this.players.length; i++) {
        const p = this._playerAtSeat(seat);
        if (p && !p.folded && !p.sittingOut && !p.allIn) { firstPlayer = p; break; }
        seat = this._nextActiveSeat(seat, -1);
      }
    }
    this._setToAct(firstPlayer ? firstPlayer.id : null);
    this.lastAggressor = null;
  }

  _maybeEndHandEarly() {
    const inHand = this._activePlayers();
    if (inHand.length === 1) {
      const winner = inHand[0];
      const won = this.pot;
      winner.stack += won;
      this.handLog.push({ type: 'win', player: winner.name, amount: won, reason: 'others folded' });
      this.lastWinSummary = { winners: [{ id: winner.id, name: winner.name, amount: won, hand: null }], pot: won };
      this.pot = 0;
      this.phase = 'showdown';
      this._setToAct(null);
      this.winners = [winner.id];
      this._closeHandStats(won, [winner.id]);
      this._archiveHand();
      return { ok: true, ended: true };
    }
    return null;
  }

  _showdown() {
    // Si solo queda 1 activo, ya se manejo en _maybeEndHandEarly.
    const inHand = this._activePlayers();
    // Evaluar manos
    for (const p of inHand) {
      p.hand = bestHand(p.hole, this.community);
    }

    // Construir side-pots a partir de totalBet
    const pots = this._buildSidePots();
    const summary = { winners: [], pot: this.pot };
    let distributed = 0;
    for (const pot of pots) {
      const eligibles = inHand.filter(p => pot.eligible.has(p.id));
      if (!eligibles.length) continue;
      // mejor mano(s)
      let best = eligibles[0];
      let ties = [best];
      for (let i = 1; i < eligibles.length; i++) {
        const cmp = compareHands(eligibles[i].hand, best.hand);
        if (cmp > 0) { best = eligibles[i]; ties = [best]; }
        else if (cmp === 0) ties.push(eligibles[i]);
      }
      const share = Math.floor(pot.amount / ties.length);
      const remainder = pot.amount - share * ties.length;
      ties.forEach((p, i) => {
        const win = share + (i < remainder ? 1 : 0);
        p.stack += win;
        distributed += win;
        summary.winners.push({ id: p.id, name: p.name, amount: win, hand: p.hand });
        this.handLog.push({ type: 'win', player: p.name, amount: win, hand: p.hand?.name, cards: p.hand?.cards });
      });
    }
    this.pot = 0;
    this.sidePots = pots.map(p => ({ amount: p.amount, eligible: Array.from(p.eligible) }));
    this.lastWinSummary = summary;
    this.winners = [...new Set(summary.winners.map(w => w.id))];
    this._setToAct(null);
    this._closeHandStats(distributed, this.winners);
    this._archiveHand();
  }

  _closeHandStats(amountDistributed, winnerIds) {
    for (const p of this.players) {
      if (p.totalBet > 0) { // jugo la mano (puso ante al menos)
        const st = this._ensureStats(p.id);
        st.handsPlayed++;
        if (st.vpipFlagThisHand) st.vpipCount++;
        if (winnerIds.includes(p.id)) {
          st.handsWon++;
          // calcular cuanto gano realmente
          const winRecord = this.lastWinSummary?.winners?.find(w => w.id === p.id);
          if (winRecord) st.totalWon += winRecord.amount;
        }
      }
    }
  }

  _archiveHand() {
    const record = {
      handId: this.handId,
      community: this.community.slice(),
      players: this.players
        .filter(p => p.totalBet > 0)
        .map(p => ({
          id: p.id,
          name: p.name,
          hole: (!p.folded && p.hole.length === 2) ? p.hole.slice() : null,
          handName: p.hand?.name || null,
          handCards: p.hand?.cards || null,
          totalBet: p.totalBet,
          finalStack: p.stack,
          folded: p.folded
        })),
      winners: this.lastWinSummary?.winners?.map(w => ({ id: w.id, name: w.name, amount: w.amount, handName: w.hand?.name || null })) || [],
      log: this.handLog.slice(),
      ts: Date.now()
    };
    this.history.unshift(record);
    if (this.history.length > 20) this.history.length = 20;
  }

  _buildSidePots() {
    // Ordena los totalBet (solo jugadores que pusieron algo).
    const contributions = this.players
      .filter(p => p.totalBet > 0)
      .map(p => ({ id: p.id, total: p.totalBet, folded: p.folded }));
    const pots = [];
    let prev = 0;
    const levels = [...new Set(contributions.map(c => c.total))].sort((a, b) => a - b);
    for (const lvl of levels) {
      let amount = 0;
      const eligible = new Set();
      for (const c of contributions) {
        const slice = Math.max(0, Math.min(c.total, lvl) - prev);
        amount += slice;
        if (!c.folded && c.total >= lvl) eligible.add(c.id);
      }
      if (amount > 0) pots.push({ amount, eligible });
      prev = lvl;
    }
    return pots;
  }

  // ---------- vista publica para el cliente ----------
  publicState(forPlayerId = null) {
    // El codigo de invitacion solo se ve si estas sentado o eres espectador en la mesa.
    const inSeat = this.players.find(p => p.id === forPlayerId);
    const isSpectator = this.spectators.has(forPlayerId);
    const showCode = (inSeat || isSpectator) ? this.inviteCode : null;
    return {
      id: this.id,
      name: this.name,
      isPrivate: this.isPrivate,
      inviteCode: showCode,
      tournament: this.tournament ? {
        currentLevel: this.tournament.currentLevel,
        levelEndsAt: this.tournament.levelEndsAt || 0,
        levels: this.tournament.levels
      } : null,
      spectators: Array.from(this.spectators.entries()).map(([id, name]) => ({ id, name })),
      iAmSpectator: isSpectator,
      phase: this.phase,
      ante: this.ante,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      community: this.community,
      dealerSeat: this.dealerSeat,
      toAct: this.toAct,
      turnStartedAt: this.turnStartedAt,
      actionTimeoutMs: this.actionTimeoutMs,
      serverNow: Date.now(),
      handId: this.handId,
      maxPlayers: this.maxPlayers,
      players: this.players.map(p => {
        const st = this.stats.get(p.id) || { handsPlayed: 0, handsWon: 0, vpipCount: 0, totalWon: 0 };
        return {
          id: p.id,
          name: p.name,
          seat: p.seat,
          stack: p.stack,
          bet: p.bet,
          totalBet: p.totalBet,
          folded: p.folded,
          allIn: p.allIn,
          sittingOut: p.sittingOut,
          lastAction: p.lastAction,
          // tus cartas solo se ven para ti, salvo en showdown
          hole: (forPlayerId === p.id) ? p.hole : ((this.phase === 'showdown' && !p.folded && !p.sittingOut && p.hole.length) ? p.hole : []),
          handName: (this.phase === 'showdown' && p.hand) ? p.hand.name : null,
          handCards: (this.phase === 'showdown' && p.hand && !p.folded) ? p.hand.cards : null,
          isWinner: this.winners.includes(p.id),
          stats: { handsPlayed: st.handsPlayed, handsWon: st.handsWon, vpipCount: st.vpipCount, totalWon: st.totalWon }
        };
      }),
      log: this.handLog.slice(-30),
      lastWinSummary: this.lastWinSummary,
      sidePots: this.sidePots && this.phase === 'showdown' ? this.sidePots : [],
      historyCount: this.history.length
    };
  }

  // Devuelve el historial completo (al pedirlo, no en cada state).
  getHistory() {
    return this.history.slice();
  }
}
