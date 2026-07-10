import type { TileType } from "./protocol.js";

export interface MapBuildingDef {
  id: string;
  name: string;
  kind: "bar" | "shop" | "safehouse" | "warehouse";
  doorX: number;
  doorY: number;
  /** Interior rectangle inclusive */
  ix0: number;
  iy0: number;
  ix1: number;
  iy1: number;
  spawnX: number;
  spawnY: number;
  /** Interior exit door tile (stand near to leave) */
  exitX: number;
  exitY: number;
  exteriorSpawnX: number;
  exteriorSpawnY: number;
}

export interface WorldMapDef {
  width: number;
  height: number;
  tiles: TileType[][];
  buildings: MapBuildingDef[];
  playerSpawn: { x: number; y: number };
  /** Outdoor walkable points used for quiet respawns */
  respawnPoints: Array<{ x: number; y: number }>;
  npcSpawns: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    role: "bartender" | "fixer" | "thug" | "dealer";
    buildingId?: string;
  }>;
  aiPosseSpawns: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    color: number;
    aggression: number;
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
  if (y0 > 0) rect(tiles, 0, y0 - 2, w - 1, y0 - 1, "sidewalk");
  if (y1 + 2 < tiles.length) rect(tiles, 0, y1 + 1, w - 1, y1 + 2, "sidewalk");
}

function roadV(tiles: TileType[][], x0: number, x1: number, h: number) {
  rect(tiles, x0, 0, x1, h - 1, "road");
  if (x0 > 0) rect(tiles, x0 - 2, 0, x0 - 1, h - 1, "sidewalk");
  if (x1 + 2 < tiles[0]!.length) rect(tiles, x1 + 1, 0, x1 + 2, h - 1, "sidewalk");
}

function outdoorWalkable(t: TileType): boolean {
  return t === "grass" || t === "road" || t === "sidewalk";
}

