# Realms — Segregated World Instances

**Status:** Implemented (2026-07-10) · **Mode:** A (in-memory) and beta  
**Related:** [architecture.md](./architecture.md) · [MASTER_PLAN.md](./MASTER_PLAN.md) · [STATUS.md](./STATUS.md)

## 1. Goal

Players can invite friends into a **realm**: a segregated city simulation that does not mix units, combat, economy, chat proximity, or AI with other realms on the same server process.

There is **no authentication**. A realm is just a shared string identifier chosen at join time or via URL.

## 2. Player-facing design

### 2.1 Login

On the login screen:

| Field | Required | Rules |
|-------|----------|--------|
| Display name | Yes | Existing rules (length, uniqueness **within realm**) |
| Realm | No | Empty / blank → join the **default public realm** |

Optional UI copy:

- “Realm (optional) — share the same code with friends for a private city.”
- “Leave blank for the public streets.”

### 2.2 URL join

Support query parameters on the client origin (local and beta):

| Param | Example | Behavior |
|-------|---------|----------|
| `realm` | `?realm=sondre-crew` | Pre-fill realm and prefer auto-join after name if name is also provided |
| `name` | `?name=Nikki&realm=sondre-crew` | Optional pre-fill display name |

Examples:

```
http://localhost:5173/?realm=friday-night
https://loose-cannon-beta.azurewebsites.net/?realm=sondre-crew&name=Thug
```

Shareable invite flow:

1. Player A joins realm `sondre-crew`.
2. Player A copies link with `?realm=sondre-crew` (client **Copy invite** button once implemented).
3. Player B opens link → realm field filled → enters name → joins same segregated world.

### 2.3 Visibility model

| Realm type | How it forms | Who is there |
|------------|--------------|--------------|
| **Public default** | Empty realm id | Everyone who did not specify a realm |
| **Named realm** | Same normalized realm string | Only players who join that string |
| Semi-public | Same as named — “security” is obscurity of the code | Anyone with the code/link |

**Not** a password system. No realm registry, no ACL, no owner. If two groups pick the same code, they share a world.

### 2.4 In-game feedback

- Snapshot / HUD shows current realm (e.g. `REALM · public` or `REALM · sondre-crew`).
- Optional: short line on join: “You hit the streets in realm *sondre-crew*.”

## 3. Realm ID rules

Normalize client and server the same way:

| Rule | Detail |
|------|--------|
| Empty / whitespace | → `public` (canonical default id) |
| Case | Lowercase |
| Trim | Leading/trailing whitespace removed |
| Allowed charset | `a-z`, `0-9`, `-`, `_` |
| Length | 1–32 characters after normalize (default `public` always valid) |
| Reject | Spaces mid-string, unicode, URL-unsafe characters |

Invalid realm → `auth.fail` with a clear reason (“Realm code: use letters, numbers, - or _ only”).

## 4. Server architecture (Mode A / beta in-memory)

### 4.1 One process, many worlds

Today: one global `GameWorld` (or equivalent) holds all units, posses, AI, map ticks.

**Target:** the Node process holds a **map of realms**:

```
ServerProcess
  realms: Map<realmId, RealmWorld>
    RealmWorld
      - map state (or shared static map def + per-realm dynamic state)
      - units, posses, AI spawns
      - mission instances (mi_*) scoped to realm
      - sessions in this realm
      - tick simulation for this realm
```

Static map **geometry** may be shared (read-only `createSkidrowMap()` template).  
**Dynamic** state (players, AI, props cooldowns, mission instances, dancer tip stages, cash) is **per realm**.

### 4.2 Isolation requirements

Players in realm A must **never**:

- Appear in realm B snapshots  
- Deal damage, loot, or interact across realms  
- Hear proximity chat across realms  
- Share AI posses / mission hostiles  
- Block tiles for the other realm  

