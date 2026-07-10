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
