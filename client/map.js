// Full-map overlay (M key). Renders towns, POIs, roads, the active player,
// peers and any active supply drop on a 2D canvas. North up. Click to drop
// a custom waypoint pin (visible only locally).

import { peers } from './entities.js';
import { player } from './player.js';
import { crates } from './loot.js';
import { WORLD_HALF } from './world.js';

const WORLD_SIZE = WORLD_HALF * 2;
const MAP_SIZE = 720;        // px canvas

// Coords sincronizadas con server.TOWNS / POIS / ROADS.
const MAP_TOWNS = [
  { x: -600, z:  560, label: 'Westhaven',  type: 'town', color: '#f0c060' },
  { x:  620, z:  600, label: 'Eastfield',  type: 'town', color: '#f0c060' },
  { x: -640, z: -520, label: 'Pinecreek',  type: 'town', color: '#f0c060' },
  { x:  560, z: -640, label: 'Southridge', type: 'town', color: '#f0c060' },
  { x: -300, z:  640, label: 'Northgate',  type: 'town', color: '#f0c060' },
  { x:  300, z: -680, label: 'Sandwell',   type: 'town', color: '#f0c060' },
  { x: -700, z:  100, label: 'Westmark',   type: 'town', color: '#f0c060' },
  { x:  720, z:  -80, label: 'Eastmark',   type: 'town', color: '#f0c060' },
  { x:  100, z:  680, label: 'Snowhold',   type: 'town', color: '#f0c060' },
  { x: -180, z: -700, label: 'Burntpoint', type: 'town', color: '#f0c060' },
  { x:    0, z: -200, label: 'HELIX LAB',  type: 'city', color: '#ff5050' },
];
const MAP_POIS = [
  // Helicopteros
  { x: -320, z:  240, kind: 'helicopter' },
  { x:  320, z:  280, kind: 'helicopter' },
  { x: -160, z:   40, kind: 'helicopter' },
  { x:  440, z: -200, kind: 'helicopter' },
  { x: -400, z: -100, kind: 'helicopter' },
  { x:  100, z:  440, kind: 'helicopter' },
  { x: -100, z: -440, kind: 'helicopter' },
  // Gas
  { x: -360, z: -160, kind: 'gas' },
  { x:  400, z: -120, kind: 'gas' },
  { x:    0, z:  500, kind: 'gas' },
  { x: -700, z:    0, kind: 'gas' },
  { x:  700, z:  400, kind: 'gas' },
  // Bunkers
  { x:  300, z:    0, kind: 'bunker' },
  { x: -480, z:  480, kind: 'bunker' },
  { x:  200, z: -520, kind: 'bunker' },
  { x:  480, z:  300, kind: 'bunker' },
  { x: -300, z: -380, kind: 'bunker' },
  // Cabins
  { x:  240, z:  400, kind: 'cabin' },
  { x: -400, z:  360, kind: 'cabin' },
  { x:  120, z: -200, kind: 'cabin' },
  { x: -160, z: -200, kind: 'cabin' },
  { x:  440, z:  360, kind: 'cabin' },
  { x: -520, z:  200, kind: 'cabin' },
  { x:  680, z:   80, kind: 'cabin' },
  { x: -200, z:  680, kind: 'cabin' },
  // Caves
  { x: -520, z:  680, kind: 'cave' },
  { x:  560, z:  520, kind: 'cave' },
  { x:  680, z: -400, kind: 'cave' },
  { x: -520, z: -680, kind: 'cave' },
];
// Roads (igual al server). Lista de segmentos {x1,z1,x2,z2}.
const MAP_ROADS = [
  // Anillo
  { x1: -600, z1:  560, x2: -300, z2:  640 },
  { x1: -300, z1:  640, x2:  100, z2:  680 },
  { x1:  100, z1:  680, x2:  620, z2:  600 },
  { x1:  620, z1:  600, x2:  720, z2:  -80 },
  { x1:  720, z1:  -80, x2:  560, z2: -640 },
  { x1:  560, z1: -640, x2:  300, z2: -680 },
  { x1:  300, z1: -680, x2: -180, z2: -700 },
  { x1: -180, z1: -700, x2: -640, z2: -520 },
  { x1: -640, z1: -520, x2: -700, z2:  100 },
  { x1: -700, z1:  100, x2: -600, z2:  560 },
  // Radiales a Helix
  { x1: -300, z1:  640, x2:    0, z2: -200 },
  { x1:  100, z1:  680, x2:    0, z2: -200 },
  { x1:  720, z1:  -80, x2:    0, z2: -200 },
  { x1:  300, z1: -680, x2:    0, z2: -200 },
  { x1: -180, z1: -700, x2:    0, z2: -200 },
  { x1: -700, z1:  100, x2:    0, z2: -200 },
];

