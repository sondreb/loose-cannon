# Implementation Status

Last updated: 2026-07-11 (cycle 35 — smoke hang + extract limp harden; Mode A backlog empty)  
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
| **Indoor / combat micro-path** | **Done** | Walk-line clear check; blocked short hops A*; indoor snap; Doc clears downed |
| **Enemy AI roles** | **Done** | Shooter / rusher / coward; role gear + engage bands; HUD badges |
| **Weapon range readability** | **Done** | Selected-unit iso range ring (war / combat) |
| **Hit / miss feedback** | **Done** | Miss whiz tracers; heavier shotgun/minigun/tommy hit FX |
| **Cover / LoS** | **Done** | Walls/void block shots; soft cover near walls; BLOCKED FX |
| **Ammo economy** | **Done** | Limited specials; ∞ pistol/melee; HUD counts; pawn refill |
| **More missions (M6)** | **Done** | +5 jobs: still_not_guns, parking_tax, chop_shop_raid, rail_rats, pier_punch |
| **Mission feedback polish** | **Done** | Payday / fail SFX + toast kickers; notify `outcome` |
| **Safe-zone fire log spam** | **Done** | Throttled holster / dry-ammo / assassinate combat logs |
| **Third instance (M7)** | **Done** | Cold Storage template + `cold_storage` Ice Box Eviction |
| **Fourth instance (M7+)** | **Done** | Church template + `chapel_cleanse` Chapel Cleanse |
| **Street contract pack (M7+)** | **Done** | `toll_booth` / `keep_frozen` / `viper_nest` on orphan props + Vipers |
| **Rival kill pack (M7+)** | **Done** | `lot_ride` / `silk_hit` / `chrome_out` — Lot / Slicks / Chrome bosses |
| **Temple pack (M7+)** | **Done** | `temple_sweat` gym dual-use instance + `west_wreck` outdoor kill |
| **Outdoor Choir kill (M7+)** | **Done** | `last_hymn` — Choirmaster (`ai_church`) south of Our Lady |
| **Street hustles / POI (M7)** | **Done** | Phone/mail/hydrant/neon/cone hustles; fence NPC; prop `readyIn` |
| **Rival gang variety (M7)** | **Done** | Per-gang names, gear, role bias, aggro/detect ranges; instance flavors |
| **Music bed (M7)** | **Done** | Title / explore / action MP3 loops @ ~0.12; Settings mute; gesture unlock |
| **Day/night + district light** | **Done** | ~6 min cycle; sky/overlay/neon/rain; district tints; HUD phase |
| **Directional goons / walk bob** | **Done** | Iso screen flip; two-beat bob + lean; speed cadence; idle server facing |
| **HUD / event-log readability** | **Done** | Kind-colored log lines; pin-to-read; stronger objective/toasts/mission HUD |
| **Mobile touch polish** | **Done** | Long-press charge ring + fire on hold; drag cancel; larger slop; control hit targets |
| **Parties / co-op** | **Done** | Invite/leave/kick; presence; party chat; shared jobs |
| **M4 party polish** | **Done** | Kick/leave confirm; shared hold meter; wipe loot split |
| **Crash Pad stash UX** | **Done** | Tutorial step + crew chips + cash half/all + risk banner |
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
| `cold_storage` | Ice Box Eviction | Instance (coldstore) | Clear → extract | $580 + 6 rep |
| `pier_punch` | Pier Punch | Outdoor | Kill Pier Punchers boss | $480 + 4 rep |
| `chapel_cleanse` | Chapel Cleanse | Instance (church) | Clear → extract | $540 + 5 rep |
| `toll_booth` | Unofficial Toll | Outdoor | Hold `p2` ~15s | $430 + 4 rep |
| `keep_frozen` | Keep Frozen | Outdoor | Crate `cr3` (84, 56) | $320 + 2 rep |
| `viper_nest` | Viper Nest | Outdoor | Kill Neon Vipers boss | $650 + 7 rep |
| `lot_ride` | Lot Ride | Outdoor | Kill Lot Lizards boss | $540 + 5 rep |
| `silk_hit` | Silk Hit | Outdoor | Kill Southside Slicks boss | $560 + 6 rep |
| `chrome_out` | Chrome Out | Outdoor | Kill Chrome Fists boss | $530 + 5 rep |
| `temple_sweat` | Temple Sweat | Instance (gym) | Clear → extract | $560 + 5 rep |
| `west_wreck` | West End Wreck | Outdoor | Kill West End Wreckers boss | $510 + 5 rep |
| `last_hymn` | Last Hymn | Outdoor | Kill Choir of Pain boss | $500 + 5 rep |

