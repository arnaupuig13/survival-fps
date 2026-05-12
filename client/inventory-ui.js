// Rust-style inventory UI — drag&drop, paperdoll equip, item info, drop-to-ground.
//
// Hooks into the static markup defined in index.html (#inventoryPanel + .rustPanel).
// Public API:
//   refresh()                     — re-render grid + recipes from current state
//   setName(name)                 — update paperdoll name label
//   setCraftHandler(fn)           — recipe button click handler
//
// Drop-to-ground: arrastrá un item fuera del modal → diálogo cantidad → spawn
// crate local con el contenido. main.js detecta `crate.localLoot` y aplica el
// loot al inventario directamente (sin roundtrip al servidor).

import * as inv from './inventory.js';
import { player } from './player.js';
import { spawnCrate, crates } from './loot.js';
import { logLine } from './hud.js';
import * as sfx from './sounds.js';
import * as hotbar from './hotbar.js';
import * as attachments from './attachments.js';

// =====================================================================
// DOM refs (resolved lazily so this module can be imported before the
// DOM is fully parsed without throwing).
// =====================================================================
const $ = (id) => document.getElementById(id);
const panel        = $('inventoryPanel');
const rustPanel    = document.querySelector('.rustPanel');
const grid         = $('rustInvGrid');
const weaponAttachListEl = $('weaponAttachList');
const recipesEl    = $('rustCraftList');
const itemInfo     = $('rustItemInfo');
const helmetSlot   = document.querySelector('.armorSlot.posHelmet');
const vestSlot     = document.querySelector('.armorSlot.posVest');
const dragGhost    = $('dragGhost');
const dropDialog   = $('dropDialog');
const ddSlider     = $('ddSlider');
const ddCount      = $('ddCount');
const ddOk         = $('ddOk');
const ddCancel     = $('ddCancel');
const ddTitle      = $('ddTitle');
const ctxMenu      = $('ctxMenu');
const vitHp        = $('vitHp');
const vitHun       = $('vitHun');
const vitThi       = $('vitThi');
const resBullet    = $('resBullet');
const resBite      = $('resBite');
const resRad       = $('resRad');
const paperdollName= $('paperdollName');
const paperdollHotbar = $('paperdollHotbar');

// Equipment items live on the paperdoll, not in the grid. Incluye los
// 28 pieces armor 4-tier 7-slot + legacy vest/helmet.
const EQUIP_KEYS = new Set([
  'vest_armor', 'helmet_armor',
  // T1 cloth
  'cloth_helmet', 'cloth_shirt', 'cloth_pants', 'cloth_shoes', 'cloth_body', 'cloth_legs', 'cloth_gloves',
  // T2 leather
  'leather_helmet', 'leather_shirt', 'leather_pants', 'leather_shoes', 'leather_body', 'leather_legs', 'leather_gloves',
  // T3 iron
  'iron_helmet', 'iron_shirt', 'iron_pants', 'iron_shoes', 'iron_body', 'iron_legs', 'iron_gloves',
  // T4 mil
  'mil_helmet', 'mil_shirt', 'mil_pants', 'mil_shoes', 'mil_body', 'mil_legs', 'mil_gloves',
]);

// Display order — Rust packs items in a logical order (weapons → ammo → meds → food → resources).
// v1.2: incluye TODOS los items nuevos (armas, bodies, ammo, food, materials).
const DISPLAY_ORDER = [
  // Weapons
  'pistol_pickup', 'rifle_pickup', 'ak_pickup', 'semi_pickup', 'smg_pickup',
  'shotgun_pickup', 'sniper_pickup', 'crossbow_pickup', 'gl_pickup', 'gatling_pickup', 'nuke_pickup',
  'knife', 'axe', 'pickaxe', 'hammer',
  // Weapon bodies (rare drops)
  'rifle_body', 'shotgun_body', 'smg_body', 'sniper_body',
  'ak_body', 'semi_body', 'gl_body', 'gatling_body', 'nuke_body',
  // Attachments
  'scope', 'silencer', 'ext_mag', 'grip', 'laser_sight',
  // Ammo
  'bullet_p', 'bullet_r', 'bullet_762', 'bullet_marksman', 'bullet_smg',
  'shell', 'sniper_round', 'gl_round', 'nuke_round',
  'bullet_p_ap', 'bullet_r_ap', 'bullet_r_inc', 'bolt',
  // Throwables / meds
  'bandage', 'medkit', 'antibiotics', 'painkillers', 'morphine', 'adrenaline',
  'grenade', 'smoke_grenade', 'flashbang', 'molotov', 'c4', 'mine',
  // Food / drink
  'meat_cooked', 'meat_raw', 'fish_cooked', 'fish_raw',
  'jerky', 'bread', 'soup', 'stew', 'canned_food', 'energy_bar',
  'mushroom', 'herbs', 'berry', 'honey',
  'water_bottle', 'dirty_water', 'purified_water', 'coffee', 'milk', 'tea',
  // Resources
  'wood', 'stone', 'cloth', 'iron', 'coal', 'sulfur', 'copper',
  'rabbit_pelt', 'deer_pelt', 'leather', 'nail', 'gunpowder', 'circuit', 'battery', 'rope', 'scrap',
  // Utility gear
  'flashlight', 'compass', 'binoculars', 'fishing_rod', 'lockpick',
  'radio', 'gas_mask', 'parachute', 'rope_climb', 'nvg', 'dog_collar', 'seeds',
  // Placeables
  'campfire', 'furnace', 'wall_piece', 'bedroll_item',
  'bear_trap', 'spike_trap', 'stash_box',
];

// Short item descriptions used in the info panel.
const DESCRIPTIONS = {
  bullet_p:       'Munición para pistola.',
  bullet_r:       'Munición para rifle automático.',
  bullet_smg:     'Munición para subfusil.',
  shell:          'Cartuchos para escopeta.',
  sniper_round:   'Munición de calibre .50 para rifle de francotirador.',
  bandage:        'Restaura 30 HP al usar (tecla H).',
  grenade:        'Granada de fragmentación. Lanzar con G.',
  pistol_pickup:  'Pistola estándar. Tu arma de inicio. Arrastrala al cinturón.',
  rifle_pickup:   'Rifle automático. Arma versátil de medio alcance.',
  shotgun_pickup: 'Escopeta de cañón corto. Letal a corta distancia.',
  smg_pickup:     'Subfusil. Cadencia alta, daño moderado.',
  sniper_pickup:  'Rifle de francotirador. Calibre pesado, larga distancia.',
  axe:            'Hacha — talá árboles para conseguir madera.',
  pickaxe:        'Pico — picá rocas para conseguir piedra.',
  scope:          'Mirilla reflex. Equipala a un arma — más zoom y dot rojo al apuntar (clic derecho).',
  silencer:       'Silenciador. Equipalo a un arma — no alerta zombies al disparar.',
  ext_mag:        'Cargador extendido. Equipalo a un arma — +50% capacidad de cargador.',
  vest_armor:     'Chaleco antibalas. Reduce daño recibido un 25%.',
  helmet_armor:   'Casco. Reduce daño recibido un 25% (acumulable con chaleco).',
  meat_raw:       'Carne cruda. Comestible pero te quita 5 HP. Mejor cocinala.',
  meat_cooked:    'Carne cocida. Restaura hambre y un poco de HP.',
  berry:          'Bayas silvestres. Restauran un poco de hambre.',
  water_bottle:   'Botella de agua. Restaura sed.',
  wood:           'Madera. Material de crafteo básico.',
  stone:          'Piedra. Material de crafteo y herramientas.',
  campfire:       'Hoguera. Colocala con B para cocinar y dar calor.',
  wall_piece:     'Pared. Pieza de construcción (próximamente).',
  bedroll_item:   'Cama. Punto de respawn personal (próximamente).',
};

