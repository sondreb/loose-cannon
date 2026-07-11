/**
 * First-session guided flow (Mode A).
 * Server advances steps from real gameplay; client only displays + can skip.
 */

export type TutorialStepId =
  | "go_bar"
  | "hire_vince"
  | "talk_rita"
  | "take_job"
  | "finish_job"
  | "stash_pad";

export interface TutorialStepDef {
  id: TutorialStepId;
  title: string;
  body: string;
  /** World waypoint for objective strip */
  hintX?: number;
  hintY?: number;
}

export const TUTORIAL_STEPS: TutorialStepDef[] = [
  {
    id: "go_bar",
    title: "Hit The Rusty Nail",
    body: "Walk northwest to the bar (door on the south wall). Press E at the door to go inside. Safe downtown — no street murders yet.",
    hintX: 8.5,
    hintY: 15.2,
  },
  {
    id: "hire_vince",
    title: "Hire bar muscle",
    body: "Talk to Vince the Barman (counter). Choose hire — $150 for a warm body. You already have one goon; pad the roster.",
    hintX: 3.2,
    hintY: 3.2,
  },
  {
    id: "talk_rita",
    title: "Find the fixer",
    body: "Rita Fix sits with a notepad. Talk to her and pick “Got work?” to open the job book.",
    hintX: 7,
    hintY: 4,
  },
  {
    id: "take_job",
    title: "Accept a contract",
    body: "Pick any job — Smash & Grab is the friendliest first run (crate downtown). Warehouse Wipe is a private bay if you want a sealed fight.",
  },
  {
    id: "finish_job",
    title: "Get paid",
    body: "Complete the objectives (and extract if it's an instance). Rita pays when the server says you're done. Then bank the take before someone shoots you.",
  },
  {
    id: "stash_pad",
    title: "Bank it at the Crash Pad",
    body: "Walk to Your Crash Pad (green roof, west of the bar). E to enter, walk into the room, E again to open the stash. Pocket cash & street gear drop on wipe — house stash does not.",
    hintX: 8,
    hintY: 25.5,
  },
];
export const TUTORIAL_ORDER: TutorialStepId[] = TUTORIAL_STEPS.map((s) => s.id);

export function tutorialStepIndex(id: TutorialStepId): number {
  return TUTORIAL_ORDER.indexOf(id);
}

export function nextTutorialStep(id: TutorialStepId): TutorialStepId | null {
  const i = tutorialStepIndex(id);
  if (i < 0 || i >= TUTORIAL_ORDER.length - 1) return null;
  return TUTORIAL_ORDER[i + 1]!;
}
