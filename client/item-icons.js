// Detailed SVG icons por item. Cada función devuelve un string SVG
// con viewBox 0 0 40 40 que se renderiza en los slots del inventario,
// side panels, hotbar, crafteo, etc. Diseñados una sola vez.
//
// Convenciones:
//   - viewBox 0 0 40 40 (compacto pero con detalle)
//   - Trazo principal en el color del item para que se identifique
//   - Background neutro para que se vea sobre fondos oscuros
//   - Stroke 1.5-2.5 para que se vea claro a 32-48px

// =====================================================================
// Helper: build SVG con un wrapper estándar.
// =====================================================================
function svg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" class="itemIcon">${inner}</svg>`;
}

// =====================================================================
// WEAPONS — silueta lateral del arma
// =====================================================================
const ICONS = {
  pistol: svg(`
    <rect x="7" y="20" width="20" height="6" fill="#3a3a3e" stroke="#222" stroke-width="0.5"/>
    <rect x="22" y="14" width="10" height="6" fill="#3a3a3e" stroke="#222" stroke-width="0.5"/>
    <rect x="32" y="15" width="3" height="4" fill="#1a1a1c"/>
    <rect x="9" y="26" width="6" height="8" fill="#3a3a3e" stroke="#222" stroke-width="0.5"/>
    <rect x="18" y="13" width="3" height="3" fill="#1a1a1c"/>
  `),
  rifle: svg(`
    <rect x="4" y="20" width="32" height="4" fill="#3a3a3e"/>
    <rect x="6" y="17" width="6" height="3" fill="#1a1a1c"/>
    <rect x="10" y="24" width="5" height="6" fill="#4a3018"/>
    <rect x="14" y="22" width="8" height="4" fill="#2a2a2c"/>
    <rect x="26" y="19" width="2" height="6" fill="#1a1a1c"/>
    <circle cx="34" cy="22" r="1" fill="#666"/>
  `),
  ak: svg(`
    <rect x="3" y="20" width="34" height="4" fill="#5a3018"/>
    <rect x="8" y="17" width="6" height="3" fill="#3a2010"/>
    <path d="M 14 24 Q 16 30 20 32 Q 24 30 26 24 Z" fill="#1a1a1c"/>
    <rect x="13" y="23" width="14" height="3" fill="#3a2010"/>
    <rect x="29" y="19" width="2" height="6" fill="#1a1a1c"/>
    <circle cx="35" cy="22" r="1.5" fill="#888"/>
  `),
  semi: svg(`
    <rect x="3" y="20" width="34" height="4" fill="#2a3018"/>
    <rect x="8" y="17" width="5" height="3" fill="#1a1a1c"/>
    <rect x="11" y="24" width="5" height="6" fill="#1a2010"/>
    <rect x="14" y="22" width="10" height="3" fill="#3a4020"/>
    <circle cx="30" cy="21" r="2" fill="none" stroke="#666" stroke-width="0.5"/>
    <line x1="30" y1="19" x2="30" y2="23" stroke="#666" stroke-width="0.3"/>
  `),
  smg: svg(`
    <rect x="8" y="20" width="22" height="4" fill="#2a2a2c"/>
    <rect x="10" y="17" width="4" height="3" fill="#1a1a1c"/>
    <rect x="14" y="24" width="6" height="8" fill="#3a3a3e"/>
    <rect x="20" y="22" width="6" height="4" fill="#1a1a1c"/>
    <circle cx="28" cy="22" r="1" fill="#666"/>
  `),
  shotgun: svg(`
    <rect x="3" y="20" width="34" height="3" fill="#3a2018"/>
    <rect x="6" y="18" width="6" height="3" fill="#1a1a1c"/>
    <rect x="10" y="23" width="6" height="6" fill="#5a3018"/>
    <rect x="14" y="22" width="8" height="3" fill="#2a1a10"/>
    <rect x="22" y="21" width="4" height="5" fill="#1a1a1c"/>
    <circle cx="36" cy="21" r="1" fill="#888"/>
  `),
  sniper: svg(`
    <rect x="2" y="21" width="36" height="3" fill="#2a2a2c"/>
    <rect x="5" y="19" width="4" height="3" fill="#1a1a1c"/>
    <rect x="12" y="24" width="5" height="5" fill="#3a3018"/>
    <ellipse cx="22" cy="18" rx="6" ry="2" fill="none" stroke="#888" stroke-width="0.8"/>
    <rect x="20" y="17" width="4" height="2" fill="#666"/>
    <line x1="22" y1="22" x2="22" y2="20" stroke="#888" stroke-width="0.5"/>
  `),
  crossbow: svg(`
    <path d="M 5 16 Q 20 8 35 16" stroke="#5a3018" stroke-width="2" fill="none"/>
    <rect x="14" y="20" width="12" height="3" fill="#3a2010"/>
    <line x1="20" y1="16" x2="20" y2="23" stroke="#1a1a1c" stroke-width="1.5"/>
    <line x1="5" y1="16" x2="35" y2="16" stroke="#888" stroke-width="0.3"/>
    <rect x="14" y="23" width="4" height="5" fill="#3a2010"/>
  `),
  gl: svg(`
    <rect x="5" y="18" width="30" height="6" fill="#2a3a2a"/>
    <circle cx="33" cy="21" r="3" fill="#1a1a1c"/>
    <circle cx="33" cy="21" r="2" fill="#3a2010"/>
    <rect x="10" y="24" width="6" height="6" fill="#2a3a2a"/>
    <rect x="14" y="22" width="8" height="3" fill="#1a2a1a"/>
  `),
  gatling: svg(`
    <rect x="10" y="14" width="22" height="14" fill="#3a3a3e"/>
    <circle cx="14" cy="18" r="1.5" fill="#1a1a1c"/>
    <circle cx="14" cy="22" r="1.5" fill="#1a1a1c"/>
    <circle cx="14" cy="26" r="1.5" fill="#1a1a1c"/>
    <circle cx="32" cy="21" r="3" fill="#666"/>
    <line x1="32" y1="14" x2="32" y2="28" stroke="#888" stroke-width="0.4"/>
    <rect x="6" y="28" width="8" height="4" fill="#222"/>
  `),
  nuke: svg(`
    <rect x="4" y="17" width="30" height="6" fill="#5a5a5e"/>
    <ellipse cx="34" cy="20" rx="3" ry="3" fill="#888"/>
    <circle cx="34" cy="20" r="1.5" fill="#1a1a1c"/>
    <rect x="10" y="23" width="8" height="6" fill="#3a3a3e"/>
    <text x="18" y="21" font-family="monospace" font-size="6" fill="#f0c060" font-weight="bold">☢</text>
  `),
  knife: svg(`
    <path d="M 6 22 L 26 18 L 28 22 L 26 24 Z" fill="#c0c0c4" stroke="#666" stroke-width="0.5"/>
    <rect x="26" y="20" width="8" height="4" fill="#4a3018"/>
    <rect x="26" y="20" width="8" height="1" fill="#2a1a10"/>
  `),
  bolt: svg(`
    <line x1="4" y1="20" x2="32" y2="20" stroke="#888" stroke-width="1"/>
    <path d="M 32 17 L 36 20 L 32 23 Z" fill="#888"/>
    <path d="M 4 17 L 6 20 L 4 23 L 8 20 Z" fill="#3a2018"/>
  `),

  // =====================================================================
  // TOOLS
  // =====================================================================
  axe: svg(`
    <rect x="18" y="6" width="3" height="28" fill="#5a3018"/>
    <path d="M 6 8 L 20 6 L 20 18 L 6 16 Z" fill="#888"/>
    <line x1="8" y1="9" x2="18" y2="10" stroke="#444" stroke-width="0.5"/>
  `),
  pickaxe: svg(`
    <rect x="18" y="8" width="3" height="28" fill="#5a3018"/>
    <path d="M 4 4 L 12 12 L 20 8 L 28 12 L 36 4 L 32 14 L 8 14 Z" fill="#888"/>
  `),
  hammer: svg(`
    <rect x="18" y="8" width="3" height="28" fill="#5a3018"/>
    <rect x="10" y="6" width="18" height="6" fill="#888"/>
    <rect x="12" y="7" width="14" height="1" fill="#444"/>
  `),

  // =====================================================================
  // WEAPON BODIES — engranaje + silueta de arma
  // =====================================================================
  rifle_body:    svg(bodyIcon('rifle')),
  shotgun_body:  svg(bodyIcon('shotgun')),
  smg_body:      svg(bodyIcon('smg')),
  sniper_body:   svg(bodyIcon('sniper')),
  ak_body:       svg(bodyIcon('ak')),
  semi_body:     svg(bodyIcon('semi')),
  gl_body:       svg(bodyIcon('gl')),
  gatling_body:  svg(bodyIcon('gatling')),
  nuke_body:     svg(bodyIcon('nuke')),

  // =====================================================================
  // AMMO — silueta del cartucho
  // =====================================================================
  bullet_p:        svg(`<rect x="14" y="14" width="6" height="14" fill="#c8a040"/><rect x="14" y="12" width="6" height="3" fill="#888"/><rect x="13" y="28" width="8" height="3" fill="#a0801a"/>`),
  bullet_r:        svg(`<rect x="13" y="10" width="7" height="20" fill="#c8a040"/><rect x="13" y="8" width="7" height="3" fill="#888"/><rect x="12" y="30" width="9" height="3" fill="#a0801a"/>`),
  bullet_762:      svg(`<rect x="13" y="9" width="7" height="22" fill="#a07820"/><rect x="13" y="7" width="7" height="3" fill="#666"/><rect x="12" y="31" width="9" height="3" fill="#806018"/>`),
  bullet_marksman: svg(`<rect x="13" y="6" width="7" height="26" fill="#b88830"/><rect x="13" y="4" width="7" height="3" fill="#888"/><rect x="12" y="32" width="9" height="3" fill="#906018"/>`),
  bullet_smg:      svg(`<rect x="14" y="16" width="5" height="12" fill="#c8a040"/><rect x="14" y="14" width="5" height="3" fill="#888"/><rect x="13" y="28" width="7" height="3" fill="#a0801a"/>`),
  shell:           svg(`<rect x="12" y="8" width="9" height="24" rx="2" fill="#c83020"/><rect x="12" y="29" width="9" height="3" fill="#888"/><rect x="14" y="6" width="5" height="3" fill="#1a1a1c"/>`),
  sniper_round:    svg(`<rect x="13" y="4" width="7" height="28" fill="#d8a830"/><rect x="13" y="2" width="7" height="3" fill="#888"/><rect x="12" y="32" width="9" height="4" fill="#a07810"/><text x="14" y="22" font-size="6" fill="#1a1a1c" font-family="monospace">50</text>`),
  gl_round:        svg(`<rect x="11" y="12" width="11" height="18" fill="#3a5a3a"/><ellipse cx="16.5" cy="12" rx="5.5" ry="2.5" fill="#1a3a1a"/><rect x="10" y="30" width="13" height="3" fill="#888"/><text x="13" y="24" font-size="5" fill="#f0c060" font-family="monospace">40</text>`),
  nuke_round:      svg(`<ellipse cx="20" cy="16" rx="7" ry="9" fill="#888"/><rect x="17" y="24" width="6" height="10" fill="#3a3a3e"/><text x="14" y="20" font-size="9" fill="#f0c060" font-family="monospace" font-weight="bold">☢</text>`),
  bullet_p_ap:     svg(`<rect x="14" y="14" width="6" height="14" fill="#3a90e0"/><rect x="14" y="12" width="6" height="3" fill="#1a60a0"/><rect x="13" y="28" width="8" height="3" fill="#1a5080"/><text x="14" y="22" font-size="4" fill="#fff" font-weight="bold">AP</text>`),
  bullet_r_ap:     svg(`<rect x="13" y="10" width="7" height="20" fill="#3a90e0"/><rect x="13" y="8" width="7" height="3" fill="#1a60a0"/><rect x="12" y="30" width="9" height="3" fill="#1a5080"/><text x="14" y="22" font-size="4" fill="#fff" font-weight="bold">AP</text>`),
  bullet_r_inc:    svg(`<rect x="13" y="10" width="7" height="20" fill="#e05030"/><rect x="13" y="8" width="7" height="3" fill="#a02010"/><rect x="12" y="30" width="9" height="3" fill="#801800"/><path d="M 14 24 L 17 18 L 20 24 Z" fill="#f0c040"/>`),

  // =====================================================================
  // ATTACHMENTS
  // =====================================================================
  scope:        svg(`<circle cx="20" cy="20" r="13" fill="none" stroke="#444" stroke-width="2.5"/><circle cx="20" cy="20" r="9" fill="#1a3a5a" stroke="#666"/><line x1="20" y1="11" x2="20" y2="29" stroke="#888" stroke-width="0.6"/><line x1="11" y1="20" x2="29" y2="20" stroke="#888" stroke-width="0.6"/><circle cx="20" cy="20" r="1" fill="#d04040"/>`),
  silencer:     svg(`<rect x="8" y="18" width="24" height="5" rx="2" fill="#1a1a1c" stroke="#444"/><circle cx="30" cy="20.5" r="2" fill="#000"/><line x1="12" y1="20.5" x2="28" y2="20.5" stroke="#444" stroke-width="0.3"/>`),
  ext_mag:      svg(`<rect x="14" y="8" width="10" height="22" rx="1" fill="#3a3a3e" stroke="#1a1a1c"/><rect x="14" y="8" width="10" height="3" fill="#5a5a5e"/><line x1="16" y1="14" x2="22" y2="14" stroke="#1a1a1c" stroke-width="0.4"/><line x1="16" y1="18" x2="22" y2="18" stroke="#1a1a1c" stroke-width="0.4"/><line x1="16" y1="22" x2="22" y2="22" stroke="#1a1a1c" stroke-width="0.4"/>`),
  grip:         svg(`<path d="M 16 12 L 24 12 L 26 32 L 14 32 Z" fill="#3a2018" stroke="#1a1a1c" stroke-width="0.5"/><line x1="17" y1="18" x2="23" y2="18" stroke="#1a0e00" stroke-width="0.5"/><line x1="17" y1="24" x2="23" y2="24" stroke="#1a0e00" stroke-width="0.5"/>`),
  laser_sight:  svg(`<rect x="10" y="18" width="16" height="5" rx="1" fill="#3a3a3e"/><circle cx="28" cy="20.5" r="2" fill="#d04040"/><line x1="30" y1="20.5" x2="38" y2="20.5" stroke="#d04040" stroke-width="0.8"/>`),

  // =====================================================================
  // MEDS
  // =====================================================================
  bandage:     svg(`<rect x="6" y="18" width="28" height="6" fill="#f0e8dc" stroke="#888"/><rect x="14" y="16" width="12" height="10" fill="#fff" stroke="#888"/><rect x="18" y="19" width="4" height="4" fill="#d04040"/><rect x="19" y="18" width="2" height="6" fill="#d04040"/>`),
  medkit:      svg(`<rect x="6" y="10" width="28" height="24" rx="2" fill="#d04040" stroke="#1a1a1c"/><rect x="6" y="14" width="28" height="2" fill="#9c2020"/><rect x="18" y="18" width="4" height="14" fill="#fff"/><rect x="13" y="23" width="14" height="4" fill="#fff"/>`),
  antibiotics: svg(`<rect x="14" y="12" width="12" height="20" rx="2" fill="#f8f8e8" stroke="#444"/><rect x="14" y="12" width="12" height="5" fill="#3a90e0"/><text x="16" y="26" font-size="5" fill="#444" font-family="monospace">Rx</text>`),
  painkillers: svg(`<ellipse cx="20" cy="20" rx="12" ry="7" fill="#e060c0"/><line x1="8" y1="20" x2="32" y2="20" stroke="#a0306e" stroke-width="1"/>`),
  morphine:    svg(`<rect x="8" y="18" width="20" height="5" fill="#f0f0f0" stroke="#666"/><rect x="28" y="19" width="6" height="3" fill="#3a90e0"/><line x1="34" y1="20.5" x2="38" y2="20.5" stroke="#888" stroke-width="1"/><text x="14" y="22" font-size="5" fill="#1a1a1c">═</text>`),
  adrenaline:  svg(`<rect x="8" y="18" width="20" height="5" fill="#f0f0f0" stroke="#666"/><rect x="28" y="19" width="6" height="3" fill="#d04040"/><line x1="34" y1="20.5" x2="38" y2="20.5" stroke="#888" stroke-width="1"/><path d="M 14 14 L 17 21 L 15 21 L 18 28" stroke="#d04040" stroke-width="1.5" fill="none"/>`),

  // =====================================================================
  // THROWABLES
  // =====================================================================
  grenade:       svg(`<circle cx="20" cy="22" r="10" fill="#3a5a3a" stroke="#1a3a1a"/><rect x="18" y="9" width="4" height="6" fill="#666"/><rect x="16" y="11" width="8" height="3" fill="#888"/><path d="M 14 19 L 26 19 M 14 23 L 26 23 M 14 27 L 26 27" stroke="#1a3a1a" stroke-width="0.5"/>`),
  smoke_grenade: svg(`<rect x="14" y="14" width="12" height="20" rx="2" fill="#5a5a5e" stroke="#222"/><rect x="14" y="14" width="12" height="4" fill="#888"/><rect x="17" y="10" width="6" height="5" fill="#444"/><circle cx="14" cy="8" r="2" fill="#aaa" opacity="0.6"/><circle cx="22" cy="6" r="2.5" fill="#aaa" opacity="0.6"/>`),
  flashbang:     svg(`<rect x="14" y="14" width="12" height="20" rx="1" fill="#e8e8d0" stroke="#888"/><rect x="14" y="14" width="12" height="4" fill="#f0c060"/><rect x="17" y="10" width="6" height="5" fill="#888"/><circle cx="20" cy="22" r="3" fill="#fff" opacity="0.9"/>`),
  molotov:       svg(`<path d="M 16 14 L 24 14 L 26 24 L 22 32 L 18 32 L 14 24 Z" fill="#5aa8d0" stroke="#1a4060"/><rect x="18" y="10" width="4" height="5" fill="#888"/><path d="M 19 9 Q 18 5 16 6 Q 20 4 22 6 Q 20 5 21 9" fill="#f0a020"/>`),
  c4:            svg(`<rect x="8" y="14" width="24" height="14" fill="#e8e0c8" stroke="#888"/><rect x="8" y="14" width="24" height="3" fill="#d04040"/><text x="13" y="25" font-size="6" font-family="monospace" font-weight="bold" fill="#1a1a1c">C-4</text><line x1="32" y1="21" x2="38" y2="21" stroke="#222" stroke-width="0.6"/>`),
  mine:          svg(`<ellipse cx="20" cy="26" rx="14" ry="4" fill="#3a3a3e" stroke="#1a1a1c"/><rect x="17" y="18" width="6" height="8" fill="#444"/><rect x="18" y="14" width="4" height="4" fill="#d04040"/>`),

  // =====================================================================
  // FOOD / DRINK
  // =====================================================================
  meat_cooked:    svg(`<path d="M 8 16 Q 12 8 22 10 Q 32 14 32 24 Q 28 30 20 30 Q 10 28 8 16 Z" fill="#7a4018" stroke="#3a1a08"/><rect x="22" y="22" width="6" height="3" fill="#1a0e00" opacity="0.5"/>`),
  meat_raw:       svg(`<path d="M 8 16 Q 12 8 22 10 Q 32 14 32 24 Q 28 30 20 30 Q 10 28 8 16 Z" fill="#c04050" stroke="#601018"/><rect x="22" y="22" width="6" height="3" fill="#fff" opacity="0.4"/>`),
  fish_cooked:    svg(`<path d="M 4 20 Q 12 12 22 14 Q 32 18 36 20 Q 32 22 22 26 Q 12 28 4 20 Z" fill="#a06030"/><path d="M 30 16 L 38 12 L 38 28 L 30 24 Z" fill="#a06030"/><circle cx="14" cy="18" r="1" fill="#1a1a1c"/>`),
  fish_raw:       svg(`<path d="M 4 20 Q 12 12 22 14 Q 32 18 36 20 Q 32 22 22 26 Q 12 28 4 20 Z" fill="#7090a0"/><path d="M 30 16 L 38 12 L 38 28 L 30 24 Z" fill="#7090a0"/><circle cx="14" cy="18" r="1" fill="#1a1a1c"/>`),
  jerky:          svg(`<path d="M 6 18 L 14 14 L 26 12 L 34 16 L 32 26 L 24 30 L 12 28 L 8 24 Z" fill="#601810" stroke="#300808"/><line x1="14" y1="20" x2="32" y2="22" stroke="#1a0808" stroke-width="0.5"/>`),
  bread:          svg(`<ellipse cx="20" cy="22" rx="14" ry="9" fill="#d8a060" stroke="#a06820"/><line x1="10" y1="20" x2="30" y2="20" stroke="#603818" stroke-width="0.7"/><line x1="12" y1="24" x2="28" y2="24" stroke="#603818" stroke-width="0.7"/>`),
  soup:           svg(`<path d="M 6 20 Q 6 30 20 32 Q 34 30 34 20 L 33 22 L 7 22 Z" fill="#8a5018"/><ellipse cx="20" cy="20" rx="14" ry="3" fill="#a06028"/><path d="M 18 16 Q 19 14 18 12 M 22 16 Q 23 14 22 12" stroke="#aaa" stroke-width="0.6" fill="none"/>`),
  stew:           svg(`<path d="M 6 20 Q 6 30 20 32 Q 34 30 34 20 L 33 22 L 7 22 Z" fill="#603018"/><ellipse cx="20" cy="20" rx="14" ry="3" fill="#7a4020"/><circle cx="16" cy="20" r="1.5" fill="#c0a020"/><circle cx="22" cy="19" r="1" fill="#c04030"/><path d="M 18 16 Q 19 14 18 12" stroke="#aaa" stroke-width="0.6" fill="none"/>`),
  canned_food:    svg(`<rect x="12" y="10" width="16" height="24" rx="1" fill="#888" stroke="#444"/><rect x="12" y="10" width="16" height="3" fill="#aaa"/><rect x="12" y="31" width="16" height="3" fill="#666"/><rect x="14" y="16" width="12" height="10" fill="#c84030"/><text x="16" y="24" font-size="4" fill="#fff" font-weight="bold">FOOD</text>`),
  energy_bar:     svg(`<rect x="6" y="16" width="28" height="10" rx="1" fill="#d8a040"/><rect x="6" y="16" width="28" height="3" fill="#f0c060"/><text x="12" y="24" font-size="5" font-family="monospace" font-weight="bold" fill="#1a1a1c">ENERGY</text>`),
  mushroom:       svg(`<path d="M 8 18 Q 10 8 20 8 Q 30 8 32 18 Q 30 20 20 20 Q 10 20 8 18 Z" fill="#c83030"/><circle cx="14" cy="14" r="1.5" fill="#fff"/><circle cx="22" cy="13" r="1.5" fill="#fff"/><circle cx="28" cy="16" r="1" fill="#fff"/><rect x="17" y="20" width="6" height="10" fill="#e8d8a0"/>`),
  herbs:          svg(`<path d="M 20 32 L 20 16" stroke="#3a8030" stroke-width="1.2"/><path d="M 20 22 Q 14 18 12 12 Q 18 14 20 18 M 20 18 Q 26 14 28 8 Q 22 12 20 16 M 20 26 Q 14 22 12 18 Q 18 22 20 24" stroke="#3a8030" stroke-width="0.8" fill="#48a040"/>`),
  berry:          svg(`<circle cx="14" cy="22" r="5" fill="#603088"/><circle cx="22" cy="20" r="5" fill="#7040a0"/><circle cx="26" cy="26" r="4" fill="#601868"/><circle cx="15" cy="20" r="1" fill="#a070c0"/>`),
  honey:          svg(`<path d="M 12 14 L 28 14 L 30 32 L 10 32 Z" fill="#f0c040" stroke="#a08018"/><rect x="14" y="10" width="12" height="5" fill="#fff" stroke="#aaa"/><polygon points="20,22 22,25 20,28 18,25" fill="#a07810"/>`),
  water_bottle:   svg(`<path d="M 14 14 L 14 32 Q 14 34 16 34 L 24 34 Q 26 34 26 32 L 26 14 Z" fill="#7090c0" stroke="#3a5080" opacity="0.7"/><rect x="16" y="6" width="8" height="9" fill="#888"/><path d="M 16 18 L 16 30 L 24 30 L 24 18 Z" fill="#3a70a0" opacity="0.6"/>`),
  dirty_water:    svg(`<path d="M 14 14 L 14 32 Q 14 34 16 34 L 24 34 Q 26 34 26 32 L 26 14 Z" fill="#605030" stroke="#403018" opacity="0.7"/><rect x="16" y="6" width="8" height="9" fill="#666"/><path d="M 16 18 L 16 30 L 24 30 L 24 18 Z" fill="#503820" opacity="0.6"/>`),
  purified_water: svg(`<path d="M 14 14 L 14 32 Q 14 34 16 34 L 24 34 Q 26 34 26 32 L 26 14 Z" fill="#90c0e8" stroke="#3a70a0" opacity="0.7"/><rect x="16" y="6" width="8" height="9" fill="#aaa"/><path d="M 28 16 L 30 18 L 32 16 L 30 14 Z" fill="#f0c060"/>`),
  coffee:         svg(`<path d="M 8 12 L 8 28 Q 8 32 14 32 L 26 32 Q 32 32 32 28 L 32 12 Z" fill="#603018" stroke="#301808"/><ellipse cx="20" cy="12" rx="12" ry="3" fill="#2a1008"/><path d="M 32 18 Q 38 18 38 23 Q 38 28 32 28" stroke="#603018" stroke-width="2" fill="none"/>`),
  milk:           svg(`<path d="M 10 12 L 14 6 L 26 6 L 30 12 L 30 32 L 10 32 Z" fill="#f8f8e8" stroke="#aaa"/><rect x="12" y="14" width="16" height="6" fill="#3a70a0"/><text x="15" y="19" font-size="5" font-family="monospace" font-weight="bold" fill="#fff">MILK</text>`),
  tea:            svg(`<path d="M 8 14 L 8 28 Q 8 32 14 32 L 26 32 Q 32 32 32 28 L 32 14 Z" fill="#a06028" stroke="#603018"/><ellipse cx="20" cy="14" rx="12" ry="3" fill="#702808"/><path d="M 20 12 Q 16 6 12 8 Q 14 10 20 14" fill="#48a040"/>`),

  // =====================================================================
  // MATERIALS
  // =====================================================================
  wood:        svg(`<rect x="8" y="14" width="24" height="12" rx="1" fill="#8a5020" stroke="#3a1a08"/><line x1="10" y1="17" x2="30" y2="17" stroke="#5a3010" stroke-width="0.4"/><line x1="10" y1="22" x2="30" y2="22" stroke="#5a3010" stroke-width="0.4"/><circle cx="13" cy="20" r="2" fill="none" stroke="#5a3010" stroke-width="0.5"/>`),
  stone:       svg(`<path d="M 8 24 L 12 14 L 22 10 L 30 16 L 32 24 L 24 30 L 12 30 Z" fill="#888" stroke="#444"/><path d="M 14 16 L 20 14 M 24 18 L 28 16" stroke="#aaa" stroke-width="0.5"/>`),
  cloth:       svg(`<path d="M 6 16 L 14 12 L 22 14 L 30 12 L 34 16 L 30 22 L 32 28 L 24 30 L 16 28 L 8 30 L 10 22 Z" fill="#d0d0c0" stroke="#888"/><path d="M 12 18 L 28 20 M 12 24 L 28 26" stroke="#888" stroke-width="0.4"/>`),
  iron:        svg(`<path d="M 6 20 L 8 14 L 32 14 L 34 20 L 32 26 L 8 26 Z" fill="#a0a0a8" stroke="#444"/><line x1="8" y1="17" x2="32" y2="17" stroke="#666" stroke-width="0.5"/><line x1="8" y1="23" x2="32" y2="23" stroke="#444" stroke-width="0.5"/>`),
  coal:        svg(`<path d="M 8 26 L 12 14 L 22 10 L 32 18 L 30 28 L 18 32 L 10 30 Z" fill="#1a1a20" stroke="#000"/><path d="M 14 18 L 18 16 M 22 22 L 26 20" stroke="#3a3a3e" stroke-width="0.4"/>`),
  sulfur:      svg(`<path d="M 8 24 L 12 14 L 22 10 L 30 16 L 32 24 L 24 30 L 12 30 Z" fill="#e8c020" stroke="#a08008"/><path d="M 14 16 L 20 14" stroke="#fff" stroke-width="0.5"/>`),
  copper:      svg(`<path d="M 6 20 L 8 14 L 32 14 L 34 20 L 32 26 L 8 26 Z" fill="#c87030" stroke="#603010"/><line x1="8" y1="17" x2="32" y2="17" stroke="#a05018" stroke-width="0.5"/><line x1="8" y1="23" x2="32" y2="23" stroke="#603010" stroke-width="0.5"/>`),
  rabbit_pelt: svg(`<path d="M 8 18 Q 8 8 20 8 Q 32 8 32 18 L 30 32 L 10 32 Z" fill="#d8c8a0" stroke="#888"/><circle cx="14" cy="14" r="1.5" fill="#444"/><circle cx="26" cy="14" r="1.5" fill="#444"/>`),
  deer_pelt:   svg(`<path d="M 8 18 Q 8 8 20 8 Q 32 8 32 18 L 30 32 L 10 32 Z" fill="#9a6028" stroke="#603018"/><circle cx="16" cy="22" r="1.2" fill="#fff"/><circle cx="22" cy="20" r="1" fill="#fff"/><circle cx="20" cy="26" r="1" fill="#fff"/>`),
  leather:     svg(`<rect x="6" y="12" width="28" height="16" fill="#6a4020" stroke="#3a1a08"/><line x1="9" y1="15" x2="31" y2="15" stroke="#3a1a08" stroke-dasharray="1 1" stroke-width="0.5"/><line x1="9" y1="25" x2="31" y2="25" stroke="#3a1a08" stroke-dasharray="1 1" stroke-width="0.5"/>`),
  nail:        svg(`<line x1="20" y1="6" x2="20" y2="32" stroke="#888" stroke-width="2.5"/><path d="M 14 6 L 26 6 L 24 10 L 16 10 Z" fill="#aaa"/><path d="M 20 32 L 22 36 L 18 36 Z" fill="#666"/>`),
  gunpowder:   svg(`<path d="M 8 28 Q 12 22 20 22 Q 28 22 32 28 Q 28 32 20 32 Q 12 32 8 28 Z" fill="#3a3a3e"/><circle cx="14" cy="26" r="0.8" fill="#1a1a1c"/><circle cx="20" cy="24" r="0.8" fill="#1a1a1c"/><circle cx="26" cy="26" r="0.8" fill="#1a1a1c"/><circle cx="17" cy="28" r="0.8" fill="#1a1a1c"/><circle cx="23" cy="28" r="0.8" fill="#1a1a1c"/>`),
  circuit:     svg(`<rect x="6" y="12" width="28" height="16" fill="#2a6a3a" stroke="#1a4020"/><circle cx="12" cy="18" r="1.5" fill="#f0c040"/><circle cx="20" cy="22" r="1.5" fill="#f0c040"/><circle cx="28" cy="18" r="1.5" fill="#f0c040"/><line x1="12" y1="18" x2="20" y2="22" stroke="#aaa" stroke-width="0.5"/><line x1="20" y1="22" x2="28" y2="18" stroke="#aaa" stroke-width="0.5"/><rect x="14" y="24" width="3" height="2" fill="#1a1a1c"/><rect x="22" y="14" width="3" height="2" fill="#1a1a1c"/>`),
  battery:     svg(`<rect x="8" y="12" width="22" height="16" fill="#3a3a3e" stroke="#1a1a1c"/><rect x="30" y="16" width="3" height="8" fill="#888"/><rect x="10" y="14" width="18" height="3" fill="#48d068"/><rect x="10" y="20" width="14" height="3" fill="#48d068"/><rect x="10" y="24" width="10" height="3" fill="#48d068"/>`),
  rope:        svg(`<circle cx="20" cy="22" r="11" fill="none" stroke="#a06028" stroke-width="2.5"/><circle cx="20" cy="22" r="7" fill="none" stroke="#a06028" stroke-width="2.5"/><circle cx="20" cy="22" r="3" fill="none" stroke="#a06028" stroke-width="2"/>`),
  scrap:       svg(`<path d="M 6 22 L 10 14 L 18 12 L 20 18 L 28 14 L 32 22 L 28 28 L 14 30 L 8 28 Z" fill="#5a5a5e" stroke="#222"/><line x1="14" y1="18" x2="18" y2="22" stroke="#888" stroke-width="0.5"/><line x1="22" y1="20" x2="26" y2="24" stroke="#888" stroke-width="0.5"/>`),
  seeds:       svg(`<circle cx="13" cy="20" r="2.5" fill="#a08040"/><circle cx="20" cy="16" r="2.5" fill="#a08040"/><circle cx="27" cy="20" r="2.5" fill="#a08040"/><circle cx="16" cy="26" r="2.5" fill="#a08040"/><circle cx="24" cy="26" r="2.5" fill="#a08040"/>`),

  // =====================================================================
  // ARMOR — 4 TIERS x 7 SLOTS
  // =====================================================================
  // Helpers para shapes de armor por slot (varia el color por tier)
  // Slot shapes: helmet, shirt, pants, shoes, body, legs, gloves

  // === ARMOR LEGACY ===
  vest_armor:   svg(armorIcon('body', '#3a90e0')),
  helmet_armor: svg(armorIcon('helmet', '#a060e0')),

  // === T1 CLOTH (tela — beige claro) ===
  cloth_helmet: svg(armorIcon('helmet', '#d0c0a0')),
  cloth_shirt:  svg(armorIcon('shirt',  '#d0c0a0')),
  cloth_pants:  svg(armorIcon('pants',  '#d0c0a0')),
  cloth_shoes:  svg(armorIcon('shoes',  '#d0c0a0')),
  cloth_body:   svg(armorIcon('body',   '#d0c0a0')),
  cloth_legs:   svg(armorIcon('legs',   '#d0c0a0')),
  cloth_gloves: svg(armorIcon('gloves', '#d0c0a0')),
  // === T2 LEATHER (marrón) ===
  leather_helmet: svg(armorIcon('helmet', '#7a4020')),
  leather_shirt:  svg(armorIcon('shirt',  '#7a4020')),
  leather_pants:  svg(armorIcon('pants',  '#7a4020')),
  leather_shoes:  svg(armorIcon('shoes',  '#7a4020')),
  leather_body:   svg(armorIcon('body',   '#7a4020')),
  leather_legs:   svg(armorIcon('legs',   '#7a4020')),
  leather_gloves: svg(armorIcon('gloves', '#7a4020')),
  // === T3 IRON (gris metalico) ===
  iron_helmet: svg(armorIcon('helmet', '#888888')),
  iron_shirt:  svg(armorIcon('shirt',  '#888888')),
  iron_pants:  svg(armorIcon('pants',  '#888888')),
  iron_shoes:  svg(armorIcon('shoes',  '#888888')),
  iron_body:   svg(armorIcon('body',   '#888888')),
  iron_legs:   svg(armorIcon('legs',   '#888888')),
  iron_gloves: svg(armorIcon('gloves', '#888888')),
  // === T4 MIL (verde oscuro militar) ===
  mil_helmet: svg(armorIcon('helmet', '#3a4830')),
  mil_shirt:  svg(armorIcon('shirt',  '#3a4830')),
  mil_pants:  svg(armorIcon('pants',  '#3a4830')),
  mil_shoes:  svg(armorIcon('shoes',  '#3a4830')),
  mil_body:   svg(armorIcon('body',   '#3a4830')),
  mil_legs:   svg(armorIcon('legs',   '#3a4830')),
  mil_gloves: svg(armorIcon('gloves', '#3a4830')),

  // =====================================================================
  // UTILITY GEAR
  // =====================================================================
  flashlight:   svg(`<rect x="8" y="18" width="16" height="5" rx="1" fill="#3a3a3e"/><circle cx="26" cy="20.5" r="3" fill="#f0e8a0"/><path d="M 28 20 L 38 16 L 38 26 L 28 22 Z" fill="#f0c040" opacity="0.5"/>`),
  compass:      svg(`<circle cx="20" cy="22" r="11" fill="#d0a060" stroke="#603018"/><circle cx="20" cy="22" r="9" fill="#f8f0d8" stroke="#888"/><path d="M 20 14 L 22 22 L 20 30 L 18 22 Z" fill="#c83030"/><path d="M 20 14 L 22 22 L 18 22 Z" fill="#fff"/><text x="18" y="13" font-size="4" fill="#1a1a1c">N</text>`),
  binoculars:   svg(`<circle cx="12" cy="22" r="7" fill="#1a1a1c" stroke="#444"/><circle cx="28" cy="22" r="7" fill="#1a1a1c" stroke="#444"/><circle cx="12" cy="22" r="4" fill="#3a5070"/><circle cx="28" cy="22" r="4" fill="#3a5070"/><rect x="17" y="20" width="6" height="4" fill="#444"/>`),
  fishing_rod:  svg(`<line x1="6" y1="34" x2="32" y2="8" stroke="#5a3018" stroke-width="2"/><circle cx="9" cy="32" r="1.5" fill="#888"/><line x1="32" y1="8" x2="34" y2="30" stroke="#666" stroke-width="0.5" stroke-dasharray="1 1"/><circle cx="34" cy="30" r="2" fill="#888" stroke="#444"/>`),
  lockpick:     svg(`<rect x="14" y="22" width="20" height="3" fill="#888"/><rect x="32" y="20" width="2" height="7" fill="#666"/><rect x="6" y="20" width="10" height="7" fill="#666"/>`),
  radio:        svg(`<rect x="8" y="14" width="24" height="18" rx="1" fill="#3a3a3e" stroke="#1a1a1c"/><rect x="10" y="16" width="20" height="6" fill="#48d068"/><circle cx="14" cy="27" r="1.5" fill="#888"/><circle cx="20" cy="27" r="1.5" fill="#888"/><circle cx="26" cy="27" r="1.5" fill="#888"/><line x1="20" y1="14" x2="20" y2="6" stroke="#888" stroke-width="0.6"/>`),
  gas_mask:     svg(`<path d="M 8 18 Q 8 8 20 8 Q 32 8 32 18 L 32 26 Q 30 32 20 32 Q 10 32 8 26 Z" fill="#444" stroke="#1a1a1c"/><circle cx="14" cy="18" r="3" fill="#3a5a3a"/><circle cx="26" cy="18" r="3" fill="#3a5a3a"/><circle cx="20" cy="28" r="3" fill="#222"/>`),
  parachute:    svg(`<path d="M 4 18 Q 20 6 36 18 L 32 18 Q 28 14 24 14 Q 20 14 16 14 Q 12 14 8 18 Z" fill="#d04040" stroke="#601818"/><line x1="6" y1="18" x2="20" y2="32" stroke="#888" stroke-width="0.5"/><line x1="20" y1="18" x2="20" y2="32" stroke="#888" stroke-width="0.5"/><line x1="34" y1="18" x2="20" y2="32" stroke="#888" stroke-width="0.5"/>`),
  rope_climb:   svg(`<path d="M 14 6 Q 18 12 14 18 Q 18 24 14 30" stroke="#a06028" stroke-width="2.5" fill="none"/><circle cx="14" cy="6" r="2" fill="#888"/>`),
  nvg:          svg(`<rect x="6" y="14" width="28" height="12" rx="2" fill="#2a3a2a" stroke="#1a1a1c"/><circle cx="14" cy="20" r="4" fill="#48d068" stroke="#1a3a18"/><circle cx="26" cy="20" r="4" fill="#48d068" stroke="#1a3a18"/><circle cx="14" cy="20" r="1.5" fill="#1a1a1c"/><circle cx="26" cy="20" r="1.5" fill="#1a1a1c"/>`),
  dog_collar:   svg(`<circle cx="20" cy="22" r="11" fill="none" stroke="#a06028" stroke-width="3"/><rect x="18" y="29" width="4" height="6" fill="#f0c040" stroke="#888"/><circle cx="20" cy="32" r="0.8" fill="#1a1a1c"/>`),
  campfire:     svg(`<rect x="6" y="28" width="6" height="2" fill="#5a3018" transform="rotate(-15 9 29)"/><rect x="28" y="28" width="6" height="2" fill="#5a3018" transform="rotate(15 31 29)"/><path d="M 14 30 Q 16 22 18 24 Q 16 18 22 18 Q 20 12 24 16 Q 28 22 26 28 Q 24 30 18 30 Q 14 30 14 30 Z" fill="#f0c040"/><path d="M 18 28 Q 18 24 20 22 Q 22 26 22 28 Z" fill="#d04020"/>`),
  furnace:      svg(`<rect x="6" y="12" width="28" height="22" fill="#5a5a5e" stroke="#222"/><rect x="10" y="16" width="20" height="14" fill="#1a1a1c"/><circle cx="20" cy="23" r="4" fill="#f0c040"/><circle cx="20" cy="23" r="2" fill="#d04020"/><rect x="14" y="10" width="12" height="3" fill="#888"/>`),
  wall_piece:   svg(`<rect x="6" y="10" width="28" height="24" fill="#a08060" stroke="#603018"/><line x1="6" y1="16" x2="34" y2="16" stroke="#603018"/><line x1="6" y1="22" x2="34" y2="22" stroke="#603018"/><line x1="6" y1="28" x2="34" y2="28" stroke="#603018"/><line x1="14" y1="10" x2="14" y2="16" stroke="#603018"/><line x1="22" y1="16" x2="22" y2="22" stroke="#603018"/><line x1="16" y1="22" x2="16" y2="28" stroke="#603018"/><line x1="24" y1="22" x2="24" y2="28" stroke="#603018"/><line x1="20" y1="28" x2="20" y2="34" stroke="#603018"/><line x1="28" y1="10" x2="28" y2="16" stroke="#603018"/>`),
  bedroll_item: svg(`<rect x="6" y="22" width="28" height="10" rx="3" fill="#7a3018" stroke="#3a1808"/><rect x="6" y="22" width="28" height="3" fill="#9a4020"/><circle cx="10" cy="27" r="1.5" fill="#5a2010"/><circle cx="30" cy="27" r="1.5" fill="#5a2010"/>`),
  bear_trap:    svg(`<circle cx="20" cy="22" r="11" fill="none" stroke="#666" stroke-width="2"/><path d="M 12 22 L 14 18 L 16 22 L 18 18 L 20 22 L 22 18 L 24 22 L 26 18 L 28 22" stroke="#888" stroke-width="1.5" fill="none"/><circle cx="20" cy="22" r="3" fill="#1a1a1c"/>`),
  spike_trap:   svg(`<rect x="6" y="26" width="28" height="6" fill="#3a3a3e"/><path d="M 8 26 L 10 14 L 12 26 M 14 26 L 16 12 L 18 26 M 20 26 L 22 10 L 24 26 M 26 26 L 28 14 L 30 26 M 32 26 L 32 18" fill="#aaa" stroke="#444" stroke-width="0.5"/>`),
  stash_box:    svg(`<rect x="6" y="14" width="28" height="20" rx="1" fill="#7a4020" stroke="#3a1808"/><rect x="6" y="14" width="28" height="4" fill="#9a5028"/><rect x="18" y="20" width="4" height="6" fill="#f0c040"/><circle cx="20" cy="23" r="1" fill="#1a1a1c"/>`),
};

