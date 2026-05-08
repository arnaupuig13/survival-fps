// Screen shake — agita la cámara temporalmente al matar / tomar daño
// fuerte. Usa offset Euler aplicado a la cámara antes del render.

import { camera } from './three-setup.js';

let trauma = 0;       // 0..1
let _decayPerSec = 4;

export function bump(amount = 0.5) {
  trauma = Math.min(1, trauma + amount);
}

export function tick(dt) {
  if (trauma <= 0) return;
  // Shake — random small offsets, mayores con más trauma².
  const t2 = trauma * trauma;
  const offX = (Math.random() * 2 - 1) * 0.012 * t2;
  const offY = (Math.random() * 2 - 1) * 0.010 * t2;
  const offZ = (Math.random() * 2 - 1) * 0.005 * t2;
  // Aplicar como rotación adicional (sin tocar el yaw/pitch del player).
  camera.rotation.x += offX;
  camera.rotation.y += offY;
  camera.rotation.z += offZ;
  trauma = Math.max(0, trauma - _decayPerSec * dt);
}

// Kill feedback — un short "X" rojo grande en pantalla por 600ms.
const kfEl = (() => {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('killFeedback');
  if (!el) {
    el = document.createElement('div');
    el.id = 'killFeedback';
    el.style.cssText = 'position:fixed;top:42%;left:50%;transform:translate(-50%,-50%);font:700 60px monospace;color:#ff4040;text-shadow:0 0 18px rgba(255,40,40,0.7);pointer-events:none;opacity:0;transition:opacity 0.2s;z-index:9;letter-spacing:6px;';
    document.body.appendChild(el);
  }
  return el;
})();
let _kfTimer = 0;
export function showKillFeedback(label = '✗') {
  if (!kfEl) return;
  kfEl.textContent = label;
  kfEl.style.opacity = '1';
  kfEl.style.transform = 'translate(-50%,-50%) scale(1.4)';
  clearTimeout(_kfTimer);
  setTimeout(() => { kfEl.style.transform = 'translate(-50%,-50%) scale(1.0)'; }, 80);
  _kfTimer = setTimeout(() => {
    kfEl.style.opacity = '0';
  }, 600);
}
