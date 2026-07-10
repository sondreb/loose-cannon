# Automated development overseer

This project is set up so **Grok Build** can keep developing Loose Cannon across many cycles until the near-term definition of done in `MASTER_PLAN.md` is met.

## Prerequisites

1. **Grok Build CLI** installed (`grok --version` should work).
   - Windows: `irm https://x.ai/cli/install.ps1 | iex`
2. **Authenticated** once (`grok` browser login, or set `XAI_API_KEY`).
3. Repo dependencies: `npm install` from the repo root.
4. You are on a machine that can run builds and (optionally) `npm run dev` for playtests.

## What was added

| Path | Purpose |
|------|---------|
| `AGENTS.md` | Always-on project rules for every Grok session |
| `docs/MASTER_PLAN.md` | Ordered milestones |
| `docs/STATUS.md` | Live status (agent updates this) |
| `docs/OVERSEER_LOG.md` | Per-cycle log |
| `scripts/overseer/` | Headless loop + prompts |
| `.grok/skills/overseer-cycle/` | Reusable skill for one cycle |

## Option A — Interactive TUI (recommended first)

From the repo root:

```powershell
cd F:\src\github\sondreb\loose-cannon
grok
```

Then paste a goal (or type `/goal` if available):

```
/goal Act as permanent lead developer for Loose Cannon. Follow AGENTS.md, docs/MASTER_PLAN.md, and docs/STATUS.md. Implement the next incomplete milestone toward a playable content spine (job board → mission instances → rewards). Spawn subagents for explore/plan/implement/test as needed. After each milestone: run npm run smoke and npm run build when relevant, update STATUS.md and OVERSEER_LOG.md. Continue until a new player can recruit, take a job, finish an instance, and get paid. Do not build Mode B infra (Postgres/auth/k8s).
```

Or start with plan mode for a big milestone:

```
/plan Implement job board + first mission instance end-to-end (server room + client UI + rewards).
```

Stay in the TUI to approve tools, or set permission mode carefully. Context persists via sessions (`/resume`).

## Option B — Headless single cycle

```powershell
cd F:\src\github\sondreb\loose-cannon
# Prefer -Yolo for headless (otherwise tool prompts can hang with no TUI)
.\scripts\overseer\run-cycle.ps1 -Yolo
```

Flags:

| Flag | Meaning |
|------|---------|
| `-Yolo` | Auto-approve all tools (`--always-approve`). **Use only if you trust the agent in this repo.** **Required for unattended headless** — without it, permission prompts hang with empty logs. |
| `-Bootstrap` | Use bootstrap prompt (first-time). Still a **new** session by default. |
| `-ResumeSession` | Opt-in: reuse healthy `.session-id` (often hangs in headless — not recommended) |
| `-Resume <id>` | Resume a specific session UUID (may hang) |
| `-ForceResume` | Resume even if the session looks unhealthy (may hang) |
| `-MaxTurns <n>` | Cap agent turns (default 80) |
| `-StallTimeoutSeconds <n>` | Kill grok if no stdout for N seconds (default 90; `0` disables) |
| `-DryRun` | Print the command without running |

**Default is a fresh Grok session every cycle.** Headless `--resume` often stalls after `session/load` with zero stdout (CLI bug). Continuity comes from `docs/STATUS.md` and `docs/OVERSEER_LOG.md`, not chat history. The loop retries after a stall instead of exiting.

```powershell
.\scripts\overseer\run-cycle.ps1 -Yolo
.\scripts\overseer\overseer-loop.ps1 -Yolo
```

## Option C — Continuous loop (“set and forget”)

```powershell
# Review every cycle with approval prompts (safer)
.\scripts\overseer\overseer-loop.ps1

# Unattended (risky — agent can edit files and run commands)
.\scripts\overseer\overseer-loop.ps1 -Yolo -SleepSeconds 90

# Stop after N cycles
.\scripts\overseer\overseer-loop.ps1 -Yolo -MaxCycles 10
```

The loop:

1. Runs one headless overseer cycle.
2. Continues the same session (`-Continue` after the first).
3. Sleeps, then repeats until max cycles or you Ctrl+C.

**Ctrl+C behavior**

| When | Effect |
|------|--------|
| Idle sleep between cycles | Stops **immediately** |
| Cycle currently running (1st Ctrl+C) | Notes the request, **lets the cycle finish**, then exits (does not kill the active `grok` run) |
| Cycle currently running (2nd Ctrl+C) | **Force-kills** the active `grok` process tree and exits immediately |

Bash equivalent: `scripts/overseer/overseer-loop.sh` (Git Bash / WSL / Linux / macOS).

### Run in background (Windows)

