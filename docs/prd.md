# Loose Cannon — Product Requirements Document (PRD)

## Document Control

| Field | Value |
|-------|-------|
| Product | Loose Cannon |
| Type | Browser MMO (desktop + mobile web) |
| Status | Planning / pre-implementation |
| Related | [game-design.md](./game-design.md), [architecture.md](./architecture.md) |
| Out of scope for this doc | Production code, final balance numbers |

---

## 1. Vision & Problem Statement

**Vision:** A modern browser MMO that captures isometric squad crime-tactics (Syndicate), disposable-named-crew comedy (Cannon Fodder), and foul-mouthed gangster recruitment fantasy (Kingpin)—with a secure, cheat-resistant backend.

**Problem:** Players want a social crime sandbox with tactical missions, but classic games are single-player, dated, or first-person. Loose Cannon delivers shared-world gang progression in the browser without installs.

**Success metrics (post-launch targets — tune later):**

| Metric | Target (indicative) |
|--------|---------------------|
| D1 / D7 retention | Track baselines; aim competitive for mid-core web |
| Mission start → complete rate | > 70% for starter jobs |
| Players who recruit ≥1 goon in first session | > 60% |
| Detected critical economy exploits | 0 open for > 24h |
| p95 combat intent RTT handling | Playable under 200 ms network RTT |
| Crash-free sessions | > 99% |

---

## 2. Personas

1. **Nostalgic tactician** — loved Syndicate/XCOM; wants isometric squad control  
2. **Crime RPG fan** — wants bars, dialogue, crew building, turf  
3. **Casual web gamer** — 15-minute sessions on laptop or phone  
4. **Gang leader social** — recruits friends, runs a player gang, contests docks on weekends  
5. **Content enjoyer** — here for voice lines, humor, memorial wall stories  

---

## 3. Scope Phases

| Phase | Name | Goal |
|-------|------|------|
| P0 | Foundations | Monorepo, **local Node.js server (in-memory)**, Vite client hello |
| P1 | Vertical combat slice | Isometric map, move, shoot, AI, rewards (server-auth, RAM) |
| P2 | Posse & hub | Bar, dialogue, recruit, roster, equip |
| P3 | Content spine | Multiple missions, districts unlock, shops, heat |
| P4 | MMO social (local/LAN) | Parties, presence, chat, multi-client on one server process |
| P5 | Polish | TTS/Imagine pipelines, mobile UX, feel, content volume |
| P6 | Hardening | Optional durable store, real auth—only when going public |
| P7+ | Live / production | Scale-out infra (see architecture Mode B) |

**Development doctrine:** Prefer frontend and gameplay. Backend is a **single local Node.js process** with **in-memory storage that resets on restart**. Do not build Postgres, Redis, Kubernetes, or multi-service meshes until gameplay is proven.

---

## 4. Functional Requirements (Exhaustive)

Requirements use IDs for tracking. Priority: **P0–P3** must-ship for first playable alpha; **P4–P5** for rich local multiplayer; **P6+** production/public.

### 4.0 Local Server Runtime (Mode A — primary)

| ID | Requirement | Priority |
|----|-------------|----------|
| LOC-001 | Game server runs via a single npm script (e.g. `npm run server`) | P0 |
| LOC-002 | Server is **Node.js + TypeScript** | P0 |
| LOC-003 | Server accepts **WebSocket** connections for all realtime gameplay | P0 |
| LOC-004 | All world/player state lives **in memory** (Maps/objects) | P0 |
| LOC-005 | Process restart **wipes** all runtime state (documented, intentional) | P0 |
| LOC-006 | Boot **seeds** default hub, NPCs, shop stock, weapons, missions | P0 |
| LOC-007 | No Postgres/Redis/Docker required to develop or play | P0 |
| LOC-008 | HTTP health endpoint (e.g. `GET /health`) | P0 |
| LOC-009 | Dev identity: connect with a **display name** (no email/password required) | P0 |
| LOC-010 | Session token issued in memory for reconnect while process lives | P1 |
| LOC-011 | Room model: at least `hub:*` and `instance:*` in one process | P1 |
| LOC-012 | Broadcast game state only to connections in the same room | P1 |
| LOC-013 | Per-connection intent rate limiting | P1 |
| LOC-014 | `Store` interface with `InMemoryStore` implementation only (for now) | P1 |
| LOC-015 | Optional `POST /dev/reset` re-seeds without full process kill | P2 |
| LOC-016 | Optional `GET /dev/state` dumps store for debugging | P2 |
| LOC-017 | Server bind configurable (`0.0.0.0`) for LAN multiplayer | P2 |
| LOC-018 | Client configures server URL via env (`VITE_WS_URL`) | P0 |
| LOC-019 | Protocol version field; mismatch shows clear client error | P1 |
| LOC-020 | JSON WebSocket messages first (MessagePack optional later) | P0 |
| LOC-021 | Tick combat only for active instances (idle hubs cheap) | P1 |
| LOC-022 | Handle many concurrent WS connections without per-client tight loops | P1 |
| LOC-023 | Graceful handling of client disconnect (remove from room) | P1 |
| LOC-024 | Shared package for protocol types between client and server | P0 |
| LOC-025 | Concurrent dev script to run client + server together (optional) | P1 |

### 4.1 Account & Identity