// Categoria de cada item — usada por los filtros de la inventory tab.
// Si un item no esta en CATEGORIES_MAP, va a la categoria 'all' solo.
const CATEGORIES_MAP = {
  // weapons
  pistol_pickup:'weapons', rifle_pickup:'weapons', ak_pickup:'weapons', semi_pickup:'weapons',
  smg_pickup:'weapons', shotgun_pickup:'weapons', sniper_pickup:'weapons', crossbow_pickup:'weapons',
  gl_pickup:'weapons', gatling_pickup:'weapons', nuke_pickup:'weapons', knife:'weapons',
  // tools
  axe:'tools', pickaxe:'tools', hammer:'tools',
  // bodies (rare drops)
  rifle_body:'bodies', shotgun_body:'bodies', smg_body:'bodies', sniper_body:'bodies',
  ak_body:'bodies', semi_body:'bodies', gl_body:'bodies', gatling_body:'bodies', nuke_body:'bodies',
  // ammo
  bullet_p:'ammo', bullet_r:'ammo', bullet_762:'ammo', bullet_marksman:'ammo', bullet_smg:'ammo',
  shell:'ammo', sniper_round:'ammo', gl_round:'ammo', nuke_round:'ammo',
  bullet_p_ap:'ammo', bullet_r_ap:'ammo', bullet_r_inc:'ammo', bolt:'ammo',
  scope:'ammo', silencer:'ammo', ext_mag:'ammo', grip:'ammo', laser_sight:'ammo',
  // meds
  bandage:'meds', medkit:'meds', antibiotics:'meds', painkillers:'meds', morphine:'meds', adrenaline:'meds',
  // throwables
  grenade:'throwables', smoke_grenade:'throwables', flashbang:'throwables', molotov:'throwables',
  c4:'throwables', mine:'throwables',
  // food
  meat_cooked:'food', meat_raw:'food', fish_cooked:'food', fish_raw:'food',
  jerky:'food', bread:'food', soup:'food', stew:'food', canned_food:'food', energy_bar:'food',
  mushroom:'food', herbs:'food', berry:'food', honey:'food',
  water_bottle:'food', dirty_water:'food', purified_water:'food', coffee:'food', milk:'food', tea:'food',
  // materials
  wood:'materials', stone:'materials', cloth:'materials', iron:'materials', coal:'materials',
  sulfur:'materials', copper:'materials', rabbit_pelt:'materials', deer_pelt:'materials',
  leather:'materials', nail:'materials', gunpowder:'materials', circuit:'materials',
  battery:'materials', rope:'materials', scrap:'materials',
  // armor (all 4 tiers)
  vest_armor:'armor', helmet_armor:'armor',
  cloth_helmet:'armor', cloth_shirt:'armor', cloth_pants:'armor', cloth_shoes:'armor',
  cloth_body:'armor', cloth_legs:'armor', cloth_gloves:'armor',
  leather_helmet:'armor', leather_shirt:'armor', leather_pants:'armor', leather_shoes:'armor',
  leather_body:'armor', leather_legs:'armor', leather_gloves:'armor',
  iron_helmet:'armor', iron_shirt:'armor', iron_pants:'armor', iron_shoes:'armor',
  iron_body:'armor', iron_legs:'armor', iron_gloves:'armor',
  mil_helmet:'armor', mil_shirt:'armor', mil_pants:'armor', mil_shoes:'armor',
  mil_body:'armor', mil_legs:'armor', mil_gloves:'armor',
  // utility
  flashlight:'utility', compass:'utility', binoculars:'utility', fishing_rod:'utility',
  lockpick:'utility', radio:'utility', gas_mask:'utility', parachute:'utility',
  rope_climb:'utility', nvg:'utility', dog_collar:'utility', seeds:'utility',
  campfire:'utility', furnace:'utility', wall_piece:'utility', bedroll_item:'utility',
  bear_trap:'utility', spike_trap:'utility', stash_box:'utility',
};

let activeCategory = 'all';
let searchQuery = '';

// Items that can be "used" from the inventory ctx menu.
const USABLE = new Set([
  'bandage', 'medkit', 'antibiotics', 'painkillers', 'morphine', 'adrenaline',
  'meat_cooked', 'meat_raw', 'fish_cooked', 'fish_raw',
  'jerky', 'bread', 'soup', 'stew', 'canned_food', 'energy_bar',
  'mushroom', 'herbs', 'berry', 'honey',
  'water_bottle', 'dirty_water', 'purified_water', 'coffee', 'milk', 'tea',
  'dog_collar', 'smoke_grenade', 'flashbang', 'molotov',
  'stash_box', 'seeds',
]);

// =====================================================================
// State
// =====================================================================
let dragState = null;          // { itemKey, count }
let selectedKey = null;
let _craftHandler = null;
// v1.3: grid dinamico — N slots = items owned filtrados por categoria+search.
// Antes era 24 slots fijos pero con 100+ items la mayoria no se veian.

// Build grid empty (slots se crean dinamicamente en render).
function buildGrid() {
  if (!grid) return;
  grid.innerHTML = '';
}

// Items que viven en las SIDE PANELS (no en el grid central).
//   LEFT panel: ammo + attachments
//   RIGHT panel: materials
const SIDE_LEFT_KEYS = new Set();    // ammo + attachments → llenado abajo
const SIDE_RIGHT_KEYS = new Set();   // materials → llenado abajo
(function fillSideKeys() {
  for (const [k, cat] of Object.entries(CATEGORIES_MAP)) {
    if (cat === 'ammo') SIDE_LEFT_KEYS.add(k);
    if (cat === 'materials') SIDE_RIGHT_KEYS.add(k);
  }
})();

// Filter inventory state into a list of grid items applying category + search.
// Excluye los items que van a las side panels (ammo + materials) — esos se
// renderizan aparte.
function getGridItems(state) {
  const items = [];
  const q = (searchQuery || '').toLowerCase().trim();
  for (const key of DISPLAY_ORDER) {
    if (EQUIP_KEYS.has(key)) continue;
    if (SIDE_LEFT_KEYS.has(key) || SIDE_RIGHT_KEYS.has(key)) continue;
    const meta = inv.ITEMS[key];
    if (!meta) continue;
    const count = state[key] | 0;
    if (count <= 0) continue;
    // Category filter.
    if (activeCategory !== 'all') {
      const cat = CATEGORIES_MAP[key];
      if (cat !== activeCategory) continue;
    }
    // Search filter.
    if (q && !meta.label.toLowerCase().includes(q) && !key.toLowerCase().includes(q)) continue;
    items.push({ key, count, meta });
  }
  return items;
}

// === SIDE PANEL RENDER ===
// Ammo + attachments en columna izquierda, materials en derecha. Listas
// verticales compactas con contador. Sin limite de stack.
function renderSidePanels(state) {
  const ammoEl = document.getElementById('ammoList');
  const attachEl = document.getElementById('attachList');
  const matEl = document.getElementById('matList');
  if (!ammoEl || !attachEl || !matEl) return;
  ammoEl.innerHTML = '';
  attachEl.innerHTML = '';
  matEl.innerHTML = '';
  const attachKeys = new Set(['scope', 'silencer', 'ext_mag', 'grip', 'laser_sight']);
  for (const key of DISPLAY_ORDER) {
    const count = state[key] | 0;
    if (count <= 0) continue;
    const meta = inv.ITEMS[key];
    if (!meta) continue;
    let target;
    if (attachKeys.has(key)) target = attachEl;
    else if (SIDE_LEFT_KEYS.has(key)) target = ammoEl;
    else if (SIDE_RIGHT_KEYS.has(key)) target = matEl;
    if (!target) continue;
    const row = document.createElement('div');
    row.className = 'invSideRow rare-' + (meta.rarity || 'common');
    row.dataset.itemKey = key;
    row.innerHTML = `<span class="ilName">${meta.label}</span><span class="ilCount">${count}</span>`;
    row.title = `${meta.label} ×${count}\nLMB click: 1\nLMB arrastrar: TODO\nMMB arrastrar: la MITAD`;
    target.appendChild(row);
  }
}

