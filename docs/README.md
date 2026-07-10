# Loose Cannon — Documentation

Planning docs for a browser MMO that mixes **Syndicate** (isometric tactics & visuals), **Cannon Fodder** (named squad mortality & dark humor), and **Kingpin** (gangster recruitment, bars, attitude).

## Documents

| File | Contents |
|------|----------|
| [game-design.md](./game-design.md) | Full game vision, pillars, systems, tone, art direction summary, loops |
| [architecture.md](./architecture.md) | **Mode A:** local Node.js + in-memory WS server; Mode B deferred production; client stack; Grok pipelines |
| [prd.md](./prd.md) | Exhaustive requirements (incl. LOC-*), task breakdown, milestones, risks |

## Inspiration sources

See [`../inspiration/`](../inspiration/) for reference write-ups and screenshots:

- `syndicate.md` + `syndicate-*.png/jpg` — camera, HUD, urban pixel combat  
- `cannon-fodder.md` + `cannon-fodder-*.png/jpg` — squad humor, fragility, mission chaos  
- `king-pin.md` — crime fantasy, dialogue, posse hiring, voice/attitude  

## Backend stance (important)

Day-to-day development targets a **single local Node.js process**:

- WebSockets for gameplay  
- **In-memory** state (reset on restart)  
- No Postgres/Redis/Docker required  

Production-scale infrastructure is documented as a later migration (architecture Mode B), not the current build focus.

## Implementation status

**Documentation only.** No game code in this phase.

See [STATUS.md](./STATUS.md) for what’s implemented vs deferred.

Suggested next: more missions/turf, TTS pipeline, and art polish via Imagine → pixel atlases.