| ID | Requirement | Priority |
|----|-------------|----------|
| ACC-001 | **Mode A:** Dev login with display name creates/finds in-memory character | P0 |
| ACC-002 | User can disconnect / reconnect with token while server is up | P1 |
| ACC-003 | User can authenticate via OAuth (at least one provider) | P6 (Mode B) |
| ACC-004 | Email + password accounts with secure hashing | P6 (Mode B) |
| ACC-005 | User must accept ToS and age gate (18+) | P6 |
| ACC-006 | User can reset password via email | P6 |
| ACC-007 | User can view active sessions and revoke them | P6 |
| ACC-008 | Support optional 2FA for account login | P7 |
| ACC-009 | Ban / suspend state (in-memory kick is enough in Mode A) | P4 / P6 durable |
| ACC-010 | Character name uniqueness with profanity filter | P2 |
| ACC-011 | Account can own multiple characters (cap configurable) | P6 |
| ACC-012 | Guest/trial mode N/A in Mode A (name login is the guest) | — |
| ACC-013 | GDPR-style data export / delete request workflow | P6 |
| ACC-014 | Device metadata logged for abuse investigation (hashed IP) | P6 |

### 4.2 Client Shell & Platform

| ID | Requirement | Priority |
|----|-------------|----------|
| CL-001 | Load game in Chromium, Firefox, Safari (latest 2 major) | P0 |
| CL-002 | Responsive layout desktop 1280×720+ | P0 |
| CL-003 | Usable layout phone portrait + landscape | P3 |
| CL-004 | Asset loading with progress bar and error recovery | P1 |
| CL-005 | Version check; block incompatible client protocol | P1 |
| CL-006 | Settings: graphics quality, audio volumes, key rebinding | P2 |
| CL-007 | Fullscreen toggle (desktop) | P2 |
| CL-008 | PWA install affordance (optional) | P5 |
| CL-009 | Offline interstitial when connection lost | P1 |
| CL-010 | Language/locale framework (English first) | P2 |
| CL-011 | Reduced motion / reduced flash option | P4 |
| CL-012 | Colorblind-safe scanner palette option | P4 |
| CL-013 | Subtitles for voiced dialogue (on by default) | P2 |
| CL-014 | Clean-language text mode (optional censor) | P5 |
| CL-015 | Performance stats overlay (dev/QA) | P1 |
| CL-016 | Crash reporting client integration | P2 |

### 4.3 Isometric Renderer & Camera

| ID | Requirement | Priority |
|----|-------------|----------|
| REN-001 | Fixed isometric projection matching Syndicate-style 2:1 feel | P1 |
| REN-002 | Tilemap rendering with multiple layers | P1 |
| REN-003 | Correct depth sorting (entities vs buildings) | P1 |
| REN-004 | Roof fade / hide when units underneath | P3 |
| REN-005 | Camera follow selected unit or squad centroid | P1 |
| REN-006 | Edge scrolling (desktop) | P2 |
| REN-007 | Pinch zoom / limited zoom levels | P2 |
| REN-008 | Integer-ish pixel scaling with nearest-neighbor sprites | P1 |
| REN-009 | Sprite animation state machine (idle, walk 8-dir, shoot, death, hit) | P1 |
| REN-010 | Number markers above posse members | P1 |
| REN-011 | Selection highlights and move target markers | P1 |
| REN-012 | Muzzle flash, projectile, blood, fire, explosion VFX | P1 |
| REN-013 | Persistent short-lived decals (blood, scorch) | P2 |
| REN-014 | Day/night or district lighting tint (lightweight) | P4 |
| REN-015 | Frustum/viewport culling | P1 |
| REN-016 | Dynamic quality scaler under low FPS | P3 |
| REN-017 | Debug draw: collision, nav, LOS (dev) | P1 |

### 4.4 Input

| ID | Requirement | Priority |
|----|-------------|----------|
| INP-001 | Left click move selected units | P1 |
| INP-002 | Right click fire / attack ground or unit | P1 |
| INP-003 | Box select and shift multi-select | P1 |
| INP-004 | Hotkeys 1–0 select posse slots | P1 |
| INP-005 | Group select all hotkey | P1 |
| INP-006 | Weapon cycle hotkeys | P1 |
| INP-007 | Hold/stop/attack-move orders | P2 |
| INP-008 | Explosive throw binding | P2 |
| INP-009 | Touch tap-to-move | P3 |
| INP-010 | Touch tap-enemy-to-fire with assist | P3 |
| INP-011 | Touch weapon wheel | P3 |
| INP-012 | Context long-press interact | P3 |
| INP-013 | Gamepad basic support (optional) | P6 |
| INP-014 | Input buffering for high latency | P3 |
| INP-015 | Holster/draw weapon in hubs | P2 |

### 4.5 Combat Simulation (Server-Authoritative)

| ID | Requirement | Priority |
|----|-------------|----------|
| CMB-001 | Server tick loop for instances | P1 |
| CMB-002 | Intent queue with per-player rate limits | P1 |
| CMB-003 | Movement validation (speed, collision, nav) | P1 |
| CMB-004 | Pathfinding on server nav grid | P1 |
| CMB-005 | Hitscan and/or projectile weapons with server resolution | P1 |
| CMB-006 | Line-of-sight checks | P1 |
| CMB-007 | Cover modifiers | P3 |
| CMB-008 | Damage tables by weapon and body rules | P1 |
| CMB-009 | Health, death, ragdoll/death state | P1 |
| CMB-010 | Ammo consumption and reload rules | P2 |
| CMB-011 | Cooldowns and fire rates enforced server-side | P1 |
| CMB-012 | Friendly fire policy (configurable per mode) | P2 |
| CMB-013 | Explosives with splash and destructibles | P2 |
| CMB-014 | Burning vehicles / fire DoT zones | P3 |
| CMB-015 | Destructible props with nav updates if needed | P4 |
| CMB-016 | Suppression / panic / morale for goons | P3 |
| CMB-017 | Vehicle enter/drive basic (optional slice) | P5 |
| CMB-018 | Client prediction + reconciliation for local units | P2 |
| CMB-019 | Interpolation for remote units | P2 |
| CMB-020 | Limited lag compensation for hits (documented) | P4 |
| CMB-021 | Combat log events for rewards and anti-cheat | P1 |
| CMB-022 | Mission abort / disconnect policy | P2 |
| CMB-023 | Spectator mode for dead players in co-op | P4 |