// =====================================================================
// Render
// =====================================================================
function render(state) {
  if (!grid) return;
  const items = getGridItems(state);
  // Min 24 slots para mantener el look. Mas slots si hay mas items.
  const slotCount = Math.max(24, Math.ceil(items.length / 8) * 8);
  // Re-build grid si cambio el slot count (cuando el filtro cambia).
  if (grid.children.length !== slotCount) {
    grid.innerHTML = '';
    for (let i = 0; i < slotCount; i++) {
      const slot = document.createElement('div');
      slot.className = 'invSlot';
      slot.dataset.slotIdx = String(i);
      slot.innerHTML = '<div class="iLabel"></div><div class="iCount"></div>';
      grid.appendChild(slot);
    }
  }
  const slots = grid.querySelectorAll('.invSlot');
  for (let i = 0; i < slotCount; i++) {
    const slot = slots[i];
    if (!slot) break;
    slot.classList.remove('has', 'rare-common', 'rare-uncommon', 'rare-rare', 'rare-epic', 'rare-legendary', 'selected');
    const item = items[i];
    if (!item) {
      slot.dataset.itemKey = '';
      slot.querySelector('.iLabel').textContent = '';
      slot.querySelector('.iCount').textContent = '';
      slot.title = '';
      continue;
    }
    slot.dataset.itemKey = item.key;
    slot.classList.add('has', 'rare-' + (item.meta.rarity || 'common'));
    if (item.key === selectedKey) slot.classList.add('selected');
    slot.querySelector('.iLabel').textContent = item.meta.label;
    slot.querySelector('.iCount').textContent = item.count > 1 ? item.count : '';
    slot.title = `${item.meta.label} ×${item.count}\n${DESCRIPTIONS[item.key] || ''}`;
  }
  // Update count badge.
  const badge = document.getElementById('invCountBadge');
  if (badge) badge.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;

  // Equipment paperdoll slots
  if (helmetSlot) {
    helmetSlot.classList.toggle('filled', !!state.helmet_armor);
    helmetSlot.dataset.itemKey = state.helmet_armor ? 'helmet_armor' : '';
    helmetSlot.title = state.helmet_armor ? 'CASCO equipado' : 'Slot vacío';
  }
  if (vestSlot) {
    vestSlot.classList.toggle('filled', !!state.vest_armor);
    vestSlot.dataset.itemKey = state.vest_armor ? 'vest_armor' : '';
    vestSlot.title = state.vest_armor ? 'CHALECO equipado' : 'Slot vacío';
  }

  // Vitals
  if (vitHp)  vitHp.textContent  = String(Math.max(0, Math.round(player.hp ?? 0)));
  if (vitHun) vitHun.textContent = String(Math.max(0, Math.round(player.hunger ?? 0)));
  if (vitThi) vitThi.textContent = String(Math.max(0, Math.round(player.thirst ?? 0)));

  // Resistances — armor reduces incoming damage 25% per piece.
  const armorBullet = (state.vest_armor ? 25 : 0) + (state.helmet_armor ? 25 : 0);
  if (resBullet) resBullet.textContent = `${armorBullet}%`;
  if (resBite)   resBite.textContent   = `${state.vest_armor ? 15 : 0}%`;
  if (resRad)    resRad.textContent    = `0%`;

  // Refresh selected item info panel.
  renderItemInfo(state, selectedKey);
  // Refresh sub-inventario de attachments por arma.
  renderWeaponAttachments(state);
  // Render side panels (ammo + materiales).
  renderSidePanels(state);
  // Render crafting tab si esta abierta.
  renderCraftRecipeList(state);
  renderCraftDetail(state);
  // Render perks tab.
  renderPerksTab();
}

function renderItemInfo(state, key) {
  if (!itemInfo) return;
  if (!key || !inv.ITEMS[key] || (state[key] | 0) <= 0) {
    itemInfo.innerHTML = '<div class="iiEmpty">Selecciona un item para ver detalles</div>';
    return;
  }
  const meta  = inv.ITEMS[key];
  const count = state[key] | 0;
  const rcol  = (inv.RARITY[meta.rarity] || inv.RARITY.common).color;
  const desc  = DESCRIPTIONS[key] || '';
  const stats = buildStatsHTML(key, meta);
  const canDrop = !EQUIP_KEYS.has(key) && !meta.noDrop;
  const isUsable = USABLE.has(key);
  const isAttachment = attachments.ATTACH_TYPES.includes(key);
  // Para attachments, hint de "arrastralo a un arma" en lugar de los
  // viejos botones EQUIPAR A: (ahora se hace por drag).
  let attachUI = '';
  if (isAttachment) {
    attachUI = `<div class="iiAttachLabel">↳ Arrastralo a un slot de arma para adjuntarlo</div>`;
  }

  itemInfo.innerHTML = `
    <div class="iiHead">
      <div class="iiName" style="color:${rcol}">${meta.label}${count > 1 ? ` × ${count}` : ''}</div>
      <div class="iiRarity" style="color:${rcol};border-color:${rcol}">${(meta.rarity || 'common').toUpperCase()}</div>
    </div>
    <div class="iiDesc">${desc}</div>
    ${stats ? `<div class="iiStats">${stats}</div>` : ''}
    ${attachUI}
    <div class="iiActions">
      ${isUsable ? `<button data-act="use">USAR</button>` : ''}
      ${canDrop ? `<button data-act="drop">SOLTAR</button>` : ''}
    </div>
  `;
  itemInfo.querySelectorAll('button[data-act]').forEach((b) => {
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'use')  useItem(key);
      if (act === 'drop') openDropDialog(key);
    });
  });
}

// Per-item key→value pairs shown in the info panel.
function buildStatsHTML(key, meta) {
  const rows = [];
  if (meta.max && meta.max > 1) rows.push(['Max stack', meta.max]);
  if (key === 'vest_armor')   { rows.push(['Reducción daño', '25%']); }
  if (key === 'helmet_armor') { rows.push(['Reducción daño', '25%']); }
  if (key === 'bandage')      { rows.push(['Restaura HP', '+30']); }
  if (key === 'meat_cooked')  { rows.push(['Hambre', '+45']); rows.push(['HP', '+5']); }
  if (key === 'meat_raw')     { rows.push(['Hambre', '+30']); rows.push(['HP', '-5']); }
  if (key === 'berry')        { rows.push(['Hambre', '+12']); }
  if (key === 'water_bottle') { rows.push(['Sed', '+50']); }
  if (key === 'grenade')      { rows.push(['Daño', '120']); rows.push(['Radio', '5m']); }
  if (rows.length === 0) return '';
  return rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
}

// Render bloque de armas con submenu de attachments compatibles arriba +
// 4 slots de attachments aplicados abajo. Solo se muestran las armas que
// el player tiene (pickup en inv).
function renderWeaponAttachments(state) {
  if (!weaponAttachListEl) return;
  weaponAttachListEl.innerHTML = '';
  const weaponLabels = {
    pistol: 'PISTOLA', rifle: 'RIFLE', smg: 'SMG',
    shotgun: 'ESCOPETA', sniper: 'SNIPER', crossbow: 'BALLESTA',
  };
  const pickupKey = {
    pistol: 'pistol_pickup', rifle: 'rifle_pickup', smg: 'smg_pickup',
    shotgun: 'shotgun_pickup', sniper: 'sniper_pickup', crossbow: 'crossbow_pickup',
  };
  const attachLabels = {
    scope: 'MIRILLA', silencer: 'SILENCIADOR', ext_mag: 'CARGADOR EXT.', grip: 'GRIP', laser_sight: 'LASER',
  };
  for (const w of attachments.WEAPONS) {
    if (!inv.has(pickupKey[w], 1)) continue;
    const block = document.createElement('div');
    block.className = 'weaponBlock';
    // Title.
    const title = document.createElement('div');
    title.className = 'wTitle';
    title.textContent = '⚔ ' + weaponLabels[w];
    block.appendChild(title);
    // SUBMENU: accesorios disponibles compatibles que tenés.
    const availLabel = document.createElement('div');
    availLabel.className = 'wSlotsLabel';
    availLabel.textContent = 'ACCESORIOS DISPONIBLES (click para aplicar)';
    block.appendChild(availLabel);
    const avail = document.createElement('div');
    avail.className = 'wAvailable';
    let anyAvail = false;
    for (const aType of attachments.ATTACH_TYPES) {
      if (!attachments.isCompatible(w, aType)) continue;
      if (!inv.has(aType, 1)) continue;
      if (attachments.has(w, aType)) continue;  // ya esta en este arma
      anyAvail = true;
      const btn = document.createElement('button');
      btn.className = 'wAvailBtn';
      btn.textContent = '+ ' + attachLabels[aType];
      btn.title = `Aplicar ${attachLabels[aType]} al arma`;
      btn.addEventListener('click', () => {
        // Buscar primer slot vacio y adjuntar.
        const slots = attachments.getSlots(w);
        for (let i = 0; i < slots.length; i++) {
          if (!slots[i]) { attachments.attach(w, i, aType); break; }
        }
      });
      avail.appendChild(btn);
    }
    if (!anyAvail) {
      const none = document.createElement('div');
      none.className = 'wAvailNone';
      none.textContent = 'No tenés accesorios compatibles disponibles. Conseguilos en el laboratorio o crafteá uno.';
      avail.appendChild(none);
    }
    block.appendChild(avail);
    // SLOTS APLICADOS (4 fijos, click → quita).
    const slotsLabel = document.createElement('div');
    slotsLabel.className = 'wSlotsLabel';
    slotsLabel.textContent = 'APLICADOS (click para quitar)';
    block.appendChild(slotsLabel);
    const slotsEl = document.createElement('div');
    slotsEl.className = 'wSlots';
    const slots = attachments.getSlots(w);
    for (let i = 0; i < slots.length; i++) {
      const slot = document.createElement('div');
      slot.className = 'wSlot';
      const item = slots[i];
      if (item) {
        slot.classList.add('filled');
        slot.textContent = attachLabels[item] || item;
        slot.title = `${attachLabels[item]} — click para quitar`;
        const idx = i;
        slot.addEventListener('click', () => attachments.detach(w, idx));
      } else {
        slot.textContent = '— vacío —';
      }
      slotsEl.appendChild(slot);
    }
    block.appendChild(slotsEl);
    weaponAttachListEl.appendChild(block);
  }
  if (weaponAttachListEl.children.length === 0) {
    weaponAttachListEl.innerHTML = '<div style="color:#888;font-size:12px;padding:20px;text-align:center;">No tenés armas todavía. Conseguilas matando cientificos o crafteá una.</div>';
  }
}

