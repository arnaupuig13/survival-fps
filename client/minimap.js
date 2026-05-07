// Mini-map — circular canvas, player at center, north up. Dots:
//   white   = peers
//   red     = hostile (zombie / runner / tank / wolf / scientist / boss)
//   green   = passive animal (deer / rabbit)
//   yellow  = loot crate
//   amber   = town sign
// Range visible: 100 m radius.

import { peers, enemies } from './entities.js';
import { crates } from './loot.js';
import { player } from './player.js';

const RANGE = 100;

const canvas = document.getElementById('minimap');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const cx = W / 2, cy = H / 2;

const HOSTILE = new Set(['zombie', 'runner', 'tank', 'wolf', 'scientist', 'sci_shotgun', 'sci_sniper', 'boss']);
const PASSIVE = new Set(['deer', 'rabbit']);

// Town centers — kept aligned with the server's TOWN_LOCATIONS.
const TOWN_DOTS = [
  { x: -150, z:  140 },
  { x:  155, z:  150 },
  { x: -160, z: -130 },
  { x:  140, z: -160 },
  { x:    0, z:  -90 },
];

function plotDot(worldX, worldZ, color, size = 3) {
  const yaw = player.yaw();
  // Translate to player-relative, then rotate by -yaw so that "forward"
  // points up on the minimap.
  const dx = worldX - player.pos.x;
  const dz = worldZ - player.pos.z;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  // Rotation that maps player forward (-Z when yaw=0) to up on screen.
  const lx =  cos * dx - sin * dz;
  const lz = -sin * dx - cos * dz;
  const dist = Math.hypot(lx, lz);
  if (dist > RANGE) return;
  const px = cx + (lx / RANGE) * (W / 2 - 4);
  const py = cy + (lz / RANGE) * (H / 2 - 4);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px, py, size, 0, Math.PI * 2);
  ctx.fill();
}

export function renderMinimap() {
  if (!ctx) return;
  // Clear with dark fill so it reads against the world.
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, W / 2 - 1, 0, Math.PI * 2); ctx.fill();
  // Range ring.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, W / 2 - 1, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, (W / 2 - 1) * 0.5, 0, Math.PI * 2); ctx.stroke();

  // Town dots — amber, larger, behind everything else.
  for (const t of TOWN_DOTS) plotDot(t.x, t.z, '#f0c060', 4);

  // Crates — yellow.
  for (const c of crates.values()) plotDot(c.x, c.z, '#ffea66', 2);

  // Peers — white.
  for (const p of peers.values()) plotDot(p.target.x, p.target.z, '#ffffff', 3);

  // Enemies — color by faction.
  for (const e of enemies.values()) {
    if (e.sleeping) continue; // hide sleeping ones for tactical clarity
    if (PASSIVE.has(e.etype)) plotDot(e.mesh.position.x, e.mesh.position.z, '#80c060', 2);
    else if (HOSTILE.has(e.etype)) {
      const isBoss = e.isBoss || e.etype === 'boss';
      plotDot(e.mesh.position.x, e.mesh.position.z, isBoss ? '#ff5050' : '#d04040', isBoss ? 4 : 2.5);
    }
  }

  // Player at center — yellow triangle pointing up (always forward).
  ctx.fillStyle = '#ffd84a';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 6);
  ctx.lineTo(cx - 4, cy + 4);
  ctx.lineTo(cx + 4, cy + 4);
  ctx.closePath();
  ctx.fill();
}
