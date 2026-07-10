# Overseer cycle log

Newest entries at the top. Each autonomous or interactive overseer cycle should append a short entry.

---

## Template

```
### YYYY-MM-DD — cycle N
- Focus: <milestone / task>
- Done: <bullet list>
- Verify: smoke/build/manual
- Next: <one line>
- Blocked: <none | reason>
```

---

## Entries

### 2026-07-11 — cycle 19 (M7 street hustles / POI)
- Focus: More street hustles / outdoor POI interactions (phone, mail, hydrant, neon, cone + fence NPC)
- Done:
  - Shared `hustles.ts`: cooldowns, heat amounts, `propHustleAction` labels
  - Protocol: `PropPublic.readyIn` for realm-wide prop cooldowns
  - Server: full outcomes for phonebooth / mailbox / hydrant / neon / cone; car jack heat + alarm; thug tip + shake; outdoor Fence Frankie (ammo/tip/mystery bag)
  - Map: extra hustle props (hydrant/cone/phone/mail); Fence Frankie on walkable street; Quentin unstuck from warehouse shell
  - Client: hover verbs (Call/Jack/Smash/…) + Wait ~Ns from `readyIn`
  - Smoke: hustle catalog + phone CD + fence tip; Doc heal before chop/cold to cut wipe flakes
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK (clean server)
- Next: **M7** rival gang variety or optional music bed
- Blocked: none

### 2026-07-11 — cycle 18 (M7 third instance)
- Focus: Third instanced mission + new building template (Cold Storage / Ice Box Eviction)
- Done:
  - Shared map: `coldstore` kind, docks exterior shell, freezer interior pocket, street props; Pier Punchers spawn moved west of shell
  - Mission `cold_storage` — clear → extract, Frost hostiles, $580 + 6 rep; board order appended
  - Client: coldstore/warehouse cyan accent; frost indoor lighting; `mi_*` layers resolve palette via template kind
  - Districts landmark "Cold Storage / east piers"; Vince rumor mentions docks freezer
  - Smoke: full cold_storage instance clear → extract → pay
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK (cold_storage instance ok)
- Next: **M7** street hustles / rival variety / optional music
- Blocked: none

### 2026-07-11 — cycle 17 (M4 parties)
- Focus: Party invite/leave + presence + party chat + co-op mission attach (within a realm)
- Done:
  - Shared: `PARTY_MAX`, `PartyState` / `PartyInvitePublic` / `PresenceEntry`; protocol party.* msgs + chat channel; snapshot party/partyInvite/presence
  - Server: `parties` map; invite by name, accept/decline/leave/kick; dissolve &lt;2; presence online list
  - Co-op: free party mates share outdoor contracts; shared instance layer `mi_<partyId>` + layer-keyed enemies; shared despawn rules
  - Party chat `/p` / channel flag; client PARTY HUD panel (roster, invite, presence)
  - Smoke: presence + invite/accept/leave in `smoke-party`
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK (clean server; first run hit known chop flake)
- Next: **M7 content** (third instance / hustles / rivals / music) or optional M4 polish
- Blocked: none

### 2026-07-11 — cycle 16 (M5 ammo clarity / balance pass)
- Focus: Ammo economy + HUD clarity + balance numbers in STATUS
- Done:
  - Shared `WeaponDef`: `ammoPerShot` / `maxAmmo` / `startingAmmo` / `refillPrice`; helpers `isUnlimitedAmmo`, `formatWeaponAmmo`, `weaponIdealDps`, `startingAmmoMap`
  - Protocol: `unit.weaponAmmo` (own posse); `shop.buyAmmo`
  - Server: per-unit ammo map; consume on fire; dry auto-swap to best fireable gun; AI unlimited; buy/loot/stash grant; pawn full refill (heat tax); wipe strips ammo
  - Client: ammo badges (low/empty), detail DPS + ammo readout, shop Ammo rows, dossier ammo line
  - Balance table: ∞ pistol/melee; limited uzi/shotgun/tommy(100/150)/minigun/flame; documented in STATUS
  - Smoke: asserts starter tommy ammo + no pistol key
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK (clean server; prior polluted runs had pathing/chop flakes)
- Next: **M4 parties** (invite/leave/shared objective within a realm)
- Blocked: none

