# Loose Cannon — Agent Rules

You are working on **Loose Cannon**: a browser crime MMO (isometric Syndicate tactics + Cannon Fodder crew comedy + Kingpin recruitment). Stack: TypeScript monorepo, PixiJS client, Node.js WebSocket server, shared protocol package.

## Source of truth

| Doc | Role |
|-----|------|
| `docs/STATUS.md` | Live implementation status — **update after every meaningful cycle** |
| `docs/MASTER_PLAN.md` | Ordered milestones and definition of done |
| `docs/prd.md` | Requirements (IDs); prefer P0–P3 until alpha is solid |
| `docs/game-design.md` | Fantasy, pillars, tone |
| `docs/architecture.md` | Mode A local server vs deferred Mode B |
| `inspiration/` | Visual/tone references (Syndicate, Cannon Fodder, Kingpin) |

Do not invent a parallel roadmap. Extend `MASTER_PLAN.md` / `STATUS.md` instead.

## Architecture doctrine (non-negotiable)

- **Mode A only until gameplay is fun:** single Node process, **in-memory** state, restart = wipe.
- **Do not** add Postgres, Redis, Docker meshes, Kubernetes, multi-region, or production auth unless the user explicitly asks.
- **Server-authoritative:** combat, economy, recruitment, inventory — clients send **intents** only; never trust client for damage/cash/loot.
- Packages: `packages/client` (Vite + PixiJS), `packages/server` (WS game), `packages/shared` (protocol, map, weapons, constants).
- Prefer gameplay and feel over infra. Keep the monorepo structure.

## Commands

```bash
npm install
npm run dev          # server + client
npm run smoke        # server smoke test
npm run build        # shared → server → client
```

- Client: http://localhost:5173  
- Server: ws://localhost:3001  

## Coding conventions

- TypeScript throughout; shared types live in `@loose-cannon/shared`.
- Protocol changes: update `packages/shared` first, then server, then client.
- Keep diffs focused: one milestone per cycle when possible.
- No drive-by refactors unrelated to the current milestone.
- Do not commit secrets; respect `.env.example` / `.gitignore`.
- Match existing style in each package (naming, file layout, formatting).

## Overseer / autonomous cycles

When acting as the **development overseer** (headless loop or `/goal`):

1. Read `docs/STATUS.md` and `docs/MASTER_PLAN.md` (and latest `OVERSEER_LOG.md`).
2. Pick the **next incomplete** milestone (highest priority unfinished item).  
   Default order: **memorial wall → goon stats feel → combat/pathing → more missions → parties**.
3. If STATUS marks a **critical player-facing bug**, fix that before greenfield.
4. Implement it (spawn subagents for parallel research/impl/test when useful).
5. Run verification: prefer `npm run smoke` and `npm run build` after structural changes.
6. Update `docs/STATUS.md` (what landed, what’s next, date).
7. Append a short cycle log entry to `docs/OVERSEER_LOG.md`.
8. Stop if blocked on human decision (design ambiguity, paid services, deploy credentials).

**Do not regress:** free outdoor roam (no district soft-kicks), Titty Twister, combat-scene art path, longer kill/wipe toasts, mobile full-screen dialogue, 18+ tone.

## Subagent guidance

- **explore** — map unfamiliar systems before editing.
- **plan** — multi-file features (missions, heat, parties).
- **general-purpose** — implement, fix, test.
- Keep server combat/economy and client rendering concerns separated when delegating.

## Tone & product

- **18+ only:** strong language, violence, sexual themes/suggestive club content — intentional.
- Dark humor, named goons, crime fantasy — not cyberpunk CHIP fantasy.
- Readable isometric pixels; small characters vs architecture.
- Safe downtown vs war zone; free roam outdoors; extend content (missions, memorial, parties) before Mode B infra.

## Safety

- No force-push, no `git reset --hard`, no deleting `.git`.
- Do not deploy or change Azure/GitHub secrets unless asked.
- Risky shared actions (push, PR, production) require explicit user intent.
