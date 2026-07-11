---
name: overseer-cycle
description: >
  Run one Loose Cannon development overseer cycle — read STATUS/MASTER_PLAN,
  implement the next milestone, verify, update docs. Use when the user asks for
  overseer cycle, continue autonomous development, advance the roadmap, or
  /overseer-cycle.
---

# Overseer cycle (Loose Cannon)

## When to use

- User says “continue developing”, “overseer cycle”, “next milestone”, or runs headless automation.
- After a previous cycle completed and more roadmap work remains.

## Steps

1. **Read**
   - `AGENTS.md`
   - `docs/STATUS.md`
   - `docs/MASTER_PLAN.md`
   - Latest entries in `docs/OVERSEER_LOG.md`

2. **Select**
   - Pick the highest-priority **incomplete** item in `MASTER_PLAN.md`.
   - Default order (post 2026-07-10): memorial wall → realms (docs/realms.md) → goon stats feel → combat/pathing → more missions → parties.
   - If STATUS lists a critical player-facing bug, fix that first.

3. **Implement**
   - Follow architecture doctrine: Mode A only, server-authoritative.
   - Use subagents: `explore` first if unfamiliar, `plan` for multi-file features, then implement.
   - Protocol changes go through `packages/shared` first.
   - Do **not** re-add district soft-kicks that block free outdoor roam.
   - Preserve 18+ tone, Titty Twister, combat-scene art path, longer kill toasts, mobile full-screen dialogue.

4. **Verify**
   - Run `npm run smoke` when server behavior changed (start server if needed).
   - Run `npm run build` after shared/protocol or structural edits.
   - Fix regressions you caused.

5. **Document**
   - Update `docs/STATUS.md` (tables + date).
   - Append a cycle entry to `docs/OVERSEER_LOG.md`.
   - Check off completed items in `docs/MASTER_PLAN.md`.

6. **Report**
   - Summarize: shipped, verification, next milestone, blockers.

## Stop conditions

- Near-term criteria in `MASTER_PLAN.md` are met and Mode A backlog is empty (M0–M7 done; M8 deferred only).
- Blocked on human design choice or credentials — record blocker and stop thrashing.
- Do not invent Mode B infra work (Postgres/auth/k8s).

### Idle stop (headless loop must exit)

When there is **no** incomplete Mode A work and no critical player-facing bug:

1. Write `scripts/overseer/NO_WORK` (gitignored) with one line: reason + ISO time.
2. Do **not** re-stamp STATUS/OVERSEER_LOG or re-run build/smoke if the latest log entry is already an idle/health-check stop from today.
3. End the final message with exactly: `OVERSEER_STOP: no_work`
4. Delete `NO_WORK` only when you start real Mode A work again.

The headless `overseer-loop` exits when `NO_WORK` exists or the cycle log contains `OVERSEER_STOP: no_work`. It will **not** sleep and repeat empty health-check commits.
