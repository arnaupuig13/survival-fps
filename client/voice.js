// Voz proximity WebRTC. Cada cliente abre una RTCPeerConnection con
// cada peer y modula el volumen de su audio incoming según distancia
// 3D al player local. Signaling vía WebSocket existente (`voiceSignal`).
//
// Por simplicidad: el cliente con menor selfId inicia la negociación
// (offer) cuando un peer aparece. El otro responde (answer).
//
// Tecla Y toggle mute (no captura mic mientras estás muted).

import { player } from './player.js';
import { peers } from './entities.js';
import { logLine, showBanner } from './hud.js';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const MAX_HEAR_RANGE = 80;     // m

let localStream = null;
let muted = false;
let initialized = false;
let _selfId = null;
let _network = null;

const peerConns = new Map();   // peerId → { pc, audioEl, gainNode, ctx, source }

const audioCtx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext))
  ? new (window.AudioContext || window.webkitAudioContext)()
  : null;

export async function init(network, selfId) {
  if (initialized) return;
  initialized = true;
  _network = network;
  _selfId = selfId;
  // Pedir mic. Si falla, voice queda inactiva pero los handlers de network
  // siguen rgistrados para no romper cuando otros peers manden offers.
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    showBanner('🎤 VOZ PROXIMITY ACTIVA — tecla Y mute', 2200);
    logLine('Voz proximity ON — los peers cercanos te escuchan (Y para mute)');
  } catch (err) {
    logLine('Sin permiso de micrófono — voz desactivada');
    return;
  }
}

export function setNetwork(network, selfId) {
  _network = network;
  _selfId = selfId;
}

export function toggleMute() {
  muted = !muted;
  if (localStream) {
    for (const t of localStream.getAudioTracks()) t.enabled = !muted;
  }
  logLine(muted ? '🔇 Mic muted' : '🎤 Mic on');
}
export function isMuted() { return muted; }

// Llamado desde main.js cuando un peer nuevo aparece (peerJoin / welcome).
export function onPeerAdded(peerId) {
  if (!initialized || !localStream || !_network) return;
  if (peerId === _selfId) return;
  if (peerConns.has(peerId)) return;
  // Reglas: el cliente con menor selfId inicia.
  if (_selfId < peerId) {
    initiateConnection(peerId);
  }
  // Sino, esperamos que el otro mande la offer.
}

export function onPeerRemoved(peerId) {
  const entry = peerConns.get(peerId);
  if (!entry) return;
  try { entry.pc.close(); } catch {}
  if (entry.audioEl) entry.audioEl.remove();
  peerConns.delete(peerId);
}

// Llamado por network.js cuando llega 'voiceSignal' del server.
export async function onSignal(fromId, payload) {
  if (!initialized) return;
  let entry = peerConns.get(fromId);
  if (!entry) {
    entry = createPeerConnection(fromId);
  }
  try {
    if (payload.sdp) {
      await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      if (payload.sdp.type === 'offer') {
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        sendSignal(fromId, { sdp: entry.pc.localDescription });
      }
    } else if (payload.ice) {
      await entry.pc.addIceCandidate(new RTCIceCandidate(payload.ice));
    }
  } catch (err) {
    console.warn('voice signal error:', err);
  }
}

function sendSignal(toId, payload) {
  if (!_network || !_network._send) return;
  _network._send({ type: 'voiceSignal', to: toId, payload });
}

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection(ICE_CONFIG);
  if (localStream) {
    for (const track of localStream.getAudioTracks()) {
      pc.addTrack(track, localStream);
    }
  }
  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal(peerId, { ice: e.candidate });
  };
  // Audio element + Web Audio para modular volumen por distancia.
  const audioEl = document.createElement('audio');
  audioEl.autoplay = true;
  audioEl.playsInline = true;
  audioEl.style.display = 'none';
  document.body.appendChild(audioEl);
  let gainNode = null, source = null;
  pc.ontrack = (e) => {
    audioEl.srcObject = e.streams[0];
    if (audioCtx) {
      try {
        // Conectamos el stream al audio graph para modular gain.
        source = audioCtx.createMediaStreamSource(e.streams[0]);
        gainNode = audioCtx.createGain();
        gainNode.gain.value = 0;
        source.connect(gainNode).connect(audioCtx.destination);
        // Mute el audioEl directo (lo manejamos via gain).
        audioEl.muted = true;
        const entry = peerConns.get(peerId);
        if (entry) {
          entry.gainNode = gainNode;
          entry.source = source;
        }
      } catch (err) {
        // Fallback: usar audioEl directamente.
        audioEl.muted = false;
      }
    }
  };
  const entry = { pc, audioEl, gainNode: null, source: null };
  peerConns.set(peerId, entry);
  return entry;
}

async function initiateConnection(peerId) {
  const entry = createPeerConnection(peerId);
  try {
    const offer = await entry.pc.createOffer({ offerToReceiveAudio: true });
    await entry.pc.setLocalDescription(offer);
    sendSignal(peerId, { sdp: entry.pc.localDescription });
  } catch (err) {
    console.warn('voice initiate error:', err);
  }
}

// Cada frame — modular volumen de cada peer según distancia 3D.
export function tick() {
  if (peerConns.size === 0) return;
  for (const [peerId, entry] of peerConns) {
    const peer = peers.get(peerId);
    if (!peer || !peer.mesh) {
      // Peer sin mesh todavía — silenciar.
      if (entry.gainNode) entry.gainNode.gain.value = 0;
      else if (entry.audioEl) entry.audioEl.volume = 0;
      continue;
    }
    const dx = peer.mesh.position.x - player.pos.x;
    const dy = peer.mesh.position.y - player.pos.y;
    const dz = peer.mesh.position.z - player.pos.z;
    const d = Math.hypot(dx, dy, dz);
    let vol = 0;
    if (d < MAX_HEAR_RANGE) {
      // Falloff cuadrático suave.
      const t = 1 - d / MAX_HEAR_RANGE;
      vol = t * t * 0.9;
    }
    if (entry.gainNode) {
      entry.gainNode.gain.value = vol;
    } else if (entry.audioEl) {
      entry.audioEl.volume = vol;
    }
  }
}
