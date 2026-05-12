// Smoke test: 2 jugadores headless juegan una mano completa.
// Lanzar con: node smoke.js (mientras el servidor esta arriba en :3030)
import WebSocket from 'ws';

function client(name) {
  const ws = new WebSocket('ws://localhost:3030');
  const c = { ws, name, id: null, lastState: null, queue: [] };
  ws.on('message', raw => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'welcome') c.id = m.id;
    if (m.t === 'state') c.lastState = m.state;
    if (m.t === 'error') console.log(`[${name}] ERROR:`, m.message);
    c.queue.push(m);
  });
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name })));
  c.send = (p) => ws.send(JSON.stringify(p));
  c.waitState = async () => {
    for (let i = 0; i < 50; i++) {
      if (c.lastState) return c.lastState;
      await sleep(50);
    }
    return null;
  };
  return c;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const a = client('Alice');
  const b = client('Bob');
  await sleep(300);
  // Alice crea mesa
  a.send({ t: 'createTable', name: 'Smoke', maxPlayers: 4, ante: 5, startingStack: 200 });
  await sleep(200);
  // Bob entra a la mesa de Alice (la nueva sera la ultima)
  // Pedimos lobby reciente
  const lastLobby = a.queue.filter(m => m.t === 'lobby').pop();
  const smokeTable = (lastLobby?.tables || []).find(t => t.name === 'Smoke');
  if (!smokeTable) { console.log('No se encontro mesa Smoke'); process.exit(1); }
  b.send({ t: 'joinTable', tableId: smokeTable.id });
  await sleep(200);
  // Iniciar mano
  a.send({ t: 'startHand' });
  await sleep(300);

  // Bucle: el que tenga turno hace una accion simple (call / check / fold)
  for (let step = 0; step < 60; step++) {
    const stateA = a.lastState;
    if (!stateA) { await sleep(100); continue; }
    if (stateA.phase === 'showdown' || stateA.phase === 'waiting') break;
    const turn = stateA.toAct;
    let actor = null;
    if (turn === a.id) actor = a;
    else if (turn === b.id) actor = b;
    if (!actor) { await sleep(100); continue; }
    const me = actor.lastState.players.find(p => p.id === actor.id);
    const toCall = Math.max(0, actor.lastState.currentBet - me.bet);
    if (toCall > 0) actor.send({ t: 'act', action: { type: 'call' } });
    else actor.send({ t: 'act', action: { type: 'check' } });
    await sleep(120);
  }

  // Imprimir resultado
  const last = a.lastState;
  console.log('\n=== RESULTADO ===');
  console.log('Fase:', last.phase);
  console.log('Comunitarias:', last.community);
  for (const p of last.players) {
    console.log(`- ${p.name} stack=${p.stack} hole=${JSON.stringify(p.hole)} ${p.handName || ''} ${p.isWinner ? 'WIN' : ''}`);
  }
  console.log('Ganadores:', last.lastWinSummary);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
