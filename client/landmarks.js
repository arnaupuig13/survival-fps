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
  const lavaMat = new THREE.MeshStandardMaterial({
    color: 0xff4010,
    emissive: 0xff5020,
    emissiveIntensity: 1.8,
    roughness: 0.4,
  });
  // Cono base — geometry trunc cone con radius bottom 22m, top 8m, height 14m.
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(VOLCANO_DAMAGE_R + 2, VOLCANO_OUTER_R, 14, 16),
    rockMat,
  );
  cone.position.y = 7;
  g.add(cone);
  // Cráter — disco lava emisivo arriba.
  const crater = new THREE.Mesh(new THREE.CircleGeometry(VOLCANO_DAMAGE_R, 24), lavaMat);
  crater.rotation.x = -Math.PI / 2;
  crater.position.y = 14.05;
  g.add(crater);
  // Lava río descendente desde el cráter (1 ribbon visual).
  const flowGeom = new THREE.BoxGeometry(2.5, 0.4, 18);
  flowGeom.translate(0, 0, 9);
  const flow = new THREE.Mesh(flowGeom, lavaMat);
  flow.position.set(0, 7, 5);
  flow.rotation.y = Math.random() * Math.PI;
  g.add(flow);
  // Light source en el cráter.
  const light = new THREE.PointLight(0xff5020, 4, 60, 2);
  light.position.set(0, 12, 0);
  g.add(light);
  // Rocks alrededor de la base.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
    const r = VOLCANO_OUTER_R + 1 + Math.random() * 2;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + Math.random() * 0.6, 0), rockMat);
    rock.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    g.add(rock);
  }
  g.userData.lava = crater;
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
  // Volcán: lava pulsa.
  if (volcanoGroup && volcanoGroup.userData.lava) {
    const lava = volcanoGroup.userData.lava;
    if (lava.material) lava.material.emissiveIntensity = 1.4 + Math.abs(Math.sin(_phase * 2)) * 0.6;
  }
  // Daño al player si está sobre el cráter.
  if (player && player.pos && isNearVolcanoCrater(player.pos.x, player.pos.z)) {
    if (!player.invulnerable && !player.godMode && player.hp > 0) {
      player.hp = Math.max(0, player.hp - 2 * dt);
    }
  }
}
