/**
 * Skidrow district spine (Mode A).
 * Geographic regions for map UI + soft rep unlocks.
 * Bounds are inclusive world-tile rectangles (axis-aligned).
 */

export type DistrictId =
  | "downtown"
  | "war_fringe"
  | "war_deep"
  | "docks"
  | "neon_edge";

export interface DistrictDef {
  id: DistrictId;
  name: string;
  /** Short HUD label */
  short: string;
  blurb: string;
  /** Inclusive tile bounds */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Minimum street rep to enter outdoor tiles without soft-kick */
  minRep: number;
  /** PvE safe flavor (UI only — real combat still uses SAFE_Y_MAX) */
  danger: "safe" | "risky" | "hot";
  /** Landmark hint for map UI */
  landmark?: string;
}

/**
 * Order matters for hit-test: first match wins (more specific regions first).
 * Docks / neon sit inside broader war rectangles — listed first.
 */
export const DISTRICTS: DistrictDef[] = [
  {
    id: "docks",
    name: "Pier District",
    short: "DOCKS",
    blurb: "Crates, salt, and bad deals. Bring iron and a receipt you can invent.",
    x0: 82,
    y0: 42,
    x1: 109,
    y1: 89,
    /** Advisory rep for UI; free walk always allowed (see enforceDistrictAccess). */
    minRep: 5,
    danger: "hot",
    landmark: "East piers",
  },
  {
    id: "neon_edge",
    name: "Neon Edge",
    short: "NEON",
    blurb: "Club glow and gun-shop chrome. Looks glamorous until the cover charge is blood.",
    x0: 70,
    y0: 0,
    x1: 109,
    y1: 37,
    /** Open from the start so The Titty Twister / neon strip is reachable (gear still rep-gated). */
    minRep: 0,
    danger: "risky",
    landmark: "The Titty Twister / gun row",
  },
  {
    id: "war_deep",
    name: "Deep War Zone",
    short: "DEEP",
    blurb: "South of the tracks and out of excuses. Rival crews nest here.",
    x0: 0,
    y0: 55,
    x1: 81,
    y1: 89,
    /** Advisory only for free roam (walking never blocked). Used for map UI / warnings. */
    minRep: 3,
    danger: "hot",
    landmark: "Lots & dumpsters",
  },
  {
    id: "war_fringe",
    name: "War Fringe",
    short: "FRINGE",
    blurb: "Just south of the safe line. First real bullets. Still close enough to run home.",
    x0: 0,
    y0: 38,
    x1: 81,
    y1: 54,
    minRep: 0,
    danger: "risky",
    landmark: "Tracks south",
  },
  {
    id: "downtown",
    name: "Safe Downtown",
    short: "DOWNTOWN",
    blurb: "Bars, pawn, hire meat. No street murders. Your tutorial lives here.",
    x0: 0,
    y0: 0,
    x1: 81,
    y1: 37,
    minRep: 0,
    danger: "safe",
    landmark: "The Rusty Nail",
  },
];

export function districtAt(x: number, y: number): DistrictDef {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1) return d;
  }
  // Fallback — treat unknown as downtown-safe flavor
  return DISTRICTS.find((d) => d.id === "downtown")!;
}

export function isDistrictUnlocked(def: DistrictDef, rep: number): boolean {
  return rep >= def.minRep;
}

export function unlockedDistrictIds(rep: number): DistrictId[] {
  return DISTRICTS.filter((d) => isDistrictUnlocked(d, rep)).map((d) => d.id);
}
