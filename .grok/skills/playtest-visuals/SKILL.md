---
name: playtest-visuals
description: >
  Launch Loose Cannon desktop/mobile viewports, capture screenshots for visual QA,
  run interaction/mission UI regression tests, and iterate on HUD/mobile feel.
  Use when the user asks for playtest, visual QA, screenshot analysis, mobile
  polish, UI tests, /playtest-visuals, or automated visual checks.
---

# Playtest visuals (Loose Cannon)

## Goal

Catch **visual regressions** and **stuck interaction flows** without relying on the user to paste screenshots. Launch the game, capture frames, analyze them, and fix.

## Prerequisites

```bash
npm run dev          # client :5173 + server :3001
# optional headless UI suite (starts its own server if free):
npm run test:ui
npm run playtest:shot   # desktop + mobile screenshots into playtest-out/
```

## When to run

- After street/building/HUD/mobile/touch changes
- User reports “looks broken”, “stuck”, “mobile clutter”, rain/zone/graphics issues
- Before declaring a presentation milestone done

## Steps

### 1. Launch

1. Ensure `npm run dev` is up (or start it in background).
2. Wait for Vite `Local: http://localhost:5173/` and server `ws://localhost:3001`.
3. Desktop URL: `http://localhost:5173/`
4. Mobile emulation: same URL with a 390×844 viewport (iPhone-ish) via Playwright or browser device mode.

### 2. Capture screenshots

```bash
npm run playtest:shot
```

Writes (gitignored under `playtest-out/` if configured):

| File | Viewport | Notes |
|------|----------|-------|
| `playtest-out/desktop-hub.png` | 1440×900 | Safe downtown streets |
| `playtest-out/mobile-hub.png` | 390×844 | Touch HUD clutter check |
| `playtest-out/desktop-war.png` | 1440×900 | War line / combat clutter |
| `playtest-out/mobile-bar.png` | 390×844 | Interior + dialogue |

Use `read_file` on those PNGs to **see** seams, HUD overlap, rain coverage, zone line, hydrants.

### 3. Analyze (checklist)

| Check | Pass criteria |
|-------|----------------|
| Rain | Full-viewport dual layers when raining; none when CLEAR |
| War line | Iso diagonal + jersey barriers — **not** a vertical pole column |
| Hydrants | ≤1–2 per block; no sidewalk seed spam |
| Streets | No diamond texture stitching under zoom |
| Buildings | Walls/roofs intact at zoom 0.65–1.4 |
| Mobile HUD | Posse + chat collapsible; map not buried; touch targets ≥44px |
| Touch move | Hold-drag = steer; tap = move/interact; long-press = fire |
| Pinch | Two-finger pinch zooms |
| Missions | Tutorial + smash + warehouse extract don’t soft-lock |

### 4. UI / mission regression

```bash
npm run test:ui
```

Covers (Playwright + real WS server):

- Auth → snapshot
- Tutorial step advances (go_bar path)
- Click/interact path does not hang with empty dialogue forever
- Outdoor job accept + prop interact (when possible in headless)
- Select unit → selectedUnitId changes
- Mobile viewport: critical buttons visible

Exit **non-zero** on soft-lock heuristics (no snapshot, stuck tutorial > timeout, etc.).

### 5. Fix & re-verify

1. Patch client/server as needed (Mode A only).
2. Re-run `npm run build` and `npm run test:ui` / `playtest:shot`.
3. Re-read new screenshots with `read_file`.
4. Update `docs/STATUS.md` if player-facing.

## Touch / mobile doctrine

- **Tap** → walk / interact / select crew  
- **Hold-drag** → virtual stick (`intent.dir`)  
- **Long-press (no drag)** → fire / attack  
- **Pinch** → zoom  
- Collapse chat + posse by default on narrow viewports  
- Prefer fewer chrome buttons; big Attack / Use / Stop only  

## Voice (18+)

- Rival engage: client `voice.speak` / `voice.play` taunt bank (Kingpin energy).  
- Crew select: short male/female acks (“I'm here boss”, “What's up?”).  
- Prefer MP3 under `/voice/` when present; else Web Speech API fallback.

## Do not

- Add Postgres / auth for playtests  
- Commit `playtest-out/` screenshots unless user asks  
- Force-push or reset git  

## Scripts reference

| Script | Role |
|--------|------|
| `scripts/playtest/capture.mjs` | Playwright desktop+mobile screenshots |
| `scripts/playtest/ui-test.mjs` | Interaction / soft-lock suite |
| `npm run playtest:shot` | capture only |
| `npm run test:ui` | ui-test only |