// =====================================================================
// Helper functions
// =====================================================================
function bodyIcon(weaponType) {
  // Sub-render: caja con la silueta del arma + un engranaje en la esquina
  const map = {
    rifle:   '<rect x="8" y="20" width="24" height="3" fill="#aaa"/>',
    shotgun: '<rect x="6" y="20" width="28" height="3" fill="#aaa"/>',
    smg:     '<rect x="10" y="20" width="20" height="3" fill="#aaa"/>',
    sniper:  '<rect x="4" y="21" width="32" height="2" fill="#aaa"/>',
    ak:      '<rect x="6" y="20" width="28" height="3" fill="#aaa"/><path d="M 14 23 Q 14 28 18 30 Q 22 28 22 23 Z" fill="#aaa"/>',
    semi:    '<rect x="8" y="20" width="24" height="3" fill="#aaa"/>',
    gl:      '<rect x="8" y="18" width="22" height="5" fill="#aaa"/><circle cx="28" cy="20.5" r="2" fill="#666"/>',
    gatling: '<rect x="10" y="14" width="20" height="14" fill="#aaa"/><circle cx="26" cy="21" r="2" fill="#666"/>',
    nuke:    '<rect x="6" y="17" width="26" height="6" fill="#aaa"/><circle cx="32" cy="20" r="2" fill="#888"/>',
  };
  return `
    <rect x="4" y="8" width="32" height="24" rx="2" fill="#2a2a2c" stroke="#1a1a1c"/>
    ${map[weaponType] || map.rifle}
    <circle cx="32" cy="30" r="4" fill="#666" stroke="#222"/>
    <path d="M 30 30 L 34 30 M 32 28 L 32 32" stroke="#1a1a1c" stroke-width="0.6"/>
    <circle cx="32" cy="30" r="1.5" fill="#222"/>
  `;
}