/** Build expanded Skidrow district */
export function createSkidrowMap(): WorldMapDef {
  const width = 80;
  const height = 70;
  const tiles = fill(width, height, "grass");

  // Road grid
  roadH(tiles, 20, 23, width);
  roadH(tiles, 42, 45, width);
  roadV(tiles, 18, 21, height);
  roadV(tiles, 38, 41, height);
  roadV(tiles, 58, 61, height);

  // --- Exterior building shells (city blocks) ---
  // NW bar
  shell(tiles, 6, 8, 14, 16, 10, 16);
  // NE pawn shop
  shell(tiles, 48, 8, 58, 16, 53, 16);
  // Mid west safehouse
  shell(tiles, 6, 28, 14, 36, 10, 28);
  // Mid east warehouse
  shell(tiles, 48, 28, 62, 40, 55, 28);
  // South club (bar2 exterior only shell)
  shell(tiles, 26, 52, 36, 62, 31, 52);
  // Far SE junkyard shed
  shell(tiles, 64, 52, 74, 62, 69, 52);
  // North mid factory
  shell(tiles, 26, 6, 34, 14, 30, 14);
  // East alley apartments
  shell(tiles, 66, 28, 74, 36, 66, 32);

  // --- Interior zones (map edges; not used as outdoor) ---
  // Bar interior (NW pocket)
  rect(tiles, 1, 1, 9, 6, "floor");
  outline(tiles, 1, 1, 9, 6, "wall");
  rect(tiles, 2, 2, 8, 5, "floor");
  tiles[6][5] = "door";
  tiles[3][2] = "bar";

  // Shop interior (NE pocket)
  rect(tiles, 70, 1, 78, 6, "floor");
  outline(tiles, 70, 1, 78, 6, "wall");
  rect(tiles, 71, 2, 77, 5, "floor");
  tiles[6][74] = "door";
  // Counter deep in the shop — away from the exit door so E can leave cleanly
  tiles[3][72] = "shop";
  tiles[3][73] = "shop";

  // Safehouse interior (SW pocket)
  rect(tiles, 1, 63, 9, 68, "floor");
  outline(tiles, 1, 63, 9, 68, "wall");
  rect(tiles, 2, 64, 8, 67, "floor");
  tiles[63][5] = "door";

  // Warehouse interior (SE pocket)
  rect(tiles, 70, 63, 78, 68, "floor");
  outline(tiles, 70, 63, 78, 68, "wall");
  rect(tiles, 71, 64, 77, 67, "floor");
  tiles[63][74] = "door";

  const buildings: MapBuildingDef[] = [
    {
      id: "bar_rusty",
      name: "The Rusty Nail",
      kind: "bar",
      doorX: 10,
      doorY: 16,
      ix0: 2,
      iy0: 2,
      ix1: 8,
      iy1: 5,
      spawnX: 5,
      spawnY: 5,
      exitX: 5,
      exitY: 6,
      exteriorSpawnX: 10,
      exteriorSpawnY: 17,
    },
    {
      id: "shop_pawn",
      name: "Pawn-O-Matic",
      kind: "shop",
      doorX: 53,
      doorY: 16,
      ix0: 71,
      iy0: 2,
      ix1: 77,
      iy1: 5,
      spawnX: 74,
      spawnY: 4,
      exitX: 74,
      exitY: 6,
      exteriorSpawnX: 53,
      exteriorSpawnY: 17,
    },
    {
      id: "safehouse",
      name: "Your Crash Pad",
      kind: "safehouse",
      doorX: 10,
      doorY: 28,
      ix0: 2,
      iy0: 64,
      ix1: 8,
      iy1: 67,
      spawnX: 5,
      spawnY: 65,
      exitX: 5,
      exitY: 63,
      exteriorSpawnX: 10,
      exteriorSpawnY: 27,
    },
    {
      id: "warehouse",
      name: "Old Warehouse",
      kind: "warehouse",
      doorX: 55,
      doorY: 28,
      ix0: 71,
      iy0: 64,
      ix1: 77,
      iy1: 67,
      spawnX: 74,
      spawnY: 65,
      exitX: 74,
      exitY: 63,
      exteriorSpawnX: 55,
      exteriorSpawnY: 27,
    },
  ];

  // Candidate respawn points on roads/sidewalks, away from interior pockets
  const respawnPoints: Array<{ x: number; y: number }> = [];
  for (let y = 8; y < height - 8; y += 3) {
    for (let x = 8; x < width - 8; x += 3) {
      const t = tiles[y]![x]!;
      if (!outdoorWalkable(t)) continue;
      // skip right next to doors a bit less critical; keep variety
      respawnPoints.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  // Guaranteed spread anchors
  const anchors = [
    { x: 12, y: 22 },
    { x: 40, y: 22 },
    { x: 60, y: 22 },
    { x: 20, y: 44 },
    { x: 40, y: 44 },
    { x: 60, y: 44 },
    { x: 12, y: 55 },
    { x: 40, y: 12 },
    { x: 70, y: 44 },
    { x: 30, y: 35 },
    { x: 50, y: 50 },
    { x: 15, y: 35 },
  ];
  for (const a of anchors) {
    if (outdoorWalkable(tiles[Math.floor(a.y)]![Math.floor(a.x)]!)) {
      respawnPoints.push({ x: a.x, y: a.y });
    }
  }

  return {
    width,
    height,
    tiles,
    buildings,
    playerSpawn: { x: 40, y: 43 },
    respawnPoints,
    npcSpawns: [
      {
        id: "npc_bartender",
        name: "Vince the Barman",
        x: 3,
        y: 3,
        role: "bartender",
        buildingId: "bar_rusty",
      },
      {
        id: "npc_fixer",
        name: "Rita Fix",
        x: 7,
        y: 3,
        role: "fixer",
        buildingId: "bar_rusty",
      },
      {
        id: "npc_dealer",
        name: "Pawnshop Phil",
        x: 72.5,
        y: 3.2,
        role: "dealer",
        buildingId: "shop_pawn",
      },
      {
        id: "npc_street",
        name: "Corner Carl",
        x: 36,
        y: 43,
        role: "thug",
      },
      {
        id: "npc_street2",
        name: "Alley Ace",
        x: 22,
        y: 30,
        role: "thug",
      },
    ],
    aiPosseSpawns: [
      { id: "ai_dogs", name: "The Dumpster Dogs", x: 14, y: 22, color: 0xc44, aggression: 0.7 },
      { id: "ai_silk", name: "Silk Street Crew", x: 52, y: 22, color: 0x48c, aggression: 0.45 },
      { id: "ai_rats", name: "Rail Rats", x: 40, y: 50, color: 0x8a4, aggression: 0.6 },
      { id: "ai_chrome", name: "Chrome Fists", x: 30, y: 18, color: 0xa6a, aggression: 0.5 },
      { id: "ai_south", name: "Southside Slicks", x: 62, y: 48, color: 0xc84, aggression: 0.55 },
      { id: "ai_west", name: "West End Wreckers", x: 16, y: 48, color: 0x6a8, aggression: 0.5 },
    ],
  };
}

export function isBlockedTile(t: TileType): boolean {
  return t === "wall" || t === "void";
}

export function tileColor(t: TileType): number {
  switch (t) {
    case "grass":
      return 0x5a6b3a;
    case "road":
      return 0x3a3a42;
    case "sidewalk":
      return 0x6a655c;
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
    case "void":
      return 0x101010;
    default:
      return 0x333333;
  }
}
