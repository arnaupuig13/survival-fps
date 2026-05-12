// Evaluador de manos Chiribito.
// Reglas especiales:
//   - Es OBLIGATORIO usar las 2 cartas de la mano. La mano final = 2 hole + 3 de las comunitarias.
//   - El COLOR (flush) GANA al FULL (invertido respecto al poker clasico).
//
// Ranking (mayor a menor):
//   8 = Escalera de color
//   7 = Poker (4 iguales)
//   6 = COLOR        <- mas alto que el full
//   5 = FULL
//   4 = Escalera
//   3 = Trio
//   2 = Doble pareja
//   1 = Pareja
//   0 = Carta alta

import { RANK_VALUE, cardRank, cardSuit, cardValue } from './deck.js';

export const HAND_NAME = {
  8: 'Escalera de color',
  7: 'Poker',
  6: 'Color',
  5: 'Full',
  4: 'Escalera',
  3: 'Trio',
  2: 'Doble pareja',
  1: 'Pareja',
  0: 'Carta alta'
};

function combinations(arr, k) {
  const out = [];
  const n = arr.length;
  if (k > n) return out;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    out.push(idx.map(i => arr[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

// Devuelve { rank, tiebreak: number[] } para comparar manos.
function score5(cards) {
  const vals = cards.map(cardValue).sort((a, b) => b - a);
  const suits = cards.map(cardSuit);
  const isFlush = suits.every(s => s === suits[0]);

  // Frecuencias
  const freq = {};
  for (const v of vals) freq[v] = (freq[v] || 0) + 1;
  const groups = Object.entries(freq)
    .map(([v, c]) => ({ v: +v, c }))
    .sort((a, b) => (b.c - a.c) || (b.v - a.v));

  // Escalera (consecutivos). En 28 cartas: 8-9-10-J-Q, 9-10-J-Q-K, 10-J-Q-K-A.
  // Variante 32: anade 7-8-9-10-J. La rueda A-baja no aplica aqui.
  let isStraight = false;
  if (new Set(vals).size === 5) {
    const max = vals[0], min = vals[4];
    if (max - min === 4) isStraight = true;
  }

  if (isStraight && isFlush) return { rank: 8, tiebreak: [vals[0]] };
  if (groups[0].c === 4) return { rank: 7, tiebreak: [groups[0].v, groups[1].v] };
  if (isFlush) return { rank: 6, tiebreak: vals };
  if (groups[0].c === 3 && groups[1].c === 2) return { rank: 5, tiebreak: [groups[0].v, groups[1].v] };
  if (isStraight) return { rank: 4, tiebreak: [vals[0]] };
  if (groups[0].c === 3) return { rank: 3, tiebreak: [groups[0].v, ...vals.filter(v => v !== groups[0].v)] };
  if (groups[0].c === 2 && groups[1].c === 2) {
    const high = Math.max(groups[0].v, groups[1].v);
    const low = Math.min(groups[0].v, groups[1].v);
    const kicker = vals.find(v => v !== groups[0].v && v !== groups[1].v);
    return { rank: 2, tiebreak: [high, low, kicker] };
  }
  if (groups[0].c === 2) {
    const pair = groups[0].v;
    const kickers = vals.filter(v => v !== pair);
    return { rank: 1, tiebreak: [pair, ...kickers] };
  }
  return { rank: 0, tiebreak: vals };
}

function compareScores(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i++) {
    const av = a.tiebreak[i] ?? 0;
    const bv = b.tiebreak[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// Mejor mano para un jugador dadas hole (2) y community (5).
// Regla Chiribito: las 2 hole son OBLIGATORIAS; se eligen 3 de las comunitarias.
export function bestHand(hole, community) {
  if (!hole || hole.length !== 2) return null;
  const combos = combinations(community, 3);
  let best = null, bestCards = null;
  for (const trio of combos) {
    const five = [...hole, ...trio];
    const s = score5(five);
    if (!best || compareScores(s, best) > 0) {
      best = s;
      bestCards = five;
    }
  }
  return { ...best, cards: bestCards, name: HAND_NAME[best.rank] };
}

// Compara dos resultados de bestHand. >0 si a gana, <0 si b gana, 0 empate.
export function compareHands(a, b) { return compareScores(a, b); }