Implementation rule: every unit/posse/session has `realmId`; queries filter by session realm; snapshots only include same-realm entities.

### 4.3 Join / auth protocol

Extend client → server:

```ts
// ClientMessage
{ type: "auth"; name: string; protocolVersion: number; realm?: string }
```

Server:

1. Normalize `realm` → `realmId` (`public` if empty).
2. Validate charset/length.
3. Get or create `RealmWorld` for `realmId`.
4. Enforce name uniqueness **within that realm only**.
5. Spawn posse/units inside that realm’s world.
6. Respond:

```ts
{ type: "auth.ok"; characterId: string; posseId: string; token: string; realmId: string }
```

Snapshot `you` should include:

```ts
you: {
  // existing fields...
  realmId: string;      // e.g. "public" | "sondre-crew"
  realmLabel?: string;  // display string
}
```

### 4.4 Lifecycle

| Event | Behavior |
|-------|----------|
| First player joins realm | Create realm world; seed AI / props as current single-world seed does |
| Last player leaves realm | **Optional:** destroy realm after idle TTL (e.g. 5–15 min) to free memory; or keep until process restart |
| Process restart | All realms wiped (Mode A / beta design) |
| Mission instance | `mi_*` stays scoped **inside** the parent realm |

### 4.5 Ticking

- Tick each non-empty realm at the same `TICK_HZ`, or skip empty realms.
- Do not couple realm ticks so one crowded realm freezes another (fair scheduling if needed later).

### 4.6 Health / ops

Health endpoint may report:

```json
{ "ok": true, "realms": 3, "players": 7, "byRealm": { "public": 5, "sondre-crew": 2 } }
```

Useful for beta debugging; no secrets.

## 5. Client architecture

1. On load, parse `URLSearchParams` for `realm` and `name`.
2. Prefill login fields.
3. On “Hit the Streets”, send `auth` with `realm`.
4. Store `realmId` from `auth.ok` / snapshot for HUD and invite link.
5. **Copy invite link** builds `${origin}${pathname}?realm=${encodeURIComponent(realmId)}` (omit param if public).
6. WebSocket URL unchanged (`ws` / `wss` to same server); segregation is logical, not a different host.

## 6. Beta (Azure in-memory)

Same process model as local Mode A:

- One Web App / one Node server process  
- Multiple realms in memory  
- Restart / redeploy still wipes all realms  
- No auth provider; realm codes remain shareable strings  

Document in beta README / STATUS that “private” means **segregated instance**, not encrypted or access-controlled.

## 7. Out of scope (for this feature)

- Passwords / ACLs / realm owners  
- Billing for private servers  
- Cross-realm matchmaking  
- Persisting realm state to disk/Postgres (Mode B)  
- Different map per realm (same Skidrow template unless later specified)  

## 8. Acceptance criteria

- [x] Two browsers join **empty** realm → see each other in the public streets.  
- [x] Browser A joins `realm=alpha`, browser B joins `realm=beta` → neither appears in the other’s world; combat/chat isolated.  
- [x] `?realm=alpha` prefills login; join lands in `alpha`.  
- [x] Name collision only within the same realm.  
- [x] Mission instances and AI in `alpha` do not affect `beta`.  
- [x] Works on local `npm run dev` and Azure beta (in-memory).  
- [x] `npm run build` + smoke updated for multi-realm (or at least default `public`).  
- [x] STATUS / MASTER_PLAN checkboxes updated when shipped.

## 9. Implementation sketch (for implementers)

Suggested order:

1. `packages/shared` — protocol `realm` on auth + `you.realmId`  
2. Server — `RealmWorld` (extract current world, key by realmId)  
3. Session bind to realm; filter all snapshots / combat / chat  
4. Client — login field + URL params + HUD + invite copy  
5. Smoke — two logical joins with different realms (if harness allows) or unit-level isolation test  
6. Docs STATUS done  

Keep one map definition factory; clone dynamic runtime per realm.
