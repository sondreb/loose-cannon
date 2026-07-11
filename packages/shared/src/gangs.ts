/**
 * Rival street gangs — flavor, gear bias, and aggression profiles.
 * Map spawns (mapData.aiPosseSpawns) place crews; this module makes each feel distinct.
 * Server-authoritative; clients only see names / weapons / colors on units.
 */

import type { AiCombatRole } from "./combat.js";
import type { ArmorId, WeaponId } from "./weapons.js";

export type GangRoleBias = "rush" | "hold" | "flee" | "mixed";

export interface GangProfile {
  id: string;
  name: string;
  /** One-line street intel (logs / NPC tips) */
  blurb: string;
  /** 0–1 fight eagerness (multiplies FIGHT_CHANCE) */
  aggression: number;
  /** Tiles at which they may open fire */
  aggroRange: number;
  /** Tiles at which they size you up */
  detectRange: number;
  roleBias: GangRoleBias;
  /** Boss name suffix: "Top Dog", "Road Captain", … */
  bossTitle: string;
  /** Themed goon epithets / nicknames */
  goonEpithets: string[];
  firstNamesM: string[];
  firstNamesF: string[];
  /** Preferred weapon pool per combat role (threat may upgrade) */
  preferredWeapons: {
    shooter: WeaponId[];
    rusher: WeaponId[];
    coward: WeaponId[];
  };
  preferredArmor: { boss: ArmorId; goon: ArmorId };
  /** Applied after threat-tier base stats */
  statBias: Partial<{
    aim: number;
    guts: number;
    muscle: number;
    brains: number;
    speed: number;
    maxHealth: number;
  }>;
  /** Loot cash multiplier on spawn */
  cashMult: number;
}

