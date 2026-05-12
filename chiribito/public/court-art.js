// Arte de cartas de figura (J/Q/K/A) en SVG inline.
// Estilo limpio minimalista heraldico que se ve igual de bien en grande y en chico.
// 2 estilos × 4 figuras = 8 ilustraciones.
// El color toma `currentColor` por carta (heredado del .card).

// ----- BARAJA FRANCESA -----
// J = Joker mas tradicional con sombrero, Q = corona con velo, K = barba con corona, A = pip grande con escudo

const FR = {
  J: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <!-- sombrero de bufon con cascabeles -->
    <path d="M30 8 L18 22 L24 22 L20 14 Z M30 8 L42 22 L36 22 L40 14 Z" fill="currentColor"/>
    <circle cx="20" cy="14" r="2" fill="currentColor"/>
    <circle cx="40" cy="14" r="2" fill="currentColor"/>
    <!-- cabeza ovalada -->
    <ellipse cx="30" cy="32" rx="11" ry="13" fill="none" stroke="currentColor" stroke-width="2"/>
    <!-- ojos -->
    <circle cx="26" cy="30" r="1.4" fill="currentColor"/>
    <circle cx="34" cy="30" r="1.4" fill="currentColor"/>
    <!-- boca -->
    <path d="M26 38 Q30 41 34 38" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <!-- cuello/collar zigzag -->
    <path d="M16 47 L20 50 L24 47 L28 50 L32 47 L36 50 L40 47 L44 50" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <!-- torso simbolico -->
    <path d="M19 50 Q30 58 41 50 L41 70 L19 70 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <!-- diamante en el pecho -->
    <path d="M30 58 L26 62 L30 66 L34 62 Z" fill="currentColor"/>
  </svg>`,
  Q: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <!-- corona de reina con 5 picos delicados -->
    <path d="M16 18 L20 10 L24 16 L30 8 L36 16 L40 10 L44 18 Z" fill="currentColor"/>
    <circle cx="20" cy="10" r="1.6" fill="currentColor"/>
    <circle cx="30" cy="8" r="1.8" fill="currentColor"/>
    <circle cx="40" cy="10" r="1.6" fill="currentColor"/>
    <!-- linea base de corona -->
    <line x1="16" y1="18" x2="44" y2="18" stroke="currentColor" stroke-width="1.5"/>
    <!-- cabeza con cabello largo -->
    <ellipse cx="30" cy="32" rx="12" ry="13" fill="none" stroke="currentColor" stroke-width="2"/>
    <!-- cabello cayendo a los lados -->
    <path d="M18 30 Q14 40 16 50 M42 30 Q46 40 44 50" fill="none" stroke="currentColor" stroke-width="2"/>
    <!-- ojos -->
    <ellipse cx="26" cy="32" rx="1.5" ry="1" fill="currentColor"/>
    <ellipse cx="34" cy="32" rx="1.5" ry="1" fill="currentColor"/>
    <!-- boca delicada -->
    <path d="M27 39 Q30 41 33 39" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <!-- cuello / colgante -->
    <path d="M22 48 Q30 54 38 48" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="30" cy="54" r="2.5" fill="currentColor"/>
    <!-- vestido extendido -->
    <path d="M16 60 Q30 56 44 60 L48 76 L12 76 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <!-- adornos en el vestido -->
    <circle cx="24" cy="66" r="1" fill="currentColor"/>
    <circle cx="30" cy="68" r="1" fill="currentColor"/>
    <circle cx="36" cy="66" r="1" fill="currentColor"/>
  </svg>`,
  K: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <!-- corona de rey con 3 picos prominentes y cruz -->
    <path d="M14 20 L18 8 L24 16 L30 6 L36 16 L42 8 L46 20 Z" fill="currentColor"/>
    <!-- cruz arriba -->
    <rect x="29" y="0" width="2" height="8" fill="currentColor"/>
    <rect x="26" y="3" width="8" height="2" fill="currentColor"/>
    <!-- joyas en la corona -->
    <circle cx="22" cy="14" r="1.3" fill="currentColor"/>
    <circle cx="38" cy="14" r="1.3" fill="currentColor"/>
    <!-- linea base corona -->
    <line x1="14" y1="20" x2="46" y2="20" stroke="currentColor" stroke-width="2"/>
    <!-- cabeza -->
    <ellipse cx="30" cy="34" rx="12" ry="14" fill="none" stroke="currentColor" stroke-width="2"/>
    <!-- ojos -->
    <circle cx="25" cy="32" r="1.4" fill="currentColor"/>
    <circle cx="35" cy="32" r="1.4" fill="currentColor"/>
    <!-- bigote y barba -->
    <path d="M22 38 Q26 40 30 39 Q34 40 38 38" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M24 42 Q26 50 30 52 Q34 50 36 42 L36 46 Q34 53 30 54 Q26 53 24 46 Z" fill="currentColor"/>
    <!-- hombros con armadura -->
    <path d="M16 52 Q30 55 44 52 L48 64 Q30 60 12 64 Z" fill="currentColor"/>
    <!-- pecho con escudo -->
    <path d="M16 64 L44 64 L44 76 L16 76 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <path d="M30 66 L24 70 L30 76 L36 70 Z" fill="currentColor"/>
  </svg>`,
  A: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <!-- escudo heraldico grande con A central -->
    <path d="M30 8 L48 14 Q48 50 30 70 Q12 50 12 14 Z" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <!-- A dramatica -->
    <text x="30" y="50" text-anchor="middle" font-family="Georgia, serif" font-weight="900" font-size="34" fill="currentColor">A</text>
    <!-- adornos arriba y abajo -->
    <path d="M24 16 L30 12 L36 16" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M24 60 L30 64 L36 60" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </svg>`
};

