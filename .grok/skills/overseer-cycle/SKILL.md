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
   - Prefer a vertical slice that leaves the game playable.

3. **Implement**
   - Follow architecture doctrine: Mode A only, server-authoritative.
   - Use subagents: `explore` first if unfamiliar, `plan` for multi-file features, then implement.
   - Protocol changes go through `packages/shared` first.

4. **Verify**
   - Run `npm run smoke` when server behavior changed.
   - Run `npm run build` after shared/protocol or structural edits.
   - Fix regressions you caused.

5. **Document**
   - Update `docs/STATUS.md` (tables + date).
   - Append a cycle entry to `docs/OVERSEER_LOG.md`.
   - Check off completed items in `docs/MASTER_PLAN.md`.

6. **Report**
   - Summarize: shipped, verification, next milestone, blockers.

## Stop conditions

- Near-term “more complete” criteria in `MASTER_PLAN.md` are met.
- Blocked on human design choice or credentials — record blocker and stop thrashing.
- Do not invent Mode B infra work.
