export type WeaponId =
  | "pipe"
  | "switchblade"
  | "pistol"
  | "uzi"
  | "shotgun"
  | "tommy"
  | "minigun"
  | "flamethrower";

export type ArmorId = "none" | "leather" | "kevlar" | "plate";

export type UpgradeId =
  | "aim_training"
  | "guts_training"
  | "speed_shoes"
  | "muscle_powder"
  | "medkit";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  damage: number;
  range: number;
  fireCooldown: number; // seconds
  price: number;
  description: string;
  /** Minimum street rep to buy (server-enforced) */
  minRep?: number;
  /**
   * Rounds spent per fire attempt (hit, miss, or brick).
   * 0 = unlimited (melee + street pistol — new players never dry-click basic iron).
   */
  ammoPerShot: number;
  /**
   * Max carried rounds. `null` = unlimited (no HUD count, no shop refill).
   */
  maxAmmo: number | null;
  /** Ammo granted when the weapon is first acquired (buy / loot / starter). */
  startingAmmo: number;
  /** Full top-up to maxAmmo at Pawn-O-Matic (0 if unlimited). */
  refillPrice: number;
}

export interface ArmorDef {
  id: ArmorId;
  name: string;
  damageReduce: number; // 0-0.6
  price: number;
  description: string;
  minRep?: number;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  price: number;
  description: string;
  /** Permanent stat boosts when bought for a unit */
  stats?: Partial<{ aim: number; guts: number; speed: number; muscle: number; maxHealth: number }>;
  heal?: number;
  minRep?: number;
}

/**
 * Balance snapshot (Mode A street fight feel):
 * - Melee / pistol: unlimited ammo, always available fallback
 * - Specials: finite ammo so spray guns / heavy toys need refills
 * - Rough ideal DPS = damage / fireCooldown (before stats / miss / armor)
 *
 * | Weapon        | DMG | RNG | CD   | Ideal DPS | Ammo        | Role              |
 * |---------------|-----|-----|------|-----------|-------------|-------------------|
 * | Lead Pipe     | 12  | 1.2 | 0.55 | ~22       | ∞           | free melee        |
 * | Switchblade   | 16  | 1.3 | 0.40 | ~40       | ∞           | fast melee        |
 * | Cheap Pistol  | 22  | 5.5 | 0.42 | ~52       | ∞           | street iron       |
 * | Uzi           | 14  | 5.0 | 0.11 | ~127      | 90 (start 60) | spray             |
 * | Shotgun       | 48  | 3.4 | 0.85 | ~56       | 24 (start 16) | door-kicker       |
 * | Machine Gun   | 20  | 6.0 | 0.10 | ~200      | 150 (start 100)| starter sweeper  |
 * | Minigun       | 16  | 7.0 | 0.055| ~291      | 200 (start 120)| ammo hog late     |
 * | Flamethrower  | 28  | 3.8 | 0.18 | ~156      | 50 (start 35) | short cone pressure |
 */
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pipe: {
    id: "pipe",
    name: "Lead Pipe",
    damage: 12,
    range: 1.2,
    fireCooldown: 0.55,
    price: 0,
    description: "What you woke up with next to the dumpster. Never runs dry.",
    ammoPerShot: 0,
    maxAmmo: null,
    startingAmmo: 0,
    refillPrice: 0,
  },
  switchblade: {
    id: "switchblade",
    name: "Switchblade",
    damage: 16,
    range: 1.3,
    fireCooldown: 0.4,
    price: 40,
    description: "Fast, mean, and easy to hide. Unlimited stabs.",
    ammoPerShot: 0,
    maxAmmo: null,
    startingAmmo: 0,
    refillPrice: 0,
  },
  pistol: {
    id: "pistol",
    name: "Cheap Pistol",
    damage: 22,
    range: 5.5,
    fireCooldown: 0.42,
    price: 120,
    description: "Starts arguments it can't always finish. Street iron never dry-clicks.",
    ammoPerShot: 0,
    maxAmmo: null,
    startingAmmo: 0,
    refillPrice: 0,
  },
  uzi: {
    id: "uzi",
    name: "Uzi",
    damage: 14,
    range: 5,
    fireCooldown: 0.11,
    price: 350,
    description: "Spray and pray, baby. Burns mags fast — refill at the pawn.",
    minRep: 2,
    ammoPerShot: 1,
    maxAmmo: 90,
    startingAmmo: 60,
    refillPrice: 40,
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    damage: 48,
    range: 3.4,
    fireCooldown: 0.85,
    price: 420,
    description: "Door-kicker's best friend. Shells are finite; make them count.",
    minRep: 4,
    ammoPerShot: 1,
    maxAmmo: 24,
    startingAmmo: 16,
    refillPrice: 55,
  },
  tommy: {
    id: "tommy",
    name: "Machine Gun",
    damage: 20,
    range: 6,
    fireCooldown: 0.1,
    price: 700,
    description: "Full-auto street sweeper. Classic crime-movie swagger — until the belt runs out.",
    minRep: 6,
    ammoPerShot: 1,
    maxAmmo: 150,
    startingAmmo: 100,
    refillPrice: 70,
  },
  minigun: {
    id: "minigun",
    name: "Minigun",
    damage: 16,
    range: 7,
    fireCooldown: 0.055,
    price: 1400,
    description: "Rotary doom. Spins up your problems — and your ammo bill — into confetti.",
    minRep: 10,
    ammoPerShot: 1,
    maxAmmo: 200,
    startingAmmo: 120,
    refillPrice: 120,
  },
  flamethrower: {
    id: "flamethrower",
    name: "Flamethrower",
    damage: 28,
    range: 3.8,
    fireCooldown: 0.18,
    price: 1100,
    description: "For when subtlety dies in a dumpster fire. Fuel is not free.",
    minRep: 8,
    ammoPerShot: 1,
    maxAmmo: 50,
    startingAmmo: 35,
    refillPrice: 90,
  },
};

