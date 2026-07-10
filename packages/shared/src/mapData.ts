import type { TileType } from "./protocol.js";

export type BuildingKind =
  | "bar"
  | "shop"
  | "safehouse"
  | "warehouse"
  | "hospital"
  | "gym"
  | "club"
  | "garage"
  | "church";

export interface MapBuildingDef {
  id: string;
  name: string;
  kind: BuildingKind;
  doorX: number;
  doorY: number;
  ix0: number;
  iy0: number;
  ix1: number;
  iy1: number;
  spawnX: number;
  spawnY: number;
  exitX: number;
  exitY: number;
  exteriorSpawnX: number;
  exteriorSpawnY: number;
  /** Optional flavor for labels */
  blurb?: string;
}

export interface WorldMapDef {
  width: number;
  height: number;
  tiles: TileType[][];
  buildings: MapBuildingDef[];
  playerSpawn: { x: number; y: number };
  respawnPoints: Array<{ x: number; y: number }>;
  /** World props / activity spots (outdoor) */
  props: Array<{
    id: string;
    kind: "dumpster" | "protection" | "hydrant" | "neon" | "car" | "crate";
    x: number;
    y: number;
    label?: string;
  }>;
  npcSpawns: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    role: "bartender" | "fixer" | "thug" | "dealer" | "doc" | "coach" | "priest" | "mechanic";
    buildingId?: string;
  }>;
  aiPosseSpawns: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    color: number;
    aggression: number;
    /** Higher = better starter gear for visual threat */
    threat: number;
  }>;
}

function fill(w: number, h: number, t: TileType): TileType[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => t));
}

function rect(
  tiles: TileType[][],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t: TileType,
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (tiles[y]?.[x] !== undefined) tiles[y][x] = t;
    }
  }
}

function outline(
  tiles: TileType[][],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t: TileType,
) {
  for (let x = x0; x <= x1; x++) {
    tiles[y0][x] = t;
    tiles[y1][x] = t;
  }
  for (let y = y0; y <= y1; y++) {
    tiles[y][x0] = t;
    tiles[y][x1] = t;
  }
}

function shell(
  tiles: TileType[][],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  doorX: number,
  doorY: number,
) {
  outline(tiles, x0, y0, x1, y1, "wall");
  rect(tiles, x0 + 1, y0 + 1, x1 - 1, y1 - 1, "void");
  if (tiles[doorY]?.[doorX] !== undefined) tiles[doorY][doorX] = "door";
}

function roadH(tiles: TileType[][], y0: number, y1: number, w: number) {
  rect(tiles, 0, y0, w - 1, y1, "road");
  if (y0 > 1) rect(tiles, 0, y0 - 2, w - 1, y0 - 1, "sidewalk");
  if (y1 + 2 < tiles.length) rect(tiles, 0, y1 + 1, w - 1, y1 + 2, "sidewalk");
}

function roadV(tiles: TileType[][], x0: number, x1: number, h: number) {
  rect(tiles, x0, 0, x1, h - 1, "road");
  if (x0 > 1) rect(tiles, x0 - 2, 0, x0 - 1, h - 1, "sidewalk");
  if (x1 + 2 < tiles[0]!.length) rect(tiles, x1 + 1, 0, x1 + 2, h - 1, "sidewalk");
}

function outdoorWalkable(t: TileType): boolean {
  return t === "grass" || t === "road" || t === "sidewalk" || t === "parking";
}

