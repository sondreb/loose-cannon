# Implementation Status

Last updated: 2026-07-11 (M6 HUD/event-log + mobile touch polish)  
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
| **Goon stats feel** | **Done** | Aim/Guts/Muscle/Speed combat + role UI + hire archetypes |
| **Path around shells** | **Done** | Shared grid A* + stuck repath; long click-move routes façades |
| **Enemy AI roles** | **Done** | Shooter / rusher / coward; role gear + engage bands; HUD badges |
| **Weapon range readability** | **Done** | Selected-unit iso range ring (war / combat) |
| **Hit / miss feedback** | **Done** | Miss whiz tracers; heavier shotgun/minigun/tommy hit FX |
| **Cover / LoS** | **Done** | Walls/void block shots; soft cover near walls; BLOCKED FX |
| **More missions (M6)** | **Done** | +4 jobs: still_not_guns, parking_tax, chop_shop_raid, rail_rats |
| **Day/night + district light** | **Done** | ~6 min cycle; sky/overlay/neon/rain; district tints; HUD phase |
| **Directional goons / walk bob** | **Done** | Iso screen flip; two-beat bob + lean; speed cadence; idle server facing |
| **HUD / event-log readability** | **Done** | Kind-colored log lines; pin-to-read; stronger objective/toasts/mission HUD |
| **Mobile touch polish** | **Done** | Long-press charge ring + fire on hold; drag cancel; larger slop; control hit targets |
| Parties / co-op | Not started | M4 (within a realm) |
| Automated overseer scaffolding | Done | AGENTS + scripts/overseer |

## Starter jobs (live)

| Id | Title | Mode | Objective | Pay |
|----|-------|------|-----------|-----|
| `smash_stash` | Smash & Grab | Outdoor | Crate `cr1` (44, 28) | $280 + 2 rep |
| `warehouse_raid` | Warehouse Wipe | Instance | Clear → extract | $450 + 4 rep |
| `protection_corner` | Corner Tax | Outdoor | Hold `p1` ~12s | $350 + 3 rep |
| `collect_debt` | Debt Collection | Outdoor | Kill Dumpster Dogs boss | $500 + 5 rep |
| `still_not_guns` | Still Not Guns | Outdoor | Crate `cr2` (58, 50) | $300 + 2 rep |
| `parking_tax` | Parking Racket | Outdoor | Hold `p3` ~15s | $400 + 3 rep |
| `chop_shop_raid` | Chop Shop Sweep | Instance (garage) | Clear → extract | $520 + 5 rep |
| `rail_rats` | Rail Rat Removal | Outdoor | Kill Rail Rats boss | $420 + 4 rep |

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

### Goon stats (live)

- Shared `combat.ts`: hit/crit/power/toughness/move/fire-rate formulas + `streetRole` / hire archetypes  
- **Aim** → hit % + crit; **Muscle** → damage + armor pierce (melee bonus); **Guts** → dodge + damage taken; **Speed** → move tiles/s + fire cooldown  
- Bar hires pick archetype (sharpshooter / bruiser / survivor / runner / smartass / street) with distinct stats + starter weapon flavor  
- Client: role badge, combat preview line (`Hit ~% · Crit · Pwr · t/s`), stat tooltips; prediction uses unit Speed  
- Shop training copy describes real effects; train log shows new A/G/M/S  

### Pathing (live)

- Shared `pathfind.ts`: octile A* on walkable tiles, no corner-cutting, axis-aligned simplify  
- Server `setUnitNav` on long click-move / formation hops: intermediate waypoints → slide still for WASD  
- Stuck recovery: repath every ~8 ticks of no progress; skip jammed waypoint; hard-stop after long jam  
- Smoke: single-click spawn → bar door (no multi-hop waypoints)

### Combat AI & feel (live)

