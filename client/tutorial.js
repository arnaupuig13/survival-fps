// Tutorial first-time. Si es la primera vez que el jugador inicia
// la partida (localStorage flag), muestra una secuencia de pasos
// guiados como overlay. Cada paso se descarta presionando ENTER o
// cumpliendo una condición (ej. abrir inventario).

const STORAGE_KEY = 'survival-fps-v1-tutorial-seen';

const STEPS = [
  {
    id: 'movement',
    text: 'WASD para moverte · SHIFT para correr · CTRL para agacharte',
    autoDismiss: 5000,
  },
  {
    id: 'inventory',
    text: 'Apretá TAB para abrir el inventario',
    waitFor: 'tab',
  },
  {
    id: 'hotbar',
    text: 'Arrastrá la PISTOLA del inventario al primer slot del cinturón',
    waitFor: 'pistolInHotbar',
    autoDismiss: 25000,
  },
  {
    id: 'shoot',
    text: 'Cerrá el inventario (TAB) y presioná 1 para equipar la pistola. Click izquierdo dispara.',
    waitFor: 'shoot',
    autoDismiss: 30000,
  },
  {
    id: 'crate',
    text: 'Buscá una casa o cofre y presioná E para abrirlo. El loot mejor está en cofres custodiados.',
    autoDismiss: 12000,
  },
  {
    id: 'survival',
    text: 'Tu hambre, sed y calor bajan con el tiempo. H = vendaje · J = comer · U = beber. G = granada.',
    autoDismiss: 10000,
  },
  {
    id: 'final',
    text: 'Sobreviví el mayor tiempo posible. Suerte. — Apretá ENTER para empezar.',
  },
];

let currentStep = -1;
let active = false;
const overlay = (() => {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('tutorialOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tutorialOverlay';
    el.style.cssText = `
      position: fixed; left: 50%; top: 30%; transform: translateX(-50%);
      background: rgba(20,20,28,0.92); border: 1px solid #f0c060;
      padding: 18px 28px; min-width: 480px; max-width: 720px;
      color: #f0c060; font: 14px system-ui, sans-serif; letter-spacing: 1px;
      z-index: 12; text-align: center; pointer-events: none;
      box-shadow: 0 8px 24px rgba(240,192,96,0.3);
      transition: opacity 0.25s;
    `;
    el.innerHTML = `
      <div id="tutorialTitle" style="color:#80ff60;font-size:11px;letter-spacing:3px;margin-bottom:6px;">★ TUTORIAL ★</div>
      <div id="tutorialText" style="color:#ddd;font-size:14px;line-height:1.5;"></div>
      <div style="color:#666;font-size:10px;margin-top:10px;letter-spacing:1px;">[ENTER siguiente · ESC saltar tutorial]</div>
    `;
    document.body.appendChild(el);
  }
  return el;
})();

function setOverlayText(text) {
  const t = document.getElementById('tutorialText');
  if (t) t.textContent = text;
}

export function isActive() { return active; }
export function hasSeen() {
  try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
}
export function markSeen() {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
}

let _timer = null;
function showStep(idx) {
  currentStep = idx;
  if (idx >= STEPS.length) {
    finish();
    return;
  }
  const step = STEPS[idx];
  setOverlayText(step.text);
  if (overlay) overlay.style.opacity = '1';
  if (_timer) clearTimeout(_timer);
  if (step.autoDismiss) {
    _timer = setTimeout(() => advance(), step.autoDismiss);
  }
}

export function advance() {
  if (!active) return;
  showStep(currentStep + 1);
}

export function finish() {
  active = false;
  markSeen();
  if (overlay) overlay.style.opacity = '0';
  if (_timer) clearTimeout(_timer);
}

export function start() {
  if (hasSeen()) return;
  active = true;
  showStep(0);
}

// Eventos externos: el handler de TAB/dispara avisa para avanzar.
export function trigger(eventName) {
  if (!active) return;
  const step = STEPS[currentStep];
  if (!step || !step.waitFor) return;
  if (step.waitFor === eventName) advance();
}

// Hook a eventos del teclado.
if (typeof addEventListener !== 'undefined') {
  addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.code === 'Enter') {
      e.preventDefault();
      advance();
    } else if (e.code === 'Escape') {
      finish();
    } else if (e.code === 'Tab') {
      trigger('tab');
    }
  });
}
