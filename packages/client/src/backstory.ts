/**
 * Stable short goon backstories for the posse profile card.
 * Deterministic from unit id + name so the same face always tells the same tale.
 */

import { streetRole, type UnitStats } from "@loose-cannon/shared";

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(pool: readonly T[], seed: number, salt: number): T {
  const i = ((seed + Math.imul(salt, 2654435761)) >>> 0) % pool.length;
  return pool[i]!;
}

const ORIGINS = [
  "Came up on the south docks stacking crates nobody owned twice.",
  "Used to run numbers for a bookie who still has their IOU framed.",
  "Walked out of a county lockup with a busted nose and a worse attitude.",
  "Grew up two blocks from the tracks — learned to duck before learning to read.",
  "Was a bouncer until the wrong VIP left in a bag and the club needed a fall guy.",
  "Deserted a private security gig when the paychecks bounced harder than the clients.",
  "Survived three crews that don't exist anymore. That isn't luck; it's practice.",
  "Hustled fake watch chains until someone paid in real lead.",
] as const;

const HOOKS = [
  "Keeps a lucky lighter that has never lit the same cigarette twice.",
  "Hums funeral hymns when the heat meter climbs.",
  "Owes Vince a tab large enough to buy a small war.",
  "Writes names on cigarette papers and burns them before jobs.",
  "Swears the city maps itself differently after midnight.",
  "Won't cross a red light without a second opinion from a gun.",
  "Still checks payphones for messages that stopped coming years ago.",
  "Collects spent brass like other people collect stamps.",
] as const;

const ROLE_LINES: Record<string, readonly string[]> = {
  sharpshooter: [
    "Counts heartbeats between shots. Misses make them personal.",
    "Zeroed a cheap scope on a fire escape and never looked back.",
    "Prefers distance — close quarters smell too much like regret.",
  ],
  bruiser: [
    "Solves negotiations with doors, jaws, and the occasional spine.",
    "Once bent a crowbar around a rival's week. The crowbar was fine.",
    "Believes muscle is a love language and armor is just politeness.",
  ],
  survivor: [
    "Has been left for dead twice. Both times they walked home.",
    "Bleeds slow and holds grudges slower — forever, basically.",
    "Treats pain like weather: ugly, temporary, not optional.",
  ],
  runner: [
    "Knows every alley that still has a working exit sign.",
    "If the plan goes loud, they're already three rooftops away.",
    "Speed is their religion. Reloading is the sermon.",
  ],
  brain: [
    "Reads contracts like crime scenes — and crime scenes like contracts.",
    "Always has a second plan, and a third for when you ignore the second.",
    "Talks too much until the bullets start; then they're quiet and right.",
  ],
  street: [
    "Warm body with cold hands. Don't romanticize the hire.",
    "Learned the city by getting lost in the expensive parts.",
    "Average at everything except staying employed by people like you.",
  ],
};

const ENDINGS = [
  "They joined up because the alternative was digging their own hole.",
  "They're here for cash, cover, and someone else to take the first bullet.",
  "If they outlive you, they'll still say you were the boss. Briefly.",
  "Loyalty lasts until the memorial wall needs another name — hopefully not theirs.",
  "Point them at a job and they stop asking why. That's the product.",
  "They'll follow you into the war zone. They won't write poetry about it.",
] as const;

const BOSS_LINES = [
  "The name on the posse is yours. The blood on the sidewalk is everyone's.",
  "You didn't hire yourself — the streets did, and the receipt is permanent.",
  "Boss means first into the fire and last to cash out. Usually.",
] as const;

export function goonBackstory(input: {
  id: string;
  name: string;
  gender?: string | null;
  stats: UnitStats;
  boss?: boolean;
}): string {
  const seed = hashStr(input.id + "|" + input.name);
  const role = streetRole(input.stats);
  const rolePool = ROLE_LINES[role.id] ?? ROLE_LINES.street!;

  if (input.boss) {
    const a = pick(ORIGINS, seed, 1);
    const b = pick(BOSS_LINES, seed, 3);
    const c = pick(HOOKS, seed, 5);
    return `${a} ${b} ${c}`;
  }

  const origin = pick(ORIGINS, seed, 2);
  const roleLine = pick(rolePool, seed, 7);
  const hook = pick(HOOKS, seed, 11);
  const end = pick(ENDINGS, seed, 13);

  // Light gender flavor without stereotypes — just pronoun-free street talk
  const who =
    input.gender === "female"
      ? pick(
          [
            "She keeps the safety off and the stories shorter.",
            "She learned early that pretty and deadly can share a jacket.",
          ] as const,
          seed,
          17,
        )
      : input.gender === "male"
        ? pick(
            [
              "He smiles like a plea deal that already fell through.",
              "He measures people in calibers and unpaid favors.",
            ] as const,
            seed,
            19,
          )
        : "";

  return [origin, roleLine, who, hook, end].filter(Boolean).join(" ");
}