### 4.6 Posse / Goon System

| ID | Requirement | Priority |
|----|-------------|----------|
| POS-001 | Player character entity distinct from goons | P1 |
| POS-002 | Roster storage (bench + active) | P1 |
| POS-003 | Active squad size cap | P1 |
| POS-004 | Goon stats model (guts, aim, muscle, brains, speed, loyalty, heat) | P2 |
| POS-005 | Goon quirks affecting AI behavior | P3 |
| POS-006 | Goon loadouts (weapons/armor) | P2 |
| POS-007 | Name generation + manual rename (filtered) | P2 |
| POS-008 | Injury states and recovery timers | P2 |
| POS-009 | Permanent death mode flag + standard injury mode | P2 |
| POS-010 | Memorial wall data model and UI | P3 |
| POS-011 | Goon AI: follow, hold, attack-move, auto-acquire | P1 |
| POS-012 | Goon AI: flee when broken morale | P3 |
| POS-013 | Goon skill uses (lockpick, demo, talk assist) | P4 |
| POS-014 | Formation / spacing behaviors | P3 |
| POS-015 | Goon loyalty/betrayal edge cases (high heat, unpaid) | P5 |
| POS-016 | Import recruited NPC appearance into roster sprite set | P2 |
| POS-017 | Goon voice profile assignment | P2 |
| POS-018 | Per-goon combat stats display in UI | P2 |

### 4.7 Recruitment & Dialogue

| ID | Requirement | Priority |
|----|-------------|----------|
| DLG-001 | Dialogue graph data format and loader | P2 |
| DLG-002 | Server-side condition evaluation (rep, cash, flags) | P2 |
| DLG-003 | Client dialogue UI (portrait, text, choices) | P2 |
| DLG-004 | Tone branches: Smooth / Business / Threaten / Insult | P2 |
| DLG-005 | NPC memory of prior interactions | P3 |
| DLG-006 | Holstered weapon requirement in safe zones | P2 |
| DLG-007 | Escalation from insults to bar brawl instance | P3 |
| DLG-008 | Recruitment offer flow with price/rep checks | P2 |
| DLG-009 | Failure paths (refuse, demand more, call friends) | P2 |
| DLG-010 | Quest-giving NPCs and notepad journal | P3 |
| DLG-011 | Ambient bark lines on cooldown | P3 |
| DLG-012 | Multi-NPC conversations (optional) | P5 |
| DLG-013 | Localization keys for all dialogue | P3 |
| DLG-014 | Caption sync with audio duration | P2 |
| DLG-015 | Content moderation pipeline for player-entered text in dialogue contexts | P3 |

### 4.8 Hub World & Districts

| ID | Requirement | Priority |
|----|-------------|----------|
| HUB-001 | Load persistent hub map for a district | P2 |
| HUB-002 | Player presence of other characters (AOI) | P4 |
| HUB-003 | Interactable NPCs (bartender, dealer, fixer) | P2 |
| HUB-004 | Enter/exit interior scenes (bar interior) | P2 |
| HUB-005 | Safe zone rules (no lethal PvP) | P2 |
| HUB-006 | District travel / unlock gates | P3 |
| HUB-007 | Ambient civilian/traffic AI (lightweight) | P3 |
| HUB-008 | Job board / fixer mission selection UI | P2 |
| HUB-009 | Safehouse interior owned by player/gang | P3 |
| HUB-010 | Safehouse upgrades (armory, medbay, lounge, memorial) | P4 |
| HUB-011 | District list: Skidrow, Docks, Industrial, Neon, Rails, Uptown | P3–P6 |
| HUB-012 | Weather/ambient audio beds per district | P4 |
| HUB-013 | Instant travel between owned safehouses (cost/heat tradeoff) | P5 |

### 4.9 Missions & Objectives

| ID | Requirement | Priority |
|----|-------------|----------|
| MIS-001 | Mission template data (map, spawns, objectives, rewards) | P1 |
| MIS-002 | Instance lifecycle: create, load, start, complete, destroy | P1 |
| MIS-003 | Objective: eliminate target | P1 |
| MIS-004 | Objective: reach extraction | P1 |
| MIS-005 | Objective: collect/interact object | P2 |
| MIS-006 | Objective: defend for timer | P2 |
| MIS-007 | Objective: destroy asset | P2 |
| MIS-008 | Objective: escort NPC | P3 |
| MIS-009 | Multi-stage heist objectives | P4 |
| MIS-010 | Failure conditions and partial rewards policy | P2 |
| MIS-011 | Mission briefing screen with flavor text | P2 |
| MIS-012 | Mission debrief with kills, losses, loot, memorials | P2 |
| MIS-013 | Difficulty tiers / recommended power | P3 |
| MIS-014 | Daily/weekly contract rotations | P4 |
| MIS-015 | Tutorial mission sequence | P2 |
| MIS-016 | Replayability modifiers (optional mutators) | P5 |
| MIS-017 | Co-op mission start with party | P4 |
| MIS-018 | AI enemy archetypes: thug, enforcer, shooter, boss | P1 |
| MIS-019 | Enemy spawners / reinforcements | P2 |
| MIS-020 | Civilian non-combatants and heat on collateral | P3 |

