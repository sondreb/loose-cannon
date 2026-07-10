# Loose Cannon — Technical Architecture

## 1. Goals

| Goal | Implication |
|------|-------------|
| Run in modern browsers (desktop + phones) | WebGL/WebGPU client, responsive UI, touch + mouse |
| Secure gameplay loop (no client-trusted combat/economy) | **Server-authoritative** simulation; clients send intents only |
| **Local-first development** | One Node.js process, in-memory state, restart = clean slate |
| Focus on frontend & feel | Minimal infra; no Postgres/Redis/k8s required to play |
| Syndicate-style isometric presentation | 2D isometric renderer with depth sort, not FPS engine |
| Voice + generative art pipelines | Offline/batch **Grok TTS** / **Grok Imagine** when needed |
| Path to real MMO later | Keep a thin store interface so durable backends can plug in later |

**Current phase priority:** frontend + gameplay + a simple authoritative local server.  
**Explicitly deferred:** multi-service mesh, managed databases, CDN edge, multi-region, production anti-cheat pipelines.

### Realms (specified)

**Realms** are segregated in-memory world instances on the **same** Mode A / beta process. No auth: players pick a realm string at login or join via `?realm=` URL. Empty realm = public default. Full design: [realms.md](./realms.md).

| Property | Behavior |
|----------|----------|
| Isolation | Units, combat, chat, AI, mission instances scoped per `realmId` |
| Default | `public` when field left blank |
| Security | Obscurity only (shared code/link) — not passwords |
| Persistence | None in Mode A/beta — restart wipes all realms |

---

## 2. Two Architecture Modes

| Mode | When | Storage | Process model |
|------|------|---------|----------------|
| **A. Local game server (default, now)** | Day-to-day dev, playtests, multi-browser local MMO | **In-memory only** (reset on restart) | Single Node.js process |
| **B. Production MMO (later)** | Public launch / scale | Postgres + Redis + workers | Split services, edge, CDN |

Mode A is the **only** backend you need to implement until gameplay is fun. Mode B is a future migration, not a prerequisite.

---

## 3. Mode A — Local Node.js Game Server (Primary Plan)

### 3.1 One-command developer loop

```
# Terminal 1 — authoritative game server
npm run server          # e.g. node packages/server  →  ws://localhost:3001

# Terminal 2 — Vite client
npm run client          # http://localhost:5173  →  connects to local server
```

Optional: `npm run dev` runs both via concurrently. No Docker, no database install.

**Restart behavior:** process exit wipes all accounts, cash, goons, instances, turf. That is intentional for rapid iteration.

