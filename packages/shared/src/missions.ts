/**
 * Starter job catalog (Mode A).
 * Outdoor jobs run on the hub map; instanced jobs use a private layer
 * (warehouse / garage / coldstore / church). Street pack + rival kill pack
 * wire orphan props and ambient gangs to Rita's board.
 * Server is authoritative for progress and rewards.
 */

export type MissionId =
  | "protection_corner"
  | "smash_stash"
  | "collect_debt"
  | "warehouse_raid"
  | "still_not_guns"
  | "parking_tax"
  | "chop_shop_raid"
  | "rail_rats"
  | "cold_storage"
  | "pier_punch"
  | "chapel_cleanse"
  | "toll_booth"
  | "keep_frozen"
  | "viper_nest"
  | "lot_ride"
  | "silk_hit"
  | "chrome_out";

export type MissionObjectiveKind =
  | "hold"
  | "interact_prop"
  | "kill_unit"
  | "clear_hostiles"
  | "extract";

export interface MissionObjectiveDef {
  id: string;
  label: string;
  kind: MissionObjectiveKind;
  /** Prop id for hold / interact */
  propId?: string;
  /** AI posse id whose boss must die (kill_unit) */
  targetPosseId?: string;
  /** Seconds to hold near prop (hold) */
  holdSeconds?: number;
  /** Interact range override (tiles) */
  range?: number;
}

export interface MissionInstanceDef {
  /** Reuse this building's interior footprint for the private layer */
  templateBuildingId: string;
  /** How many hostile goons to spawn (plus one boss) */
  enemyCount: number;
  /** Threat tier for spawned hostiles (1–4) */
  enemyThreat: number;
  /** Flavor prefix for hostile names (e.g. "Bay", "Chop") */
  enemyLabel?: string;
}

export interface MissionDef {
  id: MissionId;
  title: string;
  /** Cannon Fodder–style cheerful understatement */
  blurb: string;
  difficulty: 1 | 2 | 3;
  rewardCash: number;
  rewardRep: number;
  objectives: MissionObjectiveDef[];
  /** Optional pointer for HUD / smoke (outdoor jobs) */
  hintX?: number;
  hintY?: number;
  /** When set, accept teleports into a private instance layer */
  instance?: MissionInstanceDef;
}