### 2026-07-11 — cycle 15 (M6 HUD/event-log + mobile touch polish)
- Focus: Event-log / HUD readability + mobile move/fire reliability
- Done:
  - Event log: kind-colored lines (combat/cash/mission/door/system), larger type, ~12s line life, pin toggle (tap/click)
  - Toasts restored to long readable holds (wipe ~11s / downed ~8s / loot 7–9s / mission ~7.5s); mobile left-stack vs log on right
  - Objective + mission HUD contrast pass
  - Touch: long-press charge ring (delayed so taps don’t flash), attack fires on hold complete, drag cancels, larger TAP_SLOP
  - Mobile control buttons slightly larger; district map foot no longer claims soft-kick
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK
- Next: **M5 ammo/balance note** or **M4 parties** (solo loop is solid within a realm)
- Blocked: none

### 2026-07-10 — cycle 14 (M6 directional goons + walk bob)
- Focus: Directional goon presentation + walk bob polish (no new sprite sheets)
- Done:
  - Client `unitAnim.ts`: facing octants, iso screen flip, lean, two-beat walk cycle, Speed-scaled cadence
  - `worldView`: prediction/interp use shared facing + phase rates; idle uses server facing (combat aim)
  - Painted sprites: correct L/R flip (art faces right), rock lean, squash/stretch, mild bob, shadow plant
  - Procedural goons: leg stride, body/head lean toward facing, weapons along iso aim vector
  - Dancers: keep hip sway only (no walk bob)
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK (clean server; prior runs had combat/chop flakes)
- Next: **M6** HUD/event-log readability or mobile touch polish; optional M5 ammo/balance note
- Blocked: none

### 2026-07-10 — cycle 13 (M6 day/night + district lighting)
- Focus: Lightweight day/night cycle + per-district atmospheric tint
- Done:
  - Shared: `lighting.ts` — `dayPhaseFromTick` (~6 min cycle, longer night), `lightingLook` palettes (phase × district/interior)
  - Protocol: snapshot `dayPhase`
  - Server: emits phase from tick in `buildSnapshot`
  - Client world: sky background, screen wash + vignette, ground brightness, neon windows/signs, rain density, unit/prop tint; club/bar indoor warmth
  - District flavor: neon_edge magenta, docks teal, war_deep bloody, downtown warm
  - HUD: DAWN/DAY/DUSK/NIGHT badge on cash/rep row
  - Smoke: asserts valid `dayPhase`
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK (dayPhase dawn)
- Next: **M6 presentation** — directional goons / walk bob, or HUD/mobile readability / touch polish
- Blocked: none

### 2026-07-10 — cycle 12 (M6 missions verified + M5 cover/LoS)
- Focus: Confirm M6 job pack already in code; ship true wall LoS + soft cover
- Done:
  - **M6 missions** (already live, docs were stale): `still_not_guns`, `parking_tax`, `chop_shop_raid`, `rail_rats` — map props/AI/garage wired; smoke covers still_not_guns + chop extract
  - Shared: `los.ts` (`castLineOfSight`, `hasAdjacentCover`); `COMBAT.coverHitPenalty`; protocol FX kind `blocked`
  - Server: wall/void blocks shots; soft cover −10% hit; AI prefers LoS targets; combat log on brick
  - Client: BLOCKED tracer/sparks/float; miss SFX on blocked
  - Guts tooltips mention cover + full LoS
- Verify: `npm run build` OK; LoS unit check `LOS_UNIT_OK`; `npm run smoke` → SMOKE_OK (one flaky chop wipe re-ran clean)
- Next: **M6 presentation polish** (day/night tint, directional goons, HUD/mobile) or M5 ammo/balance note
- Blocked: none

### 2026-07-10 — cycle 11 (M5 enemy AI roles + weapon feel)
- Focus: Shooter / rusher / coward AI + range ring + hit/miss readability
- Done:
  - Shared: `AiCombatRole`, `preferredEngageRange`, `assignAiPosseRoles`, labels
  - Protocol: optional `unit.aiRole` on snapshot
  - Server: role-flavored gear on street AI + warehouse hostiles; `assignAiRoleCombat` (hold band / charge / flee when low HP); aggro log role mix
  - Client: HOLD/RUSH/FLEE badges; selected-unit iso weapon range ring; miss whiz tracer; heavier heavy-gun hit FX
  - Smoke: asserts bay hostiles all have `aiRole`
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK (bay AI roles shooter,rusher)
- Next: **M6 more missions** (2+ new jobs) or M5 cover/LoS / balance note
- Blocked: none