### 3.2 Local system diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Browser(s)  ·  Vite dev server  ·  PixiJS client           │
│  Multiple tabs / machines on LAN can connect                │
└───────────────────────────┬─────────────────────────────────┘
                            │  WebSocket (ws://) + optional HTTP
                            │  JSON first; MessagePack optional later
┌───────────────────────────▼─────────────────────────────────┐
│           Node.js process  (packages/server)                │
│                                                             │
│  HTTP: health, static optional, simple login/dev identity   │
│  WS:   all realtime game traffic                            │
│                                                             │
│  ┌─────────────┐                                            │
│  │ Connection  │   auth: { name, realm? }                   │
│  │ manager     │─────────────────────────────────────┐      │
│  │ (ws library)│                                     │      │
│  └─────────────┘                                     ▼      │
│         realms: Map<realmId, RealmWorld>  (default "public")│
│  ┌──────────────────────────────────────────────────────┐   │
│  │ RealmWorld (per realm — fully segregated)            │   │
│  │  units · posses · AI · dialogue · shops · missions   │   │
│  │  mi_* instances · dancer tips · heat/cash            │   │
│  │  Shared static map def; dynamic state per realm      │   │
│  │  RESETS on process restart                           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

See [realms.md](./realms.md) for join rules, URL params, and acceptance criteria.

### 3.3 Why Node.js

| Reason | Detail |
|--------|--------|
| WebSockets at scale (for a single process) | Mature `ws` / `uWebSockets.js` ecosystems; event-loop fits many concurrent idle hub connections |
| Shared language with client | TypeScript end-to-end; one `shared` package for protocol + game constants |
| Fast iteration | No compile-to-native gate; hot reload optional (`tsx watch`) |
| Enough sim throughput for dev/alpha | 20–30 Hz ticks for small instances; profile before rewriting |
| Optional performance escape hatch | `uWebSockets.js` if `ws` becomes a bottleneck; or extract tick later |

**Libraries (recommended defaults):**

| Concern | Library |
|---------|---------|
| HTTP + WS upgrade | **Fastify** + `@fastify/websocket`, or bare **`ws`** + Node `http` |
| High connection count experiments | **uWebSockets.js** (optional later; API differs) |
| Validation | **Zod** on inbound messages |
| Dev runner | **tsx** |
| Shared types | workspace package `shared` |

Avoid NestJS-heavy DI for the local server unless you already want it—keep the process **boring and readable**.

### 3.4 In-memory store design

```ts
// Conceptual — not implementation
interface InMemoryStore {
  accounts: Map<string, Account>
  characters: Map<string, Character>
  sessions: Map<string, Session>       // token → characterId
  goons: Map<string, Goon>
  inventories: Map<string, Inventory>
  parties: Map<string, Party>
  instances: Map<string, InstanceRuntime>
  // ...
}
```

**Rules:**

1. **All mutations go through store helpers** (`addCash`, `grantItem`, `setPosition`)—never scatter ad-hoc field writes.  
2. Define a **`Store` interface** now (`getCharacter`, `saveCharacter`, …) even if only `InMemoryStore` implements it. Future Postgres is a second implementation, not a rewrite of combat.  
3. **No disk persistence** in Mode A (optional debug dump endpoint is fine: `GET /debug/snapshot`).  
4. **Seed data on boot:** starter NPCs, shop stock, one bar hub, tutorial mission templates, a few weapons.  
5. **Dev login:** accept a display name (or `dev:Alice`) and create/find an in-memory character—no email, no OAuth, no password hashing required for Mode A.

### 3.5 Connection & room model (handles “a lot of users” on one box)

Node can hold **thousands of idle WebSocket connections** on a laptop/server if you do not do heavy work per connection each tick.

| Pattern | Purpose |
|---------|---------|
| **Connection manager** | Map `ws` → `{ playerId, roomId, lastIntentAt }` |
| **Rooms** | `hub:skidrow`, `instance:<uuid>` — broadcast only inside room |
| **Interest / AOI (simple)** | Even locally: only send entity updates near each player when hub grows |
| **Per-connection rate limits** | Max moves/fires per second; drop/reject spam |
| **Backpressure** | If `ws.bufferedAmount` is huge, skip non-critical snapshots or disconnect abusive clients |
| **Tick only active instances** | Empty rooms do not run combat ticks |
| **Hub tick lighter** | Hub can be event-driven (no 30 Hz) or 5–10 Hz position sync |

**Rough capacity guidance (single process, design target, not a guarantee):**

| Load | Feasible on one Node process? |
|------|-------------------------------|
| 1–20 clients, few instances | Trivial |
| 50–200 hub-idle + small fights | Realistic with rooms + AOI |
| 500+ CCU with dense combat | Needs profiling; maybe uWS + tighter snapshots; Mode B territory |

Do not over-engineer for 10k CCU in Mode A. Structure rooms so you *can* scale later.

### 3.6 Server module layout (single process)

```
packages/server/
  src/
    index.ts              # listen HTTP/WS
    config.ts             # PORT, TICK_HZ, DEV_SEED
    net/
      connectionManager.ts
      protocol.ts         # encode/decode + zod schemas
      rateLimit.ts
    store/
      types.ts
      inMemoryStore.ts
      seed.ts
    rooms/
      hubRoom.ts
      instanceRoom.ts
    sim/
      tick.ts
      movement.ts
      combat.ts
      ai.ts
      pathfinding.ts
    systems/
      dialogue.ts
      shop.ts
      recruitment.ts
      economy.ts          # cash helpers on store
    dev/
      debugRoutes.ts      # reset world, list players, force spawn
```

Still **authoritative**: combat math and cash live here. “Simple” ≠ “trust the client.”

### 3.7 Protocol for local dev

**Start with JSON text frames** over WebSocket for debuggability (browser devtools, `wscat`). Switch to MessagePack when payload size or CPU matters.

```
Client → Server: { "type": "intent.move", "unitIds": ["u1"], "x": 12, "y": 4, "t": 1203 }
Server → Client: { "type": "snapshot", "tick": 1204, "entities": [ ... ] }
Server → Client: { "type": "event.hit", "targetId": "e3", "damage": 20, "dead": false }
```

Keep a **version field** (`protocolVersion: 1`) even locally so the client can show “restart server / hard refresh.”

### 3.8 Dev identity (no real auth stack)

| Feature | Mode A behavior |
|---------|-----------------|
| Login | Pick name → server creates character + session token |
| Reconnect | Same token reconnects if server still running; else new character |
| Multiplayer local | Open second browser profile / incognito → second name |
| Ban / OAuth / 2FA | Deferred to Mode B |

### 3.9 Simulation (same as production intent, simpler hosting)

Fixed tick (e.g. **20 Hz**) per active `instanceRoom`:

```
onTick(dt):
  processIntentQueue()
  updateMovement()
  updateProjectiles()
  resolveHits()
  updateAI()
  checkObjectives()
  broadcastDeltaOrSnapshot()
```

Rules unchanged: cooldowns, ammo, LOS, damage, loot, and rewards are server-side.

### 3.10 What Mode A deliberately skips

| Skip for now | Why |
|--------------|-----|
| PostgreSQL / Redis | Friction; in-memory is enough |
| Docker Compose | Not needed for core loop |
| JWT refresh / email reset | Dev name login |
| CDN, S3, k8s | Static Vite + local assets |
| Split microservices | One process |
| Durable anti-cheat warehouse | Keep intent validation; skip ML anomaly jobs |
| Horizontal instance fleet | Multiple rooms inside one process |

### 3.11 Optional dev quality-of-life

- `POST /dev/reset` — wipe store and re-seed without process restart  
- `GET /dev/state` — JSON dump for debugging  
- Server console commands: `list`, `cash <name> 9999`, `spawn-enemy`  
- Seed “bot” clients later for load smoke tests (optional script)

---

## 4. Mode B — Production MMO (Deferred Reference)

When gameplay is proven and you need persistence + public scale, evolve—not rewrite from zero.

```
Client → Edge (TLS, WAF) → Gateway → Hub / Instance services
                              ↓
                     Postgres + Redis + workers + CDN
```

| Piece | Role |
|-------|------|
| Postgres | Accounts, inventory, gangs, turf, ledger |
| Redis | Sessions, pub/sub across nodes, rate limits |
| Split instance pods | One room per process/pod at scale |
| Real auth | Email/OAuth, bans, 2FA |
| Workers | TTS/Imagine batch, analytics ETL |
| Observability | Metrics, traces, Sentry |

**Migration path from Mode A:**

1. Keep `Store` interface; add `PostgresStore`  
2. Extract `instanceRoom` tick into a worker process if CPU-bound  
3. Put gateway in front; sticky sessions to instance hosts  
4. Replace dev login with real identity  

See §10–§15 for scale/persistence/ops notes; Mode B details are **future** design, not the current build target.

---

## 5. Client Architecture

### 5.1 Recommended Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | **TypeScript** | Type safety, shared protocol types with server |
| Bundler | Vite | Fast HMR, modern ESM |
| Renderer | **PixiJS v8** (WebGL, WebGPU path when available) | Excellent 2D batching for thousands of sprites; isometric-friendly |
| Alternative | Phaser 3 | Faster for simple prototypes; Pixi preferred for custom MMO HUD + perf control |
| UI | React or Solid + custom game HUD canvas overlay | Complex menus (inventory, dialogue) outside WebGL; combat HUD can be pure canvas |
| Audio | Howler.js or Web Audio API wrapper | Spatial-ish 2D panning, voice line queues |
| Net | WebSocket to **local Node server**; JSON first, MessagePack later | Matches Mode A; easy to debug |
| Config | `VITE_WS_URL=ws://localhost:3001` | Point at LAN host for couch multiplayer |
| State | Client prediction buffer + server reconciliation | Feels responsive without trusting client |

**Why not Unity/Godot Web export for v1?** Possible later, but pure web TS stack keeps deploy simple and matches “browser-first.” Revisit if animation tooling becomes a bottleneck.

### 5.2 Rendering Model (Isometric)

```
World space (tile x, y, z)
        ↓
Isometric project: screenX = (x - y) * tileW/2
                   screenY = (x + y) * tileH/2 - z * height
        ↓
Depth key: sort by (x + y + zBias), then sprite layer
        ↓
Sprite batches: ground → props → characters → VFX → overhangs
```

**Key systems:**

1. **Tilemap layers** — ground, roads, walls, roofs (roofs fade when player under)  
2. **Entity sprites** — 8-direction animation state machines  
3. **Y-sort / diamond depth** — critical for Syndicate readability  
4. **Dynamic lights (optional)** — cheap point lights for neon/fire; not required day-one  
5. **Camera** — lerp follow selected unit / squad centroid; edge scroll on desktop  
6. **Culling** — only draw viewport + margin  
7. **Pixel scale** — integer scaling where possible for crisp pixels; allow fractional on odd mobile sizes with careful filtering (`round-pixels`, nearest-neighbor textures)

### 5.3 Client Trust Boundary

The client **may**:

- Render interpolated entity positions  
- Play animations and local VFX  
- Predict movement for local units for responsiveness  
- Show UI based on last known server state  

The client **must not**:

- Decide hits, damage, deaths, loot, cash, inventory mutations  
- Authoritatively path through walls (server validates final positions)  
- Unlock content by flipping local flags  
- Spawn entities or projectiles that the server did not acknowledge  

**Pattern:** Client sends `Intent` messages; server replies with `Events` + periodic `Snapshot`.

```
Client: IntentFire { weaponId, aimX, aimY, tick, unitId }
Server: validates LOS, cooldown, ammo, range → applies damage → broadcasts EventHit / EventMiss
```

### 5.4 Mobile Considerations

- Separate input adapters (TouchInputController vs MouseInputController)  
- Dynamic resolution scale under thermal/GPU pressure  
- Reduce particle counts and off-screen AI visualization  
- Collapse Syndicate-style left panel into tabs  
- Avoid hover-dependent UX  

### 5.5 Offline / Disconnect

- Hub: show reconnect UI; if server restarted, state is gone—create a new dev character  
- Mid-mission disconnect: server may hold the room briefly; on full server restart, mission is lost (acceptable in Mode A)  
- Never allow offline combat to grant rewards  

---

## 6. Security & Anti-Cheat (Mode A minimum)

Even with in-memory storage, **do not put combat math on the client**. That keeps the game honest for local multiplayer and avoids a painful rewrite later.

### 6.1 Always on (Mode A)

1. Never trust the client for damage, cash, inventory, or loot  
2. Validate intents (cooldown, range, LOS, speed caps)  
3. Rate-limit fire/move/talk  
4. Single-threaded store mutations in the Node process (no races across DB replicas yet)  

### 6.2 Deferred to Mode B

- Durable ledger audits, anomaly ML, captcha, WAF, OAuth hardening, replay warehouses  

### 6.3 Cheat table (what still matters locally)

| Cheat | Mode A mitigation |
|-------|-------------------|
| Speed hacks | Server movement caps |
| Infinite ammo / god mode | Server weapon state |
| Spawn cash | Only server economy helpers |
| Packet spam | Rate limits + disconnect |

### 6.4 Secrets

- Grok API keys only in offline content tools / env—not in the browser bundle  
- Mode A session tokens can be random UUIDs in memory  

---

## 7. Data Model (Core Entities)

Same conceptual entities in Mode A (as objects in Maps) and Mode B (as rows).

### 7.1 Identity

- `Account` — optional in Mode A; can collapse to `Character` only  
- `Character` — id, name, appearance, district, cash, rep, heat  
- `Session` — token → characterId (memory only in Mode A)  

### 7.2 Posse

- `Goon` — id, owner_character_id, name, stats, quirks, status, voice_profile_id  
- `GoonLoadout` — weapon slots, armor  
- `Memorial` — goon snapshot at death  

### 7.3 World

- `District`, `TurfNode`, `Npc` / `ShopStock`, `DialogueGraph`  

### 7.4 Combat

- `MissionTemplate` — objectives, map_id, spawns, rewards  
- `Instance` — **always** runtime memory (even in Mode B)  

### 7.5 Economy

Mode A: simple `character.cash` updates via `economy.addCash(id, delta, reason)` with an in-memory append-only log array (optional, for debugging dupes).  
Mode B: durable ledger table with idempotency keys.

### 7.6 Social

- `Party` (ephemeral), later `Gang`, `ChatMessage`  

---

## 8. Maps & Content Pipeline

### 8.1 Map Format

- Author in **Tiled** (JSON) with isometric tilesets  
- Layers: ground, roads, collision, cover, spawns, triggers, roofs  
- Server and client load the same map JSON (or a thin baked nav grid) from the repo—**no cloud bake required** in Mode A  
- Optional later: CI bake to binary + CDN  

### 8.2 Art Pipeline (Grok Imagine + Pixel Finish)

```
Prompt library → Grok Imagine (concepts) → artist pixel pass → atlas → /public or client assets
```

Serve art from the **Vite client** (or server static folder). No S3 until Mode B.

### 8.3 Voice Pipeline (Grok TTS)

```
Script → offline TTS worker (can be a local script) → audio files in repo or /public/voice
```

Client plays files by `line_id`. No runtime cloud dependency required to develop gameplay.

### 8.4 Dialogue Content

- JSON dialogue graphs in repo  
- Server evaluates conditions from in-memory character flags  
- Client only shows what the server sends  

---

## 9. Networking Details (Mode A)

### 9.1 Connection lifecycle (local)

1. Open client → enter display name  
2. `ws://localhost:3001` connect  
3. Server creates/finds character, returns session token + join `hub:skidrow`  
4. Client sends intents; server broadcasts room snapshots/events  
5. Start job → move connection to `instance:<id>` (same process, different room)  
6. Mission complete → rewards applied in memory → back to hub room  

LAN play: bind server to `0.0.0.0`, set client `VITE_WS_URL=ws://<lan-ip>:3001`.

### 9.2 Latency strategy

| Technique | Use |
|-----------|-----|
| Client prediction | Local unit movement |
| Server reconciliation | Corrections when wrong |
| Interpolation | Other players / goons |
| Interest mgmt | When hub gets busy |

Localhost RTT is ~0; still implement prediction so LAN/remote play feels right.

### 9.3 Message types (starter set)

**Client → Server:** `auth.dev`, `intent.move`, `intent.fire`, `intent.select`, `dialogue.choice`, `shop.buy`, `mission.start`  
**Server → Client:** `auth.ok`, `snapshot`, `delta`, `event.*`, `dialogue`, `inventory`, `reject`, `reward`

---

## 10. Scalability Roadmap

| Phase | Users | Architecture |
|-------|-------|--------------|
| **Now (Mode A)** | 1–50+ local/LAN | **Single Node.js process, in-memory, rooms** |
| Alpha host | dozens–hundreds | Same binary on a VPS; still memory or add SQLite/Postgres |
| Beta | thousands | Mode B: split instances, Redis, Postgres |
| Live | 10k+ CCU aspirational | Multi-region, bus, dedicated anti-cheat |

**Mode A scale levers (before Mode B):** rooms, AOI, tick only active instances, binary protocol, `uWebSockets.js`.

---

## 11. Persistence Policy

| Mode | Behavior |
|------|----------|
| **A (default)** | RAM only; **restart wipes everything**; optional `/dev/reset` re-seeds |
| **B (later)** | Postgres durability; combat instances still ephemeral |

Do **not** half-implement “sometimes save to disk” unless you need it—ambiguous persistence confuses playtests. Prefer pure ephemeral until Mode B.

---

## 12. Observability (lightweight)

**Mode A:**

- `console` logs with player id + message type  
- Optional: tick duration warning if frame > budget  
- `/dev/state` for store inspection  

**Mode B:** OpenTelemetry, Prometheus, Sentry, economy dashboards.

---

## 13. Repo Layout (suggested)

```
loose-cannon/
  packages/
    client/          # Vite + PixiJS
    server/          # Node.js authoritative game server
    shared/          # protocol types, constants, map helpers
  docs/
  inspiration/
```

Scripts at root:

- `npm run server` — in-memory game server  
- `npm run client` — frontend  
- `npm run dev` — both  

---

## 14. Technology Decision Summary

| Decision | **Now (Mode A)** | Later (Mode B) |
|----------|------------------|----------------|
| Client | PixiJS + TypeScript | same |
| Server | **Node.js + TypeScript, single process** | split services |
| Transport | **WebSocket (JSON)** | MessagePack, WSS at edge |
| Storage | **In-memory Maps** | Postgres + Redis |
| Auth | **Dev display name** | OAuth/email |
| Maps | Tiled JSON in repo | baked + CDN |
| Voice/art gen | Offline scripts + local files | workers + object storage |
| Deploy | `node` on laptop | k8s / Fly / etc. |

---

## 15. Checklists

### 15.1 Mode A “good enough to build the game” checklist

- [ ] `npm run server` starts WS game server with seed world  
- [ ] Client connects with a name and appears in hub  
- [ ] Combat intents validated server-side  
- [ ] Cash/inventory only change on server  
- [ ] Second browser can join same hub  
- [ ] Restart server → clean world  
- [ ] No Postgres/Redis/Docker required  

### 15.2 Mode B launch gate (deferred)

- [ ] Durable accounts & ledger  
- [ ] Rate limits, bans, real auth  
- [ ] Edge TLS / DDoS posture  
- [ ] Backups, metrics, moderation  
- [ ] No client-trusted damage/cash (still)  

---

## 16. Implementation Path (Technical)

1. **Server hello:** Node WS + `InMemoryStore` + dev auth + seed  
2. **Vertical combat slice:** one map, move/shoot, AI, rewards in RAM  
3. **Hub slice:** bar, dialogue, recruit  
4. **Two clients:** presence in hub  
5. **Mission rooms:** start job, complete, return to hub  
6. **Frontend feel:** pixels, HUD, audio  
7. **Only later:** Postgres store adapter + real auth  

Do not build Mode B infrastructure until the vertical slice feels good.

---

## 17. Open Technical Questions

| Question | Options | Notes |
|----------|---------|-------|
| `ws` vs `uWebSockets.js` | start `ws` / Fastify | Switch if connection/CPU bound |
| JSON vs MessagePack timing | JSON until profiling hurts | Shared codec in `packages/shared` |
| Tick rate | 20 vs 30 Hz | Start 20 |
| Dev auth only how long? | Until external playtest | Fine for solo/LAN |
| When to add SQLite? | Optional middle step | Only if you need savegames without full Mode B |

---

## 18. Related Documents

- [game-design.md](./game-design.md) — systems fantasy and content  
- [prd.md](./prd.md) — exhaustive implementation backlog  

---

*Priority order: local Node authority + gameplay feel → frontend polish → multiplayer rooms → (much later) durable production infra.*

