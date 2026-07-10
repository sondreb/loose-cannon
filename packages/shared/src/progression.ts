/**
 * Heat / reputation progression (Mode A).
 * Server applies gains, decay, markups, and rep gates; client displays.
 */

export const HEAT = {
  max: 100,
  /** Per hostile kill (player-caused) */
  kill: 7,
  /** Extra when killing an AI boss */
  killBossBonus: 4,
  /** Combat missions (instance / debt) */
  missionCombat: 8,
  /** Soft outdoor jobs */
  missionSoft: 3,
  /** Protection racket hustle */
  protection: 4,
  /** Passive decay per second while not in combat */
  decayPerSec: 0.4,
  /** Heat above this slows decay */
  decaySlowAbove: 60,
  decaySlowFactor: 0.55,
} as const;

/** Shop cash markup from street heat */
export function heatPriceMult(heat: number): number {
  if (heat >= 90) return 1.5;
  if (heat >= 70) return 1.35;
  if (heat >= 40) return 1.15;
  return 1;
}

export function shopPrice(basePrice: number, heat: number): number {
  if (basePrice <= 0) return 0;
  return Math.ceil(basePrice * heatPriceMult(heat));
}

/** Heat label for HUD */
export function heatBand(heat: number): "cool" | "warm" | "hot" | "wanted" {
  if (heat >= 90) return "wanted";
  if (heat >= 70) return "hot";
  if (heat >= 40) return "warm";
  return "cool";
}

/** Bribe / lay-low cost to cool off at the bar */
export function layLowCost(heat: number): number {
  return 60 + Math.floor(heat * 2.5);
}

export const LAY_LOW_HEAT_REDUCE = 28;
