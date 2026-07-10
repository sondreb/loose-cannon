/**
 * Goon facing + walk-cycle helpers (client presentation only).
 * Server facing is 0–7 from atan2(dy,dx) with offset:
 *   0=W 1=NW 2=N 3=NE 4=E 5=SE 6=S 7=SW
 * Goon PNGs face screen-right; flip when the iso projection aims left.
 */

import { TILE_H, TILE_W } from "@loose-cannon/shared";

/** World unit vector for an octant facing (matches server facingFromDelta). */
export function facingToDir(facing: number): { dx: number; dy: number } {
  const f = ((Math.round(facing) % 8) + 8) % 8;
  const a = f * (Math.PI / 4) - Math.PI;
  return { dx: Math.cos(a), dy: Math.sin(a) };
}

/** Facing octant from a world delta (same formula as server). */
export function facingFromDelta(dx: number, dy: number): number {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return 0;
  const angle = Math.atan2(dy, dx);
  return Math.round((angle + Math.PI) / (Math.PI / 4)) % 8;
}

/**
 * Screen-space horizontal of a world facing — positive = right on canvas.
 * Iso: sx ∝ (x − y).
 */
export function facingScreenX(facing: number): number {
  const { dx, dy } = facingToDir(facing);
  return (dx - dy) * (TILE_W / 2);
}

/** +1 = art faces right (default PNG), −1 = mirror for leftward screen motion. */
export function facingFlip(facing: number): 1 | -1 {
  return facingScreenX(facing) < 0 ? -1 : 1;
}

/** Soft lean toward travel (radians). Positive tilts clockwise. */
export function facingLean(facing: number, moving: boolean): number {
  if (!moving) return 0;
  const sx = facingScreenX(facing);
  const { dx, dy } = facingToDir(facing);
  // Vertical screen component: sy ∝ (x + y)
  const screenY = (dx + dy) * (TILE_H / 2);
  // Lean into left/right motion; slight pitch when going "into" or "out of" camera
  const horiz = Math.max(-1, Math.min(1, sx / (TILE_W * 0.55)));
  const depth = Math.max(-1, Math.min(1, screenY / (TILE_H * 0.55)));
  return horiz * 0.07 + depth * 0.03;
}

export interface WalkCycle {
  /** Vertical foot bounce (screen px) */
  bobY: number;
  /** Lateral body sway */
  swayX: number;
  /** Extra rotation while striding (radians) */
  rock: number;
  /** Sprite scaleY multiplier (squash on plant) */
  scaleY: number;
  /** Sprite scaleX multiplier (stretch at mid-stride) */
  scaleX: number;
  /** Contact shadow width scale */
  shadowW: number;
  /** Contact shadow height scale */
  shadowH: number;
  /** Procedural left/right leg lift */
  legL: number;
  legR: number;
}

/**
 * Two-beat street walk. `phase` advances in prediction/interp (~9–12/s).
 * `speedNorm` ~ tiles/s / 5 so runners cadence faster.
 */
export function walkCycle(phase: number, moving: boolean, speedNorm = 1): WalkCycle {
  if (!moving) {
    // Idle breath — barely visible
    const breath = Math.sin(phase * 0.35) * 0.35;
    return {
      bobY: breath,
      swayX: Math.sin(phase * 0.22) * 0.25,
      rock: 0,
      scaleY: 1,
      scaleX: 1,
      shadowW: 1,
      shadowH: 1,
      legL: 0,
      legR: 0,
    };
  }

  const sn = Math.max(0.65, Math.min(1.45, speedNorm));
  // Full stride = 2π; two foot plants per cycle
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const s2 = Math.sin(phase * 2); // double-time for vertical bob peaks

  // Plant low (negative), mid-stride lift positive — keep amplitude small so feet stay grounded
  const bobY = s2 * 1.15 * sn;
  const swayX = s * 1.35 * sn;
  const rock = c * 0.045 * sn;

  // Squash on foot plant (s2 peaks when feet down in our bob formula → invert)
  const plant = Math.max(0, -s2); // 0..1 at plant
  const air = Math.max(0, s2);
  const scaleY = 1 - plant * 0.04 + air * 0.025;
  const scaleX = 1 + plant * 0.03 - air * 0.02;

  const shadowW = 1 + plant * 0.12 - air * 0.06;
  const shadowH = 1 - plant * 0.08 + air * 0.1;

  const legAmp = 3.2 * sn;
  const legL = Math.max(0, s) * legAmp;
  const legR = Math.max(0, -s) * legAmp;

  return {
    bobY,
    swayX,
    rock,
    scaleY,
    scaleX,
    shadowW,
    shadowH,
    legL,
    legR,
  };
}

/** Phase advance rate — scales with unit move speed (baseline 5 → ~10). */
export function walkPhaseRate(speedStat: number, moving: boolean): number {
  if (!moving) return 1.2; // idle breath
  const tiles = Math.max(3, Math.min(9, speedStat));
  // ~2 full strides per second at speed 5
  return 8 + (tiles - 5) * 1.1;
}
