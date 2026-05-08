// Web Audio synthesis. No external assets — every sound is generated from
// noise + tones so the build stays lean. Spatial volume scales by distance
// to camera, capped at the listener.
//
// AudioContext is created lazily on first user gesture (browsers block
// autoplay otherwise). Call ensureAudio() from a click handler at boot.

let ctx = null;
let masterGain = null;

export function ensureAudio() {
  if (ctx) return ctx;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  ctx = new C();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.4;
  masterGain.connect(ctx.destination);
  return ctx;
}

// 0..1 master volume controlled from settings UI. No-op if audio hasn't
// been unlocked yet (e.g. settings opened before JUGAR).
export function setMasterVolume(v) {
  if (!ctx || !masterGain) return;
  masterGain.gain.value = Math.max(0, Math.min(1, v));
}

function envelope(node, attack, decay, sustainLvl, release) {
  const t = ctx.currentTime;
  const g = node.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(1, t + attack);
  g.exponentialRampToValueAtTime(Math.max(0.001, sustainLvl), t + attack + decay);
  g.exponentialRampToValueAtTime(0.001, t + attack + decay + release);
}

function noiseBuffer(durationMs = 200) {
  const c = ctx;
  const buf = c.createBuffer(1, c.sampleRate * durationMs / 1000, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
  return buf;
}

// Distance attenuation: linear fall-off from 0..maxRange.
function attenuate(dist, maxRange = 60) {
  return Math.max(0, 1 - dist / maxRange);
}

// =====================================================================
// Sound effects.
// =====================================================================

// Pistol: short bright crack — square wave 1.2k → 200 in 80 ms + noise.
export function playPistol(dist = 0) {
  if (!ensureAudio()) return;
  const a = attenuate(dist, 80);
  if (a <= 0) return;
  const t0 = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1200, t0);
  osc.frequency.exponentialRampToValueAtTime(200, t0 + 0.08);
  const og = ctx.createGain(); og.gain.value = 0;
  envelope(og, 0.001, 0.04, 0.0001, 0.04);
  osc.connect(og).connect(masterGain);
  osc.start(t0); osc.stop(t0 + 0.15);

  const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(120);
  const ng = ctx.createGain(); ng.gain.value = 0;
  envelope(ng, 0.001, 0.03, 0.0001, 0.03);
  const filt = ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = 1200;
  noise.connect(filt).connect(ng).connect(masterGain);
  noise.start(t0);

  // Apply distance attenuation by riding masterGain temporarily? Simpler:
  // scale individual gains.
  og.gain.setValueAtTime(a * 0.6, t0 + 0.001);
  ng.gain.setValueAtTime(a * 0.4, t0 + 0.001);
}

// Rifle: louder, deeper crack — sawtooth + noise + low end.
export function playRifle(dist = 0) {
  if (!ensureAudio()) return;
  const a = attenuate(dist, 110);
  if (a <= 0) return;
  const t0 = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(900, t0);
  osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.12);
  const og = ctx.createGain();
  og.gain.value = 0;
  envelope(og, 0.001, 0.08, 0.0001, 0.06);
  og.gain.setValueAtTime(a * 0.7, t0 + 0.001);
  osc.connect(og).connect(masterGain);
  osc.start(t0); osc.stop(t0 + 0.2);

  const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(160);
  const ng = ctx.createGain(); ng.gain.value = a * 0.5;
  const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 800; filt.Q.value = 1.5;
  noise.connect(filt).connect(ng).connect(masterGain);
  envelope(ng, 0.002, 0.05, 0.0001, 0.06);
  ng.gain.setValueAtTime(a * 0.5, t0 + 0.001);
  noise.start(t0);
}

// Hit / damage absorbed by an enemy — quick low thud.
export function playHit(dist = 0) {
  if (!ensureAudio()) return;
  const a = attenuate(dist, 40);
  if (a <= 0) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180, t0);
  osc.frequency.exponentialRampToValueAtTime(60, t0 + 0.12);
  const og = ctx.createGain();
  og.gain.value = 0;
  envelope(og, 0.001, 0.06, 0.0001, 0.05);
  og.gain.setValueAtTime(a * 0.5, t0 + 0.001);
  osc.connect(og).connect(masterGain);
  osc.start(t0); osc.stop(t0 + 0.18);
}

// Player took damage — a short red sting (descending square).
export function playPlayerHurt() {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(420, t0);
  osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.18);
  const og = ctx.createGain(); og.gain.value = 0;
  envelope(og, 0.001, 0.08, 0.0001, 0.1);
  og.gain.setValueAtTime(0.45, t0 + 0.001);
  osc.connect(og).connect(masterGain);
  osc.start(t0); osc.stop(t0 + 0.25);
}

