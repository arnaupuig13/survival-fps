// Arte de cartas de figura (J/Q/K/A) en SVG inline, version COLOR PREMIUM.
// Cada carta tiene gradientes, sombreado, frame heraldico, y fondo decorativo.
// El color del PALO se aplica con `currentColor` heredado del .card.

const DEFS = `
  <defs>
    <linearGradient id="g-skin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fcd9b6"/>
      <stop offset="100%" stop-color="#d8a374"/>
    </linearGradient>
    <linearGradient id="g-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff4b5"/>
      <stop offset="50%" stop-color="#e6c149"/>
      <stop offset="100%" stop-color="#8a6f1f"/>
    </linearGradient>
    <radialGradient id="g-medal" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#fff4b5"/>
      <stop offset="60%" stop-color="#e6c149"/>
      <stop offset="100%" stop-color="#8a6f1f"/>
    </radialGradient>
    <pattern id="p-dots" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="0.6" fill="currentColor" fill-opacity="0.15"/>
    </pattern>
  </defs>`;

// ----- BARAJA FRANCESA -----
const FR = {
  J: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    ${DEFS}
    <rect x="6" y="6" width="48" height="68" rx="3" fill="url(#p-dots)"/>
    <path d="M30 10 L19 24 L25 24 L21 16 Z" fill="url(#g-gold)" stroke="currentColor" stroke-width="0.6"/>
    <path d="M30 10 L41 24 L35 24 L39 16 Z" fill="url(#g-gold)" stroke="currentColor" stroke-width="0.6"/>
    <circle cx="21" cy="16" r="1.8" fill="#c0392b"/>
    <circle cx="39" cy="16" r="1.8" fill="#c0392b"/>
    <rect x="19" y="22" width="22" height="2.5" fill="url(#g-gold)"/>
    <ellipse cx="30" cy="34" rx="10" ry="11" fill="url(#g-skin)" stroke="#7a4f2a" stroke-width="0.8"/>
    <circle cx="24" cy="36" r="2" fill="#e8a5a5" opacity="0.55"/>
    <circle cx="36" cy="36" r="2" fill="#e8a5a5" opacity="0.55"/>
    <ellipse cx="26" cy="32" rx="1.2" ry="1.6" fill="#1a1a1a"/>
    <ellipse cx="34" cy="32" rx="1.2" ry="1.6" fill="#1a1a1a"/>
    <circle cx="26.3" cy="31.5" r="0.4" fill="#fff"/>
    <circle cx="34.3" cy="31.5" r="0.4" fill="#fff"/>
    <path d="M25 39 Q30 42.5 35 39" fill="none" stroke="#7a3018" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M16 48 L20 51 L24 48 L28 51 L32 48 L36 51 L40 48 L44 51 L42 56 L18 56 Z" fill="url(#g-gold)" stroke="currentColor" stroke-width="0.6"/>
    <path d="M19 56 Q30 62 41 56 L43 74 L17 74 Z" fill="currentColor" stroke="currentColor" stroke-width="0.6"/>
    <circle cx="30" cy="63" r="2.5" fill="url(#g-medal)" stroke="#5d4a18" stroke-width="0.4"/>
  </svg>`,

  Q: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    ${DEFS}
    <rect x="6" y="6" width="48" height="68" rx="3" fill="url(#p-dots)"/>
    <path d="M16 20 L20 10 L24 16 L30 8 L36 16 L40 10 L44 20 Z" fill="url(#g-gold)" stroke="#5d4a18" stroke-width="0.7"/>
    <circle cx="20" cy="11" r="1.4" fill="#c0392b"/>
    <circle cx="30" cy="9" r="1.6" fill="#2b6cb0"/>
    <circle cx="40" cy="11" r="1.4" fill="#2c7a4d"/>
    <rect x="16" y="20" width="28" height="2.5" fill="url(#g-gold)" stroke="#5d4a18" stroke-width="0.3"/>
    <path d="M18 30 Q14 44 18 56 L20 56 Q22 44 22 30 Z" fill="#5d3010" opacity="0.85"/>
    <path d="M42 30 Q46 44 42 56 L40 56 Q38 44 38 30 Z" fill="#5d3010" opacity="0.85"/>
    <ellipse cx="30" cy="34" rx="11" ry="12.5" fill="url(#g-skin)" stroke="#7a4f2a" stroke-width="0.8"/>
    <circle cx="23" cy="37" r="1.8" fill="#e8a5a5" opacity="0.6"/>
    <circle cx="37" cy="37" r="1.8" fill="#e8a5a5" opacity="0.6"/>
    <ellipse cx="26" cy="33" rx="1.5" ry="1" fill="#1a1a1a"/>
    <ellipse cx="34" cy="33" rx="1.5" ry="1" fill="#1a1a1a"/>
    <path d="M27 40 Q30 42 33 40" fill="#c0392b" stroke="#7a1818" stroke-width="0.4"/>
    <path d="M24 48 Q30 52 36 48" fill="none" stroke="#7a4f2a" stroke-width="0.6"/>
    <circle cx="30" cy="52" r="2.5" fill="url(#g-medal)" stroke="#5d4a18" stroke-width="0.4"/>
    <path d="M16 58 Q30 56 44 58 L50 76 L10 76 Z" fill="currentColor" stroke="currentColor" stroke-width="0.6"/>
    <circle cx="22" cy="66" r="1" fill="url(#g-gold)"/>
    <circle cx="30" cy="68" r="1.2" fill="url(#g-gold)"/>
    <circle cx="38" cy="66" r="1" fill="url(#g-gold)"/>
  </svg>`,

  K: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    ${DEFS}
    <rect x="6" y="6" width="48" height="68" rx="3" fill="url(#p-dots)"/>
    <rect x="29" y="2" width="2" height="6" fill="url(#g-gold)"/>
    <rect x="26" y="4" width="8" height="2" fill="url(#g-gold)"/>
    <path d="M14 22 L18 10 L24 18 L30 8 L36 18 L42 10 L46 22 Z" fill="url(#g-gold)" stroke="#5d4a18" stroke-width="0.7"/>
    <circle cx="22" cy="14" r="1.4" fill="#c0392b"/>
    <circle cx="38" cy="14" r="1.4" fill="#c0392b"/>
    <rect x="14" y="22" width="32" height="3" fill="url(#g-gold)" stroke="#5d4a18" stroke-width="0.3"/>
    <ellipse cx="30" cy="36" rx="12" ry="13" fill="url(#g-skin)" stroke="#7a4f2a" stroke-width="0.8"/>
    <ellipse cx="25" cy="33" rx="1.3" ry="1.5" fill="#1a1a1a"/>
    <ellipse cx="35" cy="33" rx="1.3" ry="1.5" fill="#1a1a1a"/>
    <path d="M22 30 Q25 28.5 28 30" fill="none" stroke="#5d3010" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M32 30 Q35 28.5 38 30" fill="none" stroke="#5d3010" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M22 41 Q26 43 30 41.5 Q34 43 38 41" fill="none" stroke="#5d3010" stroke-width="2" stroke-linecap="round"/>
    <path d="M24 44 Q22 52 26 56 Q30 58 34 56 Q38 52 36 44 Q34 50 30 50 Q26 50 24 44 Z" fill="#5d3010" stroke="#3a1e08" stroke-width="0.4"/>
    <path d="M14 56 Q30 60 46 56 L50 68 Q30 64 10 68 Z" fill="currentColor" stroke="currentColor" stroke-width="0.6"/>
    <path d="M16 68 L44 68 L42 78 L18 78 Z" fill="currentColor" stroke="currentColor" stroke-width="0.6"/>
    <path d="M30 70 L24 74 L30 78 L36 74 Z" fill="url(#g-medal)" stroke="#5d4a18" stroke-width="0.5"/>
  </svg>`,

  A: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    ${DEFS}
    <path d="M30 8 L48 14 Q48 50 30 70 Q12 50 12 14 Z" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2.5"/>
    <path d="M30 12 L45 16 Q45 49 30 65 Q15 49 15 16 Z" fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.6"/>
    <text x="30" y="50" text-anchor="middle" font-family="Georgia, serif" font-weight="900" font-size="38" fill="currentColor" stroke="#fff8e8" stroke-width="0.4">A</text>
    <path d="M22 16 L30 11 L38 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M22 60 L30 65 L38 60" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="30" cy="14" r="1.4" fill="url(#g-medal)" stroke="#5d4a18" stroke-width="0.3"/>
    <circle cx="30" cy="62" r="1.4" fill="url(#g-medal)" stroke="#5d4a18" stroke-width="0.3"/>
  </svg>`
};

// ----- BARAJA ESPANOLA -----
const ES = {
  J: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    ${DEFS}
    <rect x="6" y="6" width="48" height="68" rx="3" fill="url(#p-dots)"/>
    <path d="M22 18 Q30 6 38 18 L40 24 L20 24 Z" fill="currentColor" stroke="currentColor" stroke-width="0.6"/>
    <path d="M40 16 Q44 6 38 12 Z" fill="url(#g-gold)"/>
    <ellipse cx="30" cy="34" rx="10" ry="11" fill="url(#g-skin)" stroke="#7a4f2a" stroke-width="0.8"/>
    <ellipse cx="26" cy="33" rx="1.2" ry="1.5" fill="#1a1a1a"/>
    <ellipse cx="34" cy="33" rx="1.2" ry="1.5" fill="#1a1a1a"/>
    <circle cx="24" cy="36" r="1.6" fill="#e8a5a5" opacity="0.55"/>
    <circle cx="36" cy="36" r="1.6" fill="#e8a5a5" opacity="0.55"/>
    <path d="M27 39 Q30 41 33 39" fill="none" stroke="#7a3018" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="44" y1="32" x2="52" y2="14" stroke="#7a4f2a" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M52 14 L60 17 L57 24 L52 22 Z" fill="currentColor" stroke="currentColor" stroke-width="0.6"/>
    <path d="M20 46 Q30 52 40 46 L44 74 L16 74 Z" fill="currentColor" stroke="currentColor" stroke-width="0.6"/>
    <rect x="18" y="58" width="24" height="3" fill="url(#g-gold)" stroke="#5d4a18" stroke-width="0.3"/>
    <circle cx="30" cy="59.5" r="1.6" fill="url(#g-medal)" stroke="#5d4a18" stroke-width="0.4"/>
  </svg>`,

  Q: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    ${DEFS}
    <rect x="6" y="6" width="48" height="68" rx="3" fill="url(#p-dots)"/>
    <ellipse cx="30" cy="13" rx="6" ry="7" fill="url(#g-skin)" stroke="#7a4f2a" stroke-width="0.6"/>
    <circle cx="28" cy="13" r="0.7" fill="#1a1a1a"/>
    <circle cx="32" cy="13" r="0.7" fill="#1a1a1a"/>
    <path d="M24 9 Q30 3 36 9 L36 13 L24 13 Z" fill="url(#g-gold)" stroke="#5d4a18" stroke-width="0.6"/>
    <path d="M36 7 Q44 2 41 13" fill="none" stroke="#c0392b" stroke-width="2" stroke-linecap="round"/>
    <path d="M24 21 Q30 25 36 21 L38 36 L22 36 Z" fill="currentColor" stroke="currentColor" stroke-width="0.6"/>
    <path d="M12 50 Q22 36 36 40 Q46 42 50 52 L47 56 Q43 50 36 50 L24 56 Q18 56 14 60 Z" fill="currentColor" stroke="currentColor" stroke-width="0.6"/>
    <circle cx="42" cy="48" r="1.2" fill="#1a1a1a"/>
    <path d="M20 60 L18 76 L22 76 Z" fill="currentColor"/>
    <path d="M28 60 L26 78 L30 78 Z" fill="currentColor"/>
    <path d="M38 60 L40 76 L36 76 Z" fill="currentColor"/>
    <path d="M46 58 L48 76 L44 76 Z" fill="currentColor"/>
  </svg>`,

  K: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    ${DEFS}
    <rect x="6" y="6" width="48" height="68" rx="3" fill="url(#p-dots)"/>
    <path d="M14 22 L18 10 L24 16 L30 6 L36 16 L42 10 L46 22 Z" fill="url(#g-gold)" stroke="#5d4a18" stroke-width="0.7"/>
    <circle cx="22" cy="13" r="1.3" fill="#c0392b"/>
    <circle cx="30" cy="11" r="1.6" fill="#2b6cb0"/>
    <circle cx="38" cy="13" r="1.3" fill="#2c7a4d"/>
    <rect x="14" y="22" width="32" height="3" fill="url(#g-gold)" stroke="#5d4a18" stroke-width="0.3"/>
    <ellipse cx="30" cy="36" rx="11" ry="13" fill="url(#g-skin)" stroke="#7a4f2a" stroke-width="0.8"/>
    <ellipse cx="26" cy="33" rx="1.3" ry="1.5" fill="#1a1a1a"/>
    <ellipse cx="34" cy="33" rx="1.3" ry="1.5" fill="#1a1a1a"/>
    <path d="M22 30 Q26 28.5 30 30" fill="none" stroke="#5d3010" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M30 30 Q34 28.5 38 30" fill="none" stroke="#5d3010" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M21 41 Q26 44 30 42 Q34 44 39 41" fill="none" stroke="#5d3010" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M25 44 Q30 56 35 44 L35 48 Q30 58 25 48 Z" fill="#5d3010" stroke="#3a1e08" stroke-width="0.4"/>
    <path d="M14 52 Q30 58 46 52 L48 74 Q30 70 12 74 Z" fill="currentColor" stroke="currentColor" stroke-width="0.6"/>
    <line x1="50" y1="32" x2="50" y2="70" stroke="url(#g-gold)" stroke-width="2.8" stroke-linecap="round"/>
    <circle cx="50" cy="30" r="3.2" fill="url(#g-medal)" stroke="#5d4a18" stroke-width="0.4"/>
    <rect x="49" y="24" width="2" height="6" fill="url(#g-gold)"/>
  </svg>`,

  A: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    ${DEFS}
    <path d="M30 6 L46 14 Q48 40 30 70 Q12 40 14 14 Z" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2.5"/>
    <path d="M30 10 L43 16 Q45 39 30 65 Q15 39 17 16 Z" fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.6"/>
    <text x="30" y="50" text-anchor="middle" font-family="Georgia, serif" font-weight="900" font-size="32" fill="currentColor" stroke="#fff8e8" stroke-width="0.4">As</text>
    <path d="M22 18 L30 12 L38 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M22 60 L30 66 L38 60" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="30" cy="14" r="1.4" fill="url(#g-medal)" stroke="#5d4a18" stroke-width="0.3"/>
    <circle cx="30" cy="64" r="1.4" fill="url(#g-medal)" stroke="#5d4a18" stroke-width="0.3"/>
  </svg>`
};

export function courtSvg(card, style) {
  const r = card[0];
  if (!['J', 'Q', 'K', 'A'].includes(r)) return null;
  const set = style === 'espanola' ? ES : FR;
  return set[r];
}
