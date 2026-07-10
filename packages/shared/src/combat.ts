/**
 * Shared combat formulas + goon stat readability helpers.
 * Server applies these; client uses them for tooltips / combat preview.
 */
import { COMBAT, MOVE_SPEED } from "./constants.js";
import type { UnitStats } from "./protocol.js";

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Move speed in world tiles/sec (matches server). */
export function moveSpeedTilesPerSec(speed: number): number {
  return MOVE_SPEED * (0.7 + speed * COMBAT.speedMovePerPoint);
}

/**
 * Multiplier on weapon fireCooldown.
 * Speed 5 = 1.0; higher speed shoots / swings faster; low speed is sluggish.
 */
export function fireCooldownFactor(speed: number): number {
  const delta = speed - 5;
  return clamp(1 - delta * COMBAT.speedFireCdPerPoint, 0.68, 1.28);
}

/** Hit chance before clamp (AI / player modifiers applied by caller). */
export function rawHitChance(aim: number, targetGuts: number, range: number): number {
  return (
    COMBAT.baseHit +
    aim * COMBAT.aimHitPerPoint -
    targetGuts * COMBAT.gutsDodgePerPoint -
    range * COMBAT.rangeHitPenalty
  );
}

export function hitChanceClamped(
  aim: number,
  targetGuts: number,
  range: number,
  opts?: { isAi?: boolean },
): number {
  let h = rawHitChance(aim, targetGuts, range);
  if (opts?.isAi) h -= COMBAT.aiHitPenalty;
  else h += COMBAT.playerHitBonus;
  return clamp(h, 0.1, 0.94);
}

/** Crit chance 0–1. */
export function critChance(aim: number): number {
  return clamp(COMBAT.critBase + aim * COMBAT.critPerAim, 0.03, 0.42);
}

/**
 * Damage power multiplier before variance / armor / crit.
 * Melee gets extra muscle scaling.
 */
export function damagePower(aim: number, muscle: number, isMelee: boolean): number {
  let power =
    1 + aim * COMBAT.aimDamagePerPoint + muscle * COMBAT.muscleDamagePerPoint;
  if (isMelee) power += muscle * COMBAT.meleeMuscleBonus;
  return power;
}

/** Muscle armor pierce factor 0–cap. */
export function armorPierce(muscle: number): number {
  return clamp(muscle * COMBAT.muscleArmorPierce, 0, 0.4);
}

/** Incoming damage multiplier from target guts (toughness). */
export function gutsDamageTakenFactor(guts: number): number {
  const reduce = clamp(guts * COMBAT.gutsDamageReduce, 0, 0.28);
  return 1 - reduce;
}

export type StreetRoleId =
  | "sharpshooter"
  | "bruiser"
  | "survivor"
  | "runner"
  | "brain"
  | "street";

export interface StreetRole {
  id: StreetRoleId;
  /** Short HUD badge */
  label: string;
  /** One-line flavour */
  blurb: string;
}

/**
 * Dominant street role from stats (baseline 5).
 * Used on posse cards so players see roles at a glance.
 */
export function streetRole(stats: UnitStats): StreetRole {
  const base = 5;
  const scores: Array<{ id: StreetRoleId; score: number; label: string; blurb: string }> = [
    {
      id: "sharpshooter",
      score: stats.aim - base,
      label: "AIM",
      blurb: "Hits and crits land more often.",
    },
    {
      id: "bruiser",
      score: stats.muscle - base,
      label: "MUSCLE",
      blurb: "Hits harder, punches through armor — especially melee.",
    },
    {
      id: "survivor",
      score: stats.guts - base,
      label: "GUTS",
      blurb: "Harder to put down; shrugs off more damage.",
    },
    {
      id: "runner",
      score: stats.speed - base,
      label: "SPEED",
      blurb: "Moves faster and reloads / swings quicker.",
    },
    {
      id: "brain",
      score: stats.brains - base,
      label: "BRAINS",
      blurb: "Street smarts — job assist when content uses it.",
    },
  ];
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0]!;
  if (top.score < 1) {
    return {
      id: "street",
      label: "STREET",
      blurb: "Average meat. Train them or buy better.",
    };
  }
  return { id: top.id, label: top.label, blurb: top.blurb };
}