let mapEl = null, ctx = null;
let canvas = null;
let isOpen = false;
let activeSupplyDrop = null;
let waypoint = null;

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
  header.style.cssText = 'color:#f0c060;font:700 16px system-ui;letter-spacing:3px;margin-bottom:10px;';
  header.innerHTML = 'MAPA — <span style="color:#888;font-weight:400">[M] cerrar · click izq: marcador · click der: limpiar</span>';
  mapEl.appendChild(header);
  // Legend.
  const legend = document.createElement('div');
  legend.style.cssText = 'color:#aaa;font:11px system-ui;letter-spacing:1px;margin-bottom:10px;display:flex;gap:18px;flex-wrap:wrap;justify-content:center;max-width:720px;';
  legend.innerHTML = `
    <span style="color:#f0c060">● pueblo</span>
    <span style="color:#ff5050">● HELIX LAB</span>
    <span style="color:#90c0ff">● helicoptero</span>
    <span style="color:#f08040">● gasolinera</span>
    <span style="color:#ff5040">● bunker</span>
    <span style="color:#60c060">● cueva</span>
    <span style="color:#a08070">● cabaña</span>
    <span style="color:#ffd84a">▲ vos</span>
    <span style="color:#fff">○ otros jugadores</span>
    <span style="color:#40ff80">+ marcador</span>
  `;
  mapEl.appendChild(legend);
  // Coords display.
  const coords = document.createElement('div');
  coords.id = 'mapCoords';
  coords.style.cssText = 'color:#888;font:11px monospace;margin-bottom:6px;';
  coords.textContent = '—';
  mapEl.appendChild(coords);
  canvas = document.createElement('canvas');
  canvas.width = MAP_SIZE; canvas.height = MAP_SIZE;
  canvas.style.cssText = 'border:2px solid #444;background:rgba(20,30,18,0.85);cursor:crosshair;';
  mapEl.appendChild(canvas);
  // Left click = set waypoint
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const wx = (cx / MAP_SIZE) * WORLD_SIZE - WORLD_HALF;
    const wz = (cy / MAP_SIZE) * WORLD_SIZE - WORLD_HALF;
    waypoint = { x: wx, z: wz };
  });
  // Right click = clear waypoint
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    waypoint = null;
  });
  // Mouse move updates coords display.
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const wx = (cx / MAP_SIZE) * WORLD_SIZE - WORLD_HALF;
    const wz = (cy / MAP_SIZE) * WORLD_SIZE - WORLD_HALF;
    coords.textContent = `cursor: x=${wx.toFixed(0)}, z=${wz.toFixed(0)}    player: x=${player.pos.x.toFixed(0)}, z=${player.pos.z.toFixed(0)}`;
  });
  document.body.appendChild(mapEl);
  ctx = canvas.getContext('2d');
  return mapEl;
}

function world2px(x, z) {
  const px = ((x + WORLD_HALF) / WORLD_SIZE) * MAP_SIZE;
  const py = ((z + WORLD_HALF) / WORLD_SIZE) * MAP_SIZE;
  return [px, py];
}

