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
const staminaFill = document.getElementById('staminaFill');
const hitMarkerEl = document.getElementById('hitMarker');

export function setStamina(s) {
  if (staminaFill) staminaFill.style.width = `${Math.max(0, Math.min(100, s))}%`;
}

let _markerTimer = 0;
export function flashHitMarker(isKill = false) {
  if (!hitMarkerEl) return;
  hitMarkerEl.classList.toggle('kill', !!isKill);
  hitMarkerEl.style.transition = 'none';
  hitMarkerEl.style.opacity = '1';
  // Force reflow for transition restart.
  void hitMarkerEl.offsetWidth;
  hitMarkerEl.style.transition = 'opacity 0.45s';
  hitMarkerEl.style.opacity = '0';
  clearTimeout(_markerTimer);
  _markerTimer = setTimeout(() => hitMarkerEl.classList.remove('kill'), 450);
}

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

// Format hour 13.5 → "13:30" for the clock readout.
const clockEl = document.getElementById('clock');
export function setClock(hour) {
  if (!clockEl) return;
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  clockEl.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

const dayEl = document.getElementById('dayCounter');
export function setDay(day) {
  if (dayEl) dayEl.textContent = `DIA ${day}`;
}

const nameEl = document.getElementById('playerName');
export function setPlayerName(name) {
  if (nameEl) nameEl.textContent = name ? `▣ ${name}` : '';
}

// =====================================================================
// Hotbar — 9 slots. Slot 0..2 fixed (pistol, rifle, bandage). 3..8 reserved
// for future weapons. Active slot has `.active`. Each slot shows a count
// (rounds for guns, charges for bandage).
// =====================================================================
const hotbarSlots = Array.from(document.querySelectorAll('.hbslot'));
let _activeSlot = 0;
export function setHotbarActive(slotIdx) {
  _activeSlot = slotIdx;
  for (const el of hotbarSlots) el.classList.remove('active');
  const el = hotbarSlots[slotIdx];
  if (el) el.classList.add('active');
}
export function setHotbarCount(slotIdx, n) {
  const el = document.getElementById(`hbcount${slotIdx}`);
  if (el) el.textContent = n | 0;
  // Disable visual when count = 0 (only for slots that have an item).
  const slot = hotbarSlots[slotIdx];
  if (slot && !slot.classList.contains('empty')) {
    slot.classList.toggle('disabled', (n | 0) === 0);
  }
}
// Mark a slot as locked (rifle before pickup) so it grays out.
export function setHotbarLocked(slotIdx, locked) {
  const slot = hotbarSlots[slotIdx];
  if (slot) slot.classList.toggle('disabled', !!locked);
}

// Active-weapon big counter at bottom-right.
const activeWeaponName = document.getElementById('activeWeaponName');
const activeAmmoNum    = document.getElementById('activeAmmoNum');
export function setActiveWeapon(name, ammo) {
  if (activeWeaponName) activeWeaponName.textContent = name;
  if (activeAmmoNum) {
    activeAmmoNum.textContent = ammo == null ? '—' : (ammo | 0);
    activeAmmoNum.classList.toggle('empty', ammo === 0);
  }
}

// Reload indicator.
const reloadIndicator = document.getElementById('reloadIndicator');
export function showReload(show) {
  if (reloadIndicator) reloadIndicator.classList.toggle('hidden', !show);
}

// =====================================================================
// Inventory panel — TAB toggles. Renders every ITEMS entry as a tile.
// =====================================================================
const inventoryPanel = document.getElementById('inventoryPanel');
const invGrid        = document.getElementById('invGrid');
let _inventoryOpen = false;
export function isInventoryOpen() { return _inventoryOpen; }

export function toggleInventory(state) {
  _inventoryOpen = state == null ? !_inventoryOpen : !!state;
  if (inventoryPanel) inventoryPanel.classList.toggle('hidden', !_inventoryOpen);
  // While inventory is open we want the cursor unlocked so the user can
  // close with TAB or click. Pointer lock is intentionally released by
  // pressing ESC; we don't unlock here to avoid interfering.
}

// =====================================================================
// Compass — top-center bar with NSWE markers. Update with player yaw.
// 1280px strip wraps around 360°, only middle 320px visible. We slide
// the strip negatively as yaw increases so cardinal points stay accurate.
// =====================================================================
const compassStrip = document.getElementById('compassStrip');
let _compassBuilt = false;
function buildCompass() {
  if (!compassStrip || _compassBuilt) return;
  _compassBuilt = true;
  // Build 5 copies of N E S W spanning 1280 px so we can slide cleanly.
  const total = 1280;
  const cardinals = [
    { lbl: 'N', deg: 0,   major: true },
    { lbl: 'NE', deg: 45 },
    { lbl: 'E', deg: 90,  major: true },
    { lbl: 'SE', deg: 135 },
    { lbl: 'S', deg: 180, major: true },
    { lbl: 'SO', deg: 225 },
    { lbl: 'O', deg: 270, major: true },
    { lbl: 'NO', deg: 315 },
  ];
  for (const c of cardinals) {
    // Two copies — one centered around 0°, one around 360°, so wrap looks seamless.
    for (let copy = 0; copy <= 1; copy++) {
      const span = document.createElement('span');
      span.textContent = c.lbl;
      if (c.major) span.className = 'major';
      const x = (c.deg + copy * 360) / 720 * total;
      span.style.left = `${x}px`;
      compassStrip.appendChild(span);
    }
  }
}
export function setCompass(yawRad) {
  buildCompass();
  if (!compassStrip) return;
  // Yaw 0 = facing -Z = North. Map yaw to strip offset: 360° → 640 px.
  let deg = (yawRad * 180 / Math.PI) % 360;
  if (deg < 0) deg += 360;
  // Center the strip so 0° lines up with the tick. Strip is 1280px,
  // visible window 320px. Tick is at center (160px).
  const offsetX = 160 - (deg / 720) * 1280 + 320; // shift +320 puts the [360..720] copies under the tick
  compassStrip.style.transform = `translateX(${offsetX}px)`;
}

export function renderInventory(state, itemMeta) {
  if (!invGrid) return;
  invGrid.innerHTML = '';
  for (const [key, meta] of Object.entries(itemMeta)) {
    const count = (state[key] | 0);
    const div = document.createElement('div');
    div.className = 'invItem';
    if (count === 0) div.classList.add('zero');
    if (meta.oneTime && count === 0) div.classList.add('locked');
    div.innerHTML = `<div class="iname">${meta.label}</div><div class="icount">${count}</div>`;
    if (meta.oneTime) {
      const flag = document.createElement('div');
      flag.className = 'iflag';
      flag.textContent = count > 0 ? 'EQUIPADO' : 'NO RECOLECTADO';
      div.appendChild(flag);
    }
    invGrid.appendChild(div);
  }
}

// Directional damage arrow — angle is in radians measured from camera
// forward (0 = source in front, +PI/2 = right, etc). The svg is rotated
// so the triangle points outward at the screen edge.
const dmgArrow = document.getElementById('dmgArrow');
let _arrowTimer = 0;
export function showDamageArrow(angleRadFromForward) {
  if (!dmgArrow) return;
  const deg = (angleRadFromForward * 180 / Math.PI);
  dmgArrow.style.transform = `translate(-50%,-50%) rotate(${deg}deg)`;
  dmgArrow.style.opacity = '1';
  clearTimeout(_arrowTimer);
  _arrowTimer = setTimeout(() => { dmgArrow.style.opacity = '0'; }, 1200);
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
