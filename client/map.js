// Full-map overlay (M key). Renders towns, POIs, the active player, peers
// and any active supply drop on a 2D canvas. North up. Click to drop a
// custom waypoint pin (visible only locally).

import { peers } from './entities.js';
import { player } from './player.js';
import { crates } from './loot.js';
import { WORLD_HALF } from './world.js';

// World coords (xz) → canvas pixel space (with Y flipped so +Z is down).
const WORLD_SIZE = WORLD_HALF * 2;

// Hardcoded — kept aligned with server.TOWNS / POIS so the map is
// readable without an extra welcome payload.
const MAP_TOWNS = [
  { x: -150, z:  140, label: 'Westhaven', color: '#f0c060' },
  { x:  155, z:  150, label: 'Eastfield', color: '#f0c060' },
  { x: -160, z: -130, label: 'Pinecreek', color: '#f0c060' },
  { x:  140, z: -160, label: 'Southridge', color: '#f0c060' },
  { x:    0, z: -100, label: 'Helix Lab', color: '#ff5050' },
];
const MAP_POIS = [
  { x: -80,  z:  60, kind: 'helicopter' },
  { x:  80,  z:  70, kind: 'helicopter' },
  { x: -40,  z:  10, kind: 'helicopter' },
  { x: -90,  z: -40, kind: 'gas' },
  { x:  100, z: -30, kind: 'gas' },
  { x:  60,  z: 100, kind: 'cabin' },
  { x: -100, z:  90, kind: 'cabin' },
  { x:  30,  z: -50, kind: 'cabin' },
  { x: -40,  z: -50, kind: 'cabin' },
  { x: 110,  z:  90, kind: 'cabin' },
];

let mapEl = null, ctx = null;
let isOpen = false;
let activeSupplyDrop = null; // { x, z, until }
let waypoint = null;          // { x, z }

function ensureMap() {
  if (mapEl) return mapEl;
  mapEl = document.createElement('div');
  Object.assign(mapEl.style, {
    position: 'fixed', inset: '0', display: 'none',
    background: 'rgba(0,0,0,0.92)', zIndex: 11,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'column',
  });
  const header = document.createElement('div');
  header.style.cssText = 'color:#f0c060;font:700 16px system-ui;letter-spacing:4px;margin-bottom:14px;';
  header.textContent = 'MAPA — [M] cerrar · click izq pone marcador';
  mapEl.appendChild(header);
  const canvas = document.createElement('canvas');
  canvas.width = 600; canvas.height = 600;
  canvas.style.cssText = 'border:1px solid #444;background:rgba(20,30,18,0.85);cursor:crosshair;';
  mapEl.appendChild(canvas);
  // Click to set waypoint.
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const wx = (cx / 600) * WORLD_SIZE - WORLD_HALF;
    const wz = (cy / 600) * WORLD_SIZE - WORLD_HALF;
    waypoint = { x: wx, z: wz };
  });
  document.body.appendChild(mapEl);
  ctx = canvas.getContext('2d');
  return mapEl;
}

function world2px(x, z) {
  const px = ((x + WORLD_HALF) / WORLD_SIZE) * 600;
  const py = ((z + WORLD_HALF) / WORLD_SIZE) * 600;
  return [px, py];
}

function paintMap() {
  if (!ctx) return;
  // Background grid.
  ctx.fillStyle = 'rgba(20,30,18,0.85)';
  ctx.fillRect(0, 0, 600, 600);
  ctx.strokeStyle = 'rgba(80,120,80,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * 600;
    ctx.beginPath(); ctx.moveTo(t, 0); ctx.lineTo(t, 600); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, t); ctx.lineTo(600, t); ctx.stroke();
  }
  // Border.
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 598, 598);
  // North marker.
  ctx.fillStyle = '#f0c060';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('N', 300, 16);
  ctx.fillText('S', 300, 596);
  ctx.fillText('O', 12, 304);
  ctx.fillText('E', 588, 304);

  // POIs (smaller dots first so towns paint over).
  for (const p of MAP_POIS) {
    const [px, py] = world2px(p.x, p.z);
    ctx.fillStyle = p.kind === 'helicopter' ? '#90c0ff'
                  : p.kind === 'gas' ? '#f08040' : '#a08070';
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Towns (named).
  for (const t of MAP_TOWNS) {
    const [px, py] = world2px(t.x, t.z);
    ctx.fillStyle = t.color;
    ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(t.label, px + 12, py + 4);
  }
  // Active supply drop — pulsating yellow ring.
  if (activeSupplyDrop && performance.now() < activeSupplyDrop.until) {
    const [px, py] = world2px(activeSupplyDrop.x, activeSupplyDrop.z);
    const pulse = (performance.now() % 1000) / 1000;
    ctx.strokeStyle = `rgba(240,192,96,${1 - pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 10 + pulse * 14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f0c060';
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
  }
  // Loot crates near visible range — small yellow squares.
  for (const c of crates.values()) {
    const [px, py] = world2px(c.x, c.z);
    ctx.fillStyle = c.tableKey === 'boss' ? '#ff5050'
                  : c.tableKey === 'city' ? '#60b0f0' : '#f0c060';
    ctx.fillRect(px - 2, py - 2, 4, 4);
  }
  // Peers.
  for (const p of peers.values()) {
    const [px, py] = world2px(p.target.x, p.target.z);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Waypoint pin.
  if (waypoint) {
    const [px, py] = world2px(waypoint.x, waypoint.z);
    ctx.strokeStyle = '#40ff80';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px - 8, py); ctx.lineTo(px + 8, py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, py - 8); ctx.lineTo(px, py + 8); ctx.stroke();
  }
  // Player — yellow triangle pointing along yaw.
  const [px, py] = world2px(player.pos.x, player.pos.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(player.yaw());
  ctx.fillStyle = '#ffd84a';
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(-6, 6);
  ctx.lineTo(6, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function toggleMap() {
  ensureMap();
  isOpen = !isOpen;
  mapEl.style.display = isOpen ? 'flex' : 'none';
  if (isOpen) {
    document.exitPointerLock?.();
    paintMap();
  }
  return isOpen;
}
export function isMapOpen() { return isOpen; }

// Per-frame repaint while open.
export function updateMap() {
  if (isOpen) paintMap();
}

export function noteSupplyDrop(x, z) {
  activeSupplyDrop = { x, z, until: performance.now() + 6 * 60 * 1000 };
}
