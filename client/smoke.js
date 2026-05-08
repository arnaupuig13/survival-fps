// Granadas de humo cliente-side. Cuando el jugador tira una smoke
// (tecla V), spawneamos una nube gris de partículas que dura 8s. Los
// enemigos del cliente que pasen por dentro pierden el sight del player
// (bypaseamos el lookup de nearest player en sus cálculos local). Server
// no sabe del humo — la nube es local y temporal.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { player } from './player.js';
import { heightAt } from './world.js';
import { logLine, showBanner } from './hud.js';
import * as sfx from './sounds.js';
import { network } from './network.js';

const LIFETIME = 9.0;
const RADIUS   = 6.0;
const PARTICLES = 20;

const clouds = [];   // { mesh, x, z, life }

function makePuff() {
  // Esfera con material casi blanco semitransparente.
  const geom = new THREE.SphereGeometry(0.6 + Math.random() * 0.5, 8, 6);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xc0c0c0,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  return new THREE.Mesh(geom, mat);
}

export function throwSmoke() {
  const yaw = player.yaw();
  // Cae 6m al frente del jugador.
  const tx = player.pos.x + Math.sin(yaw) * -8;
  const tz = player.pos.z + Math.cos(yaw) * -8;
  const cloud = { x: tx, z: tz, life: LIFETIME, group: new THREE.Group(), puffs: [] };
  for (let i = 0; i < PARTICLES; i++) {
    const puff = makePuff();
    const ox = (Math.random() - 0.5) * RADIUS * 0.8;
    const oz = (Math.random() - 0.5) * RADIUS * 0.8;
    const oy = Math.random() * 1.5;
    puff.position.set(ox, oy + 1, oz);
    cloud.group.add(puff);
    cloud.puffs.push({ puff, vx: (Math.random() - 0.5) * 0.3, vy: 0.4 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.3 });
  }
  cloud.group.position.set(tx, heightAt(tx, tz), tz);
  scene.add(cloud.group);
  clouds.push(cloud);
  // Registrar el área en el server para que enemigos pierdan target.
  network.registerSmoke?.(tx, tz, RADIUS, LIFETIME * 1000);
  showBanner('GRANADA DE HUMO', 1000);
  sfx.playEmpty?.();
  logLine('Cobertura de humo desplegada — enemigos pierden visión');
}

// Devuelve true si una posición (x, z) está dentro de alguna nube de humo
// activa. El AI client-side lo usa para perder target cuando los enemigos
// pasan por el humo.
export function isInsideSmoke(x, z) {
  for (const c of clouds) {
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < RADIUS * RADIUS) return true;
  }
  return false;
}

export function update(dt) {
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i];
    c.life -= dt;
    // Animación: cada puff sube y se expande lento, opacidad fade out.
    const fade = Math.max(0, c.life / LIFETIME);
    for (const p of c.puffs) {
      p.puff.position.x += p.vx * dt;
      p.puff.position.y += p.vy * dt;
      p.puff.position.z += p.vz * dt;
      p.puff.material.opacity = 0.65 * fade;
      p.vy *= 0.98;
    }
    if (c.life <= 0) {
      scene.remove(c.group);
      c.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) o.material.dispose?.();
      });
      clouds.splice(i, 1);
    }
  }
}
