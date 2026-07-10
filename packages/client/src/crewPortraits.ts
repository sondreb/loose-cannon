/**
 * Stable painted crew portraits (Grok Imagine) for hireable goons.
 * Picked by hash of unit id+name so the same character always gets the same face.
 */

const FEMALE_PORTRAITS = [
  "/art/crew/goon-f-01.jpg",
  "/art/crew/goon-f-02.jpg",
  "/art/crew/goon-f-03.jpg",
  "/art/crew/goon-f-04.jpg",
  "/art/crew/goon-f-05.jpg",
  "/art/crew/goon-f-06.jpg",
  "/art/crew/goon-f-07.jpg",
  "/art/crew/goon-f-08.jpg",
] as const;

const MALE_PORTRAITS = [
  "/art/crew/goon-m-01.jpg",
  "/art/crew/goon-m-02.jpg",
  "/art/crew/goon-m-03.jpg",
  "/art/crew/goon-m-04.jpg",
  "/art/crew/goon-m-05.jpg",
  "/art/crew/goon-m-06.jpg",
  "/art/crew/goon-m-07.jpg",
  "/art/crew/goon-m-08.jpg",
] as const;

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Crew / street meat portrait URL. Stable per key+gender. */
export function crewPortraitUrl(key: string, female: boolean): string {
  const pool = female ? FEMALE_PORTRAITS : MALE_PORTRAITS;
  const idx = hashStr(key + (female ? "|f" : "|m")) % pool.length;
  return pool[idx]!;
}

export function isFemaleUnit(gender?: string | null, name?: string): boolean {
  if (gender === "female") return true;
  if (gender === "male") return false;
  if (!name) return false;
  return /rita|kate|may|sally|jazz|rosa|pepper|cookie|venus|lola|sable|cherry|roxy|nova|storm|ivy|jade|foxy|candy|nikki|diamond|blaze|kitty|vex|maid/i.test(
    name,
  );
}