### 2026-07-10 — cycle 10 (M5 path around building shells)
- Focus: Click-move routes around façades; stuck repath (no more straight-line shell glue)
- Done:
  - Shared: `pathfind.ts` octile A*, no corner-cut, axis-aligned simplify; exported from index
  - Server: unit `path` + `stuckTicks`; `setUnitNav` / `parkUnit`; long orders pathfind; escort short-hops skip A*
  - Step: follow waypoints; repath on jam; skip stuck waypoint; hard park as last resort
  - Smoke: single-click spawn → bar door (direct path assertion)
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK (direct path 8.50, 15.20)
- Next: **M5 combat/AI feel** (hit feedback / enemy roles / weapon feel) or **M6 more missions**
- Blocked: none

### 2026-07-10 — cycle 9 (M3 goon stats feel)
- Focus: Aim / Muscle / Guts / Speed feel distinct in combat + UI
- Done:
  - Shared: `combat.ts` formulas (hit, crit, power, melee muscle, guts toughness, speed move + fire CD); `streetRole`, recruit archetypes, tooltips helpers
  - Constants: retuned COMBAT so stats swing outcomes harder
  - Server: uses shared formulas; fire CD scales with Speed; hire archetypes with role dialogue/log; train log shows A/G/M/S
  - Client: role badges, combat preview line, stat effect tooltips; crew editor legend; prediction uses unit Speed
  - Shop upgrade copy describes real effects
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK (hire log shows archetype e.g. smartass)
- Next: **M5 pathing around shells** or combat/AI feel; then more missions
- Blocked: none

### 2026-07-10 — cycle 8 (M3.5 realms + memorial status fix)
- Focus: Memorial was already live (docs stale); implement M3.5 segregated realms
- Done:
  - Shared: `realms.ts` (normalize/default/`realmLabel`); protocol `auth.realm?`, `auth.ok.realmId`, `you.realmId`
  - Server: multi-`GameWorld` host in `index.ts`; route auth/handle/leave by realm; prune empty named realms; `/health` byRealm
  - Client: login Realm field; `?realm=` / `?name=` prefill; HUD REALM + INVITE copy link
  - Smoke: default `public`, isolation `smoke-alpha` vs public, invalid realm reject
  - STATUS/MASTER_PLAN: memorial + realms marked done
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK
- Next: **Goon stats feel** (Aim/Muscle/Guts/Speed outcomes + UI)
- Blocked: none

### 2026-07-10 — realms specification
- Focus: Spec segregated multiplayer “realms” for friend groups without auth
- Done:
  - New `docs/realms.md` (login field, `?realm=` / `?name=`, isolation rules, protocol, Mode A + beta in-memory multi-world)
  - architecture.md Mode A diagram updated for `Map<realmId, RealmWorld>`
  - MASTER_PLAN M3.5 checklist + priority; STATUS/AGENTS/overseer prompts/skill aligned
- Verify: docs only (implementation not started)
- Next: implement realms per acceptance criteria in realms.md (or memorial wall if still first)
- Blocked: none

### 2026-07-10 — overseer refresh (manual / pre-long-loop)
- Focus: Align overseer roadmap with post-manual product; feel fixes for long unattended run
- Done:
  - Free outdoor roam (removed district soft-kick / move clamp); map ping walks anywhere
  - Kill/wipe/loot notify toasts linger much longer (killed ~11s, downed ~8s, loot/mission ~7–9s)
  - Event log lines linger longer
  - MASTER_PLAN / STATUS / OVERSEER / AGENTS / cycle+bootstrap prompts / overseer-cycle skill updated
  - Priority for loop: M3 memorial wall → goon stats → combat/pathing → more missions → parties
  - Guardrails: do not re-add soft-kicks; preserve club, combat-scene art, mobile full-screen dialogue, 18+ tone
- Verify: client/server build green prior; restart server when testing roam
- Next: **Memorial wall** (first incomplete M3)
- Blocked: none

### 2026-07-10 — cycle 7 (combat-scene graphics pass)
- Focus: Close the gap between live UI and `public/art/combat-scene.jpg`
- Done:
  - Ground: solid wet asphalt (no sparse grass grid), crosswalks, puddles, cracks, manholes, cones, traffic lights, rain denser
  - Buildings: brick lines, more neon windows/signs, door awnings, stronger outlines
  - Units: painted goon sprites (m/f + bartender) via Pixi; detailed procedural fallback
  - Props: taxi/dumpster/motorcycle/phonebooth/cone/mailbox sprites + denser map props
  - Script: `scripts/process-sprites.py` chroma-key pipeline for Imagine assets
- Verify: `npm run build` OK; smoke pathing flake unrelated to art
- Next: memorial wall or more sprite variants / walk frames
- Blocked: none

