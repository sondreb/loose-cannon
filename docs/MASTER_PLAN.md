# Loose Cannon — Master Plan (Overseer Roadmap)

Last updated: 2026-07-10 (realms + memorial done)

Track completion in `docs/STATUS.md`. This file is the **ordered backlog** for autonomous development. Prefer finishing higher milestones before lower ones unless a dependency forces otherwise.

## North star

A fun, playable **local multiplayer** crime sandbox: recruit a posse, run jobs, fight on isometric streets, spend loot, and come back for more — without production infra.

**Tone:** 18+ dark humor, strong language, violence, suggestive club content. Not family-friendly.

## Milestone checklist

### M0 — Foundations (done)

- [x] Monorepo: client / server / shared
- [x] Local WS server + Vite client (`npm run dev`)
- [x] Shared protocol types
- [x] Azure beta deploy path (optional; not required for Mode A play)
- [x] AGENTS.md + overseer scripts/skills

### M1 — Vertical slice (done)

- [x] Isometric city + free move + click move
- [x] Buildings / POIs / shops / dialogue / recruit
- [x] Combat + attack-move + wipe loot + respawn
- [x] Posse UI, loadout, SFX, proximity chat
- [x] Harden: `npm run smoke` / `npm run build`; document bugs in STATUS

### M2 — Content spine (done)

- [x] Job board / fixer UI (Rita Fix)
- [x] Mission instances (`mi_*` warehouse + outdoor jobs)
- [x] Starter jobs (smash, warehouse, protection, debt)
- [x] Mission rewards (cash + rep)
- [x] Briefing copy (CF understatement)
- [x] Tutorial / first-session flow

### M3 — Heat, reputation, progression

- [x] Heat meter + decay + Vince lay-low + shop markup
- [x] Reputation gates for shop stock
- [x] District map UI (**free roam** — rep is advisory for outdoor walk; gates remain for gear/jobs)
- [x] **Memorial wall** for dead named goons (Cannon Fodder beat)
- [ ] Goon stats feel distinct (aim / muscle / guts / speed clearly change outcomes + UI readability) — **next primary**
- [ ] Optional: crash-pad stash UX polish / stash tutorial tip

### M3.5 — Realms (segregated instances) — **done**

Full design: [realms.md](./realms.md). Friend groups on one beta/in-memory server without auth.

- [x] **Protocol:** `auth.realm?`, `auth.ok.realmId`, snapshot `you.realmId`
- [x] **Server:** multi-`GameWorld` map; isolate units/combat/chat/AI/missions per realm
- [x] **Default realm** `public` when field empty; normalize id (lowercase, `[a-z0-9_-]{1,32}`)
- [x] **Client login:** optional Realm field; prefill from `?realm=` / `?name=`
- [x] **Invite link** copy (`?realm=code`); HUD shows current realm
- [x] Name uniqueness **per realm**; empty named realms destroyed on last leave; process restart wipes all
- [x] Works on local Mode A **and** Azure beta (same in-memory multi-world process)
- [x] Smoke / health: multi-realm isolation + `/health` `byRealm`

### M4 — Local multiplayer social (P4 light)

- [ ] Parties: invite, leave, shared objective when in mission *(party is within a realm)*
- [ ] Presence / who is online in hub *(realm-scoped)*
- [ ] Chat channels: proximity (done) + party
- [ ] Co-op mission start with party (same instance, same realm)

### M5 — Combat & AI depth

- [ ] Cover / line-of-sight or range readability improvements
- [ ] Enemy AI roles (shooter, rusher, flee)
- [ ] Weapon feel pass (hit feedback, audio, ammo clarity)
- [ ] Balance pass; note numbers in STATUS
- [ ] Simple stuck-path recovery / click path that routes around building shells better

### M6 — Presentation & feel (Mode A)

- [x] Combat-scene style ground / rain / neon buildings / prop sprites
- [x] The Titty Twister (gentlemen's club, tip→reveal stages, VO, profiles)
- [x] Free outdoor roam (no district soft-kick)
- [x] Mobile full-screen dialogue/modals + larger portraits
- [x] Longer kill / wipe / loot notify toasts
- [ ] More mission templates (2–4 new outdoor or instance jobs)
- [ ] Day/night or district lighting tint (lightweight)
- [ ] Directional goon sprites / walk bob polish
- [ ] Mobile touch polish (move + fire + interact reliability)
- [ ] HUD / event-log readability pass (mobile + desktop)

### M7 — Content density (after M3 memorial)

- [ ] Second instanced mission (different template building)
- [ ] More street hustles / POI interactions
- [ ] Rival gang variety (names, gear, aggression)
- [ ] Optional music bed (procedural or loop files) — keep volume low

### M8 — Explicitly deferred (do not start unless user asks)

- [ ] Postgres / durable accounts
- [ ] Real auth (email/OAuth)
- [ ] Multi-region / matchmaking scale-out
- [ ] Full turf war seasons / player gangs at MMO scale
- [ ] Production anti-cheat pipeline

## Definition of “more complete” (near-term)

Autonomous work should treat the game as improving when:

1. New player: join → recruit → **job board** → **instanced mission** → pay → shop.
2. `npm run build` and `npm run smoke` pass after structural work.
3. `docs/STATUS.md` stays accurate.
4. Feel regressions (movement blocks, toast flash, unreadable mobile UI) are fixed when found — not left as “known forever.”

## Cycle protocol

Each overseer cycle implements **one** primary milestone item (or a tightly related pair), then updates STATUS + OVERSEER_LOG.

### Priority order for long unattended loops

1. **M3 goon stats feel** (if still incomplete)
2. **M5 combat/AI feel** or **pathing around shells**
3. **M6 more missions** / presentation polish
4. **M4 parties** only when solo loop is solid (parties live inside a realm)
5. Never M8 / Mode B unless human asks

### Guardrails

- Mode A only (in-memory server).
- No force-push, no `git reset --hard`, no secret changes, no deploy unless user asked.
- Prefer fixing player-facing bugs over greenfield features when STATUS “known bugs” or play notes are critical.
- Art: may use Grok Imagine for sprites/portraits; keep GitHub-safe (no explicit nudity in repo assets).
- 18+ tone is intentional — do not sanitize language in game copy.