### Tutorial (live)

`go_bar` → `hire_vince` → `talk_rita` → `take_job` → `finish_job` → **`stash_pad`** (+$100 / +1 rep on open). Skip supported.

### Crash Pad stash (live)

- Building: **Your Crash Pad** (`safehouse`) — green roof west of the bar; door ~(8, 26)
- E inside (away from exit mat) opens stash panel; pocket cash + street gear drop on wipe; house stash does not
- Cash: **Stash all / half**, **Take all / half**; loadout dump on selected goon
- Crew chips in-panel (same pattern as pawn) to switch who deposits / withdraws gear
- Risk banner when pocket ≥ $50; legend strip pocket-vs-house; item rows note wipe risk
- Tutorial step `stash_pad` after first job; Vince/Rita tips mention banking at the Crash Pad
- HUD `⌂$N` when stash cash &gt; 0; smoke: open → bank half → deposit/withdraw tommy

### Districts

| Id | Name | minRep | Outdoor walk |
|----|------|--------|--------------|
| downtown | Safe Downtown | 0 | Always |
| war_fringe | War Fringe | 0 | Always — Our Lady / Wreckers west |
| neon_edge | Neon Edge / Titty Twister | 0 | Always — Iron Temple / Twister landmark |
| war_deep | Deep War Zone | 3* | Always (*advisory) |
| docks | Pier District | 5* | Always (*advisory) — Cold Storage landmark |

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
- Shared `isWalkLineClear`: sample segment so **blocked short hops** (indoor corners, façade graze, combat micro) use A* instead of straight-line + slide  
- Server `setUnitNav`: clear micro stays slide; blocked / medium+ hops pathfind; combat formation reuses / nudges path when goal only jittered  
- Indoor click destinations snap to nearest walkable tile; stuck recovery works indoor + outdoor  
- Combat AI / front-line / escort: pathfind when hop &gt; ~2 or line blocked (not only long outdoor approaches)  
- Doc Bandage full heal clears **incapacitated** (downed boss no longer limps at 0.35× after stitch)  
- Successful **instance extract** also clears downed limp on living crew (walk out at full speed)  
- Smoke: SE bar façade micro-hop + indoor bar corner; chop hostiles count all AI (not only `/chop/` names)

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

### Ammo (live)

Server-authoritative; AI ignores ammo (always free fire). Players:

| Weapon | DMG | RNG | CD | Ideal DPS | Ammo | Refill |
|--------|-----|-----|-----|-----------|------|--------|
| Lead Pipe | 12 | 1.2 | 0.55 | ~22 | ∞ | — |
| Switchblade | 16 | 1.3 | 0.40 | ~40 | ∞ | — |
| Cheap Pistol | 22 | 5.5 | 0.42 | ~52 | ∞ | — |
| Uzi | 14 | 5.0 | 0.11 | ~127 | 90 (start 60) | $40 |
| Shotgun | 48 | 3.4 | 0.85 | ~56 | 24 (start 16) | $55 |
| Machine Gun | 20 | 6.0 | 0.10 | ~200 | 150 (start 100) | $70 |
| Minigun | 16 | 7.0 | 0.055 | ~291 | 200 (start 120) | $120 |
| Flamethrower | 28 | 3.8 | 0.18 | ~156 | 50 (start 35) | $90 |

