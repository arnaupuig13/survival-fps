// Bootstrap — wire together world, player, network, entities, weapons, HUD.
// Game loop in one place. Order of imports matters: world.js mutates the
// scene at module-load time, so it must come after three-setup.js.

import { renderer, scene, camera } from './three-setup.js';
import './world.js';                 // builds terrain + trees + rocks into scene
import { player, updatePlayer } from './player.js';
import { network } from './network.js';
import { updateEntities } from './entities.js';
import { updateWeapons } from './weapons.js';
import { setHP, setOnlineCount, flashDamage, logLine, tickFps } from './hud.js';

const menuEl = document.getElementById('menu');
const playBtn = document.getElementById('playBtn');
const deathEl = document.getElementById('death');
const respawnBtn = document.getElementById('respawnBtn');

// =====================================================================
// Connect to server immediately so peers and zombies populate while the
// menu is up. The player is invulnerable until JUGAR is pressed.
// =====================================================================
network.connect(player);
network.onYouHit = (dmg, src) => {
  player.takeDamage(dmg);
  setHP(player.hp);
  flashDamage();
  if (player.hp <= 0) {
    deathEl.classList.add('show');
    document.exitPointerLock?.();
  }
};
network.onPeerCount = setOnlineCount;

// =====================================================================
// Menu wiring — JUGAR drops invulnerability and engages pointer lock.
// =====================================================================
playBtn.addEventListener('click', () => {
  player.startGame();
  menuEl.style.display = 'none';
  renderer.domElement.requestPointerLock?.();
  logLine('Bienvenido. Sobrevivi.');
});

respawnBtn.addEventListener('click', () => {
  player.respawn();
  network.respawn();
  setHP(player.hp);
  deathEl.classList.remove('show');
  renderer.domElement.requestPointerLock?.();
});

// Pause menu reappears when pointer lock is released (ESC).
player.onLockChange = (locked) => {
  if (!locked && player.hp > 0 && !deathEl.classList.contains('show')) {
    menuEl.style.display = 'flex';
  }
};

// =====================================================================
// Game loop — fixed-step camera/player update, lerp peers/zombies.
// =====================================================================
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); // clamp to avoid huge dt after tab unfocus
  last = now;

  updatePlayer(dt);
  updateEntities(dt);
  updateWeapons(dt);
  network.update(dt);
  player.regen(dt);
  setHP(player.hp);

  // Death detection — usar el HP local en cada frame en vez de depender del
  // ultimo onYouHit (ese trigger se pierde si el ultimo hit lleva HP a 0
  // exacto fuera del callback).
  if (player.hp <= 0 && !deathEl.classList.contains('show')) {
    deathEl.classList.add('show');
    document.exitPointerLock?.();
  }

  tickFps(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