// Pickup chime — two-tone uplift.
export function playPickup() {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  for (const [freq, when] of [[660, 0], [880, 0.08]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0 + when);
    const og = ctx.createGain(); og.gain.value = 0;
    envelope(og, 0.005, 0.03, 0.0001, 0.08);
    og.gain.setValueAtTime(0.4, t0 + when + 0.001);
    osc.connect(og).connect(masterGain);
    osc.start(t0 + when); osc.stop(t0 + when + 0.18);
  }
}

// Zombie growl — low rumble.
export function playGrowl(dist = 0) {
  if (!ensureAudio()) return;
  const a = attenuate(dist, 20);
  if (a <= 0) return;
  const t0 = ctx.currentTime;
  const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(420);
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 220; filt.Q.value = 0.8;
  const ng = ctx.createGain(); ng.gain.value = 0;
  envelope(ng, 0.05, 0.1, 0.6, 0.25);
  ng.gain.setValueAtTime(a * 0.5, t0 + 0.001);
  noise.connect(filt).connect(ng).connect(masterGain);
  noise.start(t0);
}

// Wolf snarl — short bandpass-filtered noise burst with a downward pitched
// triangle on top. Reads as "predator close" without sounding like the
// generic zombie growl.
export function playWolfSnarl(dist = 0) {
  if (!ensureAudio()) return;
  const a = attenuate(dist, 35);
  if (a <= 0) return;
  const t0 = ctx.currentTime;
  // Tonal element.
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(380, t0);
  osc.frequency.exponentialRampToValueAtTime(140, t0 + 0.35);
  const og = ctx.createGain(); og.gain.value = 0;
  envelope(og, 0.02, 0.15, 0.3, 0.2);
  og.gain.setValueAtTime(a * 0.35, t0 + 0.001);
  osc.connect(og).connect(masterGain);
  osc.start(t0); osc.stop(t0 + 0.55);
  // Noise body.
  const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(380);
  const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 600; filt.Q.value = 1.0;
  const ng = ctx.createGain(); ng.gain.value = 0;
  envelope(ng, 0.02, 0.1, 0.4, 0.2);
  ng.gain.setValueAtTime(a * 0.5, t0 + 0.001);
  noise.connect(filt).connect(ng).connect(masterGain);
  noise.start(t0);
}

// Footstep — soft thump.
export function playFootstep() {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80 + Math.random() * 30, t0);
  const og = ctx.createGain(); og.gain.value = 0;
  envelope(og, 0.005, 0.04, 0.0001, 0.04);
  og.gain.setValueAtTime(0.18, t0 + 0.001);
  osc.connect(og).connect(masterGain);
  osc.start(t0); osc.stop(t0 + 0.12);
}

// Boss arrival sting — slow falling triangle + noise.
export function playBossSting() {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(180, t0);
  osc.frequency.exponentialRampToValueAtTime(50, t0 + 1.2);
  const og = ctx.createGain(); og.gain.value = 0;
  envelope(og, 0.05, 0.4, 0.4, 0.8);
  og.gain.setValueAtTime(0.5, t0 + 0.001);
  osc.connect(og).connect(masterGain);
  osc.start(t0); osc.stop(t0 + 1.5);
}

// Empty-click when out of ammo.
export function playEmpty() {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(900, t0);
  const og = ctx.createGain(); og.gain.value = 0;
  envelope(og, 0.001, 0.01, 0.0001, 0.02);
  og.gain.setValueAtTime(0.18, t0 + 0.001);
  osc.connect(og).connect(masterGain);
  osc.start(t0); osc.stop(t0 + 0.05);
}

// Kill chime — quick high tone signaling a confirmed kill.
export function playKill() {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  for (const [freq, when] of [[760, 0], [1000, 0.06], [1300, 0.12]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0 + when);
    const og = ctx.createGain(); og.gain.value = 0;
    envelope(og, 0.001, 0.04, 0.0001, 0.06);
    og.gain.setValueAtTime(0.35, t0 + when + 0.001);
    osc.connect(og).connect(masterGain);
    osc.start(t0 + when); osc.stop(t0 + when + 0.13);
  }
}

// =====================================================================
// Ambient music — two looping detuned oscillators at a low gain. Tone +
// filter shift between modes (day / night / combat). startMusic() once
// after the first user gesture; setMusicMode('night' | 'day' | 'combat')
// later to swap palettes.
// =====================================================================
let musicNodes = null;

