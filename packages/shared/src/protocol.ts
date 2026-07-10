import type { DayPhase } from "./lighting.js";
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
  /** Boss is too hurt to fight but still "alive" while goons cover him */
  incapacitated?: boolean;
  /** Presentation / portrait (street mix ~40% female) */
  gender?: "male" | "female";
  /** Present for your own posse units */
  ownedWeapons?: WeaponId[];
  ownedArmors?: ArmorId[];
  /**
   * Rounds remaining per limited weapon (own posse only).
   * Melee + pistol are unlimited and omit keys; missing limited key = 0.
   */
  weaponAmmo?: Partial<Record<WeaponId, number>>;
  /** NPC spawn role (bartender, dancer, …) for client presentation */
  npcRole?: string;
  /**
   * Gentleman's club tip stage for this viewer (0 = clothed … max 2 = most skin).
   * Only set for dancer NPCs.
   */
  revealStage?: number;
  /** Stable dancer art key: a | b | c */
  dancerKey?: string;
  /**
   * AI combat role for hostiles (shooter / rusher / coward).
   * Client uses for badges + readability; server is authoritative for behavior.
   */
  aiRole?: "shooter" | "rusher" | "coward";
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
  /** Interior tile bounds (inclusive) — client uses these for full indoor view */
  ix0?: number;
  iy0?: number;
  ix1?: number;
  iy1?: number;
  exitX?: number;
  exitY?: number;
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
  /** Offline Grok TTS clip under /voice/{id}.mp3 */
  voiceLineId?: string;
  /** For portrait selection (crew art / gender) */
  gender?: "male" | "female";
  /** Gentleman's club dancer art key + tip stage for portrait */
  dancerKey?: string;
  revealStage?: number;
}

export interface ShopState {
  buildingId: string;
  shopName: string;
  /** Optional bark when the counter opens */
  voiceLineId?: string;
}

/** Crash Pad stash UI (safehouse storage — not looted on wipe) */
export interface StashState {
  cash: number;
  weapons: WeaponId[];
  armors: ArmorId[];
  /** Cash carried on the street (looted on wipe) */
  pocketCash: number;
}

/** Offer listed on the fixer job board */
export interface MissionOffer {
  id: string;
  title: string;
  blurb: string;
  difficulty: 1 | 2 | 3;
  rewardCash: number;
  rewardRep: number;
}

/** Open job board UI (snapshot-driven, like shop) */
export interface JobBoardState {
  npcId: string;
  npcName: string;
  title: string;
  offers: MissionOffer[];
}

export interface MissionObjectivePublic {
  id: string;
  label: string;
  done: boolean;
}

/** Named goon who died on your watch (Cannon Fodder memorial) */
export interface MemorialEntry {
  id: string;
  name: string;
  gender?: "male" | "female";
  /** Cheerful understatement */
  epitaph: string;
  /** How they went out */
  cause: string;
  /** Server tick when recorded */
  tick: number;
}

