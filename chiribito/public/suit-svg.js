// Iconos SVG para los 4 palos en estilos frances y espanol.
// Inline (sin requests) para que rendericen instantaneamente y se puedan colorear.

// Palos franceses: las formas estandar.
const FR = {
  s: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2c-2 4-8 7-8 12 0 3 2.4 5 5 5 1.5 0 2.5-.7 3-1.5V20l-1.5 2h5L14 20v-2.5c.5.8 1.5 1.5 3 1.5 2.6 0 5-2 5-5 0-5-6-8-8-12z"/></svg>`,
  h: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 21s-8-5.5-8-11.5C4 5.5 7 3 10 3c1.6 0 2.8.7 3.5 1.7C14.2 3.7 15.4 3 17 3c3 0 5 2.5 5 6.5 0 6-8 11.5-8 11.5h-2z"/></svg>`,
  d: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2L4 12l8 10 8-10z"/></svg>`,
  c: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 3a4 4 0 0 0-3.6 5.7A4 4 0 1 0 9.5 16c.4-.1.7.1.7.5L9.5 21h5l-.7-4.5c0-.4.3-.6.7-.5a4 4 0 1 0 1.1-7.3A4 4 0 0 0 12 3z"/></svg>`
};

// Palos espanoles: Espadas (sword), Copas (chalice), Oros (gold coin), Bastos (club staff).
const ES = {
  s: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M11 2h2v11h-2z"/>
    <path fill="currentColor" d="M7.5 13h9l-2 2h-5z"/>
    <path fill="currentColor" d="M11 13h2v6h-2z"/>
    <path fill="currentColor" d="M9 19h6v2H9z"/>
    <circle cx="12" cy="22" r="1.2" fill="currentColor"/>
  </svg>`,
  h: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M5 4h14v3a7 7 0 0 1-6 6.9V18h3v3H8v-3h3v-4.1A7 7 0 0 1 5 7V4z"/>
    <path fill="currentColor" d="M5 4c0-.6.4-1 1-1h12c.6 0 1 .4 1 1v1H5V4z"/>
  </svg>`,
  d: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" fill="currentColor"/>
    <circle cx="12" cy="12" r="6.5" fill="none" stroke="#3b2a08" stroke-width="1.2"/>
    <text x="12" y="15.5" text-anchor="middle" font-family="Georgia, serif" font-size="9" font-weight="700" fill="#3b2a08">$</text>
  </svg>`,
  c: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M11 3h2v18h-2z"/>
    <path fill="currentColor" d="M9 5l-2-2 1-1 2 2zm6 0l2-2-1-1-2 2z"/>
    <path fill="currentColor" d="M8 7l-3-1 .5-1.5L9 6zm8 0l3-1-.5-1.5L15 6z"/>
    <path fill="currentColor" d="M9 11l-2.5-.5-.2 1.5L9.5 13zm6 0l2.5-.5.2 1.5-3.2 1z"/>
    <path fill="currentColor" d="M9.5 17H8v-1.5l1.5-.5zm5 0H16v-1.5l-1.5-.5z"/>
  </svg>`
};

export function suitSvg(card, style) {
  const set = style === 'espanola' ? ES : FR;
  return set[card[1]] || '';
}