- Snapshot `unit.weaponAmmo` (own posse only); unlimited guns omit keys  
- Consume 1 round per fire attempt (hit / miss / brick)  
- Dry special → auto-swap to best fireable owned gun (pistol never dries)  
- Pawn-O-Matic: **Ammo · [weapon]** rows top up to max (heat tax applies)  
- Buy / loot / stash-withdraw grants starting ammo if new ownership  
- HUD: count badges on icons (low / empty colors); detail line shows `cur/max` or ∞ + ideal DPS  
- Smoke: asserts starter `weaponAmmo.tommy` and no `pistol` key  

### M6 extra missions (live)

- Board order: starter 4 + `still_not_guns`, `parking_tax`, `chop_shop_raid`, `rail_rats`, `pier_punch`, `chapel_cleanse`, street pack, rival kill pack, temple pack, `last_hymn`  
- Map: `cr2`, `p3`, `ai_rats`, garage / coldstore / church instance templates; pier job targets `ai_docks` ~(84, 52)  
- Smoke: asserts M6 offers (incl. pier_punch); completes still_not_guns + full chop/cold/chapel extracts  

### Street contract pack (live)

- Orphan outdoor content wired to Rita’s board (no new shells):  
  - **`toll_booth`** — hold unofficial toll prop `p2` ~(72, 48) ~15s; $430 + 4 rep  
  - **`keep_frozen`** — smash docks crate `cr3` ~(84, 56); $320 + 2 rep  
  - **`viper_nest`** — kill Neon Vipers boss (`ai_neon` / Queen Fang) ~(92, 62); elite $650 + 7 rep  
- Vince/Rita tip + phone tip line mention toll strip / freeze crate / vipers  
- Smoke: asserts three offers; full complete for `keep_frozen`

### Rival kill pack (live)

- Ambient war-zone gangs wired to Rita’s board (no new shells):  
  - **`lot_ride`** — drop Lot Lizards Road Captain (`ai_lot`) ~(52, 76); $540 + 5 rep  
  - **`silk_hit`** — drop Southside Slicks Silk Capo (`ai_south`) ~(78, 55); $560 + 6 rep  
  - **`chrome_out`** — drop Chrome Fists Iron Hands (`ai_chrome`) ~(65, 48); $530 + 5 rep  
- Vince/Rita tip + phone tip line mention lizards / slicks / chrome knuckles  
- Smoke: asserts three offers on the board  

### Outdoor Choir kill (live)

- **`last_hymn`** — drop Choir of Pain Choirmaster (`ai_church`) ~(28, 58) south of Our Lady; $500 + 5 rep  
- Complements indoor `chapel_cleanse` (instance Choir) with a street beat for the ambient fringe crew  
- Vince/Rita + phone tip lines mention Choir outside Our Lady  
- Smoke: asserts `last_hymn` on the board  

### Temple pack (live)

- **`temple_sweat`** — Iron Temple gym dual-use: private clear → extract on existing `gym` template; Iron-labeled hostiles (threat 2, rush bias, pipes/shotguns); $560 + 5 rep  
- Coach Brick + gym training stay on hub `gym`; instance clones interior only (same dual-use pattern as church memorial + chapel_cleanse)  
- Client: gym amber/sweat indoor lighting (`lightingLook` gym/temple); exterior gym gold accent already live  
- **`west_wreck`** — drop West End Wreckers Foreman (`ai_west`) ~(18, 50); $510 + 5 rep  
- Vince/Rita + phone tip lines mention Wreckers + Iron Temple after hours  
- Smoke: asserts both offers; full temple_sweat clear → extract → pay  

### Mission feedback (live)

- Protocol `notify` mission `outcome`: `"complete"` | `"failed"` (optional)  
- Client: **PAYDAY** toast + procedural `payday` SFX on complete; **JOB FAILED** + `jobFail` SFX on fail  
- Generic contract pings (accept) keep blue CONTRACT styling + cash click  

### Combat log throttle (live)

- Server `logThrottled`: safe-zone holster (~5s), dry ammo (~6s), assassinate re-click (~3s)  
- Clears per-posse throttle keys on disconnect  

### M7 third instance (live)