### 2026-07-10 — cycle 6 (M3 district map UI)
- Focus: District unlock + city map UI (“where can I go”)
- Done:
  - Shared: `districts.ts` (5 regions, bounds, minRep, danger); snapshot `districts` + `you.district*`; `map.ping`
  - Server: unlock from rep; soft-kick locked outdoor tiles; map ping → move if unlocked
  - Client: MAP button + M key modal (canvas sketch + district list); objective shows current district
  - Smoke: asserts 5 districts, war_deep locked at rep 0
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK
- Next: M3 memorial wall or goon stats feel pass
- Blocked: none

### 2026-07-10 — cycle 5 (M3 heat + rep gates)
- Focus: Heat meter + reputation-gated shop stock
- Done:
  - Shared: `progression.ts` (HEAT, shopPrice, heatBand, layLow); `minRep` on weapons/armor/upgrades; `you.heat` in protocol
  - Server: heat on kills/jobs/protection; decay; Vince lay_low bribe; shop rep gates + heat markup
  - Client: Heat HUD badge; shop locked/rep labels; heat-tax prices (`*`)
  - Smoke: asserts heat after soft job and after warehouse combat
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK
- Next: M3 district unlock / map UI, or memorial wall / goon stats feel
- Blocked: none

### 2026-07-10 — cycle 4 (M2 tutorial / first session)
- Focus: Tutorial first-session flow (name → bar → hire → Rita → job → pay)
- Done:
  - Shared: `tutorial.ts` steps + `TutorialState` on snapshot + `tutorial.skip`
  - Server: new players start `go_bar`; advance on enter bar / hire / open board / accept / complete; +$100/+1 rep finish; skip
  - Client: tutorial coach panel + objective strip; onboard final slide mentions the loop
  - Smoke: asserts tutorial steps through first job completion
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK (tutorial + smash + warehouse + shop)
- Next: **M3 heat / rep gates** (first incomplete after M2)
- Blocked: none

### 2026-07-10 — cycle 3 (M2 mission instances)
- Focus: Private mission instance layer + extract/fail for Warehouse Wipe
- Done:
  - Shared: `warehouse_raid` + instance def; objectives `clear_hostiles` / `extract`; runtime phase `extract`/`failed`/`instanced`
  - Server: `mi_<posseId>` private layer (warehouse template), combat-enabled, hostiles spawn, extract door, fail on wipe, abandon/disconnect cleanup; AI fights same layer
  - Client: extract HUD styling + INSTANCE/EXTRACT objective tags
  - Smoke: outdoor smash + full warehouse instance clear → extract → pay
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK
- Next: M2 tutorial / first-session flow (name → bar → hire → first job); then M3 heat
- Blocked: none

### 2026-07-10 — cycle 2 (M2 job board + starter missions)
- Focus: M2 vertical slice — fixer job board, 3 outdoor missions, server rewards, client UI
- Done:
  - Shared: `missions.ts` catalog + protocol (`JobBoardState`, `MissionRuntime`, jobBoard/mission msgs, mission notify)
  - Server: Rita “Got work?” opens board; accept/abandon; hold / prop / kill objectives; cash+rep pay (idempotent)
  - Client: job board modal, mission HUD strip, objective bar, mission toasts
  - Smoke: bar → Rita → accept smash_stash → complete → pay → shop → reconnect
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK (job pay + hub)
- Next: M2 remaining — private mission instance room **or** tutorial first-session flow; then M3 heat
- Blocked: none

### 2026-07-10 — cycle 1 (bootstrap / M1 harden)
- Focus: M1 harden — confirm tools, fix build, harden smoke, document bugs
- Done:
  - Repo layout confirmed (client / server / shared monorepo)
  - Fixed `packages/server` TS build: AI wipe respawn `threat` union (store `threat` on `Posse`)
  - Hardened `smoke.mjs`: correct bar/shop door + dealer coords; hard-fail on hub breaks; light reconnect check
  - Documented known Mode A limits in STATUS
- Verify: `npm run build` OK; `npm run smoke` → SMOKE_OK (bar hire, pawn shop, reconnect)
- Next: **M2 job board** — Rita Fix opens board; accept mission; server-side runtime + rewards (first vertical slice)
- Blocked: none

### 2026-07-10 — setup
- Focus: Install overseer automation (AGENTS.md, MASTER_PLAN, scripts, skill)
- Done: Scaffold only; no gameplay code this cycle
- Verify: n/a
- Next: M1 harden or M2 job board (first incomplete content-spine item)
- Blocked: none
