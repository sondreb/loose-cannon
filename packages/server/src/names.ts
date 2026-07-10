const FIRST = [
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
  "Nikki",
  "Rosa",
  "Jazz",
  "Pepper",
  "Cookie",
  "Brick",
  "Shadow",
  "Wheels",
  "Gums",
  "Ace",
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
];

export function randomGoonName(rng = Math.random): string {
  const a = FIRST[Math.floor(rng() * FIRST.length)]!;
  const b = LAST[Math.floor(rng() * LAST.length)]!;
  return `${a} ${b}`;
}
