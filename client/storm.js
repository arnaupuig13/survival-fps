// Visual de la tormenta radioactiva. Server avisa con `storm` events.
// Muestra:
//  - HUD badge con timer cuando está activa
//  - Círculo verde en minimap (safe zone)
//  - Tinte verdoso en pantalla cuando estás fuera
//  - SkyDome verde brillante durante warning/active

import { player } from './player.js';

const state = {
  status: 'idle',     // 'idle' | 'warning' | 'active'
  x: 0, z: 0, r: 0,
  until: 0,
};

export function getState() { return state; }
export function isOutside() {
  if (state.status !== 'active') return false;
  const dx = player.pos.x - state.x;
  const dz = player.pos.z - state.z;
  return Math.hypot(dx, dz) > state.r;
}

export function setFromServer(msg) {
  if (msg.state === 'warning') {
    state.status = 'warning';
    state.x = msg.x; state.z = msg.z; state.r = msg.r;
    state.until = msg.until;
  } else if (msg.state === 'active') {
    state.status = 'active';
    state.until = msg.until;
  } else if (msg.state === 'end') {
    state.status = 'idle';
    state.until = 0;
  }
}

// HUD badge — se muestra el countdown.
const badge = document.getElementById('stormBadge');
const overlay = document.getElementById('stormOverlay');

export function tickHud() {
  if (!badge) return;
  if (state.status === 'idle') {
    badge.classList.add('hidden');
    if (overlay) overlay.classList.remove('show');
    return;
  }
  badge.classList.remove('hidden');
  const remain = Math.max(0, Math.round((state.until - Date.now()) / 1000));
  if (state.status === 'warning') {
    badge.textContent = `☢ TORMENTA EN ${remain}s — buscá zona segura`;
    badge.classList.add('warning');
    badge.classList.remove('active');
  } else if (state.status === 'active') {
    badge.textContent = `☢ TORMENTA ACTIVA — ${remain}s restantes`;
    badge.classList.remove('warning');
    badge.classList.add('active');
  }
  // Overlay verde si estás fuera del círculo durante active.
  if (overlay) overlay.classList.toggle('show', isOutside());
}
