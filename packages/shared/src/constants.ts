export const PROTOCOL_VERSION = 1;
export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

export const TILE_W = 64;
export const TILE_H = 32;

export const MOVE_SPEED = 5.0; // tiles per second (free continuous movement)
export const INTERACT_RANGE = 2.2;
export const CHAT_RANGE = 8;
export const POSSE_DETECT_RANGE = 6;
export const POSSE_AGGRO_RANGE = 4;
export const FIGHT_CHANCE = 0.45;

/** Combat tuning — upgrades & weapons should clearly matter */
export const COMBAT = {
  baseHit: 0.38,
  aimHitPerPoint: 0.045,
  gutsDodgePerPoint: 0.012,
  rangeHitPenalty: 0.022,
  aimDamagePerPoint: 0.05,
  muscleDamagePerPoint: 0.04,
  muscleArmorPierce: 0.015,
  damageVarianceMin: 0.8,
  damageVarianceMax: 1.25,
  critBase: 0.04,
  critPerAim: 0.018,
  critMultiplier: 1.55,
  /** AI shooters are less lethal so player upgrades feel good */
  aiHitPenalty: 0.12,
  aiDamageFactor: 0.78,
  playerHitBonus: 0.04,
} as const;

export const MAX_ACTIVE_GOONS = 4;
export const MAX_CHAT_LEN = 160;

export const DEFAULT_CASH = 3000;
export const DEFAULT_HEALTH = 100;

/** Seconds before a dead player leader comes back */
export const RESPAWN_DELAY_SEC = 3;