/** Plain-language effect for a single stat value (tooltips). */
export function statEffectLines(
  key: keyof UnitStats,
  value: number,
): { title: string; lines: string[] } {
  switch (key) {
    case "aim": {
      const hitMid = hitChanceClamped(value, 5, 3);
      const crit = critChance(value);
      return {
        title: "Aim",
        lines: [
          `Hit ~${Math.round(hitMid * 100)}% at mid range (vs Guts 5)`,
          `Crit ~${Math.round(crit * 100)}%`,
          "Also adds a little damage",
        ],
      };
    }
    case "guts": {
      const dodge = clamp(value * COMBAT.gutsDodgePerPoint, 0, 0.35);
      const tough = 1 - gutsDamageTakenFactor(value);
      return {
        title: "Guts",
        lines: [
          `−${Math.round(dodge * 100)}% enemy hit chance (dodge)`,
          `−${Math.round(tough * 100)}% damage taken (toughness)`,
          `Soft cover (wall hug): −${Math.round(COMBAT.coverHitPenalty * 100)}% enemy hit`,
          "Walls fully block LoS shots",
        ],
      };
    }
    case "muscle": {
      const powerRanged = damagePower(5, value, false);
      const powerMelee = damagePower(5, value, true);
      const pierce = armorPierce(value);
      return {
        title: "Muscle",
        lines: [
          `Ranged power ×${powerRanged.toFixed(2)} (at Aim 5)`,
          `Melee power ×${powerMelee.toFixed(2)}`,
          `${Math.round(pierce * 100)}% armor pierce`,
        ],
      };
    }
    case "speed": {
      const move = moveSpeedTilesPerSec(value);
      const cd = fireCooldownFactor(value);
      const pct = Math.round((1 - cd) * 100);
      return {
        title: "Speed",
        lines: [
          `Move ${move.toFixed(1)} tiles/s`,
          pct >= 0
            ? `Fire/swing ${pct}% faster`
            : `Fire/swing ${Math.abs(pct)}% slower`,
          "Runners kite and re-engage",
        ],
      };
    }
    case "brains":
      return {
        title: "Brains",
        lines: [
          "Street smarts / job assist",
          "Does not change gunfights yet",
        ],
      };
    case "maxHealth":
      return {
        title: "Max HP",
        lines: [`${value} hit points before they drop`],
      };
    default:
      return { title: String(key), lines: [] };
  }
}

/** One-line combat preview for gear / crew UI. */
export function combatPreviewLine(stats: UnitStats, isMelee = false): string {
  const hit = hitChanceClamped(stats.aim, 5, 3);
  const crit = critChance(stats.aim);
  const power = damagePower(stats.aim, stats.muscle, isMelee);
  const move = moveSpeedTilesPerSec(stats.speed);
  const role = streetRole(stats);
  return `${role.label} · Hit ~${Math.round(hit * 100)}% · Crit ~${Math.round(crit * 100)}% · Pwr ×${power.toFixed(2)} · ${move.toFixed(1)} t/s`;
}

/** Hire-pool archetype for distinct recruit feel. */
export interface RecruitArchetype {
  id: StreetRoleId;
  label: string;
  /** Partial stat overrides before jitter */
  stats: Partial<UnitStats>;
  /** Optional starter weapon flavor */
  weaponHint?: "pistol" | "switchblade" | "pipe";
  hireLine: string;
}