function paintMap() {
  if (!ctx) return;
  // Background — gradient terrain feel.
  const g = ctx.createLinearGradient(0, 0, MAP_SIZE, MAP_SIZE);
  g.addColorStop(0,    '#1a2a18');  // NW forest
  g.addColorStop(0.5,  '#1f2a20');
  g.addColorStop(1,    '#2a2418');  // SE desert
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
  // Biome quadrant tint (matches server biomeAt).
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#3a8030'; ctx.fillRect(0, 0, MAP_SIZE/2, MAP_SIZE/2);          // NW forest (verde)
  ctx.fillStyle = '#e8e8f0'; ctx.fillRect(MAP_SIZE/2, 0, MAP_SIZE/2, MAP_SIZE/2); // NE snow (blanco)
  ctx.fillStyle = '#c8a850'; ctx.fillRect(MAP_SIZE/2, MAP_SIZE/2, MAP_SIZE/2, MAP_SIZE/2); // SE desert
  ctx.fillStyle = '#5a4030'; ctx.fillRect(0, MAP_SIZE/2, MAP_SIZE/2, MAP_SIZE/2); // SW burnt
  ctx.globalAlpha = 1.0;

  // Grid 8x8 for distance reading.
  ctx.strokeStyle = 'rgba(120,180,120,0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * MAP_SIZE;
    ctx.beginPath(); ctx.moveTo(t, 0); ctx.lineTo(t, MAP_SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, t); ctx.lineTo(MAP_SIZE, t); ctx.stroke();
  }
  // Border.
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, MAP_SIZE - 2, MAP_SIZE - 2);
  // Cardinal points.
  ctx.fillStyle = '#f0c060';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('N', MAP_SIZE / 2, 20);
  ctx.fillText('S', MAP_SIZE / 2, MAP_SIZE - 6);
  ctx.fillText('O', 14, MAP_SIZE / 2 + 6);
  ctx.fillText('E', MAP_SIZE - 14, MAP_SIZE / 2 + 6);

  // ROADS — amarillas que conectan pueblos.
  ctx.strokeStyle = 'rgba(208,192,80,0.7)';
  ctx.lineWidth = 3;
  for (const r of MAP_ROADS) {
    const [x1, y1] = world2px(r.x1, r.z1);
    const [x2, y2] = world2px(r.x2, r.z2);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  // Road edges (negras finas) para dar detalle.
  ctx.strokeStyle = 'rgba(50,40,20,0.6)';
  ctx.lineWidth = 5;
  for (const r of MAP_ROADS) {
    const [x1, y1] = world2px(r.x1, r.z1);
    const [x2, y2] = world2px(r.x2, r.z2);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  // Repaint roads sobre los bordes para dar relieve.
  ctx.strokeStyle = '#d0c050';
  ctx.lineWidth = 3;
  for (const r of MAP_ROADS) {
    const [x1, y1] = world2px(r.x1, r.z1);
    const [x2, y2] = world2px(r.x2, r.z2);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  // POIs — círculos chicos por tipo.
  for (const p of MAP_POIS) {
    const [px, py] = world2px(p.x, p.z);
    let color, sym;
    switch (p.kind) {
      case 'helicopter': color = '#90c0ff'; sym = 'H'; break;
      case 'gas':        color = '#f08040'; sym = 'G'; break;
      case 'bunker':     color = '#ff5040'; sym = 'B'; break;
      case 'cave':       color = '#60c060'; sym = 'C'; break;
      case 'cabin':      color = '#a08070'; sym = '⌂'; break;
      default:           color = '#aaa';    sym = '?';
    }
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sym, px, py);
  }
  ctx.textBaseline = 'alphabetic';

  // Helix radius (zona peligrosa).
  const [hpx, hpy] = world2px(0, -200);
  ctx.strokeStyle = 'rgba(255,80,80,0.4)';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(hpx, hpy, (115 / WORLD_SIZE) * MAP_SIZE, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);

  // Towns con etiqueta.
  for (const t of MAP_TOWNS) {
    const [px, py] = world2px(t.x, t.z);
    const isCity = t.type === 'city';
    ctx.fillStyle = t.color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (isCity) {
      // City = square mas grande.
      ctx.rect(px - 9, py - 9, 18, 18);
    } else {
      ctx.arc(px, py, 8, 0, Math.PI * 2);
    }
    ctx.fill(); ctx.stroke();
    // Label.
    ctx.fillStyle = isCity ? '#ff8080' : '#fff';
    ctx.font = isCity ? 'bold 13px system-ui' : '11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(t.label, px + 13, py + 4);
    // Sombra de fondo para legibilidad.
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeText(t.label, px + 13, py + 4);
    ctx.fillStyle = isCity ? '#ff8080' : '#fff';
    ctx.fillText(t.label, px + 13, py + 4);
  }

  // Supply drop pulse.
  if (activeSupplyDrop && performance.now() < activeSupplyDrop.until) {
    const [px, py] = world2px(activeSupplyDrop.x, activeSupplyDrop.z);
    const pulse = (performance.now() % 1000) / 1000;
    ctx.strokeStyle = `rgba(240,192,96,${1 - pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 10 + pulse * 14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f0c060';
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui';
    ctx.fillText('SUMINISTRO', px + 12, py - 6);
  }

  // Loot crates como cuadrados chicos (only visibles).
  let crateCount = 0;
  for (const c of crates.values()) {
    if (c.taken) continue;
    const [px, py] = world2px(c.x, c.z);
    ctx.fillStyle = c.tableKey === 'boss' ? '#ff4040'
                  : c.tableKey === 'city' ? '#60b0f0'
                  : c.tableKey === 'road' ? '#806040'
                  : '#f0c060';
    ctx.fillRect(px - 2, py - 2, 4, 4);
    crateCount++;
  }

  // Peers (otros jugadores).
  for (const p of peers.values()) {
    const [px, py] = world2px(p.target.x, p.target.z);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(p.name || `P${p.id}`, px + 7, py + 4);
  }

  // Waypoint pin.
  if (waypoint) {
    const [px, py] = world2px(waypoint.x, waypoint.z);
    ctx.strokeStyle = '#40ff80';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(px - 10, py); ctx.lineTo(px + 10, py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, py - 10); ctx.lineTo(px, py + 10); ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.stroke();
    // Distancia al waypoint.
    const dx = waypoint.x - player.pos.x;
    const dz = waypoint.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    ctx.fillStyle = '#40ff80';
    ctx.font = 'bold 11px system-ui';
    ctx.fillText(`${dist.toFixed(0)}m`, px + 18, py - 6);
  }

  // Player — flecha amarilla.
  const [px, py] = world2px(player.pos.x, player.pos.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(player.yaw() + Math.PI);
  ctx.fillStyle = '#ffd84a';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(-7, 7);
  ctx.lineTo(0, 4);
  ctx.lineTo(7, 7);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // Info bottom: total cofres visibles, peers, day.
  ctx.fillStyle = '#888';
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`cofres visibles: ${crateCount}    peers: ${peers.size}`, 12, MAP_SIZE - 12);
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
