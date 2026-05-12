// Renderizado de cartas en 2 estilos de baraja.
// El juego es identico (28 cartas, 7 rangos x 4 palos): solo cambia la etiqueta visual.

import { suitSvg } from '/suit-svg.js';
import { courtSvg } from '/court-art.js';

const FR_RANK = { '8': '8', '9': '9', 'T': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A' };
const ES_RANK = { '8': '7', '9': '8', 'T': '9', 'J': 'S', 'Q': 'C', 'K': 'R', 'A': 'As' };

const FR_COLOR = { s: '#1a1a1a', h: '#c0392b', d: '#c0392b', c: '#1a1a1a' };
const ES_COLOR = { s: '#2c5d8f', h: '#c0392b', d: '#b8860b', c: '#2c7a4d' };

const FR_FULL_NAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const ES_FULL_NAME = { s: 'Espadas', h: 'Copas', d: 'Oros', c: 'Bastos' };

let currentStyle = localStorage.getItem('chiribito.deck') || 'francesa';

export function getDeckStyle() { return currentStyle; }
export function setDeckStyle(style) {
  if (style !== 'francesa' && style !== 'espanola') return;
  currentStyle = style;
  localStorage.setItem('chiribito.deck', style);
}

export function rankLabel(card) {
  return currentStyle === 'espanola' ? ES_RANK[card[0]] : FR_RANK[card[0]];
}
export function suitColor(card) {
  return currentStyle === 'espanola' ? ES_COLOR[card[1]] : FR_COLOR[card[1]];
}
export function suitFullName(card) {
  return currentStyle === 'espanola' ? ES_FULL_NAME[card[1]] : FR_FULL_NAME[card[1]];
}
export function suitSVG(card) { return suitSvg(card, currentStyle); }

// Construye el elemento DOM de una carta con look "real":
// indice (rango+palo) en esquina superior izquierda, palo grande centrado.
// Para J/Q/K/A se usa arte SVG custom en lugar del pip simple.
export function makeCardEl(card, opts = {}) {
  const { placeholder = false, small = false } = opts;
  const div = document.createElement('div');
  div.className = 'card' + (small ? ' small' : '');
  if (placeholder) { div.classList.add('placeholder'); return div; }
  if (!card) { div.classList.add('back'); return div; }
  const r = rankLabel(card);
  const svg = suitSvg(card, currentStyle);
  const court = courtSvg(card, currentStyle);
  const color = suitColor(card);
  div.style.color = color;
  div.classList.toggle('es', currentStyle === 'espanola');
  if (court) div.classList.add('court');
  // Centro: arte de figura si es J/Q/K/A; si no, pip grande.
  const center = court || svg;
  div.innerHTML = `
    <div class="corner tl"><div class="r">${r}</div><div class="s">${svg}</div></div>
    <div class="pip">${center}</div>
    <div class="corner br"><div class="r">${r}</div><div class="s">${svg}</div></div>
  `;
  return div;
}

export function prettyCardHTML(card) {
  if (!card) return '';
  const r = rankLabel(card);
  const svg = suitSvg(card, currentStyle);
  const color = suitColor(card);
  return `<span class="card-inline" style="color:${color};background:#f4ecd8;border-radius:3px;padding:1px 5px;font-weight:700;display:inline-flex;align-items:center;gap:2px;vertical-align:middle">
    ${r}<span style="display:inline-block;width:14px;height:14px;line-height:0">${svg}</span>
  </span>`;
}
