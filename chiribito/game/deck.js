// Baraja Chiribito: SIEMPRE 28 cartas (7 rangos x 4 palos).
// Internamente etiquetamos los rangos 8..A; el cliente puede mostrarlas
// como baraja espanola (7,8,9,Sota,Caballo,Rey,As + Oros/Copas/Espadas/Bastos)
// o francesa (8,9,10,J,Q,K,A + ♠♥♦♣). El juego es identico en ambas.

export const RANKS = ['8', '9', 'T', 'J', 'Q', 'K', 'A']; // 7 rangos = 28 cartas
export const SUITS = ['s', 'h', 'd', 'c'];                // espadas, copas/♥, oros/♦, bastos/♣

export const RANK_VALUE = {
  '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// Etiquetas francesas por defecto (las usa el server en logs).
export const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const RANK_LABEL = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A', '8': '8', '9': '9' };

export function buildDeck() {
  const deck = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  return deck; // 28 cartas
}

export function shuffle(deck, rng = Math.random) {
  // Fisher-Yates
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardRank(card) { return card[0]; }
export function cardSuit(card) { return card[1]; }
export function cardValue(card) { return RANK_VALUE[card[0]]; }

export function prettyCard(card) {
  return RANK_LABEL[card[0]] + SUIT_GLYPH[card[1]];
}
