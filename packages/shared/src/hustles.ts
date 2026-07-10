/**
 * Street hustles / outdoor prop POI interactions (Mode A).
 * Server owns outcomes; client uses labels + readyIn for hover UX.
 */

/** Cooldown seconds after a successful hustle (shared prop, realm-wide). */
export const HUSTLE_CD = {
  dumpster: 45,
  protection: 60,
  car: 90,
  motorcycle: 90,
  crate: 70,
  phonebooth: 50,
  mailbox: 55,
  hydrant: 40,
  neon: 75,
  cone: 35,
} as const;

export type HustlePropKind = keyof typeof HUSTLE_CD;

/** Extra heat beyond HEAT.protection for soft street crimes */
export const HUSTLE_HEAT = {
  phoneScam: 3,
  mailbox: 2,
  neonSmash: 5,
  carJack: 3,
  coneTrouble: 2,
  hydrant: 1,
  shake: 4,
} as const;

/** Readable verb on prop hover */
export function propHustleAction(kind: string): string {
  switch (kind) {
    case "dumpster":
    case "crate":
    case "mailbox":
      return "Search";
    case "protection":
      return "Collect";
    case "car":
    case "motorcycle":
      return "Jack";
    case "phonebooth":
      return "Call";
    case "hydrant":
      return "Open";
    case "neon":
      return "Smash";
    case "cone":
      return "Move";
    default:
      return "Inspect";
  }
}

export function isHustlePropKind(kind: string): kind is HustlePropKind {
  return kind in HUSTLE_CD;
}

export function hustleCooldownSec(kind: string): number {
  if (isHustlePropKind(kind)) return HUSTLE_CD[kind];
  return 45;
}
