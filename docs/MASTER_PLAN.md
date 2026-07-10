# Loose Cannon — Master Plan (Overseer Roadmap)

Last updated: 2026-07-10

Track completion in `docs/STATUS.md`. This file is the **ordered backlog** for autonomous development. Prefer finishing higher milestones before lower ones unless a dependency forces otherwise.

## North star

A fun, playable **local multiplayer** crime sandbox: recruit a posse, run jobs, fight on the isometric streets, spend loot, and come back for more — without production infra.

## Milestone checklist

### M0 — Foundations (mostly done)

- [x] Monorepo: client / server / shared
- [x] Local WS server + Vite client (`npm run dev`)
- [x] Shared protocol types
- [x] Azure beta deploy path (optional; not required for Mode A play)

### M1 — Vertical slice (mostly done)

- [x] Isometric city + free move + click move
- [x] Buildings / POIs / shops / dialogue / recruit
- [x] Combat + attack-move + wipe loot + respawn
- [x] Posse UI, loadout, SFX, proximity chat
- [x] Harden: `npm run smoke` green; document known bugs in STATUS
- [x] Fix any critical desync / crash on reconnect during process lifetime

### M2 — Content spine (P3 focus)

- [x] **Job board / fixer UI** — pick a mission from a hub POI
- [x] **Mission instances** — enter instance room, objectives, extract/fail *(private `mi_*` warehouse layer + outdoor jobs)*
- [x] At least **3 starter jobs** (protection, smash-and-grab, debt collection) *(+ warehouse instance)*
- [x] Mission rewards: cash, rep, optional loot (server-rolled) *(cash + rep; loot optional later)*
- [x] Briefing copy with Cannon Fodder–style cheerful understatement
- [x] Tutorial / first-session flow (name → bar → first hire → first job)

### M3 — Heat, reputation, progression

- [x] Heat meter (street heat vs wanted-style consequences) *(meter + decay + lay-low + shop markup)*
- [x] Reputation gates for shops / black market stock *(minRep on catalog items)*
- [x] Simple district unlock or map UI for “where can I go”
- [ ] Goon stats feel distinct (aim / muscle / guts matter in combat)
- [ ] Memorial wall for dead named goons (Cannon Fodder beat)

### M4 — Local multiplayer social (P4 light)

- [ ] Parties: invite, leave, shared objective when in mission
- [ ] Presence / who is online in hub
- [ ] Chat channels: proximity (done) + party
- [ ] Co-op mission start with party (same instance)

### M5 — Combat & AI depth

- [ ] Cover / line-of-sight or range readability improvements
- [ ] Enemy AI roles (shooter, rusher, civilian flee)
- [ ] Weapon feel pass (recoil audio, hit feedback, ammo clarity)
- [ ] Balance pass using smoke + manual play notes in STATUS

### M6 — Presentation polish (still Mode A)

- [ ] More POI interiors / district flavor without new backend
- [ ] Day/night or lighting tint (lightweight)
- [ ] Mobile touch basics (move + fire + interact)
- [ ] Optional art pipeline notes (Grok Imagine → pixel atlases) — assets only when needed

### M7 — Explicitly deferred (do not start unless user asks)

- [ ] Postgres / durable accounts
- [ ] Real auth (email/OAuth)
- [ ] Multi-region / matchmaking scale-out
- [ ] Full turf war seasons / player gangs at MMO scale
- [ ] Production anti-cheat pipeline

## Definition of “more complete” (near-term)

Autonomous work should stop celebrating “done” only when:

1. A new player can: join → recruit → take a **job from a board** → complete an **instanced mission** → get paid → spend money.
2. `npm run build` and `npm run smoke` pass.
3. `docs/STATUS.md` reflects the above as live.

## Cycle protocol

Each overseer cycle implements **one** primary milestone item (or a tightly related pair), then updates STATUS + OVERSEER_LOG.
