// LANDMARKS visuales — lago central donde convergen los biomas + volcán
// con lava emisiva en el bosque quemado.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';
import { player } from './player.js';

// =====================================================================
// LAGO CENTRAL — disco azul translúcido en (0, 0). Diametro 60m.
// Animación sutil: la superficie sube/baja con el tiempo.
// =====================================================================
const LAKE_POS = { x: 0, z: 0 };
const LAKE_R = 60;

let lakeMesh = null;
function makeLakeMesh() {
  const geom = new THREE.CircleGeometry(LAKE_R, 64);
  geom.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1c4a8a,
    transparent: true,
    opacity: 0.7,
    metalness: 0.6,
    roughness: 0.2,
    emissive: 0x0a2040,
    emissiveIntensity: 0.3,
  });
  const m = new THREE.Mesh(geom, mat);
  m.position.set(LAKE_POS.x, heightAt(LAKE_POS.x, LAKE_POS.z) - 0.6, LAKE_POS.z);
  return m;
}

export function isInLake(x, z) {
  const dx = x - LAKE_POS.x, dz = z - LAKE_POS.z;
  return (dx * dx + dz * dz) < LAKE_R * LAKE_R;
}

// =====================================================================
// VOLCÁN — cono de roca volcánica con lava emisiva en el cráter.
// Posición: en el bosque quemado (-280, -280).
// Dañar al player que se acerca demasiado al cráter (radio 8m → -2 HP/s).
// =====================================================================
const VOLCANO_POS = { x: -280, z: -280 };
export const VOLCANO_DAMAGE_R = 6;
const VOLCANO_OUTER_R = 22;

let volcanoGroup = null;
let lavaMesh = null;
function makeVolcanoMesh() {
  const g = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a1818, roughness: 0.95 });
  const darkRockMat = new THREE.MeshStandardMaterial({ color: 0x1a0e0e, roughness: 0.98 });
  const lavaMat = new THREE.MeshStandardMaterial({
    color: 0xff4010, emissive: 0xff5020, emissiveIntensity: 1.8, roughness: 0.4,
  });
  const lavaBrightMat = new THREE.MeshStandardMaterial({
    color: 0xffaa20, emissive: 0xffaa20, emissiveIntensity: 2.5, roughness: 0.3,
  });
  // VOLCÁN ABIERTO — anillo de roca con cráter HUNDIDO (no cerrado).
  // Un anillo (TorusGeometry hueco) forma el borde exterior; adentro
  // hay un pozo de lava varios metros bajo el labio.
  const RIM_R   = 18;        // radio exterior del labio
  const CRATER_R = 12;        // radio del pozo de lava (interior del anillo)
  const RIM_H   = 6;         // altura del labio
  // Anillo — varios bloques de roca formando un ring irregular.
  const SEG = 18;
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const r = RIM_R + (Math.random() - 0.5) * 3;
    const blockH = RIM_H + Math.random() * 2 - 1;
    const blockW = 4.5 + Math.random() * 2;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(blockW, blockH, blockW),
      i % 3 === 0 ? darkRockMat : rockMat,
    );
    block.position.set(Math.cos(a) * r, blockH / 2, Math.sin(a) * r);
    block.rotation.y = a + Math.random() * 0.3;
    block.rotation.x = (Math.random() - 0.5) * 0.15;
    g.add(block);
  }
  // POZO DE LAVA — disco hundido al nivel del suelo, brillante.
  // Posicionado a -2m respecto a la base, dándole sensación de profundidad.
  const lavaPit = new THREE.Mesh(new THREE.CircleGeometry(CRATER_R, 32), lavaBrightMat);
  lavaPit.rotation.x = -Math.PI / 2;
  lavaPit.position.y = -2.0;
  g.add(lavaPit);
  // Anillo lava más oscuro (borde del pozo).
  const lavaRing = new THREE.Mesh(new THREE.RingGeometry(CRATER_R, CRATER_R + 1.4, 32), lavaMat);
  lavaRing.rotation.x = -Math.PI / 2;
  lavaRing.position.y = -1.5;
  g.add(lavaRing);
  // Borbotones de lava — 5 pequeños discos brillantes saltando dentro.
  const bubbles = [];
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * (CRATER_R - 2);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.6 + Math.random() * 0.5, 8, 6), lavaBrightMat);
    bubble.position.set(Math.cos(a) * rr, -1.2 + Math.random() * 0.5, Math.sin(a) * rr);
    g.add(bubble);
    bubbles.push({ mesh: bubble, baseY: bubble.position.y, phase: Math.random() * Math.PI * 2 });
  }
  // Río de lava saliente — 2 derrames descendentes.
  for (let i = 0; i < 2; i++) {
    const a = i === 0 ? -0.5 : 2.6;
    const flow = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.5, 14), lavaMat);
    flow.position.set(Math.cos(a) * (RIM_R + 4), 0.5, Math.sin(a) * (RIM_R + 4));
    flow.rotation.y = a;
    g.add(flow);
  }
  // Humo gris saliendo del cráter — 4 spheres semi-transparentes que suben.
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x6a6058, transparent: true, opacity: 0.45, depthWrite: false });
  const smokes = [];
  for (let i = 0; i < 6; i++) {
    const sm = new THREE.Mesh(new THREE.SphereGeometry(2.5 + Math.random() * 1.5, 8, 6), smokeMat);
    sm.position.set((Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 8);
    g.add(sm);
    smokes.push({ mesh: sm, baseY: sm.position.y, phase: Math.random() * Math.PI * 2 });
  }
  // Light fuerte rojo desde el pozo.
  const light = new THREE.PointLight(0xff5020, 6, 80, 2);
  light.position.set(0, 0.5, 0);
  g.add(light);
  // Rocas dispersas afuera del anillo.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
    const r = RIM_R + 6 + Math.random() * 5;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + Math.random() * 0.7, 0), rockMat);
    rock.position.set(Math.cos(a) * r, 0.4, Math.sin(a) * r);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    g.add(rock);
  }
  g.userData.lava = lavaPit;
  g.userData.bubbles = bubbles;
  g.userData.smokes = smokes;
  return g;
}