function armorIcon(slot, color) {
  const darker = darkenHex(color, 0.6);
  switch (slot) {
    case 'helmet':
      return `<path d="M 8 22 Q 8 8 20 8 Q 32 8 32 22 L 30 26 L 10 26 Z" fill="${color}" stroke="${darker}" stroke-width="1"/><rect x="14" y="22" width="12" height="3" fill="${darker}"/>`;
    case 'shirt':
      return `<path d="M 8 14 L 14 10 L 20 12 L 26 10 L 32 14 L 32 32 L 8 32 Z" fill="${color}" stroke="${darker}" stroke-width="1"/><line x1="20" y1="14" x2="20" y2="32" stroke="${darker}" stroke-width="0.5"/>`;
    case 'pants':
      return `<path d="M 10 8 L 30 8 L 32 22 L 28 32 L 22 32 L 21 18 L 19 18 L 18 32 L 12 32 L 8 22 Z" fill="${color}" stroke="${darker}" stroke-width="0.8"/>`;
    case 'shoes':
      return `<path d="M 8 26 L 8 20 L 12 16 L 20 16 L 28 18 L 32 24 L 32 30 L 8 30 Z" fill="${color}" stroke="${darker}" stroke-width="1"/><line x1="8" y1="26" x2="32" y2="26" stroke="${darker}" stroke-width="0.5"/>`;
    case 'body':
      return `<path d="M 10 10 L 30 10 L 32 14 L 30 32 L 10 32 L 8 14 Z" fill="${color}" stroke="${darker}" stroke-width="1.2"/><rect x="14" y="16" width="12" height="3" fill="${darker}"/><rect x="14" y="22" width="12" height="3" fill="${darker}"/>`;
    case 'legs':
      return `<path d="M 12 6 L 28 6 L 30 22 L 24 32 L 20 32 L 19 18 L 21 18 L 16 32 L 12 32 L 10 22 Z" fill="${color}" stroke="${darker}" stroke-width="1"/><rect x="14" y="12" width="4" height="8" fill="${darker}"/><rect x="22" y="12" width="4" height="8" fill="${darker}"/>`;
    case 'gloves':
      return `<path d="M 8 16 L 10 12 L 14 10 L 18 10 L 18 14 L 22 12 L 22 16 L 26 14 L 26 18 L 30 18 L 32 24 L 28 30 L 12 30 L 8 24 Z" fill="${color}" stroke="${darker}" stroke-width="0.8"/>`;
    default:
      return `<rect x="8" y="12" width="24" height="20" fill="${color}"/>`;
  }
}

