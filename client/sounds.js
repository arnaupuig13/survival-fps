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