- Building: **Cold Storage** (`coldstore`) — docks shell ~(88–102, 48–58), door west; interior pocket 83–91×83–87  
- Job: `cold_storage` / **Ice Box Eviction** — private clear → extract; Frost-labeled hostiles (threat 1, pistols); $580 + 6 rep  
- Client: coldstore cyan accent; frost indoor lighting (template kind on `mi_*` layers)  
- Pier Punchers spawn shifted west of shell (84, 52); street props COLD neon + frozen crate  
- Smoke: full cold_storage clear → extract → pay  

### M7+ fourth instance (live)

- Template: **Our Lady of Bad Decisions** (`church`) — existing shell ~(22–32, 48–58); interior pocket 59–67×2–5 (hub still has Father Trouble memorial)  
- Job: `chapel_cleanse` / **Chapel Cleanse** — private clear → extract; Choir-labeled hostiles (threat 2); $540 + 5 rep  
- Instance flavor **Choir**: hold bias, pistols/blades, psalm/vesper epithets  
- Client: chapel candle-gold indoor lighting; church exterior accent gold  
- Vince/Rita tips mention chapel among sealed rooms; fringe map landmark “Our Lady / Wreckers west”  
- Smoke: full chapel_cleanse clear → extract → pay  

### M7+ fifth instance (live)

- Template: **Iron Temple** (`gym`) — existing shell ~(90–102, 8–16); interior pocket 99–107×83–87 (hub still has Coach Brick + train)  
- Job: `temple_sweat` / **Temple Sweat** — private clear → extract; Iron-labeled hostiles (threat 2); $560 + 5 rep  
- Instance flavor **Iron**: rush bias, pipes/shotguns, plate/sweat/spotter epithets  
- Client: gym amber/sweat indoor lighting; gym exterior gold accent  
- Neon-edge landmark “Iron Temple / Titty Twister”; Vince/Rita tips mention after-hours temple  
- Smoke: full temple_sweat clear → extract → pay  

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

### Parties (live)

- **Within a realm only** — invite by display name; max **4** players (`PARTY_MAX`)  
- Protocol: `party.invite` / `accept` / `decline` / `leave` / `kick`; snapshot `party`, `partyInvite`, `presence`  
- Client **PARTY** panel: roster + LEAD/job tags, online presence + INVITE, accept/decline banner, leave/kick  
- **Kick / leave confirm:** in-game modal (no `window.confirm`) before `party.kick` / `party.leave`  
- **Party chat:** `/p …` or `/party …` (or `channel: "party"`) — `[P]` lines to party only  
- **Co-op jobs:** free mates (no active mission) auto-share when anyone accepts — outdoor same contract; instance uses shared `mi_<partyId>` layer + one enemy posse; each extracts/rewards separately  
- **Shared hold:** outdoor hold jobs (Corner Tax / Parking Racket) — any party mate on the prop advances **all** shared meters once per tick; HUD shows `PARTY HOLD · N/M on point` + seconds left  
- **Wipe loot split:** cash split evenly among online living party posses; street gear copies to each recipient; PARTY LOOT toast; chat notes N-way split  
- Disconnect / leave dissolves party of &lt;2; shared hostiles only despawn when last party mate leaves the job  
- Smoke: presence; invite/accept/**kick**/leave in realm `smoke-party`  

### Street hustles / POI (live)

All outdoor props are interactable (E / click). Realm-wide cooldowns; snapshot `prop.readyIn` seconds; hover shows verb or **Wait ~Ns**.

| Kind | Action | Outcomes (server roll) |
|------|--------|------------------------|
| dumpster | Search | Cash / raccoon (−HP) / sticky blade / trash |
| crate | Search | Cash or Uzi (“farm equipment”); mission smash still completes jobs |
| protection | Collect | Cash + rep + heat (racket) |
| car / motorcycle | Jack | Cash + heat; chance of loud alarm |
| phonebooth | Call | Paid tip line (−$15, rep) / reverse-charge scam (+cash, heat) / wrong number (−HP) / dial tone |
| mailbox | Search | Checks (+cash, heat) / love letter (rep) / warrant (heat) / junk |
| hydrant | Open | Cap bribe / cool heat (−6) / face spray (−HP) / nothing |
| neon | Smash | Scrap copper (+cash, loud heat) / glass rain (−HP) / tourist pose (rep) |
| cone | Move | Union dues cash / meter-maid heat / trip (−HP) / judgment |

