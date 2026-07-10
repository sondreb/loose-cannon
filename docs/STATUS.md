# Implementation Status (post interactive core session)

Last updated: 2026-07-10

## What’s live (Mode A — local Node + in-memory)

| Area | Status | Notes |
|------|--------|-------|
| Local WS server + Vite client | Done | `npm run dev` |
| Isometric map, free WASD + click move | Done | Screen-aligned WASD |
| Buildings enter/exit, bars, shops | Done | Exit priority fixed |
| Dialogue, hire, recruit street NPCs | Done | Recruits convert NPC |
| Posse UI, portraits, upgrade tiers | Done | |
| Crew editor + weapon icon bar | Done | Syndicate-style slots |
| Pawn-O-Matic shop UI | Done | Buyer chips + icons |
| Attack-move (RMB chase + fire) | Done | Action banner |
| Combat formula (aim/muscle/weapons) | Done | AI damage nerfed |
| Wipe loot (gear + cash) | Done | |
| Respawn 3s, quiet spots | Done | |
| Proximity chat | Done | |
| Dead goons removed from roster | Done | |

## In this push

- Larger, denser map with more POIs/stores
- Stronger isometric art (tiles, units, gear silhouettes, VFX)
- Web Audio SFX (no asset pipeline required)
- Extra activities (hospital, gym, dumpsters, protection corners)
- Enemy gear readable on the street (armor bulk + weapon shape + tier pips)
- Funnier barks / world flavor

## Still deferred (Mode B / later)

- Persistence (Postgres), real auth, multi-region
- Voice TTS batch, Grok Imagine art pipeline to atlases
- Turf wars, player gangs, seasons
- Mobile touch polish, full content volume for launch

## How to run

```bash
npm install
npm run dev
# client http://localhost:5173  server ws://localhost:3001
```

World resets when the server process restarts.
