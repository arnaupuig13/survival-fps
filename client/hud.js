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

const hungerFill = document.getElementById('hungerFill');
const thirstFill = document.getElementById('thirstFill');
const warmthFill = document.getElementById('warmthFill');
export function setSurvival(hunger, thirst, warmth) {
  if (hungerFill) hungerFill.style.width = `${Math.max(0, Math.min(100, hunger))}%`;
  if (thirstFill) thirstFill.style.width = `${Math.max(0, Math.min(100, thirst))}%`;
  if (warmthFill) warmthFill.style.width = `${Math.max(0, Math.min(100, warmth))}%`;
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
  // Armor indicator: vest 25% + helmet 25% = 50% combined max.
  const armorEl = document.getElementById('armorPct');
  if (armorEl) {
    const pct = (state.vest_armor ? 25 : 0) + (state.helmet_armor ? 25 : 0);
    armorEl.textContent = `${pct}%`;
    armorEl.style.color = pct >= 50 ? '#80ffd0' : pct >= 25 ? '#80c0ff' : '#888';
  }
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
// Hotbar — 6 slots configurables. Cada slot tiene un itemKey o null.
// El usuario asigna items dragueando desde el inventario. Las teclas 1-6
// activan el slot. Hay DOS sets de .hbslot: el HUD de afuera + el mirror
// dentro del modal del inventario. Pintamos AMBOS sincronizadamente.
// =====================================================================
let _activeSlot = -1;
export function setHotbarActive(slotIdx) {
  _activeSlot = slotIdx;
  for (const el of document.querySelectorAll('.hbslot')) el.classList.remove('active');
  for (const el of document.querySelectorAll(`.hbslot[data-slot="${slotIdx}"]`)) el.classList.add('active');
}

// Override de labels — los items de munición representan al arma cuando
// están en el cinturón (ej. bullet_p → "PISTOLA").
const HOTBAR_LABEL_OVERRIDE = {
  pistol_pickup: 'PISTOLA',
  rifle_pickup: 'RIFLE',
  smg_pickup: 'SMG',
  shotgun_pickup: 'ESCOPETA',
  sniper_pickup: 'SNIPER',
  crossbow_pickup: 'BALLESTA',
  bullet_p: 'PISTOLA',
  bullet_r: 'RIFLE',
  bullet_smg: 'SMG',
  shell: 'ESCOPETA',
  sniper_round: 'SNIPER',
  bolt: 'BALLESTA',
};

// Pinta TODOS los slots con data-slot=idx (HUD principal + modal mirror).
export function paintHotbarSlot(idx, itemKey, count, itemMeta) {
  const slots = document.querySelectorAll(`.hbslot[data-slot="${idx}"]`);
  for (const slot of slots) {
    const labelEl = slot.querySelector('.hblabel');
    const countEl = slot.querySelector('.hbcount');
    slot.classList.remove('empty', 'disabled');
    if (!itemKey) {
      slot.classList.add('empty');
      if (labelEl) labelEl.textContent = '';
      if (countEl) countEl.textContent = '';
      continue;
    }
    const label = HOTBAR_LABEL_OVERRIDE[itemKey] || itemMeta?.label || itemKey;
    if (labelEl) labelEl.textContent = label.slice(0, 9);
    if (countEl) {
      if (itemMeta?.oneTime) countEl.textContent = '';
      else countEl.textContent = (count | 0) > 0 ? (count | 0) : '';
    }
    if (itemMeta?.oneTime && (count | 0) === 0) slot.classList.add('disabled');
    else if (!itemMeta?.oneTime && (count | 0) === 0) slot.classList.add('disabled');
  }
}

// Backwards-compat: setHotbarCount y setHotbarLocked siguen exportados
// pero ya no hacen nada (los conserva main.js por ahora — los iremos
// limpiando). Re-render real desde paintHotbarSlot.
export function setHotbarCount(_slotIdx, _n) { /* deprecated */ }
export function setHotbarLocked(_slotIdx, _locked) { /* deprecated */ }

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
  // Permite que el hotbar reciba pointer events (drop targets) mientras
  // el inventario esté abierto.
  document.body.classList.toggle('inv-open', _inventoryOpen);
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

const RARITY_COLORS = {
  common:    '#666', uncommon: '#48d068', rare: '#4a90e0',
  epic:      '#a060e0', legendary: '#f0c040',
};

export function renderInventory(state, itemMeta, opts = {}) {
  if (!invGrid) return;
  invGrid.innerHTML = '';
  for (const [key, meta] of Object.entries(itemMeta)) {
    const count = (state[key] | 0);
    const div = document.createElement('div');
    div.className = 'invItem';
    if (count === 0) div.classList.add('zero');
    if (meta.oneTime && count === 0) div.classList.add('locked');
    // Border color reflects rarity.
    const rcol = RARITY_COLORS[meta.rarity || 'common'];
    div.style.borderLeft = `3px solid ${rcol}`;
    div.innerHTML = `<div class="iname">${meta.label}</div><div class="icount">${count}</div>`;
    if (meta.oneTime) {
      const flag = document.createElement('div');
      flag.className = 'iflag';
      flag.textContent = count > 0 ? 'EQUIPADO' : 'NO RECOLECTADO';
      div.appendChild(flag);
    }
    invGrid.appendChild(div);
  }
  // Recipes panel — appended below the inventory grid in the same modal.
  if (!opts.recipes) return;
  const recipeWrap = document.createElement('div');
  recipeWrap.className = 'recipesGrid';
  recipeWrap.innerHTML = '<div class="recipeHeader">CRAFTING</div>';
  for (const r of opts.recipes) {
    const can = canAffordRecipe(state, r) && (!r.needsFire || opts.nearFire);
    const reqText = Object.entries(r.requires).map(([k, v]) => `${v}× ${itemMeta[k]?.label || k}`).join(' + ') || '—';
    const btn = document.createElement('button');
    btn.className = 'recipeBtn' + (can ? '' : ' disabled');
    btn.disabled = !can;
    btn.innerHTML = `<div class="rname">${r.label}</div><div class="rreq">${reqText}${r.needsFire ? ' · cerca de fuego' : ''}</div>`;
    btn.addEventListener('click', () => {
      opts.onCraft?.(r.id);
    });
    recipeWrap.appendChild(btn);
  }
  invGrid.parentNode.insertBefore(recipeWrap, invGrid.nextSibling);
}

function canAffordRecipe(state, r) {
  for (const [k, v] of Object.entries(r.requires)) {
    if ((state[k] | 0) < v) return false;
  }
  return true;
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
  // Soporta player.maxHp > 100 cuando hay level-ups.
  const max = (typeof window !== 'undefined' && window.__playerMaxHp) || 100;
  hpFill.style.width = `${Math.max(0, Math.min(100, (hp / max) * 100))}%`;
}

// ----------------------------------------------------------------------
// XP / nivel HUD
// ----------------------------------------------------------------------
const lvlNum   = document.getElementById('lvlNum');
const xpFillEl = document.getElementById('xpFill');
const xpTextEl = document.getElementById('xpText');
export function setXp(level, xpThisLevel, xpNeeded) {
  if (lvlNum)   lvlNum.textContent = level;
  if (xpFillEl) xpFillEl.style.width = `${Math.min(100, (xpThisLevel / xpNeeded) * 100)}%`;
  if (xpTextEl) xpTextEl.textContent = `${xpThisLevel | 0} / ${xpNeeded} XP`;
}

// ----------------------------------------------------------------------
// Status (sangrado / infección)
// ----------------------------------------------------------------------
const statusRow    = document.getElementById('statusRow');
const statusBleed  = document.getElementById('statusBleed');
const statusInfect = document.getElementById('statusInfect');
export function setStatus(bleeding, infected) {
  if (!statusRow) return;
  const any = bleeding || infected;
  statusRow.classList.toggle('hidden', !any);
  statusBleed?.classList.toggle('hidden', !bleeding);
  statusInfect?.classList.toggle('hidden', !infected);
}

// ----------------------------------------------------------------------
// Quests HUD
// ----------------------------------------------------------------------
const questList = document.getElementById('questList');
export function renderQuests(quests) {
  if (!questList) return;
  questList.innerHTML = '';
  for (const q of quests) {
    const div = document.createElement('div');
    div.className = 'qItem' + (q.completed ? ' done' : '');
    const pct = Math.min(100, ((q.progress | 0) / q.goal) * 100);
    div.innerHTML = `
      <span class="qProg">${q.progress | 0}/${q.goal}</span>
      <span class="qLabel">${q.label}</span>
      <div class="qBar"><div class="qBarFill" style="width:${pct}%"></div></div>
    `;
    questList.appendChild(div);
  }
}

// ----------------------------------------------------------------------
// Trader panel
// ----------------------------------------------------------------------
const traderPanel    = document.getElementById('traderPanel');
const traderShopList = document.getElementById('traderShopList');
const traderBuyList  = document.getElementById('traderBuyList');
const traderScrapEl  = document.getElementById('traderScrap');
let _traderOpen = false;
export function isTraderOpen() { return _traderOpen; }
export function openTrader(shop, buy, scrap, onBuy, onSell, hasItem) {
  _traderOpen = true;
  if (!traderPanel) return;
  traderPanel.classList.remove('hidden');
  // Compras
  traderShopList.innerHTML = '';
  for (const o of shop) {
    const row = document.createElement('div');
    const owned = o.oneTime && hasItem(o);
    const can = !owned && scrap >= o.cost;
    row.className = 'traderRow' + (can ? '' : ' unaffordable');
    row.innerHTML = `<span>${o.label}${owned ? ' (poseído)' : ''}</span><span class="trCost">${o.cost}</span>`;
    if (can) row.addEventListener('click', () => onBuy(o.id));
    traderShopList.appendChild(row);
  }
  // Ventas
  traderBuyList.innerHTML = '';
  for (const o of buy) {
    const row = document.createElement('div');
    row.className = 'traderRow';
    row.innerHTML = `<span>${o.label}</span><span class="trCost">+${o.payScrap}</span>`;
    row.addEventListener('click', () => onSell(o.id));
    traderBuyList.appendChild(row);
  }
  if (traderScrapEl) traderScrapEl.textContent = scrap;
}
export function closeTrader() {
  _traderOpen = false;
  if (traderPanel) traderPanel.classList.add('hidden');
}
export function refreshTraderScrap(scrap) {
  if (traderScrapEl) traderScrapEl.textContent = scrap;
}

// ----------------------------------------------------------------------
// Perks modal
// ----------------------------------------------------------------------
const perksPanel = document.getElementById('perksPanel');
const perksList  = document.getElementById('perksList');
const perkBadge  = document.getElementById('perkBadge');
let _perksOpen = false;
export function isPerksOpen() { return _perksOpen; }
export function openPerksPanel(options, onChoose) {
  _perksOpen = true;
  if (!perksPanel || !perksList) return;
  perksList.innerHTML = '';
  for (const p of options) {
    const card = document.createElement('div');
    card.className = 'perkCard';
    card.innerHTML = `<div class="pkName">${p.name}</div><div class="pkDesc">${p.desc}</div>`;
    card.addEventListener('click', () => { onChoose(p.id); });
    perksList.appendChild(card);
  }
  perksPanel.classList.remove('hidden');
}
export function closePerksPanel() {
  _perksOpen = false;
  if (perksPanel) perksPanel.classList.add('hidden');
}
export function setPerkPending(n) {
  if (!perkBadge) return;
  perkBadge.classList.toggle('hidden', n <= 0);
  perkBadge.textContent = n > 1 ? `★ ${n} PERKS DISPONIBLES [K]` : '★ PERK DISPONIBLE [K]';
}

// ----------------------------------------------------------------------
// Difficulty + weather HUD
// ----------------------------------------------------------------------
const diffBadge = document.getElementById('difficultyBadge');
export function setDifficulty(day, mul) {
  if (diffBadge) diffBadge.textContent = `DIA ${day} · DIF x${mul.toFixed ? mul.toFixed(2) : mul}`;
}
const weatherEl = document.getElementById('weatherOverlay');
export function setWeather(kind) {
  if (!weatherEl) return;
  weatherEl.className = '';
  if (kind === 'rain' || kind === 'fog') weatherEl.classList.add(kind);
}

// ----------------------------------------------------------------------
// Peso de mochila
// ----------------------------------------------------------------------
const weightRow = document.getElementById('weightRow');
const weightVal = document.getElementById('weightVal');
export function setWeightHud(current, cap, overweight) {
  if (weightRow) weightRow.classList.toggle('overweight', !!overweight);
  if (weightVal) weightVal.textContent = `${current.toFixed(1)}/${cap}`;
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