export const ARMORS: Record<ArmorId, ArmorDef> = {
  none: {
    id: "none",
    name: "Street Clothes",
    damageReduce: 0,
    price: 0,
    description: "Fashionably unarmored.",
  },
  leather: {
    id: "leather",
    name: "Leather Jacket",
    damageReduce: 0.12,
    price: 150,
    description: "Looks cool. Stops some bruises.",
  },
  kevlar: {
    id: "kevlar",
    name: "Kevlar Vest",
    damageReduce: 0.28,
    price: 450,
    description: "Serious about surviving the night.",
    minRep: 3,
  },
  plate: {
    id: "plate",
    name: "Plate Carrier",
    damageReduce: 0.42,
    price: 900,
    description: "Heavy. Loud. Hard to kill.",
    minRep: 7,
  },
};

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  aim_training: {
    id: "aim_training",
    name: "Aim Training",
    price: 200,
    description: "+2 Aim — better hit % and crits for selected unit.",
    stats: { aim: 2 },
    minRep: 1,
  },
  guts_training: {
    id: "guts_training",
    name: "Guts Training",
    price: 200,
    description: "+2 Guts — harder to hit, takes less damage.",
    stats: { guts: 2 },
    minRep: 1,
  },
  speed_shoes: {
    id: "speed_shoes",
    name: "Speed Shoes",
    price: 180,
    description: "+1 Speed — faster move and fire/swing rate.",
    stats: { speed: 1 },
  },
  muscle_powder: {
    id: "muscle_powder",
    name: "Muscle Powder",
    price: 180,
    description: "+2 Muscle — harder hits, armor pierce (melee loves it).",
    stats: { muscle: 2 },
    minRep: 2,
  },
  medkit: {
    id: "medkit",
    name: "Medkit",
    price: 80,
    description: "Restore 40 HP to selected unit.",
    heal: 40,
  },
};

export const SHOP_WEAPON_ORDER: WeaponId[] = [
  "switchblade",
  "pistol",
  "uzi",
  "shotgun",
  "tommy",
  "minigun",
  "flamethrower",
];

export const SHOP_ARMOR_ORDER: ArmorId[] = ["leather", "kevlar", "plate"];
export const SHOP_UPGRADE_ORDER: UpgradeId[] = [
  "medkit",
  "aim_training",
  "guts_training",
  "speed_shoes",
  "muscle_powder",
];

/** True when this weapon never consumes / tracks ammo. */
export function isUnlimitedAmmo(weaponId: WeaponId | WeaponDef): boolean {
  const def = typeof weaponId === "string" ? WEAPONS[weaponId] : weaponId;
  return !def || def.maxAmmo == null || def.ammoPerShot <= 0;
}

/** Ideal damage-per-second ignoring stats, miss, and armor (balance reference). */
export function weaponIdealDps(weaponId: WeaponId | WeaponDef): number {
  const def = typeof weaponId === "string" ? WEAPONS[weaponId] : weaponId;
  if (!def) return 0;
  return def.damage / Math.max(0.05, def.fireCooldown);
}

/** HUD / log string: ∞ or current/max. */
export function formatWeaponAmmo(
  weaponId: WeaponId,
  current: number | undefined | null,
): string {
  const def = WEAPONS[weaponId];
  if (!def || isUnlimitedAmmo(def)) return "∞";
  const cur = Math.max(0, Math.floor(current ?? 0));
  return `${cur}/${def.maxAmmo}`;
}

/** Seed ammo map for a set of owned weapons (only limited guns get entries). */
export function startingAmmoMap(owned: Iterable<WeaponId>): Partial<Record<WeaponId, number>> {
  const out: Partial<Record<WeaponId, number>> = {};
  for (const id of owned) {
    const def = WEAPONS[id];
    if (!def || isUnlimitedAmmo(def)) continue;
    out[id] = def.startingAmmo;
  }
  return out;
}
