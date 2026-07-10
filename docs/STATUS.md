# Implementation Status (post interactive core session)

Last updated: 2026-07-10

## What’s live (Mode A — local Node + in-memory)

| Area | Status | Notes |
|------|--------|-------|
| Local WS server + Vite client | Done | `npm run dev` |
| Isometric map, free WASD + click move | Done | Screen-aligned WASD |
| Multi-story isometric buildings | Done | Walls, windows, roofs, doors |
| Character interpolation + walk bob | Done | Client-side smoothing |
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

## Still deferred (Mode B / later)

- Persistence (Postgres), real auth, multi-region
- Voice TTS batch, Grok Imagine → pixel atlases
- Turf wars, player gangs, seasons
- Full mission instances / matchmaking
- Mobile touch polish

## How to run

```bash
npm install
npm run dev
# client http://localhost:5173  server ws://localhost:3001
```

World resets when the server process restarts.
