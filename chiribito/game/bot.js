// Bot heuristico para Chiribito.
// No hace simulacion Monte-Carlo (seria caro). Estrategia simple:
//   - Preflop: par alto -> sube; suited >= J -> call; conectores cercanos -> call;
//     basura sin proyecto y subida grande -> fold.
//   - Postflop: evalua mejor mano actual con bestHand. Score numerico
//     = rank * 1000 + tiebreak[0]. Decide segun el coste de igualar vs stack.

import { bestHand } from './evaluator.js';
import { cardSuit, cardValue } from './deck.js';

const BOT_NAMES = [
  'Paco-Bot', 'Lola-Bot', 'Curro-Bot', 'Marina-Bot', 'Nacho-Bot',
  'Sofia-Bot', 'Quico-Bot', 'Ines-Bot', 'Mateo-Bot', 'Rocio-Bot'
];

let BOT_SEQ = 1;
export function nextBotName() {
  const free = BOT_NAMES.filter(n => !USED_NAMES.has(n));
  const pick = free.length ? free[Math.floor(Math.random() * free.length)] : ('Bot-' + (BOT_SEQ++));
  USED_NAMES.add(pick);
  return pick;
}
const USED_NAMES = new Set();
export function freeBotName(name) { USED_NAMES.delete(name); }

// rng deterministico opcional para tests
function chance(p, rng = Math.random) { return rng() < p; }

// Devuelve { type, amount? } para una mesa dada.
export function decideBotAction(table, bot, rng = Math.random) {
  const me = table.players.find(p => p.id === bot.id);
  if (!me) return { type: 'fold' };
  const toCall = Math.max(0, table.currentBet - me.bet);
  const potBefore = table.pot;
  const potOdds = toCall > 0 ? toCall / (potBefore + toCall) : 0;

  // ---------- Preflop ----------
  if (table.phase === 'preflop') {
    const [c1, c2] = me.hole;
    const v1 = cardValue(c1), v2 = cardValue(c2);
    const suited = cardSuit(c1) === cardSuit(c2);
    const isPair = v1 === v2;
    const high = Math.max(v1, v2), low = Math.min(v1, v2);
    const gap = high - low;

    let strength = 0;
    if (isPair) strength = 0.55 + (high - 8) * 0.05; // 0.55..0.85
    else {
      strength = 0.20 + (high - 8) * 0.04;
      if (suited) strength += 0.10;
      if (gap === 1) strength += 0.10;
      else if (gap === 2) strength += 0.04;
    }
    // Agresividad
    if (toCall === 0) {
      if (strength > 0.65 && chance(0.5, rng)) {
        const amount = Math.min(me.stack, Math.max(table.minRaise, Math.floor(potBefore * 0.6) || table.minRaise));
        return { type: 'bet', amount };
      }
      return { type: 'check' };
    }
    if (strength > potOdds + 0.1) {
      if (strength > 0.75 && chance(0.4, rng)) {
        const total = Math.min(me.stack + me.bet, table.currentBet + Math.max(table.minRaise, Math.floor(potBefore * 0.5)));
        return { type: 'raise', amount: total };
      }
      return { type: 'call' };
    }
    return { type: 'fold' };
  }

  // ---------- Postflop ----------
  const hand = bestHand(me.hole, table.community);
  // score 0..1 aproximado
  const rankScores = { 0: 0.10, 1: 0.30, 2: 0.50, 3: 0.65, 4: 0.78, 5: 0.85, 6: 0.92, 7: 0.97, 8: 0.99 };
  let strength = rankScores[hand.rank] ?? 0.2;
  // pequeno boost por tiebreak alto
  strength += (hand.tiebreak[0] - 8) * 0.005;

  // Si no hay nada que pagar, pasa o apuesta segun fuerza
  if (toCall === 0) {
    if (strength > 0.75 && chance(0.55, rng)) {
      const amount = Math.min(me.stack, Math.max(table.minRaise, Math.floor(potBefore * 0.6)));
      return { type: 'bet', amount: Math.max(table.minRaise, amount) };
    }
    if (strength > 0.55 && chance(0.25, rng)) {
      const amount = Math.min(me.stack, Math.max(table.minRaise, Math.floor(potBefore * 0.4)));
      return { type: 'bet', amount: Math.max(table.minRaise, amount) };
    }
    return { type: 'check' };
  }

  // Hay apuesta
  if (strength > 0.85 && chance(0.6, rng)) {
    const total = Math.min(me.stack + me.bet, table.currentBet + Math.max(table.minRaise, Math.floor(potBefore * 0.7)));
    return { type: 'raise', amount: total };
  }
  if (strength > potOdds + 0.05) return { type: 'call' };
  // bluff ocasional
  if (toCall < me.stack * 0.05 && chance(0.1, rng)) return { type: 'call' };
  return { type: 'fold' };
}