// ----- BARAJA ESPANOLA -----
// Sota = paje con bandera, Caballo = caballero a caballo, Rey = rey con cetro, As = simbolo grande

const ES = {
  J: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <!-- gorra de paje (estilo medieval) -->
    <path d="M22 16 Q30 6 38 16 L40 22 L20 22 Z" fill="currentColor"/>
    <circle cx="40" cy="14" r="2" fill="currentColor"/>
    <!-- cara del paje -->
    <ellipse cx="30" cy="32" rx="10" ry="11" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="26" cy="31" r="1.3" fill="currentColor"/>
    <circle cx="34" cy="31" r="1.3" fill="currentColor"/>
    <path d="M27 38 Q30 40 33 38" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <!-- mano sosteniendo bandera -->
    <line x1="44" y1="30" x2="50" y2="14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M50 14 L60 16 L58 22 L50 22 Z" fill="currentColor"/>
    <!-- torso -->
    <path d="M20 44 Q30 50 40 44 L42 70 L18 70 Z" fill="none" stroke="currentColor" stroke-width="2"/>
    <!-- cinturon -->
    <line x1="20" y1="58" x2="40" y2="58" stroke="currentColor" stroke-width="2"/>
    <!-- letra S grande (Sota) abajo -->
    <text x="30" y="76" text-anchor="middle" font-family="Georgia, serif" font-weight="900" font-size="14" fill="currentColor" opacity="0.4">SOTA</text>
  </svg>`,
  Q: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <!-- caballo perfil estilizado (Caballo es la J espanola, simbolicamente) -->
    <!-- cabeza del caballero arriba -->
    <ellipse cx="30" cy="14" rx="6" ry="7" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="28" cy="13" r="0.8" fill="currentColor"/>
    <circle cx="32" cy="13" r="0.8" fill="currentColor"/>
    <!-- casco con pluma -->
    <path d="M24 10 Q30 4 36 10 L36 14 L24 14 Z" fill="currentColor"/>
    <path d="M36 8 Q42 4 40 14" fill="none" stroke="currentColor" stroke-width="2"/>
    <!-- cuerpo del caballero -->
    <path d="M24 22 Q30 26 36 22 L38 36 L22 36 Z" fill="currentColor"/>
    <!-- caballo (cabeza simplificada apuntando derecha) -->
    <path d="M14 50 Q22 38 36 42 Q44 44 48 52 L46 56 Q42 50 36 50 L24 56 Q18 56 14 60 Z" fill="currentColor"/>
    <!-- ojo del caballo -->
    <circle cx="42" cy="48" r="1" fill="rgba(255,255,255,0.8)"/>
    <!-- patas -->
    <line x1="20" y1="60" x2="18" y2="72" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="28" y1="60" x2="26" y2="74" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="36" y1="60" x2="38" y2="72" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="44" y1="58" x2="46" y2="74" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,
  K: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <!-- corona de rey espanol amplia -->
    <path d="M14 20 L18 8 L24 14 L30 6 L36 14 L42 8 L46 20 Z" fill="currentColor"/>
    <circle cx="22" cy="11" r="1.3" fill="currentColor"/>
    <circle cx="30" cy="9" r="1.5" fill="currentColor"/>
    <circle cx="38" cy="11" r="1.3" fill="currentColor"/>
    <!-- linea base -->
    <rect x="14" y="20" width="32" height="3" fill="currentColor"/>
    <!-- cabeza -->
    <ellipse cx="30" cy="34" rx="11" ry="13" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="26" cy="33" r="1.3" fill="currentColor"/>
    <circle cx="34" cy="33" r="1.3" fill="currentColor"/>
    <!-- bigote ancho estilo espanol -->
    <path d="M22 38 Q26 41 30 40 Q34 41 38 38" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <!-- barba puntiaguda -->
    <path d="M26 43 Q30 54 34 43 L34 47 Q30 56 26 47 Z" fill="currentColor"/>
    <!-- capa real con cuello alto -->
    <path d="M14 50 Q30 56 46 50 L46 70 Q30 66 14 70 Z" fill="currentColor"/>
    <!-- cetro a la derecha -->
    <line x1="50" y1="32" x2="50" y2="68" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="50" cy="30" r="3" fill="currentColor"/>
    <!-- cruz arriba del cetro -->
    <rect x="49" y="24" width="2" height="6" fill="currentColor"/>
  </svg>`,
  A: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <!-- ornamento heraldico espanol -->
    <path d="M30 6 L46 14 Q48 40 30 70 Q12 40 14 14 Z" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <text x="30" y="50" text-anchor="middle" font-family="Georgia, serif" font-weight="900" font-size="32" fill="currentColor">As</text>
    <path d="M22 18 L30 12 L38 18" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M22 60 L30 66 L38 60" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </svg>`
};

export function courtSvg(card, style) {
  const r = card[0];
  // Solo cartas de figura: J, Q, K, A
  if (!['J', 'Q', 'K', 'A'].includes(r)) return null;
  const set = style === 'espanola' ? ES : FR;
  return set[r];
}
