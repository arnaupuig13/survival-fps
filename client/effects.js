// Visual feedback effects: bullet tracers, blood decals on the ground,
// gore particle bursts at enemy death. Pure client-side; no network sync.
//
// All three pools cap themselves so a long firefight doesn't allocate
// unbounded geometry.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt } from './world.js';

// =====================================================================
// Tracers — short line segments from muzzle to hit point that fade out.
// =====================================================================
const TRACER_LIFE = 0.18; // seconds
const TRACER_CAP = 24;
const _tracers = [];
const _tracerMat = new THREE.LineBasicMaterial({
  color: 0xfff0c0, transparent: true, opacity: 0.85,
});

export function spawnTracer(from, to) {
  const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(g, _tracerMat.clone());
  line.material.opacity = 0.9;
  scene.add(line);
  _tracers.push({ line, t: 0 });
  if (_tracers.length > TRACER_CAP) {
    const dead = _tracers.shift();
    scene.remove(dead.line);
    dead.line.geometry.dispose();
    dead.line.material.dispose();
  }
}

// =====================================================================
// Blood decals — a small flat circle on the ground at the death spot.
// Sit ~5 cm above terrain so they don't z-fight, fade over their life.
// =====================================================================
const DECAL_LIFE = 18;       // seconds before fully gone
const DECAL_CAP = 36;
const _decals = [];
const _decalGeom = new THREE.CircleGeometry(0.55, 12);
_decalGeom.rotateX(-Math.PI / 2);

export function spawnBloodDecal(x, z) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x6a0e0e, transparent: true, opacity: 0.85, depthWrite: false,
  });
  const mesh = new THREE.Mesh(_decalGeom, mat);
  mesh.position.set(x, heightAt(x, z) + 0.05, z);
  mesh.rotation.y = Math.random() * Math.PI * 2;
  // Random scale so they don't all look cookie-cutter.
  const s = 0.7 + Math.random() * 0.7;
  mesh.scale.set(s, 1, s);
  scene.add(mesh);
  _decals.push({ mesh, t: 0 });
  if (_decals.length > DECAL_CAP) {
    const dead = _decals.shift();
    scene.remove(dead.mesh);
    dead.mesh.material.dispose();
  }
}

// =====================================================================
// Gore particle burst — spheres flung outward from a point, gravity,
// short life. Pool reused; old ones recycled instead of disposed.
// =====================================================================
const PARTICLE_LIFE = 0.9;
const PARTICLE_CAP = 200;
const _particles = [];
const _partGeom = new THREE.SphereGeometry(0.08, 5, 4);
const _partMat = new THREE.MeshBasicMaterial({ color: 0x9c1a1a });

export function spawnGoreBurst(x, y, z, count = 14) {
  for (let i = 0; i < count; i++) {
    if (_particles.length >= PARTICLE_CAP) break;
    const m = new THREE.Mesh(_partGeom, _partMat);
    m.position.set(x, y + 1.0, z);
    const angle = Math.random() * Math.PI * 2;
    const up = 1.5 + Math.random() * 2.5;
    const out = 1.5 + Math.random() * 3;
    const v = new THREE.Vector3(Math.cos(angle) * out, up, Math.sin(angle) * out);
    scene.add(m);
    _particles.push({ mesh: m, v, t: 0 });
  }
}

// =====================================================================
// Per-frame update — advance each pool, clean up expired entries.
// =====================================================================
export function updateEffects(dt) {
  // Tracers fade.
  for (let i = _tracers.length - 1; i >= 0; i--) {
    const tr = _tracers[i];
    tr.t += dt;
    const life = 1 - tr.t / TRACER_LIFE;
    if (life <= 0) {
      scene.remove(tr.line);
      tr.line.geometry.dispose();
      tr.line.material.dispose();
      _tracers.splice(i, 1);
      continue;
    }
    tr.line.material.opacity = 0.9 * life;
  }

  // Decals fade — slow linear decay.
  for (let i = _decals.length - 1; i >= 0; i--) {
    const d = _decals[i];
    d.t += dt;
    const life = 1 - d.t / DECAL_LIFE;
    if (life <= 0) {
      scene.remove(d.mesh);
      d.mesh.material.dispose();
      _decals.splice(i, 1);
      continue;
    }
    d.mesh.material.opacity = 0.85 * life;
  }

  // Particles — gravity arc.
  for (let i = _particles.length - 1; i >= 0; i--) {
    const p = _particles[i];
    p.t += dt;
    if (p.t > PARTICLE_LIFE) {
      scene.remove(p.mesh);
      _particles.splice(i, 1);
      continue;
    }
    p.v.y -= 12 * dt;
    p.mesh.position.x += p.v.x * dt;
    p.mesh.position.y += p.v.y * dt;
    p.mesh.position.z += p.v.z * dt;
    // Stop at terrain (acts like a quick splat).
    const groundY = heightAt(p.mesh.position.x, p.mesh.position.z) + 0.05;
    if (p.mesh.position.y < groundY) p.mesh.position.y = groundY;
  }
}
