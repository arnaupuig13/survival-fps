// WebSocket client — auto-detects URL, sends our position at 10 Hz, receives
// server snapshots and forwards them to entities.js. Damage callbacks notify
// the player module.

import { spawnZombie, removeZombie, spawnPeer, removePeer, peers, zombies, triggerZombieAttack } from './entities.js';

const SEND_HZ = 10;

function wsUrl() {
  const params = new URLSearchParams(location.search);
  const override = params.get('server');
  if (override) return override;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

class NetworkClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.selfId = -1;
    this.player = null;
    this.onYouHit = null;
    this.onPeerCount = null;
    this._sendAccum = 0;
  }

  connect(player) {
    this.player = player;
    this.ws = new WebSocket(wsUrl());
    this.ws.addEventListener('open', () => { this.connected = true; });
    this.ws.addEventListener('close', () => { this.connected = false; });
    this.ws.addEventListener('message', (e) => this._onMessage(e));
  }

  _onMessage(e) {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    if (msg.type === 'welcome') {
      this.selfId = msg.you;
      for (const peer of msg.peers) spawnPeer(peer);
      for (const z of msg.zombies) spawnZombie(z);
      this.onPeerCount?.(peers.size + 1);
    } else if (msg.type === 'peerJoin') {
      spawnPeer(msg.p);
      this.onPeerCount?.(peers.size + 1);
    } else if (msg.type === 'peerLeave') {
      removePeer(msg.id);
      this.onPeerCount?.(peers.size + 1);
    } else if (msg.type === 'zSpawn') {
      spawnZombie(msg.z);
    } else if (msg.type === 'zDead') {
      removeZombie(msg.id);
    } else if (msg.type === 'zHit') {
      const z = zombies.get(msg.id);
      if (z) z.target.hp = msg.hp;
    } else if (msg.type === 'zAttack') {
      triggerZombieAttack(msg.id);
    } else if (msg.type === 'snapshot') {
      // Compact arrays: zombies = [[id,x,y,z,ry,hp], ...], players = same shape.
      for (const arr of msg.z) {
        const z = zombies.get(arr[0]);
        if (!z) continue;
        z.target.x = arr[1];
        z.target.z = arr[3];
        z.target.ry = arr[4];
        z.target.hp = arr[5];
      }
      for (const arr of msg.p) {
        if (arr[0] === this.selfId) continue;
        const p = peers.get(arr[0]);
        if (!p) continue;
        p.target.x = arr[1];
        p.target.z = arr[3];
        p.target.ry = arr[4];
      }
    } else if (msg.type === 'youHit') {
      this.onYouHit?.(msg.dmg, { x: msg.sx, y: msg.sy, z: msg.sz });
    } else if (msg.type === 'fire') {
      // TODO v1.1: muzzle flash from peer position. For now, ignored.
    } else if (msg.type === 'respawned') {
      this.player.pos.set(msg.x, msg.y + 1.65, msg.z);
    }
  }

  // Called every frame; throttles position broadcast to SEND_HZ.
  update(dt) {
    if (!this.connected) return;
    this._sendAccum += dt;
    if (this._sendAccum < 1 / SEND_HZ) return;
    this._sendAccum = 0;
    this._send({
      type: 'pos',
      x: this.player.pos.x,
      y: this.player.pos.y - 1.65, // send feet Y, not eyes
      z: this.player.pos.z,
      ry: this.player.yaw(),
    });
  }

  shoot(origin, dir, hitId, dmg) {
    this._send({
      type: 'shoot',
      x: origin.x, y: origin.y, z: origin.z,
      dx: dir.x,   dy: dir.y,   dz: dir.z,
      hitId, dmg,
    });
  }

  respawn() {
    this._send({ type: 'respawn' });
  }

  _send(msg) {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify(msg));
  }
}

export const network = new NetworkClient();
