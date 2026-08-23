/**
 * Per-building shop catalogs (Mode A).
 * Pawn / guns / liquor / chop parts must feel like different counters —
 * not one global inventory copy-pasted into three façades.
 */
import type { ArmorId, UpgradeId, WeaponId } from "./weapons.js";

export interface ShopCatalog {
  weapons: WeaponId[];
  armors: ArmorId[];
  upgrades: UpgradeId[];
  /** Limited-gun top-up rows (pawn + gun shop). */
  refillAmmo: boolean;
  tagline: string;
  logo: string;
}

const PAWN: ShopCatalog = {
  weapons: ["switchblade", "pistol", "uzi"],
  armors: ["leather", "kevlar"],
  upgrades: ["medkit", "speed_shoes", "aim_training"],
  refillAmmo: true,
  tagline: "Used iron, used jackets, used luck. Cash only. Heat tax applies (*).",
  logo: "P",
};

const GUN: ShopCatalog = {
  weapons: ["pistol", "uzi", "shotgun", "tommy", "minigun", "flamethrower"],
  armors: ["kevlar", "plate"],
  upgrades: ["aim_training", "medkit"],
  refillAmmo: true,
  tagline: "Bullets, alibis, and a receipt that forgets your name.",
  logo: "A",
};

const LIQUOR: ShopCatalog = {
  weapons: [],
  armors: [],
  upgrades: ["cheap_beer", "rotgut", "whiskey", "ice_pack", "guts_training"],
  refillAmmo: false,
  tagline: "Courage in a bottle. Judgment sold separately.",
  logo: "L",
};

const GARAGE: ShopCatalog = {
  weapons: ["switchblade"],
  armors: ["leather"],
  upgrades: ["speed_shoes", "medkit"],
  refillAmmo: false,
  tagline: "Parts fell off a better car. VIN optional. Conscience not stocked.",
  logo: "C",
};

export function shopCatalog(buildingId: string | null | undefined): ShopCatalog {
  switch (buildingId) {
    case "shop_gun":
      return GUN;
    case "shop_liquor":
      return LIQUOR;
    case "garage":
      return GARAGE;
    case "shop_pawn":
    default:
      return PAWN;
  }
}

export function shopSellsWeapon(
  buildingId: string | null | undefined,
  id: WeaponId,
): boolean {
  return shopCatalog(buildingId).weapons.includes(id);
}

export function shopSellsArmor(
  buildingId: string | null | undefined,
  id: ArmorId,
): boolean {
  return shopCatalog(buildingId).armors.includes(id);
}

export function shopSellsUpgrade(
  buildingId: string | null | undefined,
  id: UpgradeId,
): boolean {
  return shopCatalog(buildingId).upgrades.includes(id);
}

export function shopRefillsAmmo(buildingId: string | null | undefined): boolean {
  return shopCatalog(buildingId).refillAmmo;
}
