// HUD — HP bar, ammo, kill counter, FPS counter, online counter, event log,
// damage flash, banner, interact prompt.

const hpFill = document.getElementById('hpFill');
const fpsEl = document.getElementById('fps');
const onlineEl = document.getElementById('online');
const logEl = document.getElementById('log');
const dmgFlash = document.getElementById('dmgFlash');
const ammoP = document.getElementById('ammoP');
const ammoR = document.getElementById('ammoR');
const invBandage = document.getElementById('invBandage');
const killCount = document.getElementById('killCount');
const interactPrompt = document.getElementById('interactPrompt');
const interactText = document.getElementById('interactText');

export function setInventory(state) {
  if (ammoP) ammoP.textContent = state.bullet_p | 0;
  if (ammoR) ammoR.textContent = state.bullet_r | 0;
  if (invBandage) invBandage.textContent = state.bandage | 0;
  if (killCount) killCount.textContent = state.kills | 0;
}

export function showInteract(text) {
  if (!interactPrompt) return;
  interactText.textContent = text;
  interactPrompt.classList.add('show');
}
export function hideInteract() {
  if (interactPrompt) interactPrompt.classList.remove('show');
}

// Lazy-create the banner element (used for boss spawn / death announcements).
let bannerEl = null;
function ensureBanner() {
  if (bannerEl) return bannerEl;
  bannerEl = document.createElement('div');
  bannerEl.id = 'banner';
  Object.assign(bannerEl.style, {
    position: 'fixed', top: '18%', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(40,8,8,0.85)', color: '#ff5050',
    border: '1px solid #722', padding: '10px 28px', fontSize: '20px',
    fontWeight: '700', letterSpacing: '4px', textAlign: 'center',
    zIndex: 8, opacity: '0', transition: 'opacity 0.4s', pointerEvents: 'none',
    fontFamily: 'system-ui, sans-serif',
  });
  document.body.appendChild(bannerEl);
  return bannerEl;
}
export function showBanner(text, durationMs = 3500) {
  const el = ensureBanner();
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, durationMs);
}

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
