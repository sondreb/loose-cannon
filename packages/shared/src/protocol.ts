import type { ArmorId, UpgradeId, WeaponId } from "./weapons.js";

export type TileType =
  | "grass"
  | "road"
  | "sidewalk"
  | "parking"
  | "wall"
  | "floor"
  | "door"
  | "bar"
  | "shop"
  | "hospital"
  | "gym"
  | "void";

export interface Vec2 {
  x: number;
  y: number;
}

export interface UnitStats {
  aim: number;
  guts: number;
  muscle: number;
  brains: number;
  speed: number;
  maxHealth: number;
}

export interface UnitPublic {
  id: string;
  name: string;
  kind: "player" | "goon" | "npc" | "ai_boss" | "ai_goon";
  ownerId: string | null;
  posseId: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  weapon: WeaponId;
  armor: ArmorId;
  stats: UnitStats;
  facing: number; // 0-7
  alive: boolean;
  isPlayerLeader?: boolean;
  /** Present for your own posse units */
  ownedWeapons?: WeaponId[];
  ownedArmors?: ArmorId[];
}

export interface PossePublic {
  id: string;
  name: string;
  leaderId: string;
  isPlayer: boolean;
  hostile: boolean;
  cash?: number;
  color: number;
}

export interface BuildingPublic {
  id: string;
  name: string;
  kind: string;
  doorX: number;
  doorY: number;
  interiorId: string;
  blurb?: string;
  /** Exterior footprint for 3D isometric drawing */
  ex0?: number;
  ey0?: number;
  ex1?: number;
  ey1?: number;
  stories?: number;
  wallColor?: number;
  roofColor?: number;
  accentColor?: number;
}

export interface PropPublic {
  id: string;
  kind: string;
  x: number;
  y: number;
  label?: string;
}

export interface ChatLine {
  id: string;
  from: string;
  text: string;
  t: number;
  system?: boolean;
}

export interface DialogueChoice {
  id: string;
  label: string;
  tone: "smooth" | "business" | "threaten" | "insult";
}

export interface DialogueState {
  npcId: string;
  npcName: string;
  text: string;
  choices: DialogueChoice[];
}

export interface ShopState {
  buildingId: string;
  shopName: string;
}

export interface WorldSnapshot {
  tick: number;
  you: {
    characterId: string;
    posseId: string;
    cash: number;
    rep: number;
    selectedUnitId: string;
    insideBuildingId: string | null;
    /** Seconds remaining until respawn; null if alive */
    respawnIn: number | null;
    /** Syndicate-style order banner: IDLE, GOING, ASSASSINATE, etc. */
    action: string;
    actionDetail: string | null;
    /** true = safe downtown (PvE), false = war zone (PvP / rival gangs) */
    inSafeZone: boolean;
  };
  units: UnitPublic[];
  posses: PossePublic[];
  buildings: BuildingPublic[];
  props: PropPublic[];
  mapWidth: number;
  mapHeight: number;
  /** Included when map layer changes (enter/exit building) or first snapshot */
  mapRevision: number;
  blocked?: Array<{ x: number; y: number; type: TileType }>;
  floors?: Array<{ x: number; y: number; type: TileType }>;
  dialogue: DialogueState | null;
  shop: ShopState | null;
  recentChat: ChatLine[];
  combatLog: string[];
}

/** Client -> Server */
export type ClientMessage =
  | { type: "auth"; name: string; protocolVersion: number }
  | { type: "intent.move"; x: number; y: number; unitIds?: string[] }
  /** Continuous free movement in world space (normalized or zero to stop). */
  | { type: "intent.dir"; dx: number; dy: number }
  | { type: "intent.stop" }
  | { type: "intent.fire"; targetId?: string; x?: number; y?: number }
  | { type: "intent.select"; unitId: string }
  | { type: "intent.interact" }
  | { type: "intent.exit" }
  | { type: "dialogue.choice"; choiceId: string }
  | { type: "dialogue.close" }
  | { type: "shop.buyWeapon"; weaponId: WeaponId; unitId: string }
  | { type: "shop.buyArmor"; armorId: ArmorId; unitId: string }
  | { type: "shop.buyUpgrade"; upgradeId: UpgradeId; unitId: string }
  | { type: "shop.close" }
  | { type: "posse.setWeapon"; unitId: string; weaponId: WeaponId }
  | { type: "posse.setArmor"; unitId: string; armorId: ArmorId }
  | { type: "chat"; text: string }
  | { type: "ping"; t: number };

/** Server -> Client */
export type ServerMessage =
  | { type: "auth.ok"; characterId: string; posseId: string; token: string }
  | { type: "auth.fail"; reason: string }
  | { type: "snapshot"; data: WorldSnapshot }
  | { type: "event"; text: string }
  | { type: "chat"; line: ChatLine }
  | { type: "reject"; reason: string }
  | { type: "pong"; t: number };