// =====================================================================
// CRAFTEO TAB — lista + detalle + boton CREAR
// =====================================================================
let craftActiveCat = 'all';
let craftSearchQuery = '';
let craftSelectedId = null;

// Mapea cada receta a una categoria para el filtro.
function craftRecipeCategory(r) {
  const producesKey = Object.keys(r.produces || {})[0];
  if (!producesKey) return 'utility';
  const cat = CATEGORIES_MAP[producesKey];
  // Algunos crafts especiales caen en placeable (campfire/wall/bedroll/bear_trap).
  if (['campfire', 'furnace', 'wall_piece', 'bedroll_item', 'bear_trap', 'spike_trap', 'stash_box'].includes(producesKey)) return 'placeables';
  return cat || 'utility';
}

function recipeCanCraft(state, r) {
  if (!r) return false;
  for (const [k, v] of Object.entries(r.requires || {})) {
    if ((state[k] | 0) < v) return false;
  }
  // Si requiere fuego, asumimos true para mostrar (el craft real lo valida).
  return true;
}

function renderCraftRecipeList(state) {
  const listEl = document.getElementById('craftRecipeList');
  if (!listEl) return;
  listEl.innerHTML = '';
  const q = (craftSearchQuery || '').toLowerCase().trim();
  let count = 0;
  for (const r of inv.RECIPES) {
    const cat = craftRecipeCategory(r);
    if (craftActiveCat !== 'all' && cat !== craftActiveCat) continue;
    if (q && !r.label.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q)) continue;
    const row = document.createElement('div');
    const canCraft = recipeCanCraft(state, r);
    row.className = 'craftRecipe' + (canCraft ? ' can' : '') + (r.id === craftSelectedId ? ' selected' : '');
    row.dataset.recipeId = r.id;
    // Mini-string ingredientes.
    const reqs = Object.entries(r.requires || {})
      .map(([k, v]) => `${v}× ${(inv.ITEMS[k]?.label || k).slice(0, 8)}`)
      .join(' · ');
    row.innerHTML = `
      <div>
        <div class="crName">${canCraft ? '✓ ' : ''}${r.label}</div>
        <div class="crMini">${reqs || '—'}${r.needsFire ? ' · fuego' : ''}</div>
      </div>
    `;
    row.addEventListener('click', () => {
      craftSelectedId = r.id;
      renderCraftRecipeList(state);
      renderCraftDetail(state);
    });
    listEl.appendChild(row);
    count++;
  }
  if (count === 0) {
    listEl.innerHTML = '<div style="color:#666;padding:20px;text-align:center;font-size:11px;">Sin recetas que coincidan.</div>';
  }
}

function renderCraftDetail(state) {
  const detailEl = document.getElementById('craftDetail');
  if (!detailEl) return;
  if (!craftSelectedId) {
    detailEl.innerHTML = '<div class="craftEmpty">Selecciona una receta a la izquierda para ver el detalle.</div>';
    return;
  }
  const r = inv.RECIPES.find(x => x.id === craftSelectedId);
  if (!r) {
    detailEl.innerHTML = '<div class="craftEmpty">Receta no encontrada.</div>';
    return;
  }
  // Nombre del producto principal.
  const prodKey = Object.keys(r.produces || {})[0];
  const prodMeta = prodKey ? inv.ITEMS[prodKey] : null;
  const prodLabel = prodMeta ? prodMeta.label : r.label;
  const prodCount = prodKey ? r.produces[prodKey] : 1;
  // Descripcion (usa DESCRIPTIONS si existe).
  const desc = prodKey ? (DESCRIPTIONS[prodKey] || `Crafteable: ${r.label}`) : r.label;
  // Ingredientes.
  let ingHtml = '';
  let canCraft = true;
  for (const [k, v] of Object.entries(r.requires || {})) {
    const have = state[k] | 0;
    const ok = have >= v;
    if (!ok) canCraft = false;
    const label = inv.ITEMS[k]?.label || k;
    ingHtml += `
      <div class="crIngredient ${ok ? 'have' : 'lack'}">
        <span class="ciName">${label}</span>
        <span class="ciAmount">${have} / ${v}</span>
        <span class="ciCheck">${ok ? '✓' : '✗'}</span>
      </div>
    `;
  }
  // Si requiere fuego, agregar como requisito.
  let fireReq = '';
  if (r.needsFire) {
    fireReq = `<div class="crIngredient ${player.nearFire ? 'have' : 'lack'}">
      <span class="ciName">★ Cerca de fuego (hoguera)</span>
      <span class="ciAmount">${player.nearFire ? 'SI' : 'NO'}</span>
      <span class="ciCheck">${player.nearFire ? '✓' : '✗'}</span>
    </div>`;
    if (!player.nearFire) canCraft = false;
  }
  detailEl.innerHTML = `
    <div class="craftDetail">
      <h3>${prodLabel}${prodCount > 1 ? ' × ' + prodCount : ''}</h3>
      <div class="crDesc">${desc}</div>
      <div class="crLabel">PRODUCE</div>
      <div class="crProduct">${prodLabel}${prodCount > 1 ? ' × ' + prodCount : ''}</div>
      <div class="crLabel">INGREDIENTES</div>
      ${ingHtml}
      ${fireReq}
      <button class="craftCreateBtn ${canCraft ? '' : 'disabled'}" id="craftCreateBtn">
        ${canCraft ? '✓ CREAR' : '✗ FALTAN INGREDIENTES'}
      </button>
    </div>
  `;
  const btn = document.getElementById('craftCreateBtn');
  if (btn && canCraft) {
    btn.addEventListener('click', () => {
      if (_craftHandler) _craftHandler(r.id);
    });
  }
}