export const MISSIONS: Record<MissionId, MissionDef> = {
  smash_stash: {
    id: "smash_stash",
    title: "Smash & Grab",
    blurb:
      "There's a crate downtown labeled 'Definitely not guns.' Crack it open. If it is guns, well — farming is evolving.",
    difficulty: 1,
    rewardCash: 280,
    rewardRep: 2,
    objectives: [
      {
        id: "crack_crate",
        label: "Smash the stash crate",
        kind: "interact_prop",
        propId: "cr1",
        range: 2.4,
      },
    ],
    hintX: 44,
    hintY: 28,
  },
  warehouse_raid: {
    id: "warehouse_raid",
    title: "Warehouse Wipe",
    blurb:
      "Private job. Rita's people sealed a loading bay. Clear the freeloaders inside, then walk out the exit like you pay rent. Casualties: optional. Extract: mandatory.",
    difficulty: 2,
    rewardCash: 450,
    rewardRep: 4,
    instance: {
      templateBuildingId: "warehouse",
      enemyCount: 2,
      enemyThreat: 1,
    },
    objectives: [
      {
        id: "clear_bay",
        label: "Neutralize hostiles in the bay",
        kind: "clear_hostiles",
      },
      {
        id: "extract",
        label: "Extract at the exit door",
        kind: "extract",
      },
    ],
  },
  protection_corner: {
    id: "protection_corner",
    title: "Corner Tax",
    blurb:
      "Stand on Protection Corner for a bit. Smile at the locals. Collect dues. Try not to get ventilated — it's only a short walk south of the tracks.",
    difficulty: 1,
    rewardCash: 350,
    rewardRep: 3,
    objectives: [
      {
        id: "hold_corner",
        label: "Hold Protection Corner (~12s)",
        kind: "hold",
        propId: "p1",
        holdSeconds: 12,
        range: 2.5,
      },
    ],
    hintX: 30,
    hintY: 48,
  },
  collect_debt: {
    id: "collect_debt",
    title: "Debt Collection",
    blurb:
      "The Dumpster Dogs owe Rita a favor and a kidney. Neutralize their boss. Collateral is expected. Tasteful collateral preferred.",
    difficulty: 2,
    rewardCash: 500,
    rewardRep: 5,
    objectives: [
      {
        id: "drop_boss",
        label: "Drop the Dumpster Dogs boss",
        kind: "kill_unit",
        targetPosseId: "ai_dogs",
      },
    ],
    hintX: 14,
    hintY: 54,
  },
  still_not_guns: {
    id: "still_not_guns",
    title: "Still Not Guns",
    blurb:
      "War Fringe crate, same joke, new shipping label: 'Still not guns.' Rita wants it cracked. You're the can opener.",
    difficulty: 1,
    rewardCash: 300,
    rewardRep: 2,
    objectives: [
      {
        id: "crack_crate2",
        label: "Smash the war-fringe crate",
        kind: "interact_prop",
        propId: "cr2",
        range: 2.4,
      },
    ],
    hintX: 58,
    hintY: 50,
  },
  parking_tax: {
    id: "parking_tax",
    title: "Parking Racket",
    blurb:
      "Hold the south lot for a spell. Smile at the asphalt. Collect dues from the void. If someone ventilates you, call it market research.",
    difficulty: 2,
    rewardCash: 400,
    rewardRep: 3,
    objectives: [
      {
        id: "hold_lot",
        label: "Hold Parking Racket (~15s)",
        kind: "hold",
        propId: "p3",
        holdSeconds: 15,
        range: 2.5,
      },
    ],
    hintX: 50,
    hintY: 66,
  },
  chop_shop_raid: {
    id: "chop_shop_raid",
    title: "Chop Shop Sweep",
    blurb:
      "Private job. Chop Shop freeloaders locked the bay. Clear the floor, then extract like the wheels still belong to someone. Casualties: expected. Heart rate: optional.",
    difficulty: 2,
    rewardCash: 520,
    rewardRep: 5,
    instance: {
      templateBuildingId: "garage",
      enemyCount: 2,
      enemyThreat: 2,
      enemyLabel: "Chop",
    },
    objectives: [
      {
        id: "clear_floor",
        label: "Neutralize hostiles in the shop",
        kind: "clear_hostiles",
      },
      {
        id: "extract",
        label: "Extract at the exit door",
        kind: "extract",
      },
    ],
  },
  rail_rats: {
    id: "rail_rats",
    title: "Rail Rat Removal",
    blurb:
      "The Rail Rats nested on the fringe tracks. Drop their boss. The rest will scatter like cockroaches with better jackets.",
    difficulty: 2,
    rewardCash: 420,
    rewardRep: 4,
    objectives: [
      {
        id: "drop_rats",
        label: "Drop the Rail Rats boss",
        kind: "kill_unit",
        targetPosseId: "ai_rats",
      },
    ],
    hintX: 42,
    hintY: 48,
  },
  cold_storage: {
    id: "cold_storage",
    title: "Ice Box Eviction",
    blurb:
      "Private job. Freeloaders squatting Rita's pier freezer. Clear the icebox, then extract before your fingers resign. Casualties: chilled. Heart rate: optional.",
    difficulty: 3,
    rewardCash: 580,
    rewardRep: 6,
    instance: {
      templateBuildingId: "coldstore",
      enemyCount: 2,
      enemyThreat: 2,
      enemyLabel: "Frost",
    },
    objectives: [
      {
        id: "clear_freezer",
        label: "Neutralize hostiles in the freezer",
        kind: "clear_hostiles",
      },
      {
        id: "extract",
        label: "Extract at the exit door",
        kind: "extract",
      },
    ],
  },
  pier_punch: {
    id: "pier_punch",
    title: "Pier Punch",
    blurb:
      "The Pier Punchers are collecting dues that belong to people who pay Rita. Drop their Wharf Boss. Salt air, steel fists, zero paperwork.",
    difficulty: 2,
    rewardCash: 480,
    rewardRep: 4,
    objectives: [
      {
        id: "drop_docks",
        label: "Drop the Pier Punchers boss",
        kind: "kill_unit",
        targetPosseId: "ai_docks",
      },
    ],
    hintX: 84,
    hintY: 52,
  },
  chapel_cleanse: {
    id: "chapel_cleanse",
    title: "Chapel Cleanse",
    blurb:
      "Private job. Choir freeloaders locked the confessional after hours. Clear the nave, then extract before the collection plate starts shooting back. Casualties: blessed. Heart rate: optional.",
    difficulty: 2,
    rewardCash: 540,
    rewardRep: 5,
    instance: {
      templateBuildingId: "church",
      enemyCount: 2,
      enemyThreat: 2,
      enemyLabel: "Choir",
    },
    objectives: [
      {
        id: "clear_nave",
        label: "Neutralize hostiles in the chapel",
        kind: "clear_hostiles",
      },
      {
        id: "extract",
        label: "Extract at the exit door",
        kind: "extract",
      },
    ],
  },
  toll_booth: {
    id: "toll_booth",
    title: "Unofficial Toll",
    blurb:
      "Someone painted a booth on war asphalt and called it infrastructure. Hold the unofficial toll ~15s. Smile. Collect. If miniguns pass by, wave politely.",
    difficulty: 2,
    rewardCash: 430,
    rewardRep: 4,
    objectives: [
      {
        id: "hold_toll",
        label: "Hold Unofficial Toll (~15s)",
        kind: "hold",
        propId: "p2",
        holdSeconds: 15,
        range: 2.5,
      },
    ],
    hintX: 72,
    hintY: 48,
  },
  keep_frozen: {
    id: "keep_frozen",
    title: "Keep Frozen",
    blurb:
      "Docks crate stamped 'Keep frozen (or else).' Rita wants the or-else opened. Bring a crowbar and a sense of humor about frostbite.",
    difficulty: 1,
    rewardCash: 320,
    rewardRep: 2,
    objectives: [
      {
        id: "crack_crate3",
        label: "Smash the docks freeze crate",
        kind: "interact_prop",
        propId: "cr3",
        range: 2.4,
      },
    ],
    hintX: 84,
    hintY: 56,
  },
  viper_nest: {
    id: "viper_nest",
    title: "Viper Nest",
    blurb:
      "Neon Vipers nested south of the strip with toys that go brrrt. Drop Queen Fang. Bring kevlar, ammo, and zero pride about dying twice.",
    difficulty: 3,
    rewardCash: 650,
    rewardRep: 7,
    objectives: [
      {
        id: "drop_vipers",
        label: "Drop the Neon Vipers boss",
        kind: "kill_unit",
        targetPosseId: "ai_neon",
      },
    ],
    hintX: 92,
    hintY: 62,
  },
  lot_ride: {
    id: "lot_ride",
    title: "Lot Ride",
    blurb:
      "Lot Lizards MC turned the far south lot into a private club. Drop their Road Captain. Chains optional. Exhaust not.",
    difficulty: 2,
    rewardCash: 540,
    rewardRep: 5,
    objectives: [
      {
        id: "drop_lot",
        label: "Drop the Lot Lizards Road Captain",
        kind: "kill_unit",
        targetPosseId: "ai_lot",
      },
    ],
    hintX: 52,
    hintY: 76,
  },
  silk_hit: {
    id: "silk_hit",
    title: "Silk Hit",
    blurb:
      "Southside Slicks in tailored jackets and dirty money. Drop the Silk Capo east of the tracks. Keep the blood off the cufflinks — or don't.",
    difficulty: 3,
    rewardCash: 560,
    rewardRep: 6,
    objectives: [
      {
        id: "drop_slicks",
        label: "Drop the Southside Slicks boss",
        kind: "kill_unit",
        targetPosseId: "ai_south",
      },
    ],
    hintX: 78,
    hintY: 55,
  },
  chrome_out: {
    id: "chrome_out",
    title: "Chrome Out",
    blurb:
      "Chrome Fists polish their knuckles on anyone slow enough. Drop Iron Hands near the fringe. Bring a pipe or a death wish.",
    difficulty: 2,
    rewardCash: 530,
    rewardRep: 5,
    objectives: [
      {
        id: "drop_chrome",
        label: "Drop the Chrome Fists boss",
        kind: "kill_unit",
        targetPosseId: "ai_chrome",
      },
    ],
    hintX: 65,
    hintY: 48,
  },
};

export const MISSION_ORDER: MissionId[] = [
  "smash_stash",
  "warehouse_raid",
  "protection_corner",
  "collect_debt",
  "still_not_guns",
  "parking_tax",
  "chop_shop_raid",
  "rail_rats",
  "cold_storage",
  "pier_punch",
  "chapel_cleanse",
  "toll_booth",
  "keep_frozen",
  "viper_nest",
  "lot_ride",
  "silk_hit",
  "chrome_out",
];

export function listMissionOffers(opts?: {
  /** Mission ids already completed this session (Mode A in-memory) */
  completedIds?: Iterable<string>;
}): Array<{
  id: MissionId;
  title: string;
  blurb: string;
  difficulty: 1 | 2 | 3;
  rewardCash: number;
  rewardRep: number;
}> {
  const done = new Set(opts?.completedIds ?? []);
  return MISSION_ORDER.filter((id) => !done.has(id)).map((id) => {
    const m = MISSIONS[id];
    return {
      id: m.id,
      title: m.title,
      blurb: m.blurb,
      difficulty: m.difficulty,
      rewardCash: m.rewardCash,
      rewardRep: m.rewardRep,
    };
  });
}