- Shared `AiCombatRole`: `shooter` | `rusher` | `coward` + preferred engage ranges  
- Street AI + warehouse hostiles: role mix on spawn; rushers close (melee/shotgun), shooters hold mid band, cowards kite / flee when low HP  
- Snapshot `unit.aiRole`; client badges **HOLD / RUSH / FLEE**; aggro log notes role mix  
- Selected-unit weapon **range ring** outdoors in war zone or while fighting  
- Miss: gray whiz tracer + sparks + “miss” float; heavy weapons stronger hit blood/impact/shake  
- Smoke: bay hostiles must all carry `aiRole`

### Cover / LoS (live)

- Shared `los.ts`: `castLineOfSight` ray-march; `hasAdjacentCover` for wall-hug soft cover  
- Server: wall/void blocks bullets (doors open); melee only needs LoS when not adjacent  
- Soft cover: −10% hit chance when target adjacent to wall  
- FX: `blocked` kind — tracer to façade, sparks, **BLOCKED** float; combat log notes brick  
- AI auto-fire prefers clear-LoS targets  
- Guts tooltips mention cover + full LoS block  

### M6 extra missions (live)

- Board order: starter 4 + `still_not_guns`, `parking_tax`, `chop_shop_raid`, `rail_rats`  
- Map: `cr2`, `p3`, `ai_rats`, garage interior template for chop instance  
- Smoke: asserts all 4 offers; completes still_not_guns + full chop_shop extract  

### Day/night + district lighting (live)

- Shared `lighting.ts`: `dayPhaseFromTick`, `lightingLook(phase, district|interior, indoor)`  
- Cycle ~**6 real minutes** (longer night); phases: **dawn / day / dusk / night**  
- Snapshot `dayPhase` (server tick → all clients in a realm stay synced)  
- Client: sky background, screen wash + vignette, ground brightness, neon window/sign strength, rain density, unit/prop tint  
- District flavor: neon_edge magenta, docks teal fog, war_deep bloody, downtown warm, club interiors pink  
- HUD: cash/rep row badge **DAWN / DAY / DUSK / NIGHT**  
- Smoke: asserts `dayPhase` ∈ {dawn,day,dusk,night}

### Directional goons / walk bob (live)

- Client `unitAnim.ts`: octant facing helpers matching server; **iso screen flip** (PNG faces right → mirror when aiming left of screen)  
- Two-beat walk: bob, sway, rock lean, squash/stretch, shadow plant; cadence scales with Speed  
- Idle: soft breath + **server facing** (combat aim holds when stopped)  
- Painted sprites: flip + rotation lean + mild bob (feet stay planted); dancers keep hip sway only  
- Procedural fallback: leg stride, body/head lean, weapons aim along iso facing vector  
- Still one art sheet per goon (no full 8-dir PNGs) — readable street motion without new assets  

### HUD / event-log + mobile touch (live)

- Event log: kind classes (combat / cash / mission / door / system) with left accent + stronger panels  
- Lines linger ~12s; panel idle ~10s; tap/click **pins** log open (no hover needed on phones)  
- Notify toasts: wipe ~11s, downed ~8s, loot ~7–9s, mission ~7.5s; mobile toasts left-stacked away from log  
- Objective / mission HUD / toast titles higher contrast  
- Touch: long-press charge ring → attack fires on hold complete; drag past slop cancels; TAP_SLOP 22px  
- Mobile control buttons slightly larger hit targets; map foot copy no longer mentions soft-kick  

## Next for overseer (priority)

1. **M5 remainder** — ammo clarity / balance numbers note if combat still muddy  
2. **M4 parties** after solo loop feels solid (scoped per realm)  
3. **M7 content** — third instanced mission, rival variety, optional music  
4. **Never** Mode B (Postgres/auth/k8s) unless human asks  

## Known bugs / polish debt

| Item | Severity | Notes |
|------|----------|-------|
| Indoor / combat micro-path | Low | Short hops still straight-line + slide |
| Smoke needs live server | Ops | `npm run smoke` → `ws://127.0.0.1:3001` |
| Safe-zone fire spam logs | Low | No crash |
| Disconnect = wipe | Low | Mode A design |
| Two instance templates | Design | warehouse + garage; more in M7 |
| Goon sprites single art facing | Low | L/R iso flip + lean/bob; full 8-dir art sheets still optional later |

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