export function isNearVolcanoCrater(x, z) {
  const dx = x - VOLCANO_POS.x, dz = z - VOLCANO_POS.z;
  return (dx * dx + dz * dz) < VOLCANO_DAMAGE_R * VOLCANO_DAMAGE_R;
}

// =====================================================================
// Init + tick.
// =====================================================================
export function spawnLandmarks() {
  lakeMesh = makeLakeMesh();
  scene.add(lakeMesh);
  volcanoGroup = makeVolcanoMesh();
  volcanoGroup.position.set(VOLCANO_POS.x, heightAt(VOLCANO_POS.x, VOLCANO_POS.z), VOLCANO_POS.z);
  scene.add(volcanoGroup);
}

let _phase = 0;
export function tick(dt) {
  _phase += dt * 0.6;
  // Lake water sube/baja sutilmente para sentir agua viva.
  if (lakeMesh) {
    lakeMesh.position.y = heightAt(LAKE_POS.x, LAKE_POS.z) - 0.6 + Math.sin(_phase) * 0.05;
    if (lakeMesh.material) lakeMesh.material.opacity = 0.65 + Math.sin(_phase * 1.2) * 0.05;
  }
  // Volcán: lava pulsa + borbotones suben/bajan + humo flota.
  if (volcanoGroup && volcanoGroup.userData.lava) {
    const lava = volcanoGroup.userData.lava;
    if (lava.material) lava.material.emissiveIntensity = 2.0 + Math.abs(Math.sin(_phase * 2)) * 0.8;
  }
  if (volcanoGroup && volcanoGroup.userData.bubbles) {
    for (const b of volcanoGroup.userData.bubbles) {
      b.phase += dt * 2.5;
      b.mesh.position.y = b.baseY + Math.sin(b.phase) * 0.4;
    }
  }
  if (volcanoGroup && volcanoGroup.userData.smokes) {
    for (const s of volcanoGroup.userData.smokes) {
      s.phase += dt * 0.4;
      s.mesh.position.y = s.baseY + Math.sin(s.phase) * 1.5;
      s.mesh.rotation.y += dt * 0.2;
    }
  }
  // Daño al player si está sobre el cráter.
  if (player && player.pos && isNearVolcanoCrater(player.pos.x, player.pos.z)) {
    if (!player.invulnerable && !player.godMode && player.hp > 0) {
      player.hp = Math.max(0, player.hp - 2 * dt);
    }
  }
}