/** Street gangs keyed by map spawn id */
export const GANG_PROFILES: Record<string, GangProfile> = {
  ai_dogs: {
    id: "ai_dogs",
    name: "The Dumpster Dogs",
    blurb: "trash-can brawlers, all teeth and no filter",
    aggression: 0.72,
    aggroRange: 3.4,
    detectRange: 5.5,
    roleBias: "rush",
    bossTitle: "Top Dog",
    goonEpithets: ["Mutt", "Scrap", "Bin-Lid", "Wet Nose", "Alley Bite", "Raccoon"],
    firstNamesM: ["Rusty", "Chomp", "Butch", "Grit", "Knuckles", "Paws"],
    firstNamesF: ["Bitey", "Mange", "Scratch", "Flea", "Growl", "Trash"],
    preferredWeapons: {
      // light → heavy (pickGangWeapon escalates toward the end)
      shooter: ["pistol", "uzi"],
      rusher: ["pipe", "switchblade", "shotgun"],
      coward: ["pistol", "pipe"],
    },
    preferredArmor: { boss: "leather", goon: "none" },
    statBias: { muscle: 2, guts: 1, aim: -1, maxHealth: 8 },
    cashMult: 0.85,
  },
  ai_rats: {
    id: "ai_rats",
    name: "Rail Rats",
    blurb: "track vermin — spray, scurry, and steal your lunch",
    aggression: 0.52,
    aggroRange: 3.8,
    detectRange: 6.2,
    roleBias: "flee",
    bossTitle: "Nest King",
    goonEpithets: ["Squeak", "Tunnel", "Third Rail", "Grease", "Boxcar", "Whiskers"],
    firstNamesM: ["Slink", "Nibble", "Track", "Spike", "Freight", "Claw"],
    firstNamesF: ["Scurry", "Nest", "Piper", "Vermin", "Rust", "Cinder"],
    preferredWeapons: {
      shooter: ["uzi", "pistol"],
      rusher: ["switchblade", "pipe", "uzi"],
      coward: ["pistol", "uzi"],
    },
    preferredArmor: { boss: "leather", goon: "none" },
    statBias: { speed: 2, aim: 1, guts: -1, muscle: -1 },
    cashMult: 0.9,
  },
  ai_south: {
    id: "ai_south",
    name: "Southside Slicks",
    blurb: "tailored jackets, dirty money, clean shots",
    aggression: 0.55,
    aggroRange: 4.2,
    detectRange: 6.5,
    roleBias: "hold",
    bossTitle: "Silk Capo",
    goonEpithets: ["Velvet", "Cufflinks", "Shine", "Two-Tone", "Linen", "Chrome Cap"],
    firstNamesM: ["Marco", "Dante", "Silvio", "Gio", "Nico", "Luca"],
    firstNamesF: ["Val", "Sofia", "Carmen", "Lina", "Bianca", "Rosa"],
    preferredWeapons: {
      shooter: ["pistol", "uzi", "tommy"],
      rusher: ["switchblade", "shotgun"],
      coward: ["pistol", "uzi"],
    },
    preferredArmor: { boss: "kevlar", goon: "leather" },
    statBias: { aim: 2, brains: 1, muscle: -1 },
    cashMult: 1.15,
  },
  ai_west: {
    id: "ai_west",
    name: "West End Wreckers",
    blurb: "demo crew that never put the crowbars down",
    aggression: 0.58,
    aggroRange: 3.6,
    detectRange: 5.8,
    roleBias: "rush",
    bossTitle: "Foreman",
    goonEpithets: ["Rebar", "Wreck", "Crowbar", "Hardhat", "Rubble", "Jackhammer"],
    firstNamesM: ["Hank", "Gus", "Clay", "Brick", "Diesel", "Bolt"],
    firstNamesF: ["Wrench", "Sparks", "Hazel", "Tarp", "Grit", "Rivet"],
    preferredWeapons: {
      shooter: ["shotgun", "uzi"],
      rusher: ["pipe", "shotgun", "switchblade"],
      coward: ["pistol", "pipe"],
    },
    preferredArmor: { boss: "leather", goon: "leather" },
    statBias: { muscle: 2, guts: 1, speed: -1, maxHealth: 10 },
    cashMult: 1.0,
  },
  ai_lot: {
    id: "ai_lot",
    name: "Lot Lizards MC",
    blurb: "parking-lot club — chains, shotguns, and bad exhaust",
    aggression: 0.48,
    aggroRange: 4.0,
    detectRange: 6.0,
    roleBias: "mixed",
    bossTitle: "Road Captain",
    goonEpithets: ["Throttle", "Kickstand", "Pothole", "Chrome", "Burnout", "Sidecar"],
    firstNamesM: ["Axle", "Tank", "Hog", "Rev", "Cutter", "Rider"],
    firstNamesF: ["Throttle", "Vixen", "Pipes", "Leather", "Asphalt", "Rogue"],
    preferredWeapons: {
      shooter: ["uzi", "shotgun", "tommy"],
      rusher: ["pipe", "shotgun"],
      coward: ["pistol", "shotgun"],
    },
    preferredArmor: { boss: "leather", goon: "leather" },
    statBias: { guts: 1, muscle: 1, aim: 0, speed: 1 },
    cashMult: 1.05,
  },
  ai_church: {
    id: "ai_church",
    name: "Choir of Pain",
    blurb: "quiet hymns, quiet knives — until the chorus hits",
    aggression: 0.32,
    aggroRange: 3.2,
    detectRange: 7.0,
    roleBias: "flee",
    bossTitle: "Choirmaster",
    goonEpithets: ["Psalm", "Vesper", "Bell", "Candle", "Altar", "Confession"],
    firstNamesM: ["Brother", "Father", "Hymn", "Silent", "Monk", "Grace"],
    firstNamesF: ["Sister", "Vesper", "Mercy", "Halo", "Choir", "Lament"],
    preferredWeapons: {
      shooter: ["pistol", "uzi"],
      rusher: ["switchblade", "pipe"],
      coward: ["pistol"],
    },
    preferredArmor: { boss: "none", goon: "none" },
    statBias: { aim: 1, guts: -1, brains: 2, speed: 1 },
    cashMult: 0.75,
  },
  ai_docks: {
    id: "ai_docks",
    name: "Pier Punchers",
    blurb: "dock fists and freezer breath — don't stand near the edge",
    aggression: 0.55,
    aggroRange: 3.5,
    detectRange: 5.5,
    roleBias: "rush",
    bossTitle: "Wharf Boss",
    goonEpithets: ["Hook", "Cargo", "Barnacle", "Tide", "Crane", "Bilge"],
    firstNamesM: ["Dock", "Pike", "Salt", "Keel", "Net", "Crab"],
    firstNamesF: ["Harbor", "Spray", "Anchor", "Pier", "Foam", "Gull"],
    preferredWeapons: {
      shooter: ["shotgun", "pistol"],
      rusher: ["pipe", "switchblade", "shotgun"],
      coward: ["pistol"],
    },
    preferredArmor: { boss: "leather", goon: "none" },
    statBias: { muscle: 2, guts: 2, aim: -1, maxHealth: 12 },
    cashMult: 1.0,
  },
  ai_neon: {
    id: "ai_neon",
    name: "Neon Vipers",
    blurb: "club-strip predators — loud guns, louder jackets",
    aggression: 0.62,
    aggroRange: 4.6,
    detectRange: 7.0,
    roleBias: "hold",
    bossTitle: "Queen Fang",
    goonEpithets: ["Glow", "Strobe", "Venom", "Pulse", "Laser", "Hiss"],
    firstNamesM: ["Neon", "Viper", "Flash", "Cobalt", "Surge", "Prism"],
    firstNamesF: ["Venom", "Glitter", "Pulse", "Chrome", "Siren", "Spark"],
    preferredWeapons: {
      shooter: ["uzi", "tommy", "minigun"],
      rusher: ["shotgun", "uzi", "flamethrower"],
      coward: ["pistol", "uzi"],
    },
    preferredArmor: { boss: "plate", goon: "kevlar" },
    statBias: { aim: 2, speed: 1, guts: 1, maxHealth: 15 },
    cashMult: 1.35,
  },
  ai_chrome: {
    id: "ai_chrome",
    name: "Chrome Fists",
    blurb: "polished knuckles and zero patience",
    aggression: 0.6,
    aggroRange: 3.3,
    detectRange: 5.5,
    roleBias: "rush",
    bossTitle: "Iron Hands",
    goonEpithets: ["Knuckle", "Mirror", "Polish", "Steel", "Glove", "Dent"],
    firstNamesM: ["Chrome", "Iron", "Fist", "Bolt", "Steel", "Punch"],
    firstNamesF: ["Knux", "Silver", "Hard", "Plate", "Rivet", "Impact"],
    preferredWeapons: {
      shooter: ["uzi", "pistol"],
      rusher: ["pipe", "switchblade", "shotgun"],
      coward: ["pistol", "switchblade"],
    },
    preferredArmor: { boss: "kevlar", goon: "leather" },
    statBias: { muscle: 3, speed: 1, aim: -1, maxHealth: 10 },
    cashMult: 1.1,
  },
};