```powershell
# Separate window
Start-Process pwsh -ArgumentList "-NoExit","-File","F:\src\github\sondreb\loose-cannon\scripts\overseer\overseer-loop.ps1","-Yolo","-SleepSeconds","120"

# Or use Windows Terminal / a dedicated pane so you can watch logs
```

Logs append to `scripts/overseer/logs/` (gitignored).

## Session notes (important)

Grok does **not** use human-readable session names like `overseer-game`. Sessions are **UUIDs**.

| Goal | Command |
|------|---------|
| New headless session | `grok -p "..."` (default) |
| Continue last in this cwd | `grok -p "..." -c` |
| Resume by ID | `grok -p "..." -r <uuid>` |
| Capture ID | `grok -p "..." --output-format json` → `sessionId` |

`run-cycle.ps1` handles capture/continue for you.

## Safety

- **Without `-Yolo`**: you approve tool use (safer for first runs).
- **With `-Yolo` / `--always-approve`**: full autonomy — only use on a branch you can discard, and keep git clean so you can review diffs.
- Prefer working on a feature branch: `git checkout -b overseer/auto`.
- Review `git diff` / commits between cycles.
- The agent is instructed **not** to force-push, reset hard, or deploy without you.

## Suggested long unattended run

```powershell
cd F:\src\github\sondreb\loose-cannon
# Prefer a throwaway branch
git checkout -b overseer/auto

# Ensure deps once
npm install

# Unattended loop (example: many cycles, 2 min pause)
.\scripts\overseer\overseer-loop.ps1 -Yolo -SleepSeconds 120
# Or cap: -MaxCycles 40
```

1. First cycle should pick **M3 memorial wall** (or next incomplete in STATUS).
2. Review `docs/OVERSEER_LOG.md` and `git log` / `git diff` periodically.
3. Keep a game server available for smoke when cycles change server code (`npm run server` in another pane).

## Ready-to-paste goal (full)

```
You are the permanent Loose Cannon overseer. Product: browser isometric 18+ crime MMO (Syndicate + Cannon Fodder + Kingpin). Stack: packages/client (Pixi), packages/server (WS, in-memory), packages/shared.

Rules: AGENTS.md. Roadmap: docs/MASTER_PLAN.md. Status: docs/STATUS.md. Log: docs/OVERSEER_LOG.md.

Doctrine: Mode A only (no Postgres/Redis/k8s/real auth). Server-authoritative combat and economy. Free outdoor roam is intentional — do not re-add district soft-kicks that block walking.

Already live (do not regress): job board, mission instances, tutorial, heat/rep shops, combat-scene graphics, The Titty Twister club, longer kill toasts, mobile full-screen dialogue, free roam.

Priority backlog: M3 memorial wall → M3.5 realms (docs/realms.md) → goon stats feel → combat/pathing → more missions → M4 parties. Fix critical player-facing bugs before greenfield.

Each cycle: read STATUS + MASTER_PLAN → implement next incomplete milestone → verify (build/smoke) → update STATUS + OVERSEER_LOG → stop only if blocked on a human decision.
```

## What “done enough” looks like for a long loop

Keep shipping until memorial wall + goon-stats feel + at least one extra mission or combat polish land, and `npm run build` / `npm run smoke` stay green. Then continue down MASTER_PLAN M5–M6.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `grok` not found | Reinstall CLI; restart shell; check PATH |
| Auth errors | `grok login` or set `XAI_API_KEY` |
| Wrong project | Always `cd` to repo root before running scripts |
| **Empty logs / hangs for minutes / no code changes** | Almost always a **bad resume**. `run-cycle` auto-bootstraps unhealthy sessions; or run `-Bootstrap -Yolo`. Delete `scripts/overseer/.session-id`. Check `scripts/overseer/logs/cycle-*.debug.log` for “session load” with huge `num_chat_messages`. |
| Hangs on first tool | Pass **`-Yolo`** — headless has no UI for permission prompts |
| Session lost | Delete `scripts/overseer/.session-id` and start a new cycle (`-Bootstrap`) |
| Agent thrashing | Lower `-MaxTurns`, tighten MASTER_PLAN, use interactive `/plan` for the next big feature |
| Cost / long runs | Use `-MaxCycles`, sleep longer, or interactive mode |

### Why resume hangs

Grok headless **loads the full prior chat** on `--resume`. After many overseer cycles in one session (500+ messages), resume can stall after auth with **no stdout** (`--output-format json` only flushed at exit, so logs stayed 0 bytes). Continuity for the game lives in `docs/STATUS.md` / `OVERSEER_LOG.md` — a **fresh session each time the old one bloats is correct**, not a regression.

## Human oversight checklist

- [ ] Diffs look intentional after each few cycles  
- [ ] `docs/STATUS.md` stays honest  
- [ ] No Mode B infra sneaking in  
- [ ] Playtest after major milestones (`npm run dev`)  
