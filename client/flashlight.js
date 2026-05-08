// Linterna — SpotLight pegado a la cámara que ilumina el cono frontal.
// Toggle con tecla O. Sólo activable si tenés el item `flashlight` en
// el inventario (oneTime drop de city/boss).

import * as THREE from 'three';
import { camera } from './three-setup.js';
import * as inv from './inventory.js';
import { logLine } from './hud.js';

let active = false;
const light = new THREE.SpotLight(0xffeec0, 0, 32, Math.PI / 6, 0.45, 1.0);
light.position.set(0, 0, 0.1);
const target = new THREE.Object3D();
target.position.set(0, 0, -10);
camera.add(light);
camera.add(target);
light.target = target;

export function isOn() { return active; }

export function toggle() {
  if (!inv.has('flashlight', 1)) {
    logLine('No tenés linterna');
    return;
  }
  active = !active;
  light.intensity = active ? 14 : 0;
  logLine(active ? '★ LINTERNA ENCENDIDA' : 'Linterna apagada');
}

// Apaga si ya no tenés (por dropear). Llamado cada frame en el loop.
export function tick() {
  if (active && !inv.has('flashlight', 1)) {
    active = false;
    light.intensity = 0;
  }
}