/** District row for city map UI */
export interface DistrictPublic {
  id: string;
  name: string;
  short: string;
  blurb: string;
  minRep: number;
  unlocked: boolean;
  danger: "safe" | "risky" | "hot";
  landmark?: string;
  /** Bounds for map sketch */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** First-session guided flow (null when finished or skipped) */
export interface TutorialState {
  step: string;
  title: string;
  body: string;
  /** 1-based index for UI */
  stepIndex: number;
  stepCount: number;
  hintX?: number;
  hintY?: number;
}

/** Active job progress for HUD / debrief */
export interface MissionRuntime {
  id: string;
  title: string;
  /** active = objectives; extract = leave via exit; complete/failed terminal (usually cleared) */
  phase: "active" | "extract" | "complete" | "failed";
  objectives: MissionObjectivePublic[];
  /** Seconds left on timed objectives, if any */
  timeLeft?: number;
  /** Progress 0–1 for hold-style objectives */
  progress?: number;
  rewardCash: number;
  rewardRep: number;
  /** World hint for the active objective */
  hintX?: number;
  hintY?: number;
  /** True when running inside a private mission layer (warehouse etc.) */
  instanced?: boolean;
}

/** Visual combat event for one tick (muzzle, tracer, hit, etc.) */
export interface CombatFxEvent {
  /**
   * shot / melee / flame = attack start;
   * hit / miss / blocked / death = outcome (blocked = wall/cover LoS).
   */
  kind: "shot" | "melee" | "flame" | "hit" | "miss" | "blocked" | "death";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  weapon: WeaponId;
  crit?: boolean;
  /** Damage dealt (hit only) — client floating numbers */
  dmg?: number;
}

export interface WorldSnapshot {
  tick: number;
  /**
   * Outdoor day/night phase from server tick (see shared lighting.ts).
   * Client paints sky/overlay/neon; interiors still get district/club tint.
   */
  dayPhase: DayPhase;
  you: {
    characterId: string;
    posseId: string;
    cash: number;
    rep: number;
    /** Street heat 0–100 (wanted-style pressure) */
    heat: number;
    selectedUnitId: string;
    insideBuildingId: string | null;
    /** Seconds remaining until respawn; null if alive */
    respawnIn: number | null;
    /** Syndicate-style order banner: IDLE, GOING, ASSASSINATE, etc. */
    action: string;
    actionDetail: string | null;
    /** true = safe downtown (PvE), false = war zone (PvP / rival gangs) */
    inSafeZone: boolean;
    /** Current outdoor district id (or interior label) */
    districtId: string;
    districtName: string;
    /** True if current outdoor tile is unlocked for your rep */
    districtUnlocked: boolean;
    /** Cash locked in Crash Pad stash (safe from wipe) */
    stashCash: number;
    /** Segregated world id (default `public`) */
    realmId: string;
    /** Display label for HUD (usually same as realmId) */
    realmLabel?: string;
  };
  /** City districts for map UI (rep unlocks) */
  districts: DistrictPublic[];
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
  /** Crash Pad stash panel when open */
  stash: StashState | null;
  /** Fixer job board when open */
  jobBoard: JobBoardState | null;
  /** Active mission, if any */
  mission: MissionRuntime | null;
  /** First-session tutorial coach (null if done/skipped) */
  tutorial: TutorialState | null;
  /** Fallen named goons (your posse only) */
  memorials: MemorialEntry[];
  /** Server wants memorial wall open (priest / message) */
  memorialOpen: boolean;
  recentChat: ChatLine[];
  combatLog: string[];
  /** Combat VFX that occurred since last snapshot (this tick) */
  fx?: CombatFxEvent[];
}

/** Client -> Server */
export type ClientMessage =
  | { type: "auth"; name: string; protocolVersion: number; realm?: string }
  | { type: "intent.move"; x: number; y: number; unitIds?: string[] }
  /** Continuous free movement in world space (normalized or zero to stop). */
  | { type: "intent.dir"; dx: number; dy: number }
  | { type: "intent.stop" }
  | { type: "intent.fire"; targetId?: string; x?: number; y?: number }
  | { type: "intent.select"; unitId: string }
  /** Optional targetUnitId: talk to that NPC when in range (click-to-talk). */
  | { type: "intent.interact"; targetUnitId?: string }
  | { type: "intent.exit" }
  /** Rename boss / display name (2–20 chars, unique on this realm). */
  | { type: "settings.rename"; name: string }
  | { type: "dialogue.choice"; choiceId: string }
  | { type: "dialogue.close" }
  | { type: "shop.buyWeapon"; weaponId: WeaponId; unitId: string }
  | { type: "shop.buyArmor"; armorId: ArmorId; unitId: string }
  | { type: "shop.buyUpgrade"; upgradeId: UpgradeId; unitId: string }
  /** Top up limited weapon ammo to max for selected crew member */
  | { type: "shop.buyAmmo"; weaponId: WeaponId; unitId: string }
  | { type: "shop.close" }
  /** Crash Pad stash (safehouse only) */
  | { type: "stash.close" }
  | { type: "stash.depositCash"; amount: number }
  | { type: "stash.withdrawCash"; amount: number }
  | { type: "stash.depositWeapon"; weaponId: WeaponId; unitId: string }
  | { type: "stash.withdrawWeapon"; weaponId: WeaponId; unitId: string }
  | { type: "stash.depositArmor"; armorId: ArmorId; unitId: string }
  | { type: "stash.withdrawArmor"; armorId: ArmorId; unitId: string }
  | { type: "stash.depositAll"; unitId: string }
  | { type: "jobBoard.accept"; missionId: string }
  | { type: "jobBoard.close" }
  | { type: "mission.abandon" }
  | { type: "tutorial.skip" }
  /** Optional client-only request — server may ignore; reserved for map waypoint */
  | { type: "map.ping"; x: number; y: number }
  | { type: "memorial.open" }
  | { type: "memorial.close" }
  | { type: "posse.setWeapon"; unitId: string; weaponId: WeaponId }
  | { type: "posse.setArmor"; unitId: string; armorId: ArmorId }
  | { type: "chat"; text: string }
  | { type: "ping"; t: number };

/** Fancy loot / combat notifications (UI toasts) */
export interface NotifyLootUpgrade {
  kind: "weapon" | "armor";
  id: string;
  name: string;
  /** true = strictly better than anything the crew had before the wipe */
  upgrade: boolean;
}

export type ServerMessage =
  | { type: "auth.ok"; characterId: string; posseId: string; token: string; realmId: string }
  | { type: "auth.fail"; reason: string }
  | { type: "snapshot"; data: WorldSnapshot }
  | { type: "event"; text: string }
  | { type: "chat"; line: ChatLine }
  | { type: "reject"; reason: string }
  | { type: "pong"; t: number }
  /** Dramatic UI notifications (loot upgrades, death, downed) */
  | {
      type: "notify";
      kind: "loot";
      title: string;
      subtitle?: string;
      cash: number;
      victimName: string;
      upgrades: NotifyLootUpgrade[];
      otherItems: string[];
    }
  | { type: "notify"; kind: "killed"; title: string; body: string }
  | { type: "notify"; kind: "downed"; title: string; body: string }
  | {
      type: "notify";
      kind: "mission";
      title: string;
      body: string;
      cash?: number;
      rep?: number;
    }
  /** Play a prebaked NPC voice line (/voice/{lineId}.mp3) */
  | { type: "voice.play"; lineId: string };