// =====================================================================
// PERKS TAB — elegir perks pendientes + ver activos + tier de armas
// =====================================================================
async function renderPerksTab() {
  const chooseBlock = document.getElementById('perkChooseBlock');
  const cardsEl = document.getElementById('perkChooseCards');
  const pendingTextEl = document.getElementById('perkPendingText');
  const perksEl = document.getElementById('learnPerks');
  const tiersEl = document.getElementById('learnTiers');
  if (!perksEl || !tiersEl) return;
  const perks = await import('./perks.js');
  // Render seccion de elegir perk.
  const pending = perks.getPendingCount();
  if (chooseBlock) {
    chooseBlock.classList.toggle('hidden', pending <= 0);
    if (pendingTextEl) pendingTextEl.textContent = pending > 0 ? `(${pending} disponible${pending > 1 ? 's' : ''})` : '';
    if (cardsEl && pending > 0) {
      cardsEl.innerHTML = '';
      const opts = perks.pickThreeOptions();
      for (const p of opts) {
        const card = document.createElement('div');
        card.className = 'perkChooseCard';
        card.innerHTML = `
          <div class="pcName">${p.name}</div>
          <div class="pcDesc">${p.desc}</div>
          <div class="pcBtn">[ ELEGIR ]</div>
        `;
        card.addEventListener('click', () => {
          perks.choosePerk(p.id);
          // Re-render para mostrar nuevo state.
          renderPerksTab();
          refresh();
        });
        cardsEl.appendChild(card);
      }
    }
  }
  // Perks activos.
  perksEl.innerHTML = '';
  for (const p of perks.PERK_POOL) {
    const isOn = perks.getState().taken.has(p.id);
    const row = document.createElement('div');
    row.className = 'lRow ' + (isOn ? 'on' : 'off');
    row.innerHTML = `<span>${p.name}${isOn ? ' ✓' : ''}</span><span>${p.desc}</span>`;
    perksEl.appendChild(row);
  }
  // Tier de armas.
  const wt = await import('./weapon-tiers.js');
  tiersEl.innerHTML = '';
  const labels = { pistol: 'PISTOLA', rifle: 'RIFLE', smg: 'SMG', shotgun: 'ESCOPETA', sniper: 'SNIPER', crossbow: 'BALLESTA' };
  const owned = { pistol: 'pistol_pickup', rifle: 'rifle_pickup', smg: 'smg_pickup', shotgun: 'shotgun_pickup', sniper: 'sniper_pickup', crossbow: 'crossbow_pickup' };
  for (const w of Object.keys(labels)) {
    if (!inv.has(owned[w], 1)) continue;
    const tier = wt.getTier(w);
    const meta = wt.getTierMeta(w);
    const row = document.createElement('div');
    row.className = 'lRow lTier-' + tier;
    row.innerHTML = `<span>${labels[w]}</span><span>${meta.label} · +${Math.round((meta.dmgMul - 1) * 100)}% dmg</span>`;
    tiersEl.appendChild(row);
  }
  if (tiersEl.children.length === 0) {
    tiersEl.innerHTML = '<div class="lRow off">Sin armas (excepto pistola)</div>';
  }
}

function renderRecipes(state) {
  if (!recipesEl) return;
  recipesEl.innerHTML = '';
  for (const r of inv.RECIPES) {
    const can = canAffordRecipe(state, r) && (!r.needsFire || player.nearFire);
    const reqText = Object.entries(r.requires)
      .map(([k, v]) => `${v}× ${(inv.ITEMS[k]?.label || k)}`)
      .join(' + ') || '—';
    const btn = document.createElement('button');
    btn.className = 'rustRecipeBtn' + (can ? '' : ' disabled');
    btn.disabled = !can;
    btn.innerHTML = `<div class="rrName">${r.label}</div><div class="rrReq">${reqText}${r.needsFire ? ' · fuego' : ''}</div>`;
    btn.title = `${r.label}\nRequiere: ${reqText}${r.needsFire ? ' (cerca de fuego)' : ''}`;
    btn.addEventListener('click', () => _craftHandler?.(r.id));
    recipesEl.appendChild(btn);
  }
}

function canAffordRecipe(state, r) {
  for (const [k, v] of Object.entries(r.requires)) {
    if ((state[k] | 0) < v) return false;
  }
  return true;
}

// =====================================================================
// Drag & drop
// =====================================================================
function startDrag(key, e) {
  const meta = inv.ITEMS[key];
  if (!meta) return;
  const count = inv.get(key);
  if (count <= 0) return;
  dragState = { itemKey: key, count };
  document.body.classList.add('dragging');
  if (dragGhost) {
    dragGhost.innerHTML = `<div class="dgLabel">${meta.label}</div><div class="dgCount">${count > 1 ? count : ''}</div>`;
    dragGhost.classList.add('show');
    moveGhost(e.clientX, e.clientY);
  }
}

function moveGhost(x, y) {
  if (!dragGhost) return;
  dragGhost.style.left = (x - 32) + 'px';
  dragGhost.style.top  = (y - 32) + 'px';
}

function endDrag(e) {
  if (!dragState) return;
  const drag = dragState;
  dragState = null;
  document.body.classList.remove('dragging');
  if (dragGhost) dragGhost.classList.remove('show');

  // Si el panel se cerró mid-drag (TAB / ESC), cancelamos.
  if (!panel || panel.classList.contains('hidden')) return;

  const target = e.target;

  // Drop on a paperdoll armor slot → check key compatibility.
  const armor = target?.closest?.('.armorSlot');
  if (armor) {
    const slotKey = armor.dataset.slot;
    if (slotKey === drag.itemKey) {
      // Already in the inventory state as count=1; "equipping" is just a UX cue.
      sfx.playPickup?.();
      logLine(`${inv.ITEMS[drag.itemKey].label} equipado`);
    } else {
      logLine('Ese item no se puede equipar en ese slot');
    }
    return;
  }

  // Drop sobre un slot de attachment de arma → adjuntar.
  const attSlot = target?.closest?.('.attachSlot');
  if (attSlot && attSlot.dataset.weapon) {
    const weapon = attSlot.dataset.weapon;
    const slotIdx = parseInt(attSlot.dataset.slotIdx, 10);
    if (!Number.isNaN(slotIdx)) {
      // Solo permite types attachment válidos.
      if (!attachments.ATTACH_TYPES.includes(drag.itemKey)) {
        logLine('Ese item no es un accesorio');
        return;
      }
      if (!attachments.isCompatible(weapon, drag.itemKey)) {
        logLine(`${inv.ITEMS[drag.itemKey].label} no es compatible con ${weapon}`);
        return;
      }
      const ok = attachments.attach(weapon, slotIdx, drag.itemKey);
      if (ok) {
        logLine(`✓ ${inv.ITEMS[drag.itemKey].label} adjunto a ${weapon}`);
        sfx.playPickup?.();
      }
    }
    return;
  }

  // Drop sobre un hotbar slot → asignar el item al cinturón.
  const hbSlot = target?.closest?.('.hbslot');
  if (hbSlot && hbSlot.dataset.slot != null) {
    const idx = parseInt(hbSlot.dataset.slot, 10);
    if (!Number.isNaN(idx)) {
      hotbar.setSlot(idx, drag.itemKey);
      logLine(`Asignado "${inv.ITEMS[drag.itemKey].label}" al slot ${idx + 1}`);
      sfx.playPickup?.();
    }
    return;
  }
  // Drop back on inventory or anywhere inside the actual rust panel → no-op.
  // (Drops on the dim backdrop o cualquier lugar fuera del panel = drop al suelo.)
  if (rustPanel && rustPanel.contains(target)) return;

  // Drop OUTSIDE the panel → open quantity dialog.
  openDropDialog(drag.itemKey);
}

if (grid) {
  grid.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const slot = e.target.closest('.invSlot');
    if (!slot || !slot.dataset.itemKey) return;
    e.preventDefault();
    startDrag(slot.dataset.itemKey, e);
  });
  grid.addEventListener('click', (e) => {
    const slot = e.target.closest('.invSlot');
    if (!slot || !slot.dataset.itemKey) return;
    selectedKey = slot.dataset.itemKey;
    render(inv.getState());
  });
  grid.addEventListener('contextmenu', (e) => {
    const slot = e.target.closest('.invSlot');
    if (!slot || !slot.dataset.itemKey) return;
    e.preventDefault();
    showCtxMenu(e.clientX, e.clientY, slot.dataset.itemKey);
  });
}

