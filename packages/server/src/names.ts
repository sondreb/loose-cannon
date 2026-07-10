/** Street names — ~40% female when using randomRecruitProfile */

const FIRST_M = [
  "Rico",
  "Sal",
  "Tommy",
  "Vinnie",
  "Mace",
  "Diesel",
  "Knuckles",
  "Scratch",
  "Lefty",
  "Bones",
  "Brick",
  "Shadow",
  "Wheels",
  "Gums",
  "Ace",
  "Dutch",
  "Paco",
  "Hank",
  "Colt",
  "Razor",
];

const FIRST_F = [
  "Nikki",
  "Rosa",
  "Jazz",
  "Pepper",
  "Cookie",
  "Vex",
  "Lola",
  "Sable",
  "Cherry",
  "Roxy",
  "Diamond",
  "Blaze",
  "Kitty",
  "Venus",
  "Storm",
  "Ivy",
  "Jade",
  "Foxy",
  "Nova",
  "Candy",
];

const LAST = [
  "the Pipe",
  "Two-Times",
  "No-Socks",
  "from Skidrow",
  "the Dentist",
  "McProblems",
  "Dumpster",
  "Nightshift",
  "Half-Clip",
  "the Quiet One",
  "Barstool",
  "Payday",
  "Switchblade",
  "the Problem",
  "Cashmere",
  "Last Call",
];

export type Gender = "male" | "female";

/** Street meat / hire / AI goon gender mix (~40% women) */
export const FEMALE_SPAWN_CHANCE = 0.4;

export function rollGender(rng = Math.random): Gender {
  return rng() < FEMALE_SPAWN_CHANCE ? "female" : "male";
}

export function randomGoonName(rng = Math.random, gender?: Gender): string {
  const g = gender ?? rollGender(rng);
  const pool = g === "female" ? FIRST_F : FIRST_M;
  const a = pool[Math.floor(rng() * pool.length)]!;
  const b = LAST[Math.floor(rng() * LAST.length)]!;
  return `${a} ${b}`;
}

export function randomRecruitProfile(rng = Math.random): { name: string; gender: Gender } {
  const gender = rollGender(rng);
  return { name: randomGoonName(rng, gender), gender };
}
