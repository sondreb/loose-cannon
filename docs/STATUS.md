# Implementation Status

Last updated: 2026-07-10 (realms + memorial confirmed)  
Roadmap: [MASTER_PLAN.md](./MASTER_PLAN.md) · Realms: [realms.md](./realms.md) · Overseer: [OVERSEER.md](./OVERSEER.md) · Log: [OVERSEER_LOG.md](./OVERSEER_LOG.md)

## What’s live (Mode A — local Node + in-memory)

| Area | Status | Notes |
|------|--------|-------|
| Local WS server + Vite client | Done | `npm run dev` |
| Isometric map, free WASD + click move | Done | Instant prediction + intent |
| **Free outdoor roam** | **Done** | District rep no longer soft-kicks / clamps walks |
| PvE safe downtown / PvP war zone | Done | y&lt;38 safe; no murders north |
| Client prediction + 60 FPS path | Done | Viewport cull (spatial), not full-map scan |
| Multi-story isometric buildings | Done | Walls, neon, awnings |
| Combat-scene world look | Done | Wet asphalt, rain, props, street dressing |
| Painted goon/prop sprites | Done | Imagine PNGs + procedural fallback |
| **The Titty Twister** | **Done** | Club; 3 dancers; tip→reveal; VO; realistic profiles |
| 18+ login warning | Done | Badge + copy on login; README warning |
| Full-screen mobile dialogue/modals | Done | Portraits readable on phones |
| **Longer kill/loot toasts** | **Done** | Wipe ~11s; downed ~8s; loot/mission ~7–9s |
| Dialogue, hire, recruit | Done | |
| Posse UI, crew editor, shops | Done | |
| Attack-move, combat, wipe loot | Done | |
| Job board / missions / tutorial | Done | |
| Heat + rep shop gates | Done | |
| District map (M) | Done | Free roam; hot zones advisory |
| **Memorial wall** | **Done** | Father Trouble / V key; epitaphs on goon death |
| **Realms** (segregated instances) | **Done** | Multi-`GameWorld`; login + `?realm=`; HUD INVITE |
| Parties / co-op | Not started | M4 (within a realm) |
| Automated overseer scaffolding | Done | AGENTS + scripts/overseer |

## Starter jobs (live)

| Id | Title | Mode | Objective | Pay |
|----|-------|------|-----------|-----|
| `smash_stash` | Smash & Grab | Outdoor | Crate `cr1` (44, 28) | $280 + 2 rep |
| `warehouse_raid` | Warehouse Wipe | Instance | Clear → extract | $450 + 4 rep |
| `protection_corner` | Corner Tax | Outdoor | Hold `p1` ~12s | $350 + 3 rep |
| `collect_debt` | Debt Collection | Outdoor | Kill Dumpster Dogs boss | $500 + 5 rep |

### Tutorial (live)

`go_bar` → `hire_vince` → `talk_rita` → `take_job` → `finish_job` (+$100 / +1 rep). Skip supported.

### Districts

| Id | Name | minRep | Outdoor walk |
|----|------|--------|--------------|
| downtown | Safe Downtown | 0 | Always |
| war_fringe | War Fringe | 0 | Always |
| neon_edge | Neon Edge / Titty Twister | 0 | Always |
| war_deep | Deep War Zone | 3* | Always (*advisory) |
| docks | Pier District | 5* | Always (*advisory) |

Rep still gates **shop stock** and some content; map shows HOT / recommended rep.

### Club (The Titty Twister)

- Building id `club_neon`, east neon strip door ~(96, 28)
- Venus Static (bartender); dancers Cherry Bomb / Sable Sin / Lola Cash
- Tip $50 → $120 → $250 for reveal stages 0→2 (per-posse)
- Profiles: `/art/club/profiles/portrait-{a,b,c}-{0,1,2}.jpg` (clothed, GitHub-safe)
- Voice: `public/voice/dancer_*.mp3`

### Realms (live)

- Empty realm field → **`public`**
- Normalize: lowercase, `[a-z0-9_-]{1,32}`
- Login field + URL `?realm=` / `?name=` prefill
- HUD **REALM · …** + **INVITE** copies share link
- Server: `Map<realmId, GameWorld>`; empty named realms destroyed on last leave
- `/health` → `{ ok, realms, players, byRealm }`
- Smoke asserts isolation (`smoke-alpha` vs public) + invalid realm reject

### Memorial (live)

- Named goon deaths → `memorials[]` (epitaph + cause, max 32)
- Father Trouble (church) → “Visit the memorial wall”
- Hotkey **V**; notify toast on death
- Boss leader death does not create a memorial entry (respawn path)

## Next for overseer (priority)

1. **Goon stats feel** — combat + UI so Aim/Muscle/Guts/Speed clearly matter  
2. **Pathing / combat feel** — better routes around shells; hit feedback  
3. **More missions** — 2+ new jobs  
4. **M4 parties** after solo loop feels solid (scoped per realm)  
5. **Never** Mode B (Postgres/auth/k8s) unless human asks  

## Known bugs / polish debt

| Item | Severity | Notes |
|------|----------|-------|
| Straight-line pathing into buildings | Medium | Server slides; still no full A* |
| Smoke needs live server | Ops | `npm run smoke` → `ws://127.0.0.1:3001` |
| Safe-zone fire spam logs | Low | No crash |
| Disconnect = wipe | Low | Mode A design |
| Only one instance template | Design | Add more in M6/M7 |
| Goon sprites one facing | Low | Flip + procedural fallback |

## Still deferred (Mode B)

- Persistence, real auth, multi-region, seasons, production anti-cheat  
- Realm passwords / ACL / paid private servers (realms stay share-code only)

## How to run

```bash
npm install
npm run dev
# client http://localhost:5173  server ws://localhost:3001
# optional: http://localhost:5173/?realm=friday-night
```

```bash
npm run build
# server up:
npm run smoke
```

### Autonomous development

See [OVERSEER.md](./OVERSEER.md). Long loop: `.\scripts\overseer\overseer-loop.ps1 -Yolo -SleepSeconds 90`
