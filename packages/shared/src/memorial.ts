/** Cannon Fodder–style cheerful understatements for the memorial wall. */

const EPITAPHS = [
  "Almost made it to the van.",
  "Had plans for Tuesday.",
  "Never liked Mondays anyway.",
  "Died doing what they loved: standing near the boss.",
  "Still owed Vince a fiver.",
  "Would have been a great day for fishing.",
  "Forgot to duck. Once.",
  "Promoted to permanent leave.",
  "Left a half-eaten sandwich. Touching.",
  "The streets will miss the noise.",
  "Briefly employed. Briefly alive.",
  "Took one for the team. The team took the cash.",
  "They said it was a simple job.",
  "Remembered for the good times (there were two).",
  "Out of ammo, out of luck, out of frame.",
];

export function randomEpitaph(rng: () => number = Math.random): string {
  return EPITAPHS[Math.floor(rng() * EPITAPHS.length)]!;
}

export function memorialCause(killerName: string | null, inMission: boolean): string {
  if (inMission) return killerName ? `Fell on the job (to ${killerName})` : "Fell on the job";
  if (killerName) return `Wiped by ${killerName}`;
  return "Died on the street";
}

export const MAX_MEMORIALS = 32;