### 4.10 Inventory, Gear & Shops

| ID | Requirement | Priority |
|----|-------------|----------|
| INV-001 | Inventory model with stackable and unique items | P1 |
| INV-002 | Equip weapons/armor on player and goons | P2 |
| INV-003 | Shop UI with server-priced stock | P2 |
| INV-004 | Buy/sell with ledger transactions | P2 |
| INV-005 | Weapon tiers from pipe → heavy crime arsenal | P2 |
| INV-006 | Consumables (medkits, armor plates, molotovs) | P2 |
| INV-007 | Ammo types if differentiated | P3 |
| INV-008 | Loot drops on mission (server rolled) | P1 |
| INV-009 | Loot pickup rules and party split | P4 |
| INV-010 | Storage stash in safehouse | P3 |
| INV-011 | Item rarity and bind rules | P4 |
| INV-012 | Black market unlock gated by rep/district | P3 |
| INV-013 | Weapon mod attachments (damage/fire rate) | P5 |
| INV-014 | Prevent negative cash / oversell races | P1 |

### 4.11 Economy & Progression

| ID | Requirement | Priority |
|----|-------------|----------|
| ECO-001 | Cash currency with authoritative balance | P1 |
| ECO-002 | Double-entry or append-only ledger | P1 |
| ECO-003 | Reputation points and ranks | P2 |
| ECO-004 | Heat meter with consequences | P3 |
| ECO-005 | Influence for turf | P4 |
| ECO-006 | Mission reward formulas | P1 |
| ECO-007 | Protection racket income ticks | P4 |
| ECO-008 | Hospital / revival costs for goons | P2 |
| ECO-009 | Bribe mechanics for heat reduction | P4 |
| ECO-010 | Idempotent reward grants | P1 |
| ECO-011 | Economy admin adjustment tools (audited) | P3 |
| ECO-012 | Anti-inflation sinks (repairs, upkeep, training) | P4 |
| ECO-013 | Starter kit on character create | P1 |
| ECO-014 | Soft caps / diminishing returns documentation | P3 |

### 4.12 Turf & Empire Meta

| ID | Requirement | Priority |
|----|-------------|----------|
| TRF-001 | City map UI with districts and nodes | P3 |
| TRF-002 | Claimable turf nodes | P4 |
| TRF-003 | Passive income from owned nodes | P4 |
| TRF-004 | Contest windows / scheduled wars | P4 |
| TRF-005 | Capture point gameplay in instances | P4 |
| TRF-006 | Defense missions when contested | P4 |
| TRF-007 | Over-extortion revolt / cop raid events | P5 |
| TRF-008 | Gang ownership of nodes | P4 |
| TRF-009 | Visual control colors on city map | P4 |
| TRF-010 | Node upgrade buildings (lookout, stash, armory) | P5 |

### 4.13 Social, Gangs & Chat

| ID | Requirement | Priority |
|----|-------------|----------|
| SOC-001 | Friends list / block list | P4 |
| SOC-002 | Party invite, leave, leader | P4 |
| SOC-003 | Party shared mission queue | P4 |
| SOC-004 | Create/join player gang | P4 |
| SOC-005 | Gang ranks and permissions | P4 |
| SOC-006 | Gang bank (ledger-based) | P5 |
| SOC-007 | Gang emblem/colors cosmetics | P5 |
| SOC-008 | Text chat: party, gang, district proximity | P4 |
| SOC-009 | Chat rate limits and mute | P4 |
| SOC-010 | Report player flow | P4 |
| SOC-011 | Profanity filter configurable | P4 |
| SOC-012 | Mail / notifications for invites and wars | P5 |
| SOC-013 | Presence status (online/in-mission) | P4 |
| SOC-014 | Emotes / taunts (audio + anim) | P5 |

### 4.14 PvP Rules

| ID | Requirement | Priority |
|----|-------------|----------|
| PVP-001 | Flag starter districts as PvE-safe for open world | P4 |
| PVP-002 | Opt-in War Flag or high-tier PvP districts | P5 |
| PVP-003 | Instanced turf war matchmaking by power band | P4 |
| PVP-004 | Gank protection for new accounts | P4 |
| PVP-005 | Rewards/penalties for PvP wins/losses | P4 |
| PVP-006 | Prevent safe-hub PvP exploits | P2 |
| PVP-007 | Consensual bar brawl mode | P3 |

### 4.15 UI/UX (Syndicate-Inspired)

| ID | Requirement | Priority |
|----|-------------|----------|
| UI-001 | Left posse panel with slots, health, selection | P1 |
| UI-002 | Weapon icon grid with ammo bars | P1 |
| UI-003 | Scanner minimap with friend/foe/objective dots | P1 |
| UI-004 | Objective banner strip | P1 |
| UI-005 | Damage/heal floating numbers optional toggle | P3 |
| UI-006 | Hub: dialogue, shop, roster, map, journal tabs | P2 |
| UI-007 | Memorial wall screen | P3 |
| UI-008 | Character create / appearance | P2 |
| UI-009 | Pause/settings menu (no combat pause in MP) | P1 |
| UI-010 | Onboarding tooltips | P2 |
| UI-011 | Mobile bottom sheet HUD reflow | P3 |
| UI-012 | Accessible focus order for non-canvas menus | P4 |
| UI-013 | Kill feed / event ticker | P3 |
| UI-014 | Gang & turf management screens | P4 |

### 4.16 Audio & Voice (Grok TTS)

