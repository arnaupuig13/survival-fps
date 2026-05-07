// Personal stash — a persistent localStorage chest the player can store
// items in. Tecla X toggles the modal. Two columns: stash on the left,
// inventory on the right. Click an item to transfer one unit.

import * as inv from './inventory.js';

const STASH_KEY = 'survival-fps-v1-stash';

const stash = (function load() {
  try { return JSON.parse(localStorage.getItem(STASH_KEY) || '{}'); }
  catch { return {}; }
})();
function saveStash() { try { localStorage.setItem(STASH_KEY, JSON.stringify(stash)); } catch {} }

let modal = null, leftGrid = null, rightGrid = null;
let isOpen = false;

const STORABLE = [
  'bullet_p', 'bullet_r', 'bandage', 'grenade',
  'meat_raw', 'meat_cooked', 'berry', 'water_bottle',
  'wood', 'stone', 'campfire', 'wall_piece', 'bedroll_item',
];

function ensureModal() {
  if (modal) return modal;
  modal = document.createElement('div');
  Object.assign(modal.style, {
    position: 'fixed', inset: '0', display: 'none',
    background: 'rgba(0,0,0,0.85)', zIndex: 11,
    alignItems: 'center', justifyContent: 'center',
  });
  const panel = document.createElement('div');
  panel.style.cssText = 'background:rgba(20,20,20,0.95);border:1px solid #444;padding:24px 32px;display:flex;flex-direction:column;gap:14px;min-width:520px;';
  const header = document.createElement('div');
  header.style.cssText = 'color:#f0c060;font:700 14px system-ui;letter-spacing:3px;text-align:center;';
  header.textContent = 'COFRE PERSONAL — [X] cerrar · click izq mueve';
  panel.appendChild(header);
  const cols = document.createElement('div');
  cols.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:18px;';
  const colL = document.createElement('div');
  const colR = document.createElement('div');
  for (const c of [colL, colR]) c.style.cssText = 'background:rgba(0,0,0,0.4);border:1px solid #333;padding:12px;min-height:280px;';
  const lblL = document.createElement('div');
  lblL.style.cssText = 'font:700 11px monospace;color:#aaa;letter-spacing:2px;margin-bottom:8px;';
  lblL.textContent = 'COFRE';
  const lblR = lblL.cloneNode(true);
  lblR.textContent = 'INVENTARIO';
  colL.appendChild(lblL); colR.appendChild(lblR);
  leftGrid = document.createElement('div');
  leftGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:6px;';
  rightGrid = leftGrid.cloneNode(true);
  colL.appendChild(leftGrid); colR.appendChild(rightGrid);
  cols.appendChild(colL); cols.appendChild(colR);
  panel.appendChild(cols);
  modal.appendChild(panel);
  document.body.appendChild(modal);
  return modal;
}

function refresh() {
  if (!isOpen) return;
  leftGrid.innerHTML = '';
  rightGrid.innerHTML = '';
  for (const key of STORABLE) {
    const meta = inv.ITEMS[key];
    if (!meta) continue;
    // Stash side (deposit → withdraw)
    const stashCount = (stash[key] | 0);
    const lTile = makeTile(meta.label, stashCount);
    if (stashCount > 0) lTile.addEventListener('click', () => withdraw(key));
    leftGrid.appendChild(lTile);
    // Inventory side (withdraw → deposit)
    const invCount = inv.get(key);
    const rTile = makeTile(meta.label, invCount);
    if (invCount > 0) rTile.addEventListener('click', () => deposit(key));
    rightGrid.appendChild(rTile);
  }
}
function makeTile(label, count) {
  const el = document.createElement('div');
  el.style.cssText = 'padding:6px 10px;background:rgba(0,0,0,0.45);border:1px solid #333;display:flex;justify-content:space-between;align-items:center;cursor:' + (count > 0 ? 'pointer' : 'default') + ';font-family:monospace;font-size:11px;color:' + (count > 0 ? '#ddd' : '#555') + ';';
  el.innerHTML = `<span>${label}</span><span style="color:#f0c060;font-weight:700;">${count}</span>`;
  if (count > 0) el.addEventListener('mouseenter', () => { el.style.borderColor = '#f0c060'; });
  if (count > 0) el.addEventListener('mouseleave', () => { el.style.borderColor = '#333'; });
  return el;
}
function deposit(key) {
  if (!inv.has(key, 1)) return;
  inv.remove(key, 1);
  stash[key] = (stash[key] | 0) + 1;
  saveStash();
  refresh();
}
function withdraw(key) {
  const cur = stash[key] | 0;
  if (cur <= 0) return;
  stash[key] = cur - 1;
  inv.add(key, 1);
  saveStash();
  refresh();
}

export function toggleStash() {
  ensureModal();
  isOpen = !isOpen;
  modal.style.display = isOpen ? 'flex' : 'none';
  if (isOpen) { document.exitPointerLock?.(); refresh(); }
  return isOpen;
}
export function isStashOpen() { return isOpen; }