// Click sobre slot de attachment ocupado → desadjunta (vuelve al inv).
document.addEventListener('click', (e) => {
  if (!panel || panel.classList.contains('hidden')) return;
  const slot = e.target.closest && e.target.closest('.attachSlot.has');
  if (!slot) return;
  if (e.shiftKey) return;       // shift+click reservado para otra acción
  e.preventDefault();
  const weapon = slot.dataset.weapon;
  const idx = parseInt(slot.dataset.slotIdx, 10);
  if (!weapon || Number.isNaN(idx)) return;
  attachments.detach(weapon, idx);
  logLine('Accesorio devuelto al inventario');
  sfx.playPickup?.();
});

// Hotbar: click derecho sobre un slot lo limpia (quita el binding).
// Event delegation en document para sobrevivir a re-renders + funciona
// incluso con pointer-events:auto solo durante inv-open.
document.addEventListener('contextmenu', (e) => {
  if (!panel || panel.classList.contains('hidden')) return;
  const hb = e.target.closest && e.target.closest('.hbslot');
  if (!hb) return;
  e.preventDefault();
  const idx = parseInt(hb.dataset.slot, 10);
  if (!Number.isNaN(idx)) {
    hotbar.clearSlot(idx);
    logLine(`Slot ${idx + 1} liberado`);
    sfx.playPickup?.();
  }
});

// También permite click izquierdo simple sobre un slot del hotbar
// (cuando el inv está abierto) para limpiarlo via Shift+Click.
document.addEventListener('click', (e) => {
  if (!panel || panel.classList.contains('hidden')) return;
  if (!e.shiftKey) return;
  const hb = e.target.closest && e.target.closest('.hbslot');
  if (!hb) return;
  e.preventDefault();
  const idx = parseInt(hb.dataset.slot, 10);
  if (!Number.isNaN(idx)) {
    hotbar.clearSlot(idx);
    logLine(`Slot ${idx + 1} liberado`);
    sfx.playPickup?.();
  }
});

// Allow dragging armor off the paperdoll to drop it.
[helmetSlot, vestSlot].forEach((s) => {
  if (!s) return;
  s.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !s.dataset.itemKey) return;
    e.preventDefault();
    startDrag(s.dataset.itemKey, e);
  });
  s.addEventListener('click', () => {
    if (s.dataset.itemKey) {
      selectedKey = s.dataset.itemKey;
      render(inv.getState());
    }
  });
  s.addEventListener('contextmenu', (e) => {
    if (!s.dataset.itemKey) return;
    e.preventDefault();
    showCtxMenu(e.clientX, e.clientY, s.dataset.itemKey);
  });
});

document.addEventListener('mousemove', (e) => {
  if (!dragState) return;
  moveGhost(e.clientX, e.clientY);
});
document.addEventListener('mouseup', endDrag);

// =====================================================================
// Drop quantity dialog
// =====================================================================
let _dropKey = null;

function openDropDialog(key) {
  const max = inv.get(key);
  if (max <= 0 || !inv.ITEMS[key]) return;
  if (inv.ITEMS[key].noDrop) {
    logLine(`No se puede soltar ${inv.ITEMS[key].label}`);
    return;
  }
  _dropKey = key;
  if (ddTitle)  ddTitle.textContent = `SOLTAR ${inv.ITEMS[key].label}`;
  if (ddSlider) {
    ddSlider.min = '1';
    ddSlider.max = String(max);
    ddSlider.value = String(max);
  }
  if (ddCount) ddCount.textContent = String(max);
  if (dropDialog) dropDialog.classList.remove('hidden');
}

function closeDropDialog() {
  _dropKey = null;
  if (dropDialog) dropDialog.classList.add('hidden');
}

if (ddSlider) {
  ddSlider.addEventListener('input', () => {
    if (ddCount) ddCount.textContent = ddSlider.value;
  });
}
if (ddCancel) ddCancel.addEventListener('click', closeDropDialog);
if (ddOk) {
  ddOk.addEventListener('click', () => {
    if (!_dropKey) { closeDropDialog(); return; }
    const n = parseInt(ddSlider.value, 10) | 0;
    dropToGround(_dropKey, n);
    closeDropDialog();
  });
}