| ID | Requirement | Priority |
|----|-------------|----------|
| AUD-001 | Master / SFX / music / voice volume buses | P1 |
| AUD-002 | Weapon and explosion SFX pack | P1 |
| AUD-003 | Footsteps and ambient loops | P2 |
| AUD-004 | Music layers for hub vs combat | P3 |
| AUD-005 | Integration with xAI Grok TTS API in workers | P2 |
| AUD-006 | Batch pipeline: script → TTS → CDN asset | P2 |
| AUD-007 | Voice profile table per archetype | P2 |
| AUD-008 | Client voice line queue with priority (combat bark < dialogue) | P2 |
| AUD-009 | Subtitle fallback if audio blocked by browser | P1 |
| AUD-010 | Caching and prefetch of hot lines | P3 |
| AUD-011 | Optional runtime TTS for long-tail lines with cache | P5 |
| AUD-012 | Lip-sync not required; optional talk bob anim | P4 |
| AUD-013 | Content review step before publishing generated lines | P2 |
| AUD-014 | Cost monitoring for TTS usage | P2 |

### 4.17 Art Pipeline (Grok Imagine + Pixel)

| ID | Requirement | Priority |
|----|-------------|----------|
| ART-001 | Art bible: palette, sprite scale, outline rules | P1 |
| ART-002 | Tileset: Skidrow streets and buildings | P1 |
| ART-003 | Character base body + 8-dir walk/shoot/death | P1 |
| ART-004 | Enemy variants | P1 |
| ART-005 | Weapon iconography matching Syndicate-panel energy | P1 |
| ART-006 | VFX sprites (muzzle, fire, blood, explosion) | P1 |
| ART-007 | UI chrome (panels, buttons, scanner frame) | P1 |
| ART-008 | Grok Imagine prompt library for concepts | P2 |
| ART-009 | Worker integration for Imagine batch generation | P3 |
| ART-010 | Pixelation / cleanup workflow documented | P2 |
| ART-011 | Texture atlas build in CI | P2 |
| ART-012 | District-specific tilesets (each district) | P3–P6 |
| ART-013 | Interior kits (bar, shop, safehouse) | P2 |
| ART-014 | Marketing key art via Imagine + paint-over | P4 |
| ART-015 | Animation budget sheet per archetype | P2 |
| ART-016 | Prop kit: cars, dumpsters, neon signs, crates | P2 |

### 4.18 Maps & Content Tools

| ID | Requirement | Priority |
|----|-------------|----------|
| MAP-001 | Tiled isometric workflow documented | P1 |
| MAP-002 | Collision and nav bake pipeline | P1 |
| MAP-003 | Spawn point and trigger authoring | P1 |
| MAP-004 | Cover volume authoring | P3 |
| MAP-005 | At least 1 tutorial map | P1 |
| MAP-006 | At least 3 starter jobs maps | P2 |
| MAP-007 | Bar hub map | P2 |
| MAP-008 | One mid-game district hub | P3 |
| MAP-009 | Turf war arena map | P4 |
| MAP-010 | Map validation tests (closed nav, bounds) | P2 |
| MAP-011 | Server loads same baked nav as client collision subset | P1 |

### 4.19 Networking & Backend Services

| ID | Requirement | Priority |
|----|-------------|----------|
| NET-001 | Local HTTP for health/dev routes only (Mode A) | P0 |
| NET-002 | WebSocket game channel with dev auth | P0 |
| NET-003 | Protocol versioning | P1 |
| NET-004 | Hub room(s) in-process (not a separate microservice) | P1 |
| NET-005 | Instance rooms allocated in-process | P1 |
| NET-006 | Simple party/matchmaker in-process | P4 |
| NET-007 | Redis sessions, pub/sub, locks | P6 (Mode B) — **not** Mode A |
| NET-008 | PostgreSQL migrations system | P6 (Mode B) — **not** Mode A |
| NET-009 | Graceful reconnect / resume session while server up | P2 |
| NET-010 | Backpressure when sim overloaded (skip snapshots / disconnect) | P3 |
| NET-011 | Horizontal scale / k8s — documentation only until Mode B | P6 |
| NET-012 | Feature flags (in-memory config object is enough) | P3 |
| NET-013 | Config via env (PORT, TICK_HZ, SEED) | P1 |
| NET-014 | MessagePack or binary codec | P5 optional |
| NET-015 | Interest management AOI | P4 |
| NET-016 | CORS / Vite proxy docs for local WS | P0 |

### 4.20 Security & Anti-Cheat

| ID | Requirement | Priority |
|----|-------------|----------|
| SEC-001 | No trusted client combat math | P0 |
| SEC-002 | Server validates all purchases | P1 |
| SEC-003 | Intent rate limiting | P1 |
| SEC-004 | Movement speed hacks rejected | P1 |
| SEC-005 | In-memory economy helpers only mutate cash on server | P1 |
| SEC-006 | Anomaly detection jobs (accuracy, income rate) | P6 |
| SEC-007 | Replay capture for flagged fights | P6 |
| SEC-008 | WAF / DDoS edge protection | P6 |
| SEC-009 | Secrets management (no Grok keys in client) | P0 |
| SEC-010 | XSS hardening for any HTML UI / names | P2 |
| SEC-011 | Dependency vulnerability scanning in CI | P2 |
| SEC-012 | Dev admin routes disabled or localhost-only outside dev | P2 |
| SEC-013 | CAPTCHA / bot challenges on suspicion | P6 |
| SEC-014 | Penetration test before public launch | P6 |
| SEC-015 | Bug bounty program (post-launch optional) | P7 |
| SEC-016 | Cheat report → review queue | P6 |