**Outdoor NPCs**

- Street thugs: hire ($100) + **buy tip** ($25, rep) + **shake down** (risk cash/HP/heat)  
- **Fence Frankie** (downtown street dealer, no shop): dirty ammo top-up ($55), tip, mystery bag ($40)  
- Vince / Rita tip copy mentions booths, mailboxes, freezer  

Smoke: prop catalog + phone `readyIn` + fence street_tip; heal-before-instance to cut wipe flakes.

### Rival gangs (live)

Shared `gangs.ts` profiles keyed by map spawn id — server applies on spawn/respawn.

| Id | Crew | Style | Aggro | Signature |
|----|------|-------|-------|-----------|
| `ai_dogs` | The Dumpster Dogs | rush / brawlers | high, short range | Top Dog + Mutts; pipe/blade; muscle bias |
| `ai_rats` | Rail Rats | flee / scurry | mid | Nest King; uzi/pistol; speed bias |
| `ai_south` | Southside Slicks | hold / shooters | mid | Silk Capo; tommy/uzi; aim + kevlar |
| `ai_west` | West End Wreckers | rush / demo | mid-high | Foreman; shotgun/pipe |
| `ai_lot` | Lot Lizards MC | mixed / MC | mid | Road Captain; shotgun/tommy + leather |
| `ai_church` | Choir of Pain | flee / quiet | low, long detect | Choirmaster; pistols; sizes up more than fights |
| `ai_docks` | Pier Punchers | rush / dock | mid | Wharf Boss; pipe/shotgun; guts/HP |
| `ai_neon` | Neon Vipers | hold / elite | high, long | Queen Fang; minigun/tommy + plate |
| `ai_chrome` | Chrome Fists | rush / knuckles | high, short | Iron Hands; melee muscle |

**Also:** per-posse `aggroRange` / `detectRange`; combat logs include gang blurb; instance flavors **Bay** (readable pistols), **Chop** (tools/shotguns), **Frost** (pistols/hold — no uzi lottery), **Choir** (pistols/blades, chapel), **Iron** (pipes/shotguns, gym). Smoke asserts Dogs vs Vipers names/gear. Rush/hold/flee crews always keep ≥1 signature role (smoke-stable).

### Music bed (live)

| Track | File | When |
|-------|------|------|
| Title | `/music/rain-city-ledger.mp3` | Login / splash (after first gesture) |
| Explore | `/music/neon-blackout.mp3` | Safe streets / hub |
| Action | `/music/neon-heist-run.mp3` | War zone, instanced jobs, combat hold (~14s after last bang) |

- Volume **~0.12** (under SFX ~0.55 / voice ~0.85); crossfade title→game and explore↔action  
- Settings → **Music** mute persists (`lc_audio_v1`); autoplay unlock on pointer/key  
- Prompts for more cues: [music.md](./music.md)

## Next for overseer (priority)

**Mode A near-term checklist is complete** (M0–M7 + optional packs). No incomplete MASTER_PLAN item remains short of deferred M8.

1. **Stop greenfield** until a human re-opens backlog or reports a player-facing bug  
2. Feel polish / critical bugs only if they appear (none open at cycle 35)  
3. Optional content only if a human names it (e.g. more shells, club music bed, 8-dir art, balance pass)  
4. **Never** Mode B (Postgres/auth/k8s) unless human asks  

## Known bugs / polish debt

| Item | Severity | Notes |
|------|----------|-------|
| Smoke needs live server | Ops | `npm run smoke` → `ws://127.0.0.1:3001` |
| Disconnect = wipe | Low | Mode A design |
| Five instance templates | Live | warehouse + garage + coldstore + church + gym; more optional later |
| Goon sprites single art facing | Low | L/R iso flip + lean/bob; full 8-dir art sheets still optional later |
| Instance smoke wipe | Ops | Rare chapel wipe still possible under unlucky RNG; cycle 35: extract clears downed limp; smoke WS open timeout + post-temple heal/shop path retry |

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
