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

// Equipment items live on the paperdoll, not in the grid.
const EQUIP_KEYS = new Set(['vest_armor', 'helmet_armor']);

// Display order — Rust packs items in a logical order (weapons → ammo → meds → food → resources).
const DISPLAY_ORDER = [
  // Weapons
  'pistol_pickup', 'rifle_pickup', 'shotgun_pickup', 'smg_pickup', 'sniper_pickup',
  // Tools
  'axe', 'pickaxe',
  // Attachments
  'scope', 'silencer', 'ext_mag',
  // Ammo
  'bullet_p', 'bullet_r', 'bullet_smg', 'shell', 'sniper_round',
  // Throwables / meds
  'bandage', 'grenade',
  // Food / drink
  'meat_cooked', 'meat_raw', 'berry', 'water_bottle',
  // Resources
  'wood', 'stone',
  // Placeables
  'campfire', 'wall_piece', 'bedroll_item',
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

// Items that can be "used" from the inventory ctx menu.
const USABLE = new Set(['bandage', 'meat_cooked', 'meat_raw', 'berry', 'water_bottle', 'dog_collar', 'antibiotics']);

// =====================================================================
// State
// =====================================================================
let dragState = null;          // { itemKey, count }
let selectedKey = null;
let _craftHandler = null;
const SLOT_COUNT = 24;         // 4 × 6 grid

// Build static grid skeleton once.
function buildGrid() {
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < SLOT_COUNT; i++) {
    const slot = document.createElement('div');
    slot.className = 'invSlot';
    slot.dataset.slotIdx = String(i);
    slot.innerHTML = '<div class="iLabel"></div><div class="iCount"></div>';
    grid.appendChild(slot);
  }
}

// Filter inventory state into a list of grid items (in display order).
function getGridItems(state) {
  const items = [];
  for (const key of DISPLAY_ORDER) {
    if (EQUIP_KEYS.has(key)) continue;
    const meta = inv.ITEMS[key];
    if (!meta) continue;
    const count = state[key] | 0;
    if (count <= 0) continue;
    items.push({ key, count, meta });
  }
  return items;
}

// =====================================================================
// Render
// =====================================================================
function render(state) {
  if (!grid) return;
  const slots = grid.querySelectorAll('.invSlot');
  const items = getGridItems(state);
  for (let i = 0; i < SLOT_COUNT; i++) {
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
  const isAttachment = (key === 'scope' || key === 'silencer' || key === 'ext_mag');

  // Para attachments, mostrar dónde está equipado y los botones de equipar.
  let attachUI = '';
  if (isAttachment) {
    const ATT_TARGETS = {
      scope:    ['pistol','rifle','smg','shotgun','sniper'],
      silencer: ['pistol','smg','rifle'],
      ext_mag:  ['pistol','rifle','smg','shotgun','sniper'],
    };
    const labels = { pistol: 'PISTOLA', rifle: 'RIFLE', smg: 'SMG', shotgun: 'ESCOPETA', sniper: 'SNIPER' };
    const owned = { pistol: 'pistol_pickup', rifle: 'rifle_pickup', smg: 'smg_pickup', shotgun: 'shotgun_pickup', sniper: 'sniper_pickup' };
    const equipped = attachments.whereEquipped(key);
    const buttons = ATT_TARGETS[key].map((w) => {
      if (!inv.has(owned[w], 1)) return '';
      const isOn = equipped === w;
      return `<button class="attachBtn ${isOn ? 'attachOn' : ''}" data-equip="${w}">${labels[w]}${isOn ? ' ✓' : ''}</button>`;
    }).join('');
    attachUI = `
      <div class="iiAttachLabel">EQUIPAR A:</div>
      <div class="iiAttach">${buttons}</div>
    `;
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
  itemInfo.querySelectorAll('button[data-equip]').forEach((b) => {
    b.addEventListener('click', () => {
      const weapon = b.dataset.equip;
      const where = attachments.whereEquipped(key);
      if (where === weapon) {
        attachments.unequip(weapon, key);
        logLine(`${meta.label} desequipado de ${weapon}`);
      } else {
        attachments.equip(weapon, key);
        logLine(`${meta.label} equipado en ${weapon}${where ? ` (movido desde ${where})` : ''}`);
      }
      sfx.playPickup?.();
      // Refresh UI con el nuevo estado.
      renderItemInfo(inv.getState(), key);
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

  // Drop on a hotbar slot → asignar el item al cinturón.
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
async function useItem(key) {
  if (key === 'bandage') {
    if (inv.useBandage(player)) { logLine('+30 HP (vendaje)'); sfx.playPickup?.(); }
    else logLine('Sin vendas o HP llena');
  } else if (key === 'meat_cooked') {
    if (inv.consume('meat_cooked', 1)) { player.eat?.('meat_cooked'); logLine('+ CARNE COCIDA'); sfx.playPickup?.(); }
  } else if (key === 'meat_raw') {
    if (inv.consume('meat_raw', 1)) { player.eat?.('meat_raw'); logLine('+ CARNE CRUDA (-5 HP)'); sfx.playPickup?.(); }
  } else if (key === 'berry') {
    if (inv.consume('berry', 1)) { player.eat?.('berry'); logLine('+ BAYAS'); sfx.playPickup?.(); }
  } else if (key === 'water_bottle') {
    if (inv.consume('water_bottle', 1)) { player.drink?.(); logLine('+ AGUA'); sfx.playPickup?.(); }
  } else if (key === 'dog_collar') {
    const dog = await import('./dog.js');
    if (dog.isSummoned()) { logLine('Ya tenés un perro aliado'); return; }
    if (inv.consume('dog_collar', 1)) { dog.tryUseCollar(); }
  } else if (key === 'antibiotics') {
    const status = await import('./status.js');
    status.tryAntibiotics();
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
