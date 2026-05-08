// Local player: WASD movement, mouse-look, jump, terrain collision, obstacle
// avoidance. Camera is the player — no separate body mesh because peers see
// the avatar via the network (entities.js renders peers).

import * as THREE from 'three';
import { camera, renderer } from './three-setup.js';
import { heightAt, obstacles, WORLD_HALF } from './world.js';

const EYE_HEIGHT = 1.65;
const CROUCH_HEIGHT = 1.05;
const WALK_SPEED = 5.5;
const SPRINT_MULT = 1.7;
const CROUCH_MULT = 0.55;
const JUMP_VEL = 6.0;
const GRAVITY = 22;
const PLAYER_RADIUS = 0.4;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 18;
const STAMINA_REGEN = 14;
const STAMINA_REGEN_DELAY = 0.8;

export const keys = Object.create(null);
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  // Toggle crouch with C — non-repeating.
  if (e.code === 'KeyC' && !e.repeat) player.crouching = !player.crouching;
});
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
  // Settings UI writes to player.mouseSensitivity (default 0.0022). 1.0 in
  // settings = 0.001, so a slider at 22 = 0.0022.
  const sens = (player.mouseSensitivity || 22) / 10000;
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
  maxHp: 100,
  stamina: STAMINA_MAX,
  staminaCooldown: 0,
  // Survival stats — drain over time, damage you when they hit 0.
  hunger: 100,
  thirst: 100,
  warmth: 100,
  nearFire: false,        // set by main.js each frame; affects warmth + cooking
  crouching: false,
  eyeHeightCurrent: EYE_HEIGHT,
  invulnerable: true,
  invulnGraceUntil: 0,
  mouseSensitivity: 22,
  godMode: false,
  // Armor state — main.js writes this from the inventory each frame.
  armorState: { vest: false, helmet: false },
  yaw: () => yaw,
  pitch: () => pitch,
  get locked() { return locked; },
  onLockChange: null,           // main.js sets this to hide/show menu
  takeDamage(dmg) {
    if (this.hp <= 0 || this.invulnerable) return;
    if (performance.now() / 1000 < this.invulnGraceUntil) return;
    if (this.godMode) return;
    // Armor reduction. Vest 25%, helmet 25% — combined 50%. Read from
    // inventory at hit time (cheap; no caching needed at this scale).
    const armorReduction = (this.armorState?.vest ? 0.25 : 0) + (this.armorState?.helmet ? 0.25 : 0);
    // Perk: thick_skin agrega 10% adicional.
    const totalReduction = Math.min(0.85, armorReduction + (this.dmgReduction || 0));
    const after = Math.max(1, Math.round(dmg * (1 - totalReduction)));
    this.hp = Math.max(0, this.hp - after);
    this.lastHitAt = performance.now() / 1000;
  },
  respawn() {
    this.hp = this.maxHp || 100;
    this.stamina = STAMINA_MAX;
    this.staminaCooldown = 0;
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
  // HP regen también requiere comer y beber: si hunger o thirst en 0, no regen.
  regen(dt) {
    const max = this.maxHp || 100;
    if (this.hp > 0 && this.hp < max) {
      const now = performance.now() / 1000;
      if (now - (this.lastHitAt || 0) >= 5 && this.hunger > 10 && this.thirst > 10) {
        const rate = 4 * (this.regenMult || 1);
        this.hp = Math.min(max, this.hp + rate * dt);
      }
    }
  },
  // Drain hambre / sed / calor con el tiempo. Si llegan a 0, el player sufre
  // damage continuo hasta que coma / beba / se caliente. Llamado desde main loop.
  tickSurvival(dt, isNight) {
    if (this.invulnerable || this.godMode || this.hp <= 0) return;
    // Hunger and thirst tick down slowly. Perks pueden ralentizar el drain.
    const hungerMul = (this.hungerDrainMult || 1);
    const thirstMul = (this.thirstDrainMult || 1);
    // Lluvia hace que la sed drene 50% menos pero el calor 2x más rápido.
    const isRaining = (this.weatherKind === 'rain');
    this.hunger = Math.max(0, this.hunger - 0.5 * hungerMul * dt);
    this.thirst = Math.max(0, this.thirst - 0.7 * thirstMul * (isRaining ? 0.5 : 1) * dt);
    // Warmth depends on the time of day + proximity to fire.
    if (this.warmthImmune) {
      this.warmth = 100;
    } else if (this.nearFire) {
      this.warmth = Math.min(100, this.warmth + 12 * dt);
    } else if (isNight) {
      this.warmth = Math.max(0, this.warmth - (isRaining ? 2.4 : 1.2) * dt);
    } else {
      this.warmth = Math.min(100, this.warmth + 0.6 * dt);
    }
    // Damage when stats reach 0 — slow to give the player a chance to fix it.
    if (this.hunger <= 0) this.hp = Math.max(0, this.hp - 1.0 * dt);
    if (this.thirst <= 0) this.hp = Math.max(0, this.hp - 1.5 * dt);
    if (this.warmth <= 0) this.hp = Math.max(0, this.hp - 0.8 * dt);
  },
  eat(item) {
    if (item === 'berry')        { this.hunger = Math.min(100, this.hunger + 12); this.thirst = Math.min(100, this.thirst + 6); return true; }
    if (item === 'meat_raw')     { this.hunger = Math.min(100, this.hunger + 18); this.hp = Math.max(1, this.hp - 5); return true; } // upset stomach
    if (item === 'meat_cooked')  { this.hunger = Math.min(100, this.hunger + 35); return true; }
    return false;
  },
  drink() { this.thirst = Math.min(100, this.thirst + 40); },
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

  // Stamina-gated sprint: holding shift drains stamina; if it hits 0 the
  // sprint multiplier drops to 1 until enough has regenerated.
  const sprintHeld = (keys['ShiftLeft'] || keys['ShiftRight']) && (keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD']);
  // Sprint cancels crouch (you can't sprint and crouch at the same time).
  if (sprintHeld && player.crouching) player.crouching = false;
  let sprint = 1;
  if (sprintHeld && player.stamina > 1 && !player.crouching) {
    sprint = SPRINT_MULT;
    player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN * dt);
    player.staminaCooldown = STAMINA_REGEN_DELAY;
  } else {
    if (player.staminaCooldown > 0) player.staminaCooldown -= dt;
    else if (player.stamina < STAMINA_MAX) player.stamina = Math.min(STAMINA_MAX, player.stamina + STAMINA_REGEN * dt);
  }
  const crouchMul = player.crouching ? CROUCH_MULT : 1;
  const godMul = player.godMode ? 10 : 1;
  // Sobrepeso (lo setea main.js cada frame leyendo inv.getCurrentWeight()).
  const overweightMul = player.overweight ? 0.55 : 1;
  const speed = WALK_SPEED * sprint * crouchMul * godMul * overweightMul;
  // Smooth eye height transition for crouch.
  const targetEye = player.crouching ? CROUCH_HEIGHT : EYE_HEIGHT;
  player.eyeHeightCurrent += (targetEye - player.eyeHeightCurrent) * (1 - Math.exp(-12 * dt));
  let nx = player.pos.x + _move.x * speed * dt;
  let nz = player.pos.z + _move.z * speed * dt;

  // Clamp to world boundary.
  if (nx >  WORLD_HALF - 0.5) nx =  WORLD_HALF - 0.5;
  if (nx < -WORLD_HALF + 0.5) nx = -WORLD_HALF + 0.5;
  if (nz >  WORLD_HALF - 0.5) nz =  WORLD_HALF - 0.5;
  if (nz < -WORLD_HALF + 0.5) nz = -WORLD_HALF + 0.5;

  // Obstacle collision — circle (trees, rocks, props) AND box (building
  // walls) variants. Skipped entirely in god mode so the user can phase
  // through walls during dev testing.
  if (!player.godMode) for (const o of obstacles) {
    if (o.type === 'box') {
      // Closest-point on box (in box-local space) to player center.
      const cosI = Math.cos(-(o.ry || 0));
      const sinI = Math.sin(-(o.ry || 0));
      const dx = nx - o.cx, dz = nz - o.cz;
      const lx = cosI * dx - sinI * dz;
      const lz = sinI * dx + cosI * dz;
      const ccx = Math.max(-o.hw, Math.min(o.hw, lx));
      const ccz = Math.max(-o.hh, Math.min(o.hh, lz));
      const dpx = lx - ccx, dpz = lz - ccz;
      const dist = Math.hypot(dpx, dpz);
      if (dist < PLAYER_RADIUS) {
        let nlx, nlz;
        if (dist < 0.0001) {
          // Player is inside the box — push out toward the nearest face.
          const dL = lx + o.hw, dR = o.hw - lx;
          const dB = lz + o.hh, dF = o.hh - lz;
          const m = Math.min(dL, dR, dB, dF);
          if (m === dL)      { nlx = -o.hw - PLAYER_RADIUS; nlz = lz; }
          else if (m === dR) { nlx =  o.hw + PLAYER_RADIUS; nlz = lz; }
          else if (m === dB) { nlx = lx; nlz = -o.hh - PLAYER_RADIUS; }
          else               { nlx = lx; nlz =  o.hh + PLAYER_RADIUS; }
        } else {
          nlx = ccx + (dpx / dist) * PLAYER_RADIUS;
          nlz = ccz + (dpz / dist) * PLAYER_RADIUS;
        }
        const cosF = Math.cos(o.ry || 0), sinF = Math.sin(o.ry || 0);
        nx = o.cx + cosF * nlx - sinF * nlz;
        nz = o.cz + sinF * nlx + cosF * nlz;
      }
      continue;
    }
    // Circle collider — try axes separately so the player slides on impact.
    let dx = nx - o.x, dz = player.pos.z - o.z;
    let r = o.r + PLAYER_RADIUS;
    if (dx * dx + dz * dz < r * r) {
      const d = Math.sqrt(dx * dx + dz * dz) || 0.0001;
      nx = o.x + (dx / d) * r;
    }
    dx = nx - o.x; dz = nz - o.z;
    if (dx * dx + dz * dz < r * r) {
      const d = Math.sqrt(dx * dx + dz * dz) || 0.0001;
      nz = o.z + (dz / d) * r;
    }
  }

  player.pos.x = nx;
  player.pos.z = nz;

  // Vertical: gravity + jump + terrain follow. God mode disables gravity
  // and lets the user fly with SPACE / CTRL.
  if (player.godMode) {
    player.vy = 0;
    if (keys['Space']) player.pos.y += speed * dt;
    if (keys['ControlLeft'] || keys['ControlRight']) player.pos.y -= speed * dt;
  } else {
    player.vy -= GRAVITY * dt;
    if (keys['Space'] && player.onGround && !player.crouching) { player.vy = JUMP_VEL; player.onGround = false; }
    player.pos.y += player.vy * dt;
    const groundY = heightAt(player.pos.x, player.pos.z) + player.eyeHeightCurrent;
    if (player.pos.y <= groundY) {
      player.pos.y = groundY;
      player.vy = 0;
      player.onGround = true;
    }
  }

  camera.position.copy(player.pos);
}