function makeMusicVoice(freq, type, gainTo) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = 0;
  osc.connect(g).connect(gainTo);
  osc.start();
  return { osc, gain: g };
}

export function startMusic() {
  if (!ensureAudio()) return;
  if (musicNodes) return;
  // Sub-master gain so we can master-fade the whole layer without
  // touching the global mix.
  const bus = ctx.createGain();
  bus.gain.value = 0.18;
  bus.connect(masterGain);
  // Three detuned voices.
  const v1 = makeMusicVoice(110, 'sine',     bus);     // root
  const v2 = makeMusicVoice(165, 'triangle', bus);     // 5th
  const v3 = makeMusicVoice(220, 'sine',     bus);     // octave
  // A low-pass that we shift around to color the mix.
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 800;
  filt.Q.value = 0.7;
  bus.disconnect();
  bus.connect(filt).connect(masterGain);
  musicNodes = { bus, voices: [v1, v2, v3], filt };
  // Default day mode.
  setMusicMode('day');
  // Slow ramp-in so it doesn't slam.
  const t0 = ctx.currentTime;
  v1.gain.gain.linearRampToValueAtTime(0.7, t0 + 4);
  v2.gain.gain.linearRampToValueAtTime(0.4, t0 + 4);
  v3.gain.gain.linearRampToValueAtTime(0.3, t0 + 4);
}

export function setMusicMode(mode) {
  if (!musicNodes) return;
  const t = ctx.currentTime;
  const { voices, filt, bus } = musicNodes;
  const [v1, v2, v3] = voices;
  if (mode === 'night') {
    v1.osc.frequency.linearRampToValueAtTime(98,  t + 1.5);   // slightly flatter root
    v2.osc.frequency.linearRampToValueAtTime(155, t + 1.5);
    v3.osc.frequency.linearRampToValueAtTime(196, t + 1.5);
    filt.frequency.linearRampToValueAtTime(420, t + 2);       // darker
    bus.gain.linearRampToValueAtTime(0.22, t + 2);
  } else if (mode === 'combat') {
    v1.osc.frequency.linearRampToValueAtTime(110, t + 0.5);
    v2.osc.frequency.linearRampToValueAtTime(146, t + 0.5);   // dissonant 4th
    v3.osc.frequency.linearRampToValueAtTime(220, t + 0.5);
    filt.frequency.linearRampToValueAtTime(1500, t + 1);
    bus.gain.linearRampToValueAtTime(0.30, t + 1);
  } else { // day
    v1.osc.frequency.linearRampToValueAtTime(110, t + 1.5);
    v2.osc.frequency.linearRampToValueAtTime(165, t + 1.5);
    v3.osc.frequency.linearRampToValueAtTime(220, t + 1.5);
    filt.frequency.linearRampToValueAtTime(800, t + 2);
    bus.gain.linearRampToValueAtTime(0.18, t + 2);
  }
}

// =====================================================================
// Ambient soundscape — wind + distant moans. Llamados desde main.js
// con timers para crear atmosfera sin asset files.
// =====================================================================

// Ráfaga de viento — noise blanco con bandpass que sube y baja.
export function playWindGust() {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  const dur = 3 + Math.random() * 3;     // 3-6s
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(Math.round(dur * 1000));
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.setValueAtTime(180, t0);
  filt.frequency.linearRampToValueAtTime(380, t0 + dur * 0.4);
  filt.frequency.linearRampToValueAtTime(120, t0 + dur);
  filt.Q.value = 0.6;
  const ng = ctx.createGain(); ng.gain.value = 0;
  ng.gain.setValueAtTime(0, t0);
  ng.gain.linearRampToValueAtTime(0.06, t0 + 1.0);
  ng.gain.linearRampToValueAtTime(0.04, t0 + dur * 0.6);
  ng.gain.linearRampToValueAtTime(0, t0 + dur);
  noise.connect(filt).connect(ng).connect(masterGain);
  noise.start(t0);
}