/** Expanded crime city — denser, funnier, more places to die stylishly */
export function createSkidrowMap(): WorldMapDef {
  const width = 110;
  const height = 90;
  const tiles = fill(width, height, "grass");

  // Road grid (multi-avenue)
  roadH(tiles, 18, 21, width);
  roadH(tiles, 40, 43, width);
  roadH(tiles, 62, 65, width);
  roadV(tiles, 16, 19, height);
  roadV(tiles, 38, 41, height);
  roadV(tiles, 60, 63, height);
  roadV(tiles, 84, 87, height);

  // Parking lot (mid-south)
  rect(tiles, 44, 70, 58, 82, "parking");
  rect(tiles, 44, 70, 58, 70, "sidewalk");

  // --- Exterior shells ---
  shell(tiles, 4, 6, 12, 14, 8, 14); // Rusty Nail
  shell(tiles, 46, 6, 56, 14, 51, 14); // Pawn-O-Matic
  shell(tiles, 68, 6, 78, 14, 73, 14); // Doc's Stitch Hut
  shell(tiles, 90, 8, 102, 16, 96, 16); // Iron Temple Gym

  shell(tiles, 4, 26, 12, 34, 8, 26); // Crash pad
  shell(tiles, 46, 26, 60, 38, 53, 26); // Warehouse
  shell(tiles, 70, 28, 80, 36, 70, 32); // Chop Shop garage
  shell(tiles, 90, 28, 102, 36, 96, 28); // Neon Confessional (club)

  shell(tiles, 22, 48, 32, 58, 27, 48); // Our Lady of Bad Decisions
  shell(tiles, 4, 70, 14, 80, 9, 70); // Southside Liquor (shop2)
  shell(tiles, 68, 70, 80, 82, 74, 70); // Ammo & Alibis (gun shop)

  // --- Interiors (map rim pockets) ---
  // Bar
  rect(tiles, 1, 1, 10, 7, "floor");
  outline(tiles, 1, 1, 10, 7, "wall");
  rect(tiles, 2, 2, 9, 6, "floor");
  tiles[7][5] = "door";
  tiles[3][2] = "bar";
  tiles[4][2] = "bar";

  // Pawn
  rect(tiles, 98, 1, 108, 7, "floor");
  outline(tiles, 98, 1, 108, 7, "wall");
  rect(tiles, 99, 2, 107, 6, "floor");
  tiles[7][103] = "door";
  tiles[3][100] = "shop";
  tiles[3][101] = "shop";

  // Hospital
  rect(tiles, 1, 82, 10, 88, "floor");
  outline(tiles, 1, 82, 10, 88, "wall");
  rect(tiles, 2, 83, 9, 87, "floor");
  tiles[82][5] = "door";
  tiles[85][3] = "hospital";

  // Gym
  rect(tiles, 98, 82, 108, 88, "floor");
  outline(tiles, 98, 82, 108, 88, "wall");
  rect(tiles, 99, 83, 107, 87, "floor");
  tiles[82][103] = "door";
  tiles[85][105] = "gym";

  // Safehouse
  rect(tiles, 12, 1, 20, 6, "floor");
  outline(tiles, 12, 1, 20, 6, "wall");
  rect(tiles, 13, 2, 19, 5, "floor");
  tiles[6][16] = "door";

  // Warehouse interior
  rect(tiles, 22, 82, 32, 88, "floor");
  outline(tiles, 22, 82, 32, 88, "wall");
  rect(tiles, 23, 83, 31, 87, "floor");
  tiles[82][27] = "door";

  // Club
  rect(tiles, 34, 1, 44, 6, "floor");
  outline(tiles, 34, 1, 44, 6, "wall");
  rect(tiles, 35, 2, 43, 5, "floor");
  tiles[6][39] = "door";
  tiles[3][36] = "bar";

  // Garage
  rect(tiles, 46, 82, 56, 88, "floor");
  outline(tiles, 46, 82, 56, 88, "wall");
  rect(tiles, 47, 83, 55, 87, "floor");
  tiles[82][51] = "door";

  // Church
  rect(tiles, 58, 1, 68, 6, "floor");
  outline(tiles, 58, 1, 68, 6, "wall");
  rect(tiles, 59, 2, 67, 5, "floor");
  tiles[6][63] = "door";

  // Gun shop interior
  rect(tiles, 70, 82, 80, 88, "floor");
  outline(tiles, 70, 82, 80, 88, "wall");
  rect(tiles, 71, 83, 79, 87, "floor");
  tiles[82][75] = "door";
  tiles[85][73] = "shop";
  tiles[85][74] = "shop";

  // Liquor store interior
  rect(tiles, 82, 1, 92, 6, "floor");
  outline(tiles, 82, 1, 92, 6, "wall");
  rect(tiles, 83, 2, 91, 5, "floor");
  tiles[6][87] = "door";
  tiles[3][85] = "shop";

  const buildings: MapBuildingDef[] = [
    {
      id: "bar_rusty",
      name: "The Rusty Nail",
      kind: "bar",
      doorX: 8,
      doorY: 14,
      ix0: 2,
      iy0: 2,
      ix1: 9,
      iy1: 6,
      spawnX: 5,
      spawnY: 5,
      exitX: 5,
      exitY: 7,
      exteriorSpawnX: 8,
      exteriorSpawnY: 15,
      blurb: "Where careers go to drink",
    },
    {
      id: "shop_pawn",
      name: "Pawn-O-Matic",
      kind: "shop",
      doorX: 51,
      doorY: 14,
      ix0: 99,
      iy0: 2,
      ix1: 107,
      iy1: 6,
      spawnX: 103,
      spawnY: 5,
      exitX: 103,
      exitY: 7,
      exteriorSpawnX: 51,
      exteriorSpawnY: 15,
      blurb: "Cash only, no refunds",
    },
    {
      id: "hospital",
      name: "Doc's Stitch Hut",
      kind: "hospital",
      doorX: 73,
      doorY: 14,
      ix0: 2,
      iy0: 83,
      ix1: 9,
      iy1: 87,
      spawnX: 5,
      spawnY: 85,
      exitX: 5,
      exitY: 82,
      exteriorSpawnX: 73,
      exteriorSpawnY: 15,
      blurb: "We accept cash & threats",
    },
    {
      id: "gym",
      name: "Iron Temple",
      kind: "gym",
      doorX: 96,
      doorY: 16,
      ix0: 99,
      iy0: 83,
      ix1: 107,
      iy1: 87,
      spawnX: 103,
      spawnY: 85,
      exitX: 103,
      exitY: 82,
      exteriorSpawnX: 96,
      exteriorSpawnY: 17,
      blurb: "Guts for sale",
    },
    {
      id: "safehouse",
      name: "Your Crash Pad",
      kind: "safehouse",
      doorX: 8,
      doorY: 26,
      ix0: 13,
      iy0: 2,
      ix1: 19,
      iy1: 5,
      spawnX: 16,
      spawnY: 4,
      exitX: 16,
      exitY: 6,
      exteriorSpawnX: 8,
      exteriorSpawnY: 25,
    },
    {
      id: "warehouse",
      name: "Old Warehouse",
      kind: "warehouse",
      doorX: 53,
      doorY: 26,
      ix0: 23,
      iy0: 83,
      ix1: 31,
      iy1: 87,
      spawnX: 27,
      spawnY: 85,
      exitX: 27,
      exitY: 82,
      exteriorSpawnX: 53,
      exteriorSpawnY: 25,
    },
    {
      id: "club_neon",
      name: "Neon Confessional",
      kind: "club",
      doorX: 96,
      doorY: 28,
      ix0: 35,
      iy0: 2,
      ix1: 43,
      iy1: 5,
      spawnX: 39,
      spawnY: 4,
      exitX: 39,
      exitY: 6,
      exteriorSpawnX: 96,
      exteriorSpawnY: 27,
      blurb: "Sins optional, cover not",
    },
    {
      id: "garage",
      name: "Chop Shop",
      kind: "garage",
      doorX: 70,
      doorY: 32,
      ix0: 47,
      iy0: 83,
      ix1: 55,
      iy1: 87,
      spawnX: 51,
      spawnY: 85,
      exitX: 51,
      exitY: 82,
      exteriorSpawnX: 69,
      exteriorSpawnY: 32,
      blurb: "Wheels fall off free",
    },
    {
      id: "church",
      name: "Our Lady of Bad Decisions",
      kind: "church",
      doorX: 27,
      doorY: 48,
      ix0: 59,
      iy0: 2,
      ix1: 67,
      iy1: 5,
      spawnX: 63,
      spawnY: 4,
      exitX: 63,
      exitY: 6,
      exteriorSpawnX: 27,
      exteriorSpawnY: 47,
      blurb: "Forgiveness $50",
    },
    {
      id: "shop_gun",
      name: "Ammo & Alibis",
      kind: "shop",
      doorX: 74,
      doorY: 70,
      ix0: 71,
      iy0: 83,
      ix1: 79,
      iy1: 87,
      spawnX: 75,
      spawnY: 85,
      exitX: 75,
      exitY: 82,
      exteriorSpawnX: 74,
      exteriorSpawnY: 69,
      blurb: "Bullets & excuses",
    },
    {
      id: "shop_liquor",
      name: "Southside Liquor",
      kind: "shop",
      doorX: 9,
      doorY: 70,
      ix0: 83,
      iy0: 2,
      ix1: 91,
      iy1: 5,
      spawnX: 87,
      spawnY: 4,
      exitX: 87,
      exitY: 6,
      exteriorSpawnX: 9,
      exteriorSpawnY: 69,
      blurb: "Courage in a bottle",
    },
  ];

  const respawnPoints: Array<{ x: number; y: number }> = [];
  for (let y = 10; y < height - 10; y += 4) {
    for (let x = 10; x < width - 10; x += 4) {
      const t = tiles[y]![x]!;
      if (outdoorWalkable(t)) respawnPoints.push({ x: x + 0.5, y: y + 0.5 });
    }
  }

  const props: WorldMapDef["props"] = [
    { id: "d1", kind: "dumpster", x: 14, y: 22, label: "Dumpster of Destiny" },
    { id: "d2", kind: "dumpster", x: 55, y: 45, label: "Smells like opportunity" },
    { id: "d3", kind: "dumpster", x: 88, y: 50, label: "Industrial salad" },
    { id: "p1", kind: "protection", x: 30, y: 42, label: "Protection Corner" },
    { id: "p2", kind: "protection", x: 72, y: 42, label: "Toll Booth (unofficial)" },
    { id: "p3", kind: "protection", x: 50, y: 66, label: "Parking Racket" },
    { id: "c1", kind: "car", x: 48, y: 74, label: "Rusty Coupe" },
    { id: "c2", kind: "car", x: 52, y: 78, label: "No plates, no problems" },
    { id: "c3", kind: "car", x: 56, y: 72, label: "Chop candidate" },
    { id: "n1", kind: "neon", x: 94, y: 30, label: "OPEN" },
    { id: "n2", kind: "neon", x: 50, y: 12, label: "PAWN" },
    { id: "h1", kind: "hydrant", x: 20, y: 24 },
    { id: "h2", kind: "hydrant", x: 64, y: 46 },
    { id: "cr1", kind: "crate", x: 56, y: 30, label: "Definitely not guns" },
    { id: "cr2", kind: "crate", x: 58, y: 32, label: "Still not guns" },
  ];

  return {
    width,
    height,
    tiles,
    buildings,
    playerSpawn: { x: 40, y: 42 },
    respawnPoints,
    props,
    npcSpawns: [
      { id: "npc_bartender", name: "Vince the Barman", x: 3, y: 3, role: "bartender", buildingId: "bar_rusty" },
      { id: "npc_fixer", name: "Rita Fix", x: 7, y: 4, role: "fixer", buildingId: "bar_rusty" },
      { id: "npc_dealer", name: "Pawnshop Phil", x: 100.5, y: 3.2, role: "dealer", buildingId: "shop_pawn" },
      { id: "npc_doc", name: "Doc Bandage", x: 3.5, y: 85, role: "doc", buildingId: "hospital" },
      { id: "npc_coach", name: "Coach Brick", x: 105, y: 85, role: "coach", buildingId: "gym" },
      { id: "npc_priest", name: "Father Trouble", x: 63, y: 3, role: "priest", buildingId: "church" },
      { id: "npc_mech", name: "Grease Tony", x: 51, y: 85, role: "mechanic", buildingId: "garage" },
      { id: "npc_gun", name: "Caliber Kate", x: 74, y: 85, role: "dealer", buildingId: "shop_gun" },
      { id: "npc_booze", name: "Bottle Bob", x: 86, y: 3, role: "dealer", buildingId: "shop_liquor" },
      { id: "npc_club", name: "DJ Static", x: 38, y: 3, role: "bartender", buildingId: "club_neon" },
      { id: "npc_street", name: "Corner Carl", x: 36, y: 42, role: "thug" },
      { id: "npc_street2", name: "Alley Ace", x: 22, y: 30, role: "thug" },
      { id: "npc_street3", name: "Meter Maid Mayhem", x: 50, y: 68, role: "thug" },
      { id: "npc_street4", name: "Quiet Quentin", x: 80, y: 44, role: "thug" },
    ],
    aiPosseSpawns: [
      { id: "ai_dogs", name: "The Dumpster Dogs", x: 14, y: 22, color: 0xc44, aggression: 0.65, threat: 1 },
      { id: "ai_silk", name: "Silk Street Crew", x: 55, y: 20, color: 0x48c, aggression: 0.4, threat: 2 },
      { id: "ai_rats", name: "Rail Rats", x: 42, y: 55, color: 0x8a4, aggression: 0.55, threat: 2 },
      { id: "ai_chrome", name: "Chrome Fists", x: 30, y: 16, color: 0xa6a, aggression: 0.5, threat: 3 },
      { id: "ai_south", name: "Southside Slicks", x: 78, y: 52, color: 0xc84, aggression: 0.55, threat: 3 },
      { id: "ai_west", name: "West End Wreckers", x: 18, y: 55, color: 0x6a8, aggression: 0.5, threat: 2 },
      { id: "ai_neon", name: "Neon Vipers", x: 92, y: 34, color: 0xf0c, aggression: 0.6, threat: 4 },
      { id: "ai_lot", name: "Lot Lizards MC", x: 52, y: 76, color: 0x886, aggression: 0.45, threat: 3 },
      { id: "ai_church", name: "Choir of Pain", x: 28, y: 52, color: 0xa55, aggression: 0.35, threat: 2 },
    ],
  };
}

export function isBlockedTile(t: TileType): boolean {
  return t === "wall" || t === "void";
}

export function tileColor(t: TileType): number {
  switch (t) {
    case "grass":
      return 0x4a5a32;
    case "road":
      return 0x3a3a44;
    case "sidewalk":
      return 0x6a655c;
    case "parking":
      return 0x3a3a48;
    case "wall":
      return 0x2a2520;
    case "floor":
      return 0x4a4038;
    case "door":
      return 0x8a5a2a;
    case "bar":
      return 0x6a3030;
    case "shop":
      return 0x30506a;
    case "hospital":
      return 0x405060;
    case "gym":
      return 0x4a4030;
    case "void":
      return 0x101010;
    default:
      return 0x333333;
  }
}
