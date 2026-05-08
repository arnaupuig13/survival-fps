// Gafas de visión nocturna — overlay verde fluorescente full-screen +
// boost de luminosidad en la escena. Toggle con tecla 0.
//
// Implementación: overlay CSS con tinte verde + filter brightness/contrast.
// Es un hack simple pero da el feel correcto de NVG sin tocar shaders.

import * as inv from './inventory.js';
import { logLine } from './hud.js';

let active = false;
const overlay = document.getElementById('nvgOverlay');
const sceneEl = document.querySelector('canvas');

export function isOn() { return active; }

export function toggle() {
  if (!inv.has('nvg', 1)) {
    logLine('No tenés gafas de visión nocturna');
    return;
  }
  active = !active;
  if (overlay) overlay.classList.toggle('show', active);
  // Aplicar filter al canvas (boost brightness para ver de noche).
  if (sceneEl) {
    if (active) {
      sceneEl.style.filter = 'brightness(2.4) contrast(1.3) hue-rotate(75deg) saturate(0.4)';
    } else {
      sceneEl.style.filter = '';
    }
  }
  logLine(active ? '★ NVG ON — visión nocturna activa' : 'NVG OFF');
}

// Si dropeás las NVG mientras están activas, apagamos.
export function tick() {
  if (active && !inv.has('nvg', 1)) {
    active = false;
    if (overlay) overlay.classList.remove('show');
    if (sceneEl) sceneEl.style.filter = '';
  }
}
