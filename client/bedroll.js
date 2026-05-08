// Bedroll — punto de respawn personal. Tecla Z lo coloca en el suelo
// frente al jugador. Al respawn, si hay bedroll activo, respawneás ahí.
// Solo 1 bedroll activo a la vez por cliente. Persiste en localStorage
// para sobrevivir refreshes.
//
// El server NO sabe del bedroll directamente; el cliente le manda
// `setSpawn(x, z)` cuando lo coloca, y al pedir respawn manda los coords.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';
import * as inv from './inventory.js';
import { logLine, showBanner } from './hud.js';
import * as sfx from './sounds.js';

const STORAGE_KEY = 'survival-fps-v1-bedroll';

let mesh = null;
let pos = null;     // { x, z } o null

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Number.isFinite(data?.x) && Number.isFinite(data?.z)) {
      pos = { x: data.x, z: data.z };
      mesh = makeMesh();
      mesh.position.set(pos.x, heightAt(pos.x, pos.z), pos.z);
      scene.add(mesh);
    }
  } catch {}
}
function save() {
  try {
    if (pos) localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function makeMesh() {
  const g = new THREE.Group();
  // Saco de dormir verde militar.
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a4a28, roughness: 0.9 });
  const rect = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 1.8), mat);
  rect.position.y = 0.09;
  g.add(rect);
  // Almohada blanca.
  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.12, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xc8c0a8, roughness: 0.85 }),
  );
  pillow.position.set(0, 0.22, -0.6);
  g.add(pillow);
  return g;
}

export function getPos() { return pos; }

export function placeAt(x, z) {
  if (!inv.consume('bedroll_item', 1)) {
    logLine('No tenés cama para colocar (recurso: cama)');
    return false;
  }
  // Si ya había bedroll, lo removemos.
  if (mesh) { scene.remove(mesh); mesh = null; }
  pos = { x, z };
  mesh = makeMesh();
  mesh.position.set(x, heightAt(x, z), z);
  scene.add(mesh);
  save();
  showBanner('★ PUNTO DE RESPAWN COLOCADO', 1800);
  logLine(`Cama colocada en (${x.toFixed(1)}, ${z.toFixed(1)}). Respawnearás aquí.`);
  sfx.playPickup?.();
  return true;
}

export function clearBedroll() {
  if (mesh) scene.remove(mesh);
  mesh = null;
  pos = null;
  save();
}

load();
