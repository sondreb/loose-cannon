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
  /** Soft street crimes (phone scam, mail, hydrant, cone, car jack) — see HUSTLE_HEAT */
  hustleSoft: 2,
  /** Smashing neon / loud street crime */
  hustleLoud: 5,
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

/** The Titty Twister — tip stages (0 clothed → max most revealing) */
export const DANCER_MAX_STAGE = 2;
/** Cash cost to advance FROM stage i → i+1 (index = current stage) */
export const DANCER_TIP_COSTS = [50, 120, 250] as const;

export function dancerTipCost(stage: number): number | null {
  if (stage < 0 || stage >= DANCER_MAX_STAGE) return null;
  return DANCER_TIP_COSTS[stage] ?? null;
}