### 4.21 Analytics, Live Ops & Admin

| ID | Requirement | Priority |
|----|-------------|----------|
| OPS-001 | Structured logging | P0 |
| OPS-002 | Metrics: RTT, tick time, CCU, error rate | P1 |
| OPS-003 | Player funnel analytics (tutorial steps) | P2 |
| OPS-004 | Economy dashboards | P3 |
| OPS-005 | GM tools: kick, ban, spectate, grant (audited) | P3 |
| OPS-006 | Content kill-switch for broken missions | P3 |
| OPS-007 | Season / event configuration | P6 |
| OPS-008 | Maintenance mode banner | P2 |
| OPS-009 | Client canary deployments | P4 |
| OPS-010 | Alerting ontick overtime / ledger imbalance | P2 |

### 4.22 Monetization (If Applicable)

| ID | Requirement | Priority |
|----|-------------|----------|
| MON-001 | Decide B2P vs F2P (product decision recorded) | P3 |
| MON-002 | Cosmetics catalog system | P5 |
| MON-003 | No P2W combat stat purchases (policy + enforcement tests) | P5 |
| MON-004 | Payment provider integration | P5 |
| MON-005 | Entitlement grants via ledger-safe pipeline | P5 |
| MON-006 | Regional pricing / tax handling | P6 |
| MON-007 | Refund / chargeback handling | P6 |

### 4.23 Compliance & Legal

| ID | Requirement | Priority |
|----|-------------|----------|
| LEG-001 | Privacy policy and ToS | P2 |
| LEG-002 | Age rating self-assessment (Mature/18+) | P3 |
| LEG-003 | Cookie / analytics consent where required | P4 |
| LEG-004 | UGC policy for names/chat | P4 |
| LEG-005 | IP review: homage without copying assets from originals | P1 |
| LEG-006 | Voice/content moderation policy for generated media | P2 |
| LEG-007 | Accessibility statement baseline | P5 |

### 4.24 QA & Testing

| ID | Requirement | Priority |
|----|-------------|----------|
| QA-001 | Unit tests for economy and combat math | P1 |
| QA-002 | Integration tests for login → mission → reward | P1 |
| QA-003 | Load test instance servers | P4 |
| QA-004 | Chaos: disconnect mid-mission | P2 |
| QA-005 | Multiplayer desync soak tests | P4 |
| QA-006 | Mobile device lab pass | P4 |
| QA-007 | Browser matrix checklist | P2 |
| QA-008 | Security regression suite for common cheats | P3 |
| QA-009 | Balance playtests with recorded metrics | P3 |
| QA-010 | Automated map validation | P2 |
| QA-011 | TTS/asset link checker (no missing lines) | P2 |

---

## 5. Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-001 | Initial JS+critical assets < 5 MB gzipped target (excluding art packs) | P3 |
| NFR-002 | First interactive hub < 10s on broadband | P3 |
| NFR-003 | Combat tick budget headroom at design CCU/instance size | P2 |
| NFR-004 | 60 FPS target desktop medium settings on reference laptop | P2 |
| NFR-005 | 30 FPS minimum phone mid-tier | P3 |
| NFR-006 | Server authoritative reward latency < 2s after objective complete | P2 |
| NFR-007 | 99.5% monthly API availability target (launch) | P6 |
| NFR-008 | RPO/RTO backups defined for Postgres | P3 |
| NFR-009 | All money mutations auditable | P1 |
| NFR-010 | WCAG-oriented menus where practical | P5 |

---

## 6. Content Deliverables Checklist

### 6.1 Launch-Minimum Content (indicative)

- [ ] 1 playable city starter district (Skidrow) fully hooked  
- [ ] 1 bar hub with ≥8 recruitable NPC archetypes  
- [ ] ≥10 voiced recruitment/bark lines per archetype (batch TTS)  
- [ ] Tutorial (3 beats: move, shoot, recruit)  
- [ ] ≥8 PvE missions  
- [ ] ≥12 weapon/item definitions  
- [ ] Memorial + safehouse basic  
- [ ] 1 rival gang AI faction  
- [ ] Shop with tier-1 and tier-2 gear  
- [ ] City map shell even if only one district open  

### 6.2 Beta Expansion

- [ ] Docks + Industrial districts  
- [ ] Gangs, parties, chat  
- [ ] Turf nodes (subset)  
- [ ] Co-op missions  
- [ ] Heat system live  

### 6.3 Launch Expansion

- [ ] Neon + Rails  
- [ ] Scheduled turf events  
- [ ] Cosmetics if F2P  
- [ ] Uptown teaser  

---

## 7. Detailed Work Breakdown (Tasks)

Tasks are implementation-oriented for project tracking. Grouped by workstream.

### 7.1 Engineering — Foundations (P0) — local-first

1. Initialize monorepo (`client`, `server`, `shared`, docs)  
2. TypeScript configs, lint, format  
3. **No Docker/Postgres/Redis in default path**  
4. Node.js server skeleton: HTTP `/health` + WebSocket upgrade  
5. `InMemoryStore` + boot seed data  
6. Client Vite skeleton with blank Pixi stage  
7. `VITE_WS_URL` + connect/disconnect UI  
8. Shared package for protocol types (Zod schemas optional)  
9. Root scripts: `server`, `client`, optional `dev`  
10. Console logging for connections and message types  

### 7.2 Engineering — Dev Auth & Rooms (P0–P1)

