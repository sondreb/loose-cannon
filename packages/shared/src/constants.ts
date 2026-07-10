export const PROTOCOL_VERSION = 1;
/** Higher tick = snappier movement (still lightweight) */
export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;

export const TILE_W = 64;
export const TILE_H = 32;

export const MOVE_SPEED = 5.5; // tiles per second
export const INTERACT_RANGE = 2.2;
export const CHAT_RANGE = 8;
export const POSSE_DETECT_RANGE = 6;
export const POSSE_AGGRO_RANGE = 4;
export const FIGHT_CHANCE = 0.45;

/**
 * Safe / war zoning (world tiles).
 * y < SAFE_Y_MAX = PvE downtown (recruit, shop, no murders).
 * y >= SAFE_Y_MAX outdoor = PvP war zone (rival gangs).
 */
export const SAFE_Y_MAX = 38;

/**
 * Combat tuning — goon stats must feel distinct:
 * Aim = hit/crit, Muscle = power/pierce (melee loves it),
 * Guts = dodge + toughness, Speed = move + fire rate.
 */
export const COMBAT = {
  baseHit: 0.36,
  aimHitPerPoint: 0.048,
  gutsDodgePerPoint: 0.022,
  rangeHitPenalty: 0.022,
  aimDamagePerPoint: 0.035,
  muscleDamagePerPoint: 0.055,
  muscleArmorPierce: 0.02,
  /** Extra muscle power on pipe / switchblade */
  meleeMuscleBonus: 0.075,
  /** Guts reduces incoming damage (toughness) */
  gutsDamageReduce: 0.014,
  /** Speed vs baseline 5: fireCooldown *= (1 − delta × this) */
  speedFireCdPerPoint: 0.028,
  /** Move: MOVE_SPEED * (0.7 + speed * this) */
  speedMovePerPoint: 0.06,
  damageVarianceMin: 0.85,
  damageVarianceMax: 1.2,
  critBase: 0.04,
  critPerAim: 0.022,
  critMultiplier: 1.55,
  aiHitPenalty: 0.12,
  aiDamageFactor: 0.78,
  playerHitBonus: 0.04,
  /** Soft cover: target hugging a wall takes this hit-chance penalty (additive) */
  coverHitPenalty: 0.1,
} as const;

export const MAX_ACTIVE_GOONS = 4;
export const MAX_CHAT_LEN = 160;
/** Max player posses in one party (within a realm) */
export const PARTY_MAX = 4;

export const DEFAULT_CASH = 3000;
export const DEFAULT_HEALTH = 100;

export const RESPAWN_DELAY_SEC = 3;

export function isSafeWorldPos(x: number, y: number, insideBuildingId: string | null): boolean {
  // Interiors that are in the north / civic life are always safe
  if (insideBuildingId) {
    const safeInteriors = new Set([
      "bar_rusty",
      "shop_pawn",
      "hospital",
      "gym",
      "safehouse",
      "club_neon",
      "church",
      "shop_liquor",
      "garage",
      "coldstore",
    ]);
    // Warehouse / coldstore are war narrative but still no PvP inside for simplicity
    if (
      safeInteriors.has(insideBuildingId) ||
      insideBuildingId === "warehouse" ||
      insideBuildingId === "shop_gun"
    ) {
      return true;
    }
    return true; // all interiors non-lethal for now
  }
  return y < SAFE_Y_MAX;
}
