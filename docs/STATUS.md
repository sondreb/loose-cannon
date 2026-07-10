# Implementation Status (post interactive core session)

Last updated: 2026-07-10 (cycle 8 — Titty Twister club)  
Roadmap: [MASTER_PLAN.md](./MASTER_PLAN.md) · Overseer: [OVERSEER.md](./OVERSEER.md) · Log: [OVERSEER_LOG.md](./OVERSEER_LOG.md)

## What’s live (Mode A — local Node + in-memory)

| Area | Status | Notes |
|------|--------|-------|
| Local WS server + Vite client | Done | `npm run dev` |
| Isometric map, free WASD + click move | Done | Instant prediction + intent |
| PvE safe downtown / PvP war zone | Done | y&lt;38 safe; no murders north |
| Client prediction + 60 FPS path | Done | Viewport map cull, res cap |
| Multi-story isometric buildings | Done | Walls, windows, roofs, doors, neon signs, awnings |
| **Combat-scene world look** | **Done** | Solid wet asphalt, crosswalks, rain, neon puddles, street dressing |
| **Painted goon/prop sprites** | **Done** | Imagine PNGs + procedural fallback; taxi/dumpster/bike/booth |
| **The Titty Twister** | **Done** | Gentlemen's club; 3 dancers; tip $50/$120/$250 → reveal stages; VO + art |
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
| M1 harden (build + smoke) | Done | See known bugs below |
| **Job board / fixer UI** | **Done** | Rita Fix → “Got work?” → board modal |
| **Mission instances** | **Done** | Private `mi_*` warehouse layer, extract, fail on wipe |
| Mission rewards (cash + rep) | **Done** | Server-rolled; idempotent grant |
| Briefing copy (CF understatement) | **Done** | On board + accept notify |
| **Tutorial / first-session flow** | **Done** | Server coach: bar → hire → Rita → job → pay |
| **Heat meter** | **Done** | 0–100; kills/jobs/protection; decay; Vince lay low |
| **Rep gates (shop stock)** | **Done** | minRep on weapons/armor/upgrades; heat price markup |
| **District unlock / map UI** | **Done** | M key / MAP btn; rep soft-gates deep war, docks, neon |
| **Memorial wall** | Not started | MASTER_PLAN M3 |
| **Parties / co-op jobs** | Not started | MASTER_PLAN M4 |
| Automated overseer scaffolding | Done | AGENTS.md + scripts/overseer |

## Starter jobs (live)

| Id | Title | Mode | Objective | Pay |
|----|-------|------|-----------|-----|
| `smash_stash` | Smash & Grab | Outdoor | Interact crate `cr1` (44, 28) | $280 + 2 rep |
| `warehouse_raid` | Warehouse Wipe | **Instance** | Clear bay hostiles → extract at exit | $450 + 4 rep |
| `protection_corner` | Corner Tax | Outdoor | Hold prop `p1` ~12s (30, 48) | $350 + 3 rep |
| `collect_debt` | Debt Collection | Outdoor | Kill Dumpster Dogs boss | $500 + 5 rep |

### Mission instance rules (Mode A)

- Accept **Warehouse Wipe** → teleport into private layer `mi_<posseId>` (warehouse interior tiles, not shared with other players).
- Combat enabled inside (`mi_*` is not a safe zone).
- Clear spawned hostiles → **EXTRACT** phase → interact at exit door → pay + kick outdoors.
- Fail if the boss dies in the bay; abandon cleans up hostiles.
- Disconnect despawns instance hostiles.

### First-session tutorial (live)

New players start with `tutorialStep: go_bar`. Snapshot field `tutorial` drives the coach panel + objective strip.

| Step | Goal |
|------|------|
| `go_bar` | Enter The Rusty Nail |
| `hire_vince` | Hire from Vince (or street recruit) |
| `talk_rita` | Open Rita’s job book |
| `take_job` | Accept any contract |
| `finish_job` | Complete it → **+$100 / +1 rep** tutorial bonus |

Skip via coach **SKIP** (`tutorial.skip`). Login “How to Play” wizard still explains zones/controls.

### Heat & rep (live)

| System | Behavior |
|--------|----------|
| **Heat** | Snapshot `you.heat` (0–100). Gains: kill +7 (+4 boss), mission combat +8 / soft +3, protection +4. Decays out of combat; faster indoors. Vince **Lay low** bribe drops heat. |
| **Shop markup** | Heat ≥40 → ×1.15, ≥70 → ×1.35, ≥90 → ×1.5 (prices show `*`). |
| **Rep gates** | e.g. Uzi rep 2, Shotgun 4, Tommy 6, Minigun 10, Kevlar 3, Plate 7. Locked items show `REP N`. |

HUD: `Heat N` next to cash/rep (cool/warm/hot/wanted colors).

### Districts (live)

| Id | Name | minRep | Notes |
|----|------|--------|-------|
| `downtown` | Safe Downtown | 0 | Always open |
| `war_fringe` | War Fringe | 0 | Just south of tracks |
| `neon_edge` | Neon Edge | 2 | East neon / gun row |
| `war_deep` | Deep War Zone | 3 | Far south |
| `docks` | Pier District | 5 | East piers |

- Snapshot: `districts[]`, `you.districtId/Name/Unlocked`
- Soft-kick if you walk into locked turf; map ping only to unlocked centers
- UI: **M** or **MAP** button → sketch + list; click open district to walk

## Next for overseer (priority)

1. **M3 remaining:** memorial wall or goon stats feel pass.
2. Keep Mode A only (no Postgres/auth/k8s).

## Known bugs / limitations (Mode A)

| Item | Severity | Notes |
|------|----------|-------|
| Disconnect = full wipe | Low | `leave()` removes posse; rejoin is a **new** session. Acceptable for Mode A. |
| Smoke needs live server | Ops | `npm run smoke` expects `ws://127.0.0.1:3001` already up. |
| Safe-zone fire spam | Low | Firing in downtown logs repeatedly; no crash. |
| Straight-line pathing | Low | Server move is direct; smoke uses waypoints near façades. |
| Only one instanced job | Design | Outdoor jobs still shared hub; more instance templates later. |

## Still deferred (Mode B / later)

- Persistence (Postgres), real auth, multi-region
- Directional walk cycles / more goon sprite variants
- Voice TTS batch
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

### Play jobs

1. **The Rusty Nail** → **Rita Fix** → **Got work?**
2. Outdoor jobs: complete on the streets.
3. **Warehouse Wipe**: private bay → clear freeloaders → **E** at exit to extract.

### Verify

```bash
npm run build
# with server running:
npm run smoke   # hire → smash → warehouse instance → shop → reconnect
```

### Autonomous development

See [OVERSEER.md](./OVERSEER.md).