/** Instance freeloader flavors (warehouse / garage / coldstore) */
export const INSTANCE_GANG_FLAVORS: Record<
  string,
  Pick<
    GangProfile,
    | "blurb"
    | "roleBias"
    | "bossTitle"
    | "goonEpithets"
    | "firstNamesM"
    | "firstNamesF"
    | "preferredWeapons"
    | "preferredArmor"
    | "statBias"
    | "aggression"
  >
> = {
  Bay: {
    blurb: "sealed-bay freeloaders",
    roleBias: "mixed",
    bossTitle: "Bay Boss",
    goonEpithets: ["Crate", "Pallet", "Forklift", "Seal", "Bay Rat"],
    firstNamesM: ["Bay", "Dock", "Seal", "Load", "Pallet"],
    firstNamesF: ["Bay", "Cargo", "Tape", "Shrink", "Stack"],
    // Pistols + melee only — warehouse starter fight must stay readable
    preferredWeapons: {
      shooter: ["pistol"],
      rusher: ["pipe", "switchblade"],
      coward: ["pistol"],
    },
    preferredArmor: { boss: "none", goon: "none" },
    statBias: { aim: -1, muscle: -1 },
    aggression: 0.85,
  },
  Chop: {
    blurb: "chop-bay grease monkeys with power tools",
    roleBias: "rush",
    bossTitle: "Chop Lead",
    goonEpithets: ["Wrench", "Torque", "Rim", "Oil", "Frame"],
    firstNamesM: ["Chop", "Axle", "Grease", "Socket", "Hub"],
    firstNamesF: ["Torque", "Sparks", "Brake", "Clutch", "Vinyl"],
    preferredWeapons: {
      shooter: ["shotgun", "pistol"],
      rusher: ["pipe", "shotgun", "switchblade"],
      coward: ["pistol"],
    },
    preferredArmor: { boss: "leather", goon: "leather" },
    statBias: { muscle: 2, guts: 1 },
    aggression: 0.88,
  },
  Frost: {
    blurb: "freezer squatters — cold steel, colder hospitality",
    roleBias: "hold",
    bossTitle: "Frost Boss",
    goonEpithets: ["Ice", "Frost", "Shelf", "Chill", "Icicle"],
    firstNamesM: ["Frost", "Ice", "Cold", "Rime", "Polar"],
    firstNamesF: ["Chill", "Snow", "Frost", "Glaze", "Zero"],
    preferredWeapons: {
      shooter: ["uzi", "pistol"],
      rusher: ["pipe", "switchblade"],
      coward: ["pistol", "uzi"],
    },
    preferredArmor: { boss: "leather", goon: "none" },
    statBias: { aim: 1, guts: 1, speed: -1, maxHealth: 6 },
    aggression: 0.9,
  },
  Choir: {
    blurb: "after-hours pew squatters — quiet knives, loud hymns",
    roleBias: "hold",
    bossTitle: "Choir Lead",
    goonEpithets: ["Psalm", "Vesper", "Bell", "Candle", "Altar", "Hymn"],
    firstNamesM: ["Brother", "Father", "Silent", "Monk", "Grace", "Choir"],
    firstNamesF: ["Sister", "Mercy", "Halo", "Lament", "Vesper", "Choir"],
    preferredWeapons: {
      shooter: ["pistol", "uzi"],
      rusher: ["switchblade", "pipe"],
      coward: ["pistol"],
    },
    preferredArmor: { boss: "none", goon: "none" },
    statBias: { aim: 1, brains: 1, guts: -1, speed: 1 },
    aggression: 0.86,
  },
};

