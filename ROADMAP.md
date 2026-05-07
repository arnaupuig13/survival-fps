# Survival FPS — Roadmap

## v1 — base jugable (deployado)

Lo que hay ahora:
- Mundo procedural 200x200m con terreno suave + árboles + rocas + fence
- Multiplayer real: ves a otros jugadores como avatares animados
- Zombies AI server-authoritative, siempre sobre el terreno
- 1 arma (la actual rifle/pistola — toggle con `1` y `2`)
- HP + regeneración tras 5s sin recibir daño
- Death + respawn con 6s grace
- Pause menu (ESC libera el cursor → reaparece menú)

## v1.1 — sentir el combate (próximo, ~1 sesión)

- **Lobos**: criatura más rápida que el zombie, hace daño menor pero acosa
  - Un mesh nuevo (cuadrúpedo) en `client/entities.js`
  - Server: tipo `wolf` con behavior distinto (ronda, ataca cuando provocado)
- **Daño visual feedback**: hit marker más prominente, screen shake leve
- **Sonidos**: gunshot, footstep, zombie growl, hit, death
- **Más zombies con variantes**: runner (rápido) vs tank (lento, daño alto)

## v1.2 — supervivencia (~1-2 sesiones)

- **Hambre + sed**: bajan con el tiempo, daño cuando llegan a 0
- **Comida en el mundo**: bayas en arbustos, agua en estanques
- **Loot crates**: cofres dispersos con balas + comida + materiales
- **Día/noche**: sun rotation, zombies más agresivos de noche

## v1.3 — base + craft (~2-3 sesiones)

- **Building**: madera de árboles, piedra de rocas. Walls básicas
- **Crafting básico**: 5 recipes (vendaje, antorcha, hacha, pico, balas)
- **Save/load**: localStorage por session — inventario + posición + base

## v1.4 — depth (~2-3 sesiones)

- **Towns con loot tier**: 2-3 puntos de interés en el mapa
- **Vehículos**: buggy o caballo
- **Más armas**: shotgun, sniper

## Notas para el CTO

- Cada feature = una branch + commit testeado en local + merge a main
- Si algo rompe el juego, rollback con `git revert`, no parche encima
- Mantener el budget de perf: 60 FPS objetivo, max 50 entities en escena
- Server.js sigue siendo el bottleneck si hay muchos players — escalar
  cuando lleguemos a >5 jugadores concurrentes (split por shards o
  Render starter plan)