11. Dev auth: display name → character + session token in memory  
12. WS auth handshake message  
13. Connection manager (ws → player → room)  
14. Hub room join on login  
15. Instance room create/join/leave  
16. Disconnect cleanup  
17. `/dev/reset` and `/dev/state` (optional)  
18. Character name uniqueness within live server process  

### 7.3 Engineering — Isometric Client Core (P1)

19. Tilemap loader (Tiled JSON)  
20. Isometric projector + camera  
21. Depth sorter  
22. Sprite sheet animator  
23. Input controller (mouse)  
24. Entity interpolator  
25. HUD: posse panel + minimap placeholders  
26. Asset manifest loader  
27. Dev debug overlays  

### 7.4 Engineering — Instance Sim (P1)

28. Instance process/module lifecycle  
29. Tick loop with fixed dt  
30. Spatial grid / collision  
31. Navgrid pathfinding (A*)  
32. Unit movement system  
33. Weapon fire intents + cooldowns  
34. Hitscan LOS + damage apply  
35. Death and removal  
36. AI enemy chase/shoot  
37. Goon follow AI  
38. Snapshot/delta broadcaster  
39. Mission objective: kill all / extract  
40. Reward grant hook (cash)  

### 7.5 Engineering — Economy (P1) — in-memory

41. `economy.addCash` / `spendCash` helpers on store  
42. Optional in-memory mutation log for debugging  
43. Idempotency keys on mission reward grants (same process)  
44. Inventory maps on character/goon  
45. Loot roll tables in seed data  
46. Starter kit on character create  
47. Reject shop buys if insufficient funds (double-click safe)  

### 7.6 Engineering — Hub & Dialogue (P2)

48. Hub map enter from login  
49. NPC interact prompts  
50. Dialogue engine server  
51. Dialogue UI client  
52. Recruitment transaction (cash → goon row)  
53. Roster UI  
54. Equip UI  
55. Shop buy flow  
56. Holster state  
57. Job board → instance launch  

### 7.7 Engineering — Progression Meta (P2–P3)

58. Reputation grants  
59. Unlock flags for districts/missions  
60. Heat model  
61. Injury/death for goons  
62. Memorial records UI  
63. Safehouse scene  
64. Debrief screen  
65. Journal/quest flags  

### 7.8 Engineering — Social MMO (P4)

66. Presence in hub AOI  
67. Party service  
68. Gang service  
69. Chat channels + moderation hooks  
70. Matchmaker  
71. Turf node schema + claim  
72. Turf war instance mode  
73. Mail/notifications  

### 7.9 Engineering — Mobile (P3)

74. Touch controls  
75. HUD reflow  
76. Performance scaler  
77. Mobile QA fixes  

### 7.10 Engineering — Security & Ops

78. Intent rate limits  
79. Log intent rejects  
80. Localhost-only or dev-flag for `/dev/*` routes  
81. (Deferred P6) Anomaly jobs, GM admin, k8s, backups, pen-test  

### 7.10b Engineering — Mode B persistence (explicitly later)

82. `Store` adapter for Postgres  
83. Real auth (email/OAuth)  
84. Redis if multi-process  
85. Migrations, backups, production deploy  

### 7.11 Audio Workstream

85. SFX acquisition/creation list  
86. Music sketch loops  
87. TTS worker service  
88. Dialogue spreadsheet → generation  
89. CDN upload + manifest  
90. Client audio manager  
91. Bark trigger hooks in sim  

### 7.12 Art Workstream

92. Art bible document (palette, scale)  
93. Player/goon sprite set v1  
94. Enemy set v1  
95. Skidrow tileset v1  
96. Bar interior kit  
97. UI kit  
98. VFX kit  
99. Imagine prompt library  
100. Imagine batch experiments + selection  
101. Atlas packing pipeline  
102. District 2 art kickoff  

### 7.13 Design / Content Workstream

103. Finalize weapon stats spreadsheet  
104. Write tutorial script  
105. Write bar NPC dialogue (8 characters)  
106. Design 8 mission templates  
107. Name lists for goons  
108. Quirk list and effects  
109. Faction bible (rival gangs, dirty cops)  
110. Heat rules design  
111. Turf economy spreadsheet  
112. Onboarding UX script  
113. Tone guide (humor / language)  

### 7.14 QA Workstream

114. Test plan for vertical slice  
115. Cheat attempt checklist  
116. Browser matrix runs  
117. Load test scripts  
118. Regression suite automation  
119. Playtest sessions + notes triage  

### 7.15 Product / Legal

120. Monetization decision record  
121. ToS/Privacy drafts  
122. IP homage guidelines for artists/writers  
123. Rating questionnaire  
124. Analytics event taxonomy  
125. Success metrics dashboard definition  

---

## 8. Milestones & Acceptance Criteria

### Milestone A — “Hello Criminal” (P0)

**Accept when:**

- `npm run server` starts Node game server with in-memory seed  
- Client connects with a display name over WebSocket  
- Player sees a placeholder hub / blank world  
- Connection stays stable for a long session  
- **Server restart clears state** (verify intentionally)  
- No database containers required  

### Milestone B — “First Blood” (P1 vertical slice)

**Accept when:**

- Player moves a squad of 1+2 on isometric map  
- Kills AI with server-validated shots  
- Completes extract objective  
- Receives cash **in the same server session** (in-memory)  
- Speed hack client cannot move faster than server allows  

### Milestone C — “Bar Hire” (P2)

**Accept when:**

- Player enters bar, finishes dialogue, hires goon for cash  
- Goon appears in roster and next mission  
- Shop purchase deducts cash safely under double-click spam  
- Restart still wipes hires (expected until Mode B)  

### Milestone D — “District Alive” (P3)

