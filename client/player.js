// Local player: WASD movement, mouse-look, jump, terrain collision, obstacle
// avoidance. Camera is the player — no separate body mesh because peers see
// the avatar via the network (entities.js renders peers).

import * as THREE from 'three';
import { camera, renderer } from './three-setup.js';
import { heightAt, obstacles, WORLD_HALF } from './world.js';

const EYE_HEIGHT = 1.65;
const WALK_SPEED = 5.5;
const SPRINT_MULT = 1.7;
const JUMP_VEL = 6.0;
const GRAVITY = 22;
const PLAYER_RADIUS = 0.4;

export const keys = Object.create(null);
addEventListener('keydown', (e) => { keys[e.code] = true; });
addEventListener('keyup',   (e) => { keys[e.code] = false; });

// =====================================================================
// Pointer-lock controls — mouse-look. We rotate yaw (world Y) and pitch
// (camera local X). Pitch is clamped so the player can't look upside down.
// =====================================================================
let yaw = 0, pitch = 0;
let locked = false;
const PITCH_LIMIT = Math.PI / 2 - 0.05;

renderer.domElement.addEventListener('click', () => {
  if (!locked) renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  player.onLockChange?.(locked);
});
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  const sens = 0.0022;
  yaw   -= e.movementX * sens;
  pitch -= e.movementY * sens;
  if (pitch >  PITCH_LIMIT) pitch =  PITCH_LIMIT;
  if (pitch < -PITCH_LIMIT) pitch = -PITCH_LIMIT;
});

// =====================================================================
// Player state
// =====================================================================
export const player = {
  pos: new THREE.Vector3(0, heightAt(0, 0) + EYE_HEIGHT, 0),
  vy: 0,
  onGround: false,
  hp: 100,
  invulnerable: true,           // flipped by main.js when JUGAR is pressed
  invulnGraceUntil: 0,          // post-respawn grace window
  yaw: () => yaw,
  pitch: () => pitch,
  get locked() { return locked; },
  onLockChange: null,           // main.js sets this to hide/show menu
  takeDamage(dmg) {
    if (this.hp <= 0 || this.invulnerable) return;
    if (performance.now() / 1000 < this.invulnGraceUntil) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.lastHitAt = performance.now() / 1000;
  },
  respawn() {
    this.hp = 100;
    this.pos.set(0, heightAt(0, 0) + EYE_HEIGHT, 0);
    this.vy = 0;
    this.invulnGraceUntil = performance.now() / 1000 + 6;
    this.lastHitAt = 0;
  },
  // 4s de grace al iniciar la partida — los zombies que estaban cerca durante
  // el menu pierden ventaja y el player tiene chance de moverse / disparar.
  startGame() {
    this.invulnerable = false;
    this.invulnGraceUntil = performance.now() / 1000 + 4;
  },
  // HP regen — sumar lentamente si no fuiste hit en los ultimos 5s.
  regen(dt) {
    if (this.hp <= 0 || this.hp >= 100) return;
    const now = performance.now() / 1000;
    if (now - (this.lastHitAt || 0) < 5) return;
    this.hp = Math.min(100, this.hp + 4 * dt); // ~4 HP/s
  },
  lastHitAt: 0,
};

// =====================================================================
// Per-frame update — apply movement, gravity, terrain & obstacle collision.
// =====================================================================
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

export function updatePlayer(dt) {
  // Apply rotation to camera each frame regardless of locked state so the
  // user can move the head to inspect the world while the menu is open.
  camera.rotation.order = 'YXZ';
  camera.rotation.set(pitch, yaw, 0);

  if (!locked) { camera.position.copy(player.pos); return; }
  if (player.hp <= 0) { camera.position.copy(player.pos); return; }

  // Build move vector from WASD relative to yaw.
  _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  _move.set(0, 0, 0);
  if (keys['KeyW']) _move.add(_fwd);
  if (keys['KeyS']) _move.sub(_fwd);
  if (keys['KeyD']) _move.add(_right);
  if (keys['KeyA']) _move.sub(_right);
  if (_move.lengthSq() > 0) _move.normalize();

  const sprint = (keys['ShiftLeft'] || keys['ShiftRight']) ? SPRINT_MULT : 1;
  const speed = WALK_SPEED * sprint;
  let nx = player.pos.x + _move.x * speed * dt;
  let nz = player.pos.z + _move.z * speed * dt;

  // Clamp to world boundary.
  if (nx >  WORLD_HALF - 0.5) nx =  WORLD_HALF - 0.5;
  if (nx < -WORLD_HALF + 0.5) nx = -WORLD_HALF + 0.5;
  if (nz >  WORLD_HALF - 0.5) nz =  WORLD_HALF - 0.5;
  if (nz < -WORLD_HALF + 0.5) nz = -WORLD_HALF + 0.5;

  // Obstacle collision — separate axes so we can slide along walls.
  for (const o of obstacles) {
    // Try X-only move
    let dx = nx - o.x, dz = player.pos.z - o.z;
    let r = o.r + PLAYER_RADIUS;
    if (dx * dx + dz * dz < r * r) {
      // Push back in X.
      const d = Math.sqrt(dx * dx + dz * dz) || 0.0001;
      nx = o.x + (dx / d) * r;
    }
    // Try Z-only move
    dx = nx - o.x; dz = nz - o.z;
    if (dx * dx + dz * dz < r * r) {
      const d = Math.sqrt(dx * dx + dz * dz) || 0.0001;
      nz = o.z + (dz / d) * r;
    }
  }

  player.pos.x = nx;
  player.pos.z = nz;

  // Vertical: gravity + jump + terrain follow.
  player.vy -= GRAVITY * dt;
  if (keys['Space'] && player.onGround) { player.vy = JUMP_VEL; player.onGround = false; }
  player.pos.y += player.vy * dt;

  const groundY = heightAt(player.pos.x, player.pos.z) + EYE_HEIGHT;
  if (player.pos.y <= groundY) {
    player.pos.y = groundY;
    player.vy = 0;
    player.onGround = true;
  }

  camera.position.copy(player.pos);
}
