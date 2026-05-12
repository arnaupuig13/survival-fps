// Audio sintetizado con WebAudio. Cero assets externos.
// Hace falta un click del usuario para desbloquear el AudioContext en navegadores modernos.

let ctx = null;
let unlocked = false;
let muted = localStorage.getItem('chiribito.muted') === '1';

function ensureCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudioOnce() {
  if (unlocked) return;
  unlocked = true;
  try { ensureCtx(); } catch {}
}

export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  localStorage.setItem('chiribito.muted', muted ? '1' : '0');
  return muted;
}

function envBeep({ freq = 440, durMs = 120, type = 'sine', gain = 0.12, freqEnd = null, attack = 0.005, release = 0.05 }) {
  if (muted || !unlocked) return;
  try {
    const c = ensureCtx();
    const t0 = c.currentTime;
    const t1 = t0 + durMs / 1000;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(50, freqEnd), t1);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.linearRampToValueAtTime(0.0001, t1 - release);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  } catch {}
}

function noiseBurst({ durMs = 80, gain = 0.18, lp = 1800 }) {
  if (muted || !unlocked) return;
  try {
    const c = ensureCtx();
    const len = Math.floor(c.sampleRate * (durMs / 1000));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lp;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(c.destination);
    src.start();
    src.stop(c.currentTime + durMs / 1000 + 0.02);
  } catch {}
}

// Chip clink: 3 capas (clack alto, choque medio, decay grave) que dan
// la sensacion de fichas reales chocando.
function chipClinkLayered(amount = 0) {
  if (muted || !unlocked) return;
  const c = ensureCtx();
  // capa 1: click metalico agudo
  envBeep({ freq: 2400 + Math.random() * 600, freqEnd: 1500, durMs: 50, type: 'square', gain: 0.05 });
  // capa 2: choque de plastico medio
  setTimeout(() => envBeep({ freq: 800 + Math.random() * 200, freqEnd: 500, durMs: 90, type: 'triangle', gain: 0.07 }), 15);
  // capa 3: decay grave (rebote)
  setTimeout(() => envBeep({ freq: 280, freqEnd: 200, durMs: 140, type: 'sine', gain: 0.05 }), 35);
  // ruido corto de friccion (fichas deslizando)
  noiseBurst({ durMs: 40, gain: 0.08, lp: 3500 });
  // Si el monto es grande, anadimos otro clink-eco
  if (amount > 200) {
    setTimeout(() => envBeep({ freq: 1800 + Math.random() * 400, durMs: 50, type: 'square', gain: 0.04 }), 100);
  }
}

// Crowd murmur: ruido rosa filtrado a banda media, low gain, looped.
let _crowdNode = null;
let _crowdEnabled = false;
function startCrowdMurmur() {
  if (muted || !unlocked || _crowdNode) return;
  try {
    const c = ensureCtx();
    const bufferSize = c.sampleRate * 4;
    const buf = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buf.getChannelData(0);
    // ruido rosa simple (acumulador)
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // filtro bandpass para sonar a "voces lejanas"
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 0.7;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = c.createGain();
    g.gain.value = 0.04;
    src.connect(bp).connect(lp).connect(g).connect(c.destination);
    src.start();
    _crowdNode = { src, gain: g };
  } catch {}
}
function stopCrowdMurmur() {
  if (!_crowdNode) return;
  try {
    const c = ensureCtx();
    _crowdNode.gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
    setTimeout(() => { _crowdNode?.src.stop(); _crowdNode = null; }, 600);
  } catch {}
}

// API publica
export const Sound = {
  deal()  { noiseBurst({ durMs: 60, gain: 0.10, lp: 4000 }); },
  flip()  { envBeep({ freq: 900, freqEnd: 600, durMs: 100, type: 'triangle', gain: 0.10 }); noiseBurst({ durMs: 50, gain: 0.07, lp: 5000 }); },
  chip(amount)  { chipClinkLayered(amount || 0); },
  check() { envBeep({ freq: 350, durMs: 80, type: 'sine', gain: 0.10 }); },
  fold()  { envBeep({ freq: 220, freqEnd: 110, durMs: 200, type: 'sawtooth', gain: 0.08 }); noiseBurst({ durMs: 120, gain: 0.05, lp: 800 }); },
  raise() { envBeep({ freq: 600, freqEnd: 1100, durMs: 160, type: 'square', gain: 0.09 }); chipClinkLayered(); },
  allin() { envBeep({ freq: 200, freqEnd: 900, durMs: 320, type: 'sawtooth', gain: 0.12 }); chipClinkLayered(500); setTimeout(() => chipClinkLayered(500), 80); },
  win()   {
    if (muted || !unlocked) return;
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => setTimeout(() => envBeep({ freq: f, durMs: 220, type: 'triangle', gain: 0.10 }), i * 110));
  },
  yourTurn() { envBeep({ freq: 800, durMs: 80, type: 'sine', gain: 0.08 }); },
  crowdOn()  { _crowdEnabled = true; startCrowdMurmur(); },
  crowdOff() { _crowdEnabled = false; stopCrowdMurmur(); },
};