function dropToGround(key, n) {
  if (n <= 0) return;
  if (!inv.consume(key, n)) return;
  // Spawn a small local crate (street tier mesh) at the player's feet.
  const id = `local_drop_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const px = (player.pos?.x ?? 0) + (Math.random() - 0.5) * 0.6;
  const pz = (player.pos?.z ?? 0) + (Math.random() - 0.5) * 0.6;
  spawnCrate({ id, x: px, z: pz, tableKey: 'street' });
  // Tag it as local so main.js's KeyE handler applies the loot directly.
  const c = crates.get(id);
  if (c) c.localLoot = { [key]: n };
  logLine(`- ${n}× ${inv.ITEMS[key].label} (al suelo)`);
  sfx.playPickup?.();
}

// =====================================================================
// Right-click context menu
// =====================================================================
function showCtxMenu(x, y, key) {
  if (!ctxMenu) return;
  ctxMenu.innerHTML = '';
  const addBtn = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => { fn(); ctxMenu.classList.add('hidden'); });
    ctxMenu.appendChild(b);
  };
  if (USABLE.has(key)) addBtn('USAR', () => useItem(key));
  if (EQUIP_KEYS.has(key)) addBtn('EQUIPAR', () => { sfx.playPickup?.(); logLine(`${inv.ITEMS[key].label} equipado`); });
  addBtn('SOLTAR', () => openDropDialog(key));
  // Position; clamp to viewport.
  const vw = window.innerWidth, vh = window.innerHeight;
  ctxMenu.style.left = Math.min(x, vw - 160) + 'px';
  ctxMenu.style.top  = Math.min(y, vh - 140) + 'px';
  ctxMenu.classList.remove('hidden');
}

document.addEventListener('click', (e) => {
  if (ctxMenu && !ctxMenu.contains(e.target)) ctxMenu.classList.add('hidden');
});
window.addEventListener('blur', () => {
  if (ctxMenu) ctxMenu.classList.add('hidden');
  if (dragState) {
    dragState = null;
    document.body.classList.remove('dragging');
    if (dragGhost) dragGhost.classList.remove('show');
  }
});

// =====================================================================
// Use actions (mirrors keybinds H / J / U)
// =====================================================================
// Heal genérico: consume el item y restaura HP+hunger/thirst según tabla.
function consumeFood(key, hpDelta, hungerDelta = 0, thirstDelta = 0, label = '') {
  if (!inv.consume(key, 1)) return false;
  if (hpDelta) {
    const max = player.maxHp || 100;
    player.hp = Math.max(0, Math.min(max, (player.hp || 0) + hpDelta));
    if (player.hp <= 0) player.hp = 0;
  }
  if (hungerDelta && player.hunger != null) {
    player.hunger = Math.min(100, player.hunger + hungerDelta);
  }
  if (thirstDelta && player.thirst != null) {
    player.thirst = Math.min(100, player.thirst + thirstDelta);
  }
  logLine(`+ ${label || inv.ITEMS[key].label}`);
  sfx.playPickup?.();
  return true;
}

async function useItem(key) {
  if (key === 'bandage') {
    if (inv.useBandage(player)) { logLine('+30 HP (vendaje)'); sfx.playPickup?.(); }
    else logLine('Sin vendas o HP llena');
  } else if (key === 'medkit') {
    if (inv.consume('medkit', 1)) {
      const max = player.maxHp || 100;
      player.hp = max;
      logLine('+HP FULL (botiquín)');
      sfx.playPickup?.();
    }
  } else if (key === 'painkillers') {
    if (inv.consume('painkillers', 1)) {
      player.painkillerUntil = (performance.now() / 1000) + 60;
      logLine('Calmantes activos 60s — resistencia daño +20%');
      sfx.playPickup?.();
    }
  } else if (key === 'morphine') {
    if (inv.consume('morphine', 1)) {
      player.morphineUntil = (performance.now() / 1000) + 30;
      logLine('Morfina — regen HP 30s');
      sfx.playPickup?.();
    }
  } else if (key === 'adrenaline') {
    if (inv.consume('adrenaline', 1)) {
      player.adrenalineUntil = (performance.now() / 1000) + 30;
      logLine('Adrenalina — +velocidad +daño 30s');
      sfx.playPickup?.();
    }
  } else if (key === 'meat_cooked') {
    if (inv.consume('meat_cooked', 1)) { player.eat?.('meat_cooked'); logLine('+ CARNE COCIDA'); sfx.playPickup?.(); }
  } else if (key === 'meat_raw') {
    if (inv.consume('meat_raw', 1)) { player.eat?.('meat_raw'); logLine('+ CARNE CRUDA (-5 HP)'); sfx.playPickup?.(); }
  } else if (key === 'fish_cooked') {
    consumeFood('fish_cooked', 3, 35, 0, 'PESCADO COCIDO');
  } else if (key === 'fish_raw') {
    consumeFood('fish_raw', -3, 20, 0, 'PESCADO CRUDO (-3 HP)');
  } else if (key === 'jerky') {
    consumeFood('jerky', 2, 25, 0);
  } else if (key === 'bread') {
    consumeFood('bread', 5, 40, 0);
  } else if (key === 'soup') {
    consumeFood('soup', 8, 35, 25);
  } else if (key === 'stew') {
    consumeFood('stew', 12, 50, 15);
  } else if (key === 'canned_food') {
    consumeFood('canned_food', 5, 45, 0);
  } else if (key === 'energy_bar') {
    consumeFood('energy_bar', 8, 30, 10);
  } else if (key === 'mushroom') {
    consumeFood('mushroom', 0, 12, 0);
  } else if (key === 'herbs') {
    consumeFood('herbs', 2, 4, 4);
  } else if (key === 'berry') {
    if (inv.consume('berry', 1)) { player.eat?.('berry'); logLine('+ BAYAS'); sfx.playPickup?.(); }
  } else if (key === 'honey') {
    consumeFood('honey', 6, 25, 0);
  } else if (key === 'water_bottle') {
    if (inv.consume('water_bottle', 1)) { player.drink?.(); logLine('+ AGUA'); sfx.playPickup?.(); }
  } else if (key === 'dirty_water') {
    if (inv.consume('dirty_water', 1)) {
      if (player.thirst != null) player.thirst = Math.min(100, player.thirst + 30);
      // Riesgo: 30% de infección.
      if (Math.random() < 0.3) {
        const status = await import('./status.js');
        status.applyInfection?.();
        logLine('AGUA SUCIA — te enfermaste');
      } else {
        logLine('+ AGUA (sucia, no pasó nada)');
      }
      sfx.playPickup?.();
    }
  } else if (key === 'purified_water') {
    consumeFood('purified_water', 2, 0, 50, 'AGUA PURA');
  } else if (key === 'coffee') {
    if (inv.consume('coffee', 1)) {
      player.adrenalineUntil = (performance.now() / 1000) + 20;
      if (player.thirst != null) player.thirst = Math.min(100, player.thirst + 25);
      logLine('+ CAFE — boost 20s');
      sfx.playPickup?.();
    }
  } else if (key === 'milk') {
    consumeFood('milk', 3, 15, 30, 'LECHE');
  } else if (key === 'tea') {
    consumeFood('tea', 4, 5, 30, 'TE');
  } else if (key === 'dog_collar') {
    const dog = await import('./dog.js');
    if (dog.isSummoned()) { logLine('Ya tenés un perro aliado'); return; }
    if (inv.consume('dog_collar', 1)) { dog.tryUseCollar(); }
  } else if (key === 'antibiotics') {
    const status = await import('./status.js');
    status.tryAntibiotics();
  } else if (key === 'smoke_grenade') {
    if (inv.consume('smoke_grenade', 1)) {
      const smoke = await import('./smoke.js');
      smoke.throwSmoke();
    }
  } else if (key === 'flashbang') {
    if (inv.consume('flashbang', 1)) {
      const flashbang = await import('./flashbang.js');
      flashbang.throwFlashbang();
    }
  } else if (key === 'molotov') {
    // Molotov: similar a flashbang pero con DoT de fuego al frente del player.
    if (inv.consume('molotov', 1)) {
      const yaw = player.yaw?.() ?? 0;
      const fx = player.pos.x + Math.sin(yaw) * -8;
      const fz = player.pos.z + Math.cos(yaw) * -8;
      const network = (await import('./network.js')).network;
      network?.send?.({ type: 'molotov', x: fx, z: fz });
      logLine('+ MOLOTOV lanzado');
    }
  } else if (key === 'stash_box') {
    // Coloca un nuevo stash al frente del player.
    const stashPersonal = await import('./stash-personal.js');
    const yaw = player.yaw();
    const fx = player.pos.x + Math.sin(yaw) * -1.8;
    const fz = player.pos.z + Math.cos(yaw) * -1.8;
    stashPersonal.placeAt(fx, fz);
  } else if (key === 'seeds') {
    // Plantar al frente del player.
    const farming = await import('./farming.js');
    const yaw = player.yaw();
    const fx = player.pos.x + Math.sin(yaw) * -1.4;
    const fz = player.pos.z + Math.cos(yaw) * -1.4;
    farming.plantSeed(fx, fz);
  }
}

// =====================================================================
// Hotbar dentro del modal — slots con clase .hbslot que SE CONSIDERAN
// los mismos del hotbar real (mismo data-slot). El drop handler busca
// .hbslot, así que arrastrar al modal o al hotbar de afuera funciona.
// hud.paintHotbarSlot pinta TODOS los .hbslot[data-slot=N] en sincronía.
// =====================================================================
function buildPaperdollHotbar() {
  if (!paperdollHotbar) return;
  paperdollHotbar.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement('div');
    slot.className = 'pdSlot hbslot empty';
    slot.dataset.slot = String(i);
    slot.innerHTML = `<span class="pdKey hbkey">${i + 1}</span><span class="hblabel"></span><span class="hbcount"></span>`;
    paperdollHotbar.appendChild(slot);
  }
}

// =====================================================================
// Tabs — switching entre INVENTARIO / EQUIPO / APRENDIZAJE / ITEMS admin.
// =====================================================================
let currentTab = 'inv';
function showTab(tabName) {
  currentTab = tabName;
  for (const btn of document.querySelectorAll('.rustToolbar .rustTab')) {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  }
  for (const pane of document.querySelectorAll('.tabPane')) {
    pane.classList.toggle('hidden', pane.dataset.tab !== tabName);
  }
  // Renders específicos por tab.
  if (tabName === 'craft') {
    const state = inv.getState();
    renderCraftRecipeList(state);
    renderCraftDetail(state);
  }
  if (tabName === 'perks') renderPerksTab();
  if (tabName === 'admin') renderAdminTab();
}
// Click en botones de tab.
for (const btn of document.querySelectorAll('.rustToolbar .rustTab')) {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
}

// Tab APRENDIZAJE: perks activos + tier de armas.
async function renderLearnTab() {
  const perksEl = document.getElementById('learnPerks');
  const tiersEl = document.getElementById('learnTiers');
  if (perksEl) {
    const perks = await import('./perks.js');
    perksEl.innerHTML = '';
    for (const p of perks.PERK_POOL) {
      const isOn = perks.getState().taken.has(p.id);
      const row = document.createElement('div');
      row.className = 'lRow ' + (isOn ? 'on' : 'off');
      row.innerHTML = `<span>${p.name}${isOn ? ' ✓' : ''}</span><span>${p.desc}</span>`;
      perksEl.appendChild(row);
    }
  }
  if (tiersEl) {
    const wt = await import('./weapon-tiers.js');
    tiersEl.innerHTML = '';
    const labels = { pistol: 'PISTOLA', rifle: 'RIFLE', smg: 'SMG', shotgun: 'ESCOPETA', sniper: 'SNIPER', crossbow: 'BALLESTA' };
    const owned = { pistol: 'pistol_pickup', rifle: 'rifle_pickup', smg: 'smg_pickup', shotgun: 'shotgun_pickup', sniper: 'sniper_pickup', crossbow: 'crossbow_pickup' };
    for (const w of Object.keys(labels)) {
      if (!inv.has(owned[w], 1)) continue;
      const tier = wt.getTier(w);
      const meta = wt.getTierMeta(w);
      const row = document.createElement('div');
      row.className = 'lRow lTier-' + tier;
      row.innerHTML = `<span>${labels[w]}</span><span>${meta.label} · +${Math.round((meta.dmgMul - 1) * 100)}% dmg</span>`;
      tiersEl.appendChild(row);
    }
    if (tiersEl.children.length === 0) {
      tiersEl.innerHTML = '<div class="lRow off">Sin armas (excepto pistola)</div>';
    }
  }
}

// Tab ADMIN: spawner — todos los items. Click → +1 al inv.
function renderAdminTab() {
  const grid = document.getElementById('adminItemsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const allKeys = Object.keys(inv.ITEMS);
  for (const key of allKeys) {
    const meta = inv.ITEMS[key];
    const slot = document.createElement('div');
    slot.className = 'invSlot has rare-' + (meta.rarity || 'common');
    slot.innerHTML = `<div class="iLabel">${meta.label}</div><div class="iCount">+1</div>`;
    slot.title = `${meta.label} — clic para añadir 1 al inventario`;
    slot.addEventListener('click', () => {
      inv.add(key, 1);
      logLine(`[ADMIN] +1 ${meta.label}`);
      sfx.playPickup?.();
    });
    grid.appendChild(slot);
  }
}

export function setActiveTab(tab) { showTab(tab); }
export function getActiveTab() { return currentTab; }

// =====================================================================
// Public API
// =====================================================================
export function refresh() {
  const state = inv.getState();
  render(state);
  renderRecipes(state);
}

export function setName(name) {
  if (paperdollName) paperdollName.textContent = (name || 'P1').slice(0, 12).toUpperCase();
}

export function setCraftHandler(fn) {
  _craftHandler = fn;
}

// Re-render on inventory change, but only when the panel is visible (perf).
inv.onChange(() => {
  if (panel && !panel.classList.contains('hidden')) refresh();
});

// Init.
buildGrid();
buildPaperdollHotbar();

// === CATEGORY + SEARCH FILTERS ===
// Hookea los botones de categoria y el input de busqueda.
function wireFilters() {
  const catRow = document.getElementById('invCatRow');
  if (catRow) {
    for (const btn of catRow.querySelectorAll('.invCatBtn')) {
      btn.addEventListener('click', () => {
        catRow.querySelectorAll('.invCatBtn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.cat || 'all';
        refresh();
      });
    }
  }
  const search = document.getElementById('invSearch');
  if (search) {
    search.addEventListener('input', () => {
      searchQuery = search.value || '';
      refresh();
    });
    search.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        search.value = '';
        searchQuery = '';
        refresh();
      }
      e.stopPropagation();
    });
  }
  // === CRAFTING CATEGORIES + SEARCH ===
  const cRow = document.getElementById('craftCatRow');
  if (cRow) {
    for (const btn of cRow.querySelectorAll('.invCatBtn')) {
      btn.addEventListener('click', () => {
        cRow.querySelectorAll('.invCatBtn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        craftActiveCat = btn.dataset.ccat || 'all';
        renderCraftRecipeList(inv.getState());
      });
    }
  }
  const cSearch = document.getElementById('craftSearch');
  if (cSearch) {
    cSearch.addEventListener('input', () => {
      craftSearchQuery = cSearch.value || '';
      renderCraftRecipeList(inv.getState());
    });
    cSearch.addEventListener('keydown', (e) => e.stopPropagation());
  }
}
wireFilters();

// =====================================================================
// DRAG MECHANICS — side panels (ammo + materials) tienen 3 acciones:
//   LMB click sin mover  → agarra 1 unidad (drag-out al piso = 1 cae)
//   LMB click + drag     → agarra el stack COMPLETO (drag-out = todo cae)
//   MMB click + drag     → agarra la MITAD del stack (drag-out = mitad cae)
// Si soltás afuera del modal (en el "mundo"), el item cae al piso del player.
// =====================================================================
const DRAG_PX_THRESHOLD = 5;
let sideDrag = null;   // { itemKey, mode, startX, startY, ghostEl, dragged }

function startSideDrag(e, key, isMiddleClick) {
  const count = inv.get(key);
  if (count <= 0) return;
  sideDrag = {
    itemKey: key,
    mode: isMiddleClick ? 'half' : 'all',   // se ajusta a 'one' si NO se mueve
    startX: e.clientX,
    startY: e.clientY,
    dragged: false,
  };
  document.addEventListener('mousemove', onSideMove, true);
  document.addEventListener('mouseup', onSideUp, true);
  e.preventDefault();
}

function onSideMove(e) {
  if (!sideDrag) return;
  const dx = Math.abs(e.clientX - sideDrag.startX);
  const dy = Math.abs(e.clientY - sideDrag.startY);
  if (!sideDrag.dragged && (dx > DRAG_PX_THRESHOLD || dy > DRAG_PX_THRESHOLD)) {
    sideDrag.dragged = true;
    // Crear ghost visual.
    const ghost = document.createElement('div');
    ghost.id = 'sideGhost';
    ghost.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;background:rgba(60,50,20,0.95);border:1px solid #f0c060;color:#f0c060;padding:6px 10px;font:600 12px system-ui;letter-spacing:1px;';
    const meta = inv.ITEMS[sideDrag.itemKey];
    const count = inv.get(sideDrag.itemKey);
    const carryCount = sideDrag.mode === 'half' ? Math.ceil(count / 2) : count;
    ghost.innerHTML = `${meta?.label || sideDrag.itemKey} × <b>${carryCount}</b>`;
    document.body.appendChild(ghost);
    sideDrag.ghostEl = ghost;
  }
  if (sideDrag.ghostEl) {
    sideDrag.ghostEl.style.left = (e.clientX + 10) + 'px';
    sideDrag.ghostEl.style.top = (e.clientY + 10) + 'px';
  }
}

function onSideUp(e) {
  if (!sideDrag) return;
  document.removeEventListener('mousemove', onSideMove, true);
  document.removeEventListener('mouseup', onSideUp, true);
  const { itemKey, mode, dragged, ghostEl } = sideDrag;
  if (ghostEl) ghostEl.remove();
  sideDrag = null;
  const count = inv.get(itemKey);
  if (count <= 0) return;
  // Decidir cantidad a tirar segun modo.
  let drop = 0;
  if (!dragged) {
    // Click izquierdo sin mover: agarra 1 unidad (la tira al piso).
    drop = 1;
  } else {
    // Drag — para que cuente como "tirar al piso", la liberacion debe
    // estar FUERA de la caja del modal (.rustPanel).
    const target = e.target;
    if (target && target.closest('.rustPanel')) return;
    drop = mode === 'half' ? Math.ceil(count / 2) : count;
  }
  if (drop > 0) {
    inv.remove(itemKey, drop);
    // Spawn crate local al pie del player.
    spawnLocalDrop(itemKey, drop);
    refresh();
  }
}

// Spawn un crate "localLoot" frente al player que al abrirlo te devuelve
// el item. Sin sync al server — es solo visual + recogible.
function spawnLocalDrop(itemKey, count) {
  // Posicion: 1.5m frente al player.
  const yaw = player.yaw?.() ?? 0;
  const fx = player.pos.x + Math.sin(yaw) * -1.5;
  const fz = player.pos.z + Math.cos(yaw) * -1.5;
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  spawnCrate({
    id, x: fx, z: fz,
    y: 0,
    tableKey: 'town',
    localLoot: { [itemKey]: count },   // main.js lee esto al abrir
  });
  logLine(`Tiraste ${count}× ${inv.ITEMS[itemKey]?.label || itemKey}`);
}

// Wire side panels: mousedown abre el drag, click sin mover lo hace "drop 1".
function wireSidePanelDrag() {
  const ammo = document.getElementById('ammoList');
  const attach = document.getElementById('attachList');
  const mat = document.getElementById('matList');
  for (const container of [ammo, attach, mat]) {
    if (!container) continue;
    container.addEventListener('mousedown', (e) => {
      const row = e.target.closest('.invSideRow');
      if (!row) return;
      const key = row.dataset.itemKey;
      if (!key) return;
      const isMMB = e.button === 1;
      const isLMB = e.button === 0;
      if (!isMMB && !isLMB) return;
      startSideDrag(e, key, isMMB);
    });
  }
}
wireSidePanelDrag();
