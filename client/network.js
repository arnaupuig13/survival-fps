// WebSocket client. v1.1 — supports etype'd enemies, sleeping flag, town
// layouts and boss banner. Auto-detects ws:// vs wss:// from page protocol.

import {
  spawnEnemy, removeEnemy, wakeEnemy, triggerEnemyAttack,
  spawnPeer, removePeer, peers, enemies, setPeerName, showPeerBubble, setPeerHP,
} from './entities.js';
import { setTownLayouts } from './towns.js';
import { setPoiLayouts } from './poi.js';
import { spawnCrate, removeCrate } from './loot.js';

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
    this.onBanner = null;
    this.onEnemyDead = null;
    this.onLootGranted = null;
    this.onTimeUpdate = null;
    this.onChat = null;
    this.onGrenade = null;
    this.onGrenadeBoom = null;
    this.onWave = null;
    this.onDifficulty = null;
    this.onWeather = null;
    this.onHeliTrader = null;
    this.onStorm = null;
    this.onSupplyDrop = null;
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
      if (msg.towns) setTownLayouts(msg.towns);
      if (msg.pois) setPoiLayouts(msg.pois);
      for (const peer of msg.peers) spawnPeer(peer);
      const initial = msg.enemies || msg.zombies || [];
      for (const en of initial) spawnEnemy(en);
      for (const c of (msg.crates || [])) spawnCrate(c);
      this.onPeerCount?.(peers.size + 1);
      if (msg.hour != null) this.onTimeUpdate?.(msg.hour, !!msg.night);
      if (msg.day != null) this.onDifficulty?.(msg.day, msg.diffMul ?? 1);
      if (msg.weather) this.onWeather?.({ kind: msg.weather });
    } else if (msg.type === 'time') {
      this.onTimeUpdate?.(msg.h, !!msg.night);
    } else if (msg.type === 'peerJoin') {
      spawnPeer(msg.p);
      this.onPeerCount?.(peers.size + 1);
    } else if (msg.type === 'peerLeave') {
      removePeer(msg.id);
      this.onPeerCount?.(peers.size + 1);
    } else if (msg.type === 'eSpawn' || msg.type === 'zSpawn') {
      const info = msg.e || msg.z;
      spawnEnemy(info);
      // Wolf snarl on spawn if it's reasonably near the player — adds the
      // "predator just appeared somewhere in the wild" cue.
      if (info && info.etype === 'wolf' && this.player) {
        const dx = info.x - this.player.pos.x;
        const dz = info.z - this.player.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 35) import('./sounds.js').then(s => s.playWolfSnarl(d));
      }
    } else if (msg.type === 'eDead' || msg.type === 'zDead') {
      removeEnemy(msg.id);
      if (msg.isBoss) this.onBanner?.('★ EL DOCTOR HA CAIDO');
      this.onEnemyDead?.(msg.id, msg);
    } else if (msg.type === 'eHit' || msg.type === 'zHit') {
      const e = enemies.get(msg.id);
      if (e) e.target.hp = msg.hp;
    } else if (msg.type === 'eAttack' || msg.type === 'zAttack') {
      triggerEnemyAttack(msg.id);
    } else if (msg.type === 'eShoot') {
      // Visual: shooter fires at (tx,tz). Could spawn a tracer in v1.2.
      // For now, just trigger the attack anim cue.
      triggerEnemyAttack(msg.id);
    } else if (msg.type === 'eWake') {
      wakeEnemy(msg.id);
    } else if (msg.type === 'snapshot') {
      // Compact: enemies = [[id,x,y,z,ry,hp,sleeping]]; players same minus sleeping.
      for (const arr of msg.z) {
        const e = enemies.get(arr[0]);
        if (!e) continue;
        e.target.x = arr[1];
        e.target.z = arr[3];
        e.target.ry = arr[4];
        e.target.hp = arr[5];
        // Server says no longer sleeping → wake the mesh pose.
        if (e.sleeping && arr[6] === 0) wakeEnemy(arr[0]);
      }
      for (const arr of msg.p) {
        if (arr[0] === this.selfId) continue;
        const p = peers.get(arr[0]);
        if (!p) continue;
        p.target.x = arr[1];
        p.target.z = arr[3];
        p.target.ry = arr[4];
        // arr[5] = hp; only repaint label if it actually changed.
        if (arr[5] != null && arr[5] !== p.hp) {
          setPeerHP(arr[0], arr[5], 100);
        }
      }
    } else if (msg.type === 'youHit') {
      this.onYouHit?.(msg.dmg, { x: msg.sx, y: msg.sy, z: msg.sz }, msg.source || 'enemy');
    } else if (msg.type === 'crateSpawn') {
      spawnCrate(msg.c);
    } else if (msg.type === 'crateTaken') {
      removeCrate(msg.id);
    } else if (msg.type === 'lootGranted') {
      this.onLootGranted?.(msg.loot, msg.crateId);
    } else if (msg.type === 'banner') {
      this.onBanner?.(msg.text);
    } else if (msg.type === 'peerName') {
      setPeerName(msg.id, msg.name);
    } else if (msg.type === 'chat') {
      this.onChat?.(msg.id, msg.name, msg.text);
      if (msg.id !== this.selfId) showPeerBubble(msg.id, msg.text);
    } else if (msg.type === 'grenadeSpawn') {
      this.onGrenade?.(msg.g);
    } else if (msg.type === 'grenadeBoom') {
      this.onGrenadeBoom?.(msg);
    } else if (msg.type === 'wave') {
      this.onWave?.(msg.state);
    } else if (msg.type === 'difficulty') {
      this.onDifficulty?.(msg.day, msg.mul);
    } else if (msg.type === 'weather') {
      this.onWeather?.(msg);
    } else if (msg.type === 'heliTrader') {
      this.onHeliTrader?.(msg);
    } else if (msg.type === 'storm') {
      this.onStorm?.(msg);
    } else if (msg.type === 'supplyDrop') {
      this.onSupplyDrop?.(msg.x, msg.z);
    } else if (msg.type === 'fire') {
      // TODO: muzzle flash from peer position.
    } else if (msg.type === 'respawned') {
      this.player.pos.set(msg.x, msg.y + 1.65, msg.z);
    }
  }

  update(dt) {
    if (!this.connected) return;
    this._sendAccum += dt;
    if (this._sendAccum < 1 / SEND_HZ) return;
    this._sendAccum = 0;
    this._send({
      type: 'pos',
      x: this.player.pos.x,
      y: this.player.pos.y - 1.65,
      z: this.player.pos.z,
      ry: this.player.yaw(),
    });
  }

  shoot(origin, dir, hitId, dmg, opts = {}) {
    this._send({
      type: 'shoot',
      x: origin.x, y: origin.y, z: origin.z,
      dx: dir.x, dy: dir.y, dz: dir.z,
      hitId, dmg,
      incendiary: !!opts.incendiary,
      silenced: !!opts.silenced,
    });
  }

  openCrate(id) { this._send({ type: 'openCrate', id }); }
  respawn(spawn) { this._send({ type: 'respawn', x: spawn?.x, z: spawn?.z }); }
  setSpawn(x, z) { this._send({ type: 'setSpawn', x, z }); }
  trySleepStat() { this._send({ type: 'sleep' }); }
  setName(name) { this._send({ type: 'name', name }); }
  chat(text) { this._send({ type: 'chat', text }); }
  throwGrenade(dx, dy, dz) { this._send({ type: 'grenade', dx, dy, dz }); }

  _send(msg) {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify(msg));
  }
}

export const network = new NetworkClient();