export function gangProfile(id: string): GangProfile | undefined {
  return GANG_PROFILES[id];
}

export function instanceGangFlavor(label: string | undefined) {
  if (!label) return INSTANCE_GANG_FLAVORS.Bay!;
  return INSTANCE_GANG_FLAVORS[label] ?? INSTANCE_GANG_FLAVORS.Bay!;
}

/** Role mix biased by gang personality. */
export function assignGangRoles(
  memberCount: number,
  bias: GangRoleBias = "mixed",
  opts?: { aggression?: number; rng?: () => number },
): AiCombatRole[] {
  const rng = opts?.rng ?? Math.random;
  const aggression = opts?.aggression ?? 0.6;
  if (memberCount <= 0) return [];
  const roles: AiCombatRole[] = [];

  // Boss
  if (bias === "flee" || aggression < 0.38) roles.push("coward");
  else if (bias === "rush" && aggression > 0.55) roles.push(rng() < 0.35 ? "rusher" : "shooter");
  else roles.push("shooter");

  for (let i = 1; i < memberCount; i++) {
    const r = rng();
    if (bias === "rush") {
      roles.push(r < 0.55 ? "rusher" : r < 0.85 ? "shooter" : "coward");
    } else if (bias === "hold") {
      roles.push(r < 0.55 ? "shooter" : r < 0.8 ? "coward" : "rusher");
    } else if (bias === "flee") {
      roles.push(r < 0.45 ? "coward" : r < 0.8 ? "shooter" : "rusher");
    } else {
      // mixed — same spirit as assignAiPosseRoles
      if (i === 1) roles.push("rusher");
      else if (i === 2) roles.push(r < 0.45 ? "coward" : "shooter");
      else roles.push(r < 0.4 ? "rusher" : r < 0.75 ? "shooter" : "coward");
    }
  }
  // Guarantee signature roles so crew identity (and smoke) aren't pure RNG
  if (memberCount >= 2 && bias === "rush" && !roles.includes("rusher")) {
    roles[1] = "rusher";
  }
  if (memberCount >= 2 && bias === "hold" && !roles.includes("shooter")) {
    roles[1] = "shooter";
  }
  if (memberCount >= 2 && bias === "flee" && !roles.includes("coward")) {
    roles[1] = "coward";
  }
  return roles;
}