export const RECRUIT_ARCHETYPES: RecruitArchetype[] = [
  {
    id: "sharpshooter",
    label: "sharpshooter",
    stats: { aim: 8, guts: 4, muscle: 4, speed: 5, brains: 5 },
    weaponHint: "pistol",
    hireLine: "Good eye. Don't waste it on pigeons.",
  },
  {
    id: "bruiser",
    label: "bruiser",
    stats: { aim: 4, guts: 5, muscle: 8, speed: 4, brains: 4 },
    weaponHint: "pipe",
    hireLine: "Built like a fridge. Point them at a door.",
  },
  {
    id: "survivor",
    label: "survivor",
    stats: { aim: 5, guts: 8, muscle: 5, speed: 5, brains: 5 },
    weaponHint: "pistol",
    hireLine: "Hard to kill. Soft on conversation.",
  },
  {
    id: "runner",
    label: "runner",
    stats: { aim: 5, guts: 4, muscle: 4, speed: 8, brains: 5 },
    weaponHint: "switchblade",
    hireLine: "Fast feet. Watch the exits.",
  },
  {
    id: "brain",
    label: "smartass",
    stats: { aim: 5, guts: 5, muscle: 4, speed: 5, brains: 8 },
    weaponHint: "pistol",
    hireLine: "Thinks they're clever. Sometimes they are.",
  },
  {
    id: "street",
    label: "street meat",
    stats: { aim: 5, guts: 5, muscle: 5, speed: 5, brains: 5 },
    weaponHint: "pistol",
    hireLine: "Warm body. Don't get attached.",
  },
];

export function pickRecruitArchetype(rng: () => number = Math.random): RecruitArchetype {
  const i = Math.floor(rng() * RECRUIT_ARCHETYPES.length);
  return RECRUIT_ARCHETYPES[i] ?? RECRUIT_ARCHETYPES[RECRUIT_ARCHETYPES.length - 1]!;
}

// ——— Enemy AI combat roles (M5) ———

/** How AI street meat fights once hostile. */
export type AiCombatRole = "shooter" | "rusher" | "coward";

export function aiRoleLabel(role: AiCombatRole): string {
  switch (role) {
    case "rusher":
      return "RUSH";
    case "coward":
      return "FLEE";
    case "shooter":
    default:
      return "HOLD";
  }
}

export function aiRoleBlurb(role: AiCombatRole): string {
  switch (role) {
    case "rusher":
      return "Charges in close — watch the flanks.";
    case "coward":
      return "Holds range, bails when bleeding.";
    case "shooter":
    default:
      return "Keeps mid-range and sprays.";
  }
}

/**
 * Preferred stand-off distance (world tiles) for this role + weapon range.
 * Rusher closes; shooter holds ~weapon range; coward stays deep and flees when low.
 */
export function preferredEngageRange(role: AiCombatRole, weaponRange: number): number {
  switch (role) {
    case "rusher":
      return Math.max(1.05, Math.min(weaponRange * 0.42, 2.15));
    case "coward":
      return Math.max(2.4, weaponRange * 0.92);
    case "shooter":
    default:
      return Math.max(1.45, weaponRange * 0.78);
  }
}

/** HP fraction below which cowards (and battered shooters) try to create space. */
export const AI_FLEE_HEALTH_FRAC = 0.38;

/**
 * Assign roles across an AI posse so fights aren't homogeneous.
 * Boss = shooter (or coward if low aggression); goons mix rush + hold + fleer.
 */
export function assignAiPosseRoles(
  memberCount: number,
  opts?: { aggression?: number; rng?: () => number },
): AiCombatRole[] {
  const rng = opts?.rng ?? Math.random;
  const aggression = opts?.aggression ?? 0.6;
  if (memberCount <= 0) return [];
  const roles: AiCombatRole[] = [];
  // Boss (index 0)
  roles.push(aggression < 0.4 ? "coward" : "shooter");
  for (let i = 1; i < memberCount; i++) {
    if (i === 1) roles.push("rusher");
    else if (i === 2) roles.push(rng() < 0.45 ? "coward" : "shooter");
    else {
      const r = rng();
      roles.push(r < 0.4 ? "rusher" : r < 0.75 ? "shooter" : "coward");
    }
  }
  return roles;
}

/** Apply archetype + small jitter so clones aren't identical. */
export function rollRecruitStats(
  archetype: RecruitArchetype,
  rng: () => number = Math.random,
): UnitStats {
  const j = (base: number) => base + Math.floor(rng() * 3) - 1; // −1..+1
  const s = archetype.stats;
  return {
    aim: clamp(j(s.aim ?? 5), 2, 12),
    guts: clamp(j(s.guts ?? 5), 2, 12),
    muscle: clamp(j(s.muscle ?? 5), 2, 12),
    brains: clamp(j(s.brains ?? 5), 2, 12),
    speed: clamp(j(s.speed ?? 5), 2, 12),
    maxHealth: 100,
  };
}