function darkenHex(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.floor(r * factor);
  const dg = Math.floor(g * factor);
  const db = Math.floor(b * factor);
  return '#' + dr.toString(16).padStart(2, '0') + dg.toString(16).padStart(2, '0') + db.toString(16).padStart(2, '0');
}

// =====================================================================
// Generic fallback — para items sin icono especifico
// =====================================================================
const GENERIC_ICON = svg(`<rect x="10" y="10" width="20" height="20" fill="#3a3a3e" stroke="#888" stroke-dasharray="2 1"/><text x="20" y="24" text-anchor="middle" font-size="10" fill="#888" font-family="monospace">?</text>`);

// =====================================================================
// ALIAS — keys del inventario terminan en _pickup pero los iconos están
// definidos sin sufijo. Mapeo para que `pistol_pickup` use el icono de
// `pistol`, etc.
// =====================================================================
const ICON_ALIAS = {
  pistol_pickup:   'pistol',
  rifle_pickup:    'rifle',
  ak_pickup:       'ak',
  semi_pickup:     'semi',
  smg_pickup:      'smg',
  shotgun_pickup:  'shotgun',
  sniper_pickup:   'sniper',
  crossbow_pickup: 'crossbow',
  gl_pickup:       'gl',
  gatling_pickup:  'gatling',
  nuke_pickup:     'nuke',
};

// =====================================================================
// PUBLIC API — get icon HTML para un item key.
// =====================================================================
export function getIcon(itemKey) {
  const aliased = ICON_ALIAS[itemKey] || itemKey;
  return ICONS[aliased] || GENERIC_ICON;
}

// Inline el icono dentro de un contenedor (helper).
export function iconHTML(itemKey, sizePx = 32) {
  return `<span class="iconWrap" style="display:inline-block;width:${sizePx}px;height:${sizePx}px;line-height:0">${getIcon(itemKey)}</span>`;
}