function clampStat(n: number, lo = 2, hi = 12): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Pick a themed weapon, escalating with threat when possible. */
export function pickGangWeapon(
  preferred: WeaponId[],
  role: AiCombatRole,
  threat: number,
  rng: () => number = Math.random,
): WeaponId {
  const pool = preferred.length ? preferred : role === "rusher" ? (["pipe", "switchblade"] as WeaponId[]) : (["pistol"] as WeaponId[]);
  // Threat gates heavy toys
  const allowed = pool.filter((w) => {
    if (w === "minigun" || w === "flamethrower") return threat >= 3;
    if (w === "tommy") return threat >= 3;
    if (w === "shotgun") return threat >= 2;
    if (w === "uzi") return threat >= 2;
    return true;
  });
  const use = allowed.length ? allowed : pool;
  // Higher threat → prefer later (heavier) entries in light→heavy pools
  if (threat >= 4 && use.length > 1) return use[use.length - 1]!;
  if (threat >= 3 && use.length > 1 && rng() < 0.7) return use[use.length - 1]!;
  if (threat >= 2 && use.length > 1 && rng() < 0.5) {
    return use[Math.min(use.length - 1, Math.max(1, use.length - 2))]!;
  }
  return use[Math.floor(rng() * use.length)]!;
}

export function gangBossName(profile: Pick<GangProfile, "name" | "bossTitle">): string {
  return `${profile.name} ${profile.bossTitle}`;
}

export function gangGoonName(
  profile: Pick<GangProfile, "firstNamesM" | "firstNamesF" | "goonEpithets">,
  gender: "male" | "female",
  rng: () => number = Math.random,
): string {
  const firstPool = gender === "female" ? profile.firstNamesF : profile.firstNamesM;
  const first = firstPool[Math.floor(rng() * firstPool.length)] ?? "Street";
  const epi = profile.goonEpithets[Math.floor(rng() * profile.goonEpithets.length)] ?? "Meat";
  return `${first} ${epi}`;
}

/** Threat-tier HP/base, then gang stat bias. */
export function gangBaseStats(
  threat: number,
  bias: GangProfile["statBias"],
  role: AiCombatRole,
): {
  aim: number;
  guts: number;
  muscle: number;
  brains: number;
  speed: number;
  maxHealth: number;
} {
  let aim = 4 + Math.min(4, threat);
  let guts = 5 + Math.min(3, threat - 1);
  let muscle = 5 + Math.min(3, threat - 1);
  let brains = 4;
  let speed = 5 + Math.min(2, threat - 1);
  let maxHealth = 100 + Math.max(0, threat - 1) * 10;

  if (role === "rusher") {
    muscle += 2;
    speed += 1;
    aim -= 1;
  } else if (role === "coward") {
    speed += 2;
    guts -= 1;
    aim += 1;
  } else {
    aim += 1;
  }

  aim = clampStat(aim + (bias.aim ?? 0));
  guts = clampStat(guts + (bias.guts ?? 0));
  muscle = clampStat(muscle + (bias.muscle ?? 0));
  brains = clampStat(brains + (bias.brains ?? 0));
  speed = clampStat(speed + (bias.speed ?? 0));
  maxHealth = Math.max(60, Math.min(160, maxHealth + (bias.maxHealth ?? 0)));

  return { aim, guts, muscle, brains, speed, maxHealth };
}

/** Owned weapon set for AI (they ignore ammo; set is for loot flavor). */
export function gangOwnedWeapons(weapon: WeaponId, preferred: GangProfile["preferredWeapons"]): Set<WeaponId> {
  const all = new Set<WeaponId>(["pipe", "pistol"]);
  for (const list of Object.values(preferred)) {
    for (const w of list) all.add(w);
  }
  all.add(weapon);
  return all;
}

export function listGangIntelLines(): string[] {
  return Object.values(GANG_PROFILES).map((g) => `${g.name}: ${g.blurb}`);
}
