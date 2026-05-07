// HUD — HP bar, FPS counter, online counter, event log, damage flash.
// Pure DOM; the canvas+three handles the world.

const hpFill = document.getElementById('hpFill');
const fpsEl = document.getElementById('fps');
const onlineEl = document.getElementById('online');
const logEl = document.getElementById('log');
const dmgFlash = document.getElementById('dmgFlash');

let lastFpsUpdate = 0;
let frameCount = 0;
let frameAccum = 0;

export function setHP(hp) {
  hpFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
}

export function setOnlineCount(n) {
  onlineEl.textContent = `${n} jugador${n === 1 ? '' : 'es'}`;
}

export function flashDamage() {
  dmgFlash.style.transition = 'none';
  dmgFlash.style.background = 'rgba(180,0,0,0.45)';
  void dmgFlash.offsetWidth;
  dmgFlash.style.transition = 'background 0.4s';
  dmgFlash.style.background = 'rgba(180,0,0,0)';
}

export function logLine(text) {
  const line = document.createElement('div');
  line.className = 'line';
  line.textContent = text;
  logEl.prepend(line);
  // Auto-fade
  setTimeout(() => { line.style.transition = 'opacity 0.6s'; line.style.opacity = '0'; }, 4500);
  setTimeout(() => { line.remove(); }, 5200);
  // Cap on-screen lines.
  while (logEl.children.length > 6) logEl.lastChild.remove();
}

export function tickFps(dt) {
  frameCount++;
  frameAccum += dt;
  if (frameAccum >= 0.5) {
    const fps = Math.round(frameCount / frameAccum);
    fpsEl.textContent = `${fps} FPS`;
    frameCount = 0;
    frameAccum = 0;
  }
}
