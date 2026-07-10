export type WeaponId =
  | "pipe"
  | "switchblade"
  | "pistol"
  | "uzi"
  | "shotgun"
  | "tommy"
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
}

export interface ArmorDef {
  id: ArmorId;
  name: string;
  damageReduce: number; // 0-0.6
  price: number;
  description: string;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  price: number;
  description: string;
  /** Permanent stat boosts when bought for a unit */
  stats?: Partial<{ aim: number; guts: number; speed: number; muscle: number; maxHealth: number }>;
  heal?: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pipe: {
    id: "pipe",
    name: "Lead Pipe",
    damage: 12,
    range: 1.2,
    fireCooldown: 0.55,
    price: 0,
    description: "What you woke up with next to the dumpster.",
  },
  switchblade: {
    id: "switchblade",
    name: "Switchblade",
    damage: 16,
    range: 1.3,
    fireCooldown: 0.4,
    price: 40,
    description: "Fast, mean, and easy to hide.",
  },
  pistol: {
    id: "pistol",
    name: "Cheap Pistol",
    damage: 22,
    range: 5.5,
    fireCooldown: 0.42,
    price: 120,
    description: "Starts arguments it can't always finish.",
  },
  uzi: {
    id: "uzi",
    name: "Uzi",
    damage: 14,
    range: 5,
    fireCooldown: 0.11,
    price: 350,
    description: "Spray and pray, baby.",
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    damage: 48,
    range: 3.4,
    fireCooldown: 0.85,
    price: 420,
    description: "Door-kicker's best friend.",
  },
  tommy: {
    id: "tommy",
    name: "Machine Gun",
    damage: 20,
    range: 6,
    fireCooldown: 0.1,
    price: 700,
    description: "Full-auto street sweeper. Classic crime-movie swagger.",
  },
  flamethrower: {
    id: "flamethrower",
    name: "Flamethrower",
    damage: 28,
    range: 3.8,
    fireCooldown: 0.18,
    price: 1100,
    description: "For when subtlety dies in a dumpster fire.",
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
  },
  plate: {
    id: "plate",
    name: "Plate Carrier",
    damageReduce: 0.42,
    price: 900,
    description: "Heavy. Loud. Hard to kill.",
  },
};

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  aim_training: {
    id: "aim_training",
    name: "Aim Training",
    price: 200,
    description: "+2 Aim permanently for selected unit.",
    stats: { aim: 2 },
  },
  guts_training: {
    id: "guts_training",
    name: "Guts Training",
    price: 200,
    description: "+2 Guts permanently for selected unit.",
    stats: { guts: 2 },
  },
  speed_shoes: {
    id: "speed_shoes",
    name: "Speed Shoes",
    price: 180,
    description: "+1 Speed permanently.",
    stats: { speed: 1 },
  },
  muscle_powder: {
    id: "muscle_powder",
    name: "Muscle Powder",
    price: 180,
    description: "+2 Muscle permanently.",
    stats: { muscle: 2 },
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
