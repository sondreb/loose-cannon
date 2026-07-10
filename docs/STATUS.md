# Implementation Status (post interactive core session)

Last updated: 2026-07-10  
Roadmap: [MASTER_PLAN.md](./MASTER_PLAN.md) · Overseer: [OVERSEER.md](./OVERSEER.md) · Log: [OVERSEER_LOG.md](./OVERSEER_LOG.md)

## What’s live (Mode A — local Node + in-memory)

| Area | Status | Notes |
|------|--------|-------|
| Local WS server + Vite client | Done | `npm run dev` |
| Isometric map, free WASD + click move | Done | Instant prediction + intent |
| PvE safe downtown / PvP war zone | Done | y&lt;38 safe; no murders north |
| Client prediction + 60 FPS path | Done | Viewport map cull, res cap |
| Multi-story isometric buildings | Done | Walls, windows, roofs, doors |
| Character interpolation + walk bob | Done | Prediction for local posse |
| Buildings enter/exit, many POIs | Done | Exit priority fixed |
| Dialogue, hire, recruit street NPCs | Done | Recruits convert NPC |
| Posse UI, portraits, upgrade tiers | Done | Glass panel styling |
| Crew editor + weapon icon bar | Done | Syndicate-style slots |
| Pawn-O-Matic / multi-shop UI | Done | Buyer chips + icons |
| Attack-move (RMB chase + fire) | Done | Action banner |
| Combat formula (aim/muscle/weapons) | Done | AI damage nerfed |
| Wipe loot (gear + cash) | Done | |
| Respawn 3s, quiet spots | Done | |
| Street hustles (dumpster, protection…) | Done | |
| Web Audio SFX | Done | Procedural |
| Glass login / modern HUD | Done | Apple-style gloss |
| Proximity chat | Done | |
| Dead goons removed from roster | Done | |
| **Job board / fixer missions** | Not started | MASTER_PLAN M2 |
| **Mission instances** (objectives/extract) | Not started | MASTER_PLAN M2 |
| **Heat / rep gates** | Not started | MASTER_PLAN M3 |
| **Parties / co-op jobs** | Not started | MASTER_PLAN M4 |
| Automated overseer scaffolding | Done | AGENTS.md + scripts/overseer |

## Next for overseer (priority)

1. Harden M1 if smoke/build fails; else start **M2 job board + first mission instance**.
2. Keep Mode A only (no Postgres/auth/k8s).

## Still deferred (Mode B / later)

- Persistence (Postgres), real auth, multi-region
- Voice TTS batch, Grok Imagine → pixel atlases
- Turf wars, player gangs, seasons
- Full matchmaking scale-out
- Mobile touch polish

## How to run

```bash
npm install
npm run dev
# client http://localhost:5173  server ws://localhost:3001
```

World resets when the server process restarts.

### Autonomous development

See [OVERSEER.md](./OVERSEER.md). Quick start (PowerShell, repo root):

```powershell
.\scripts\overseer\run-cycle.ps1              # one cycle (prompts for tools)
.\scripts\overseer\overseer-loop.ps1 -Yolo -MaxCycles 5
```