**Accept when:**

- ≥8 missions, heat/rep matter, memorials work  
- Tutorial completable by new player unguided < 20 minutes  

### Milestone E — “Shared Streets” (P4)

**Accept when:**

- Two browsers on the **same local server** see each other in hub  
- Party can run co-op job in one instance room  
- Optional: turf node contest on the local process  

### Milestone F — “Playable product” (P5)

**Accept when:**

- Gameplay loop is fun end-to-end on local/LAN server  
- Performance targets met on reference devices  
- Content minimums filled  
- Still acceptable that restart wipes world  

### Milestone G — “Public backend” (P6, optional later)

**Accept when:**

- Durable store + real auth  
- Mode B security checklist in architecture.md  
- Soft-launch instrumentation  

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scope explosion (3-game mash-up) | High | Vertical slice discipline; phase gates |
| Building infra instead of game | High | **Mode A only until fun**; PRD marks Mode B as P6+ |
| Cheating in local multiplayer | Medium | Server authority even in memory |
| Losing progress on restart | Low (dev) / High (public) | Document wipe; Mode B when needed |
| Art consistency with Imagine outputs | Medium | Pixel bible + mandatory artist pass |
| TTS cost/latency | Medium | Prebake local files; budget alarms |
| Mobile combat feel poor | High | Simplify orders; aim assist; separate UX |
| Networking desync | High | State sync not lockstep; multi-tab tests |
| IP confusion with original games | Medium | Original story/assets; homage only |
| Sim tick cost in TS | Medium | Rooms + profile; uWS later if needed |

---

## 10. Dependencies

**Mode A (now):**

- Node.js LTS  
- Modern browser  
- Art tooling: Aseprite/LibreSprite, Tiled (when making content)  
- Optional: xAI API for offline TTS/Imagine content scripts  

**Mode B (later):**

- Hosting account, domain, CDN  
- Email / OAuth  
- Postgres (and maybe Redis)  
- Legal review for public ToS/rating  

---

## 11. Explicit Non-Goals (Tracked)

| Non-goal | Reason |
|----------|--------|
| **Postgres/Redis/Docker for day-to-day dev** | Mode A is in-memory local server |
| **Microservices before gameplay is fun** | One Node process |
| Durable savegames in Mode A | Restart wipe is a feature for iteration |
| Native iOS/Android stores at v1 | Browser-first |
| FPS mode | Violates art/design pillar |
| Full seamless open-world combat city | Cost; use hybrid instances |
| User-generated maps at launch | Moderation risk |
| Blockchain / NFT | Out of tone and scope |
| Copying Syndicate/Kingpin/Cannon Fodder assets | Legal |
| Permanent player character death | MMO retention |

---

## 12. Open Product Questions

1. Buy-to-play vs free-to-play at launch?  
2. Max CCU target for year one (drives cost)?  
3. Hardcore permanent goon death as default or optional?  
4. How much profanity in default localization vs “clean” mode?  
5. Single region or multi-region at launch?  
6. Allow players to voice-chat via third party only, or built-in later?  
7. Female/male/other character options and sprite budget?  
8. Real-world city homage vs fully fictional naming?  

Record decisions in `docs/decisions/` as they are made (suggested follow-up).

---

## 13. Traceability Matrix (Systems → Pillars)

| Pillar | Primary requirement groups |
|--------|----------------------------|
| Syndicate tactics/view | REN-*, INP-*, CMB-*, UI-001–004, MAP-* |
| Cannon Fodder crew mortality/humor | POS-008–010, MIS-012, ART character barks, AUD barks |
| Kingpin crime recruitment | DLG-*, HUB-*, POS recruitment, tone guide |
| Secure gameplay | SEC-*, LOC authority, economy helpers, QA cheat tests |
| Local-first backend | LOC-*, NET Mode A rows, architecture Mode A |
| Generative pipelines | AUD-005–014, ART-008–010 |

---

## 14. Suggested First Sprint (Two Weeks)

**Goal:** Milestone A complete + Milestone B thin slice. Backend stays dumb and local.

1. Monorepo: `client` / `server` / `shared`  
2. Node server: WS + `InMemoryStore` + seed + dev name auth  
3. Client connects to `ws://localhost:3001`  
4. One isometric test map  
5. Server tick: move + shoot + one AI  
6. Client render + input  
7. Reward $ in memory on win  
8. Movement speed validation  
9. Two-browser hub presence smoke test  
10. Confirm restart wipes world  

**Do not in sprint 1:** Postgres, Redis, Docker, OAuth, k8s, CDN, MessagePack (unless free).

---

## 15. Appendix — Feature Inventory by Player-Facing Verb

Players must be able to:

- **Join** with a display name (dev) / account later  
- **Walk** isometric streets/hubs  
- **Talk** to NPCs  
- **Hire** goons  
- **Equip** gear  
- **Buy/sell** at shops  
- **Select** squad members  
- **Order** move/hold/attack  
- **Shoot** and use explosives  
- **Loot**  
- **Complete** objectives  
- **Extract**  
- **Mourn** dead goons  
- **Upgrade** safehouse  
- **Unlock** districts  
- **Form** parties/gangs  
- **Chat**  
- **Contest** turf  
- **Report** abusers  
- **Customize** settings/accessibility  
- **Hear** voiced lines  
- **See** pixel crime chaos that feels like Syndicate with a Kingpin soul  

---

*This PRD is intentionally exhaustive for planning. Default backend is a local in-memory Node.js WebSocket server. Implementation should proceed slice-by-slice; infrastructure expansion before fun is the main process risk.*
