// Flashbang. Tirar con tecla X (o desde inventario). Detona en frente
// del player; el server stunea enemigos cercanos 3s. Cualquier cliente
// dentro de 14m + LOS recibe un white-out de 3s con fade.

import { player } from './player.js';
import { network } from './network.js';
import { showBanner, logLine } from './hud.js';
import * as sfx from './sounds.js';

const FLASH_R = 14;          // radio efectivo (server lo confirma)

let _flashUntil = 0;
const overlay = document.getElementById('flashOverlay');

export function throwFlashbang() {
  const yaw = player.yaw();
  // Detona 8m al frente.
  const tx = player.pos.x + Math.sin(yaw) * -8;
  const tz = player.pos.z + Math.cos(yaw) * -8;
  network.detonateFlashbang?.(tx, tz);
  showBanner('GRANADA CIEGA', 1000);
  logLine('Flashbang lanzada — enemigos cercanos quedan ciegos 3s');
  sfx.playBossSting?.();
}

// Llamado por main.js cuando llega 'flashbang' del server.
export function onServerFlash(msg) {
  if (!msg) return;
  const dx = (player.pos?.x || 0) - msg.x;
  const dz = (player.pos?.z || 0) - msg.z;
  const d = Math.hypot(dx, dz);
  if (d > FLASH_R) return;
  // Fade strength based on proximidad.
  const intensity = 1 - d / FLASH_R;
  const dur = msg.dur || 3000;
  _flashUntil = performance.now() + dur;
  if (overlay) {
    overlay.style.opacity = String(0.95 * intensity);
    overlay.classList.add('show');
  }
}

export function tick() {
  if (!overlay) return;
  if (_flashUntil > 0) {
    const remain = _flashUntil - performance.now();
    if (remain <= 0) {
      _flashUntil = 0;
      overlay.classList.remove('show');
      overlay.style.opacity = '0';
    } else {
      // Fade lineal de 95% → 0 sobre la duración.
      overlay.style.opacity = String(Math.max(0, remain / 3000) * 0.95);
    }
  }
}
