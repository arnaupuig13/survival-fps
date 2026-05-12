# Chiribito

Poker espanol multijugador (variante Madrid anos 50). 28 cartas, 6 rondas de apuestas, el **Color le gana al Full**.

Server Node.js + WebSocket. Cliente vanilla JS sin frameworks.

## Local

```bash
cd chiribito
npm install
npm start
# http://localhost:3030
```

Variables de entorno opcionales:
- `PORT` — puerto (default 3030)
- `HOST` — interfaz (default 0.0.0.0)

## Deploy a Render

El repo raiz ya incluye `render.yaml` con un servicio `chiribito` usando `rootDir: chiribito`.

Pasos:

1. **Push** a tu repo de Github (rama main o la que conectes a Render).
2. En el dashboard de Render: **New +** → **Blueprint** → seleccionar el repo.
3. Render detecta `render.yaml` y crea el servicio `chiribito` con plan free.
4. Esperar el build (`npm install --omit=dev`) y deploy.
5. URL final: `https://chiribito.onrender.com` (o el subdominio que Render asigne).

WebSocket funciona en cualquier plan de Render (incluido free). El cliente detecta `https:` y usa `wss://` automaticamente.

### Limitaciones del plan free

- **Filesystem efimero**: `chiribito/data/tables.json` se reinicia en cada deploy/restart. Las mesas privadas creadas se pierden al redeployar. Para persistencia real, sumar un **persistent disk** en Render (plan paid):
  ```yaml
  - type: web
    name: chiribito
    ...
    disk:
      name: chiribito-data
      mountPath: /opt/render/project/src/chiribito/data
      sizeGB: 1
  ```
- **Cold starts**: en free tier el servicio duerme tras 15 min sin trafico. Primer request despues despierta en ~30s.

## Estructura

```
chiribito/
├── server.js          HTTP + WebSocket, reconnect, achievements, persistence
├── game/
│   ├── deck.js        28 cartas (7 rangos x 4 palos)
│   ├── evaluator.js   ranking Chiribito (Color > Full)
│   ├── table.js       state machine, torneo, history, stats, sidepots
│   └── bot.js         AI heuristica
└── public/
    ├── index.html
    ├── client.js      render, animaciones, audio, voz
    ├── style.css      3 temas, 3D, mobile responsive
    ├── cards.js       renderer dual (Francesa/Espanola)
    ├── court-art.js   8 ilustraciones SVG (J/Q/K/A)
    ├── suit-svg.js    iconos SVG por palo
    ├── sounds.js      WebAudio sintetizado
    └── i18n.js        ES/EN/PT
```

## Features

**Gameplay**
- 28 cartas (8..A o 7..As espanol), 7 rangos x 4 palos
- 2 hole + 5 comunitarias, **uso obligatorio de las 2 hole**
- 6 rondas de apuestas (preflop + 5 streets)
- **Color > Full** invertido respecto al poker clasico
- Side pots para all-ins, ante en lugar de blinds
- Bots con heuristica (preflop strength + pot odds postflop)
- Salas publicas y privadas con codigo de invitacion
- Modo torneo con blinds escalando cada 3 min
- Modo espectador
- Reconexion seamless (30s de gracia)
- 8 logros desbloqueables

**Visual / UX**
- 2 estilos de baraja: francesa (♠♥♦♣) y espanola (Espadas/Copas/Oros/Bastos)
- 3 temas: Esmeralda, Cereza, Medianoche
- 3 idiomas: ES/EN/PT
- 4 angulos de camara (teclas 1/2/3 + cinema mode)
- Felt premium 3D con rail de madera, vignette, motas orbitando, halo dinamico
- Cartas con arco parabolico al repartirse, flip 3D Y, glass sheen
- Speech bubbles 3D, avatar lean, dealer button rolling
- Spotlight que sigue al jugador en turno
- Chip stacks con denominaciones reales (5/25/100/500/1000)
- Pot count-up animado, stack count-down/up por jugador
- Banner de accion grande, confeti en showdown, humo al fold
- Slow-mo automatico en showdown real
- Sonido WebAudio sintetizado (chip clinks layered, crowd murmur, voz dealer)
- Privacy mode (blur de tus cartas, hover para ver)
- Stats por jugador en sesion, hand history viewer
- Tournament leaderboard

## Reglas (resumen oficial)

Ver [chiribito.com](https://www.chiribito.com).