// Gemido lejano de zombi — más grave y prolongado que el growl normal.
// Se atenúa con distancia para crear sensación de "hay algo allá".
export function playDistantMoan(dist = 50) {
  if (!ensureAudio()) return;
  const a = Math.max(0.01, attenuate(dist, 120));
  const t0 = ctx.currentTime;
  // Tonal — pitch grave que oscila.
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80 + Math.random() * 30, t0);
  osc.frequency.linearRampToValueAtTime(60 + Math.random() * 20, t0 + 1.5);
  const og = ctx.createGain(); og.gain.value = 0;
  og.gain.setValueAtTime(0, t0);
  og.gain.linearRampToValueAtTime(a * 0.20, t0 + 0.4);
  og.gain.linearRampToValueAtTime(a * 0.15, t0 + 1.3);
  og.gain.linearRampToValueAtTime(0, t0 + 2.0);
  // Filtro low-pass para que suene "amortiguado" lejos.
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 350;
  filt.Q.value = 0.5;
  osc.connect(filt).connect(og).connect(masterGain);
  osc.start(t0); osc.stop(t0 + 2.1);
  // Noise body para textura.
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(2000);
  const nfilt = ctx.createBiquadFilter();
  nfilt.type = 'bandpass';
  nfilt.frequency.value = 280;
  nfilt.Q.value = 1.5;
  const ng = ctx.createGain(); ng.gain.value = 0;
  ng.gain.setValueAtTime(0, t0);
  ng.gain.linearRampToValueAtTime(a * 0.10, t0 + 0.3);
  ng.gain.linearRampToValueAtTime(0, t0 + 1.8);
  noise.connect(nfilt).connect(ng).connect(masterGain);
  noise.start(t0);
}

// === HELIX ALARM — sirena cuando el player entra a Helix Lab ===
// Drone disonante con pulsos lentos. Se inicia/detiene desde main.js
// segun la distancia del player al centro del lab.
let helixAlarmNodes = null;
export function startHelixAlarm() {
  if (!ensureAudio()) return;
  if (helixAlarmNodes) return;
  const t = ctx.currentTime;
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(masterGain);
  // Sirena: 2 osciladores que pulsan en frecuencia.
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 220;
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 280;
  // LFO modula las frecuencias para crear el efecto de sirena.
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 30;
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);
  lfoGain.connect(osc2.frequency);
  // Filtro band para sonido apretado.
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = 250;
  filt.Q.value = 4;
  osc1.connect(filt);
  osc2.connect(filt);
  filt.connect(bus);
  osc1.start(t);
  osc2.start(t);
  lfo.start(t);
  // Fade in.
  bus.gain.linearRampToValueAtTime(0.15, t + 1.5);
  helixAlarmNodes = { bus, osc1, osc2, lfo };
}
export function stopHelixAlarm() {
  if (!helixAlarmNodes) return;
  const t = ctx.currentTime;
  const { bus, osc1, osc2, lfo } = helixAlarmNodes;
  bus.gain.linearRampToValueAtTime(0, t + 1.0);
  setTimeout(() => {
    try { osc1.stop(); osc2.stop(); lfo.stop(); bus.disconnect(); } catch {}
  }, 1100);
  helixAlarmNodes = null;
}

// === DOG BARK — ladrido (placeable + dog AI) ===
export function playDogBark(dist = 0) {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  const distMul = Math.max(0.15, 1 - dist / 60);
  for (const startOff of [0, 0.18, 0.40]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 800;
    osc.frequency.setValueAtTime(380, t0 + startOff);
    osc.frequency.exponentialRampToValueAtTime(220, t0 + startOff + 0.10);
    g.gain.setValueAtTime(0.0, t0 + startOff);
    g.gain.linearRampToValueAtTime(0.15 * distMul, t0 + startOff + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + startOff + 0.13);
    osc.connect(filt).connect(g).connect(masterGain);
    osc.start(t0 + startOff);
    osc.stop(t0 + startOff + 0.15);
  }
}

// === BOSS STING — mas dramático cuando spawnea el boss ===
export function playBossAppear() {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  const bus = ctx.createGain();
  bus.gain.value = 0.4;
  bus.connect(masterGain);
  // Acorde menor disonante descendente.
  const freqs = [220, 261, 311, 415];
  for (let i = 0; i < freqs.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freqs[i];
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.18, t0 + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 2.5);
    osc.connect(g).connect(bus);
    osc.start(t0 + i * 0.05);
    osc.stop(t0 + 2.6);
  }
}

// Sonido sutil de páginas/papeles que vuelan con el viento — de día.
export function playLeafRustle() {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(700);
  const filt = ctx.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = 1200;
  const ng = ctx.createGain(); ng.gain.value = 0;
  ng.gain.setValueAtTime(0, t0);
  ng.gain.linearRampToValueAtTime(0.04, t0 + 0.15);
  ng.gain.linearRampToValueAtTime(0, t0 + 0.7);
  noise.connect(filt).connect(ng).connect(masterGain);
  noise.start(t0);
}
