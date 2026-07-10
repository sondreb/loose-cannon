/**
 * Starter job catalog (Mode A).
 * Outdoor jobs run on the hub map; instanced jobs use a private warehouse layer.
 * Server is authoritative for progress and rewards.
 */

export type MissionId =
  | "protection_corner"
  | "smash_stash"
  | "collect_debt"
  | "warehouse_raid";

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
};

export const MISSION_ORDER: MissionId[] = [
  "smash_stash",
  "warehouse_raid",
  "protection_corner",
  "collect_debt",
];

export function listMissionOffers(): Array<{
  id: MissionId;
  title: string;
  blurb: string;
  difficulty: 1 | 2 | 3;
  rewardCash: number;
  rewardRep: number;
}> {
  return MISSION_ORDER.map((id) => {
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
