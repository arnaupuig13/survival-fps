// Linterna — SpotLight pegado a la cámara que ilumina el cono frontal.
// Toggle con tecla O. Activable si:
//   1) Tenés el item `flashlight` (handheld) en el inventario, O
//   2) El arma activa tiene `flashlight_attach` montada en cualquier slot.
// La pistola de inicio viene con flashlight_attach pre-equipada.

import * as THREE from 'three';
import { camera } from './three-setup.js';
import * as inv from './inventory.js';
import * as attachments from './attachments.js';
import { logLine } from './hud.js';

let active = false;
const light = new THREE.SpotLight(0xffeec0, 0, 32, Math.PI / 6, 0.45, 1.0);
light.position.set(0, 0, 0.1);
const target = new THREE.Object3D();
target.position.set(0, 0, -10);
camera.add(light);
camera.add(target);
light.target = target;

// Cualquier arma activa con flashlight_attach montada habilita la linterna.
function hasFlashlightSource(activeWeapon) {
  if (inv.has('flashlight', 1)) return true;
  if (activeWeapon && attachments.has(activeWeapon, 'flashlight_attach')) return true;
  return false;
}

export function isOn() { return active; }

export function toggle(activeWeapon = null) {
  if (!hasFlashlightSource(activeWeapon)) {
    logLine('No tenés linterna');
    return;
  }
  active = !active;
  light.intensity = active ? 14 : 0;
  logLine(active ? '★ LINTERNA ENCENDIDA' : 'Linterna apagada');
}

// Apaga si ya no tenés ningun source. Llamado cada frame.
export function tick(activeWeapon = null) {
  if (active && !hasFlashlightSource(activeWeapon)) {
    active = false;
    light.intensity = 0;
  }
}
