import {
  ARMORS,
  CHAT_RANGE,
  COMBAT,
  DEFAULT_CASH,
  DEFAULT_HEALTH,
  FIGHT_CHANCE,
  INTERACT_RANGE,
  isSafeWorldPos,
  DISTRICTS,
  districtAt,
  HEAT,
  HUSTLE_HEAT,
  hustleCooldownSec,
  isDistrictUnlocked,
  LAY_LOW_HEAT_REDUCE,
  DANCER_MAX_STAGE,
  dancerTipCost,
  dayPhaseFromTick,
  weatherFromTick,
  DEFAULT_REALM_ID,
  listMissionOffers,
  layLowCost,
  MAX_ACTIVE_GOONS,
  MAX_CHAT_LEN,
  MAX_MEMORIALS,
  PARTY_MAX,
  memorialCause,
  MISSIONS,
  realmLabel,
  AI_FLEE_HEALTH_FRAC,
  armorPierce,
  assignAiPosseRoles,
  assignGangRoles,
  castLineOfSight,
  gangBaseStats,
  gangBossName,
  gangGoonName,
  gangOwnedWeapons,
  gangProfile,
  instanceGangFlavor,
  pickGangWeapon,
  critChance,
  damagePower,
  fireCooldownFactor,
  gutsDamageTakenFactor,
  hasAdjacentCover,
  hitChanceClamped,
  isBlockedTile,
  moveSpeedTilesPerSec,
  pickRecruitArchetype,
  preferredEngageRange,
  rollRecruitStats,
  streetRole,
  type AiCombatRole,
  nextTutorialStep,
  POSSE_AGGRO_RANGE,
  POSSE_DETECT_RANGE,
  PROTOCOL_VERSION,
  randomEpitaph,
  RESPAWN_DELAY_SEC,
  SAFE_Y_MAX,
  SHOP_ARMOR_ORDER,
  SHOP_UPGRADE_ORDER,
  SHOP_WEAPON_ORDER,
  shopPrice,
  TICK_HZ,
  TUTORIAL_ORDER,
  TUTORIAL_STEPS,
  UPGRADES,
  WEAPONS,
  createSkidrowMap,
  findGridPath,
  isWalkLineClear,
  isUnlimitedAmmo,
  pickVoiceLineId,
  type ArmorId,
  type ChatLine,
  type ClientMessage,
  type CombatFxEvent,
  type DialogueState,
  type DistrictPublic,
  type JobBoardState,
  type MemorialEntry,
  type MissionId,
  type MissionRuntime,
  type PartyInvitePublic,
  type PartyState,
  type PresenceEntry,
  type ShopState,
  type StashState,
  type TutorialState,
  type TutorialStepId,
  type PathPoint,
  type UnitPublic,
  type UnitStats,
  type UpgradeId,
  type WeaponId,
  type WorldSnapshot,
} from "@loose-cannon/shared";
import { randomGoonName, randomRecruitProfile, type Gender } from "./names.js";
import type { ClientConn } from "./net.js";

/** Server-only mission progress (mirrored into MissionRuntime for clients). */
interface PosseMission {
  defId: MissionId;
  holdAccum: number;
  rewardGranted: boolean;
  /** For kill missions: unit id of the target boss when known */
  targetUnitId: string | null;
  /** Private layer id (`mi_<posseId>`) when instanced */
  instanceLayerId: string | null;
  /** Building template used for interior geometry (e.g. warehouse) */
  templateBuildingId: string | null;
  /** Hostile posse spawned for this instance */
  enemyPosseId: string | null;
  /** active → extract after hostiles clear → complete on door */
  phase: "active" | "extract" | "failed";
  /** Extract objective completed */
  extracted: boolean;
  /** Logged once when door unlocks after clear */
  extractAnnounced?: boolean;
}

interface Unit {
  id: string;
  name: string;
  kind: UnitPublic["kind"];
  ownerId: string | null;
  posseId: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** Intermediate A* waypoints toward tx/ty (world space); empty = straight-line */
  path: PathPoint[];
  /** Ticks with no progress while pathing — triggers repath */
  stuckTicks: number;
  /** Free-move velocity direction (world space); used when moveMode === "dir" */
  dirX: number;
  dirY: number;
  moveMode: "idle" | "target" | "dir";
  health: number;
  stats: UnitStats;
  weapon: WeaponId;
  armor: ArmorId;
  facing: number;
  alive: boolean;
  fireCd: number;
  isPlayerLeader: boolean;
  /** Boss is too hurt to fight; stays alive until the rest of the posse falls */
  incapacitated: boolean;
  gender: Gender;
  ownedWeapons: Set<WeaponId>;
  ownedArmors: Set<ArmorId>;
  /** Limited-weapon rounds remaining (players only; AI ignores ammo) */
  weaponAmmo: Map<WeaponId, number>;
  aiWanderT: number;
  buildingId: string | null;
  respawnT?: number;
  /** Posse that last damaged this unit (for wipe loot attribution) */
  lastHitByPosseId: string | null;
  /** NPC spawn role for dialogue / client art */
  npcRole?: string;
  /** Gentleman's club dancer art key */
  dancerKey?: string;
  /** Hostile AI fight style (shooter / rusher / coward) */
  aiRole?: AiCombatRole;
}

/** Seed ammo for limited guns the unit owns. */
function ammoMapForWeapons(weapons: Iterable<WeaponId>): Map<WeaponId, number> {
  const m = new Map<WeaponId, number>();
  for (const id of weapons) {
    const def = WEAPONS[id];
    if (!def || isUnlimitedAmmo(def)) continue;
    m.set(id, def.startingAmmo);
  }
  return m;
}

/** Ensure a newly acquired limited weapon has starting ammo (never lowers existing). */
function grantWeaponAmmo(unit: Unit, weaponId: WeaponId, amount?: number): void {
  const def = WEAPONS[weaponId];
  if (!def || isUnlimitedAmmo(def) || def.maxAmmo == null) return;
  const add = amount ?? def.startingAmmo;
  const cur = unit.weaponAmmo.get(weaponId) ?? 0;
  unit.weaponAmmo.set(weaponId, Math.min(def.maxAmmo, Math.max(cur, add)));
}

function stripLimitedAmmo(unit: Unit): void {
  unit.weaponAmmo.clear();
}

/** True if unit can fire this weapon (unlimited or has rounds). */
function canFireWeapon(unit: Unit, weaponId: WeaponId): boolean {
  const def = WEAPONS[weaponId];
  if (!def) return false;
  if (isUnlimitedAmmo(def)) return true;
  return (unit.weaponAmmo.get(weaponId) ?? 0) >= def.ammoPerShot;
}

/**
 * If current gun is dry, equip best owned weapon that still has ammo
 * (or unlimited pistol/melee). Returns false only if nothing is fireable.
 */
function ensureFireableWeapon(unit: Unit): boolean {
  if (canFireWeapon(unit, unit.weapon)) return true;
  let best: WeaponId | null = null;
  let bestScore = -1;
  for (const id of unit.ownedWeapons) {
    if (!canFireWeapon(unit, id)) continue;
    const score = weaponScore(id);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  if (!best) return false;
  unit.weapon = best;
  return true;
}

function weaponScore(w: WeaponId): number {
  const d = WEAPONS[w];
  if (!d) return 0;
  return d.damage / Math.max(0.05, d.fireCooldown) + d.range * 0.4;
}

function armorScore(a: ArmorId): number {
  return ARMORS[a]?.damageReduce ?? 0;
}

const STARTER_WEAPONS: WeaponId[] = ["pipe", "pistol", "tommy"];

interface Posse {
  id: string;
  name: string;
  leaderId: string;
  isPlayer: boolean;
  hostile: boolean;
  cash: number;
  rep: number;
  /** Street heat 0–HEAT.max */
  heat: number;
  color: number;
  aggression: number;
  /** AI threat tier (gear/cash scaling); used on wipe respawn */
  threat: number;
  /** Per-gang aggro start range (tiles); defaults to POSSE_AGGRO_RANGE */
  aggroRange: number;
  /** Per-gang detect / size-up range (tiles); defaults to POSSE_DETECT_RANGE */
  detectRange: number;
  /** Street intel line for combat logs */
  gangBlurb: string | null;
  lastAggroCheck: number;
  combatUntil: number;
  selectedUnitId: string;
  insideBuildingId: string | null;
  dialogue: DialogueState | null;
  shop: ShopState | null;
  /** Crash Pad stash panel open */
  stashOpen: boolean;
  jobBoard: JobBoardState | null;
  mission: PosseMission | null;
  /** Mission ids finished this session — dropped from Rita's board (Mode A memory) */
  completedMissions: MissionId[];
  /** First-session tutorial; null when finished or skipped */
  tutorialStep: TutorialStepId | null;
  /** Fallen named goons */
  memorials: MemorialEntry[];
  /** Client has memorial wall open */
  memorialOpen: boolean;
  memberIds: string[];
  respawnT?: number;
  /** Last posse that killed one of our members */
  lastKillerPosseId: string | null;
  /** Gear banked from goons who died before a full wipe (street gear only) */
  fallenWeapons: Set<WeaponId>;
  fallenArmors: Set<ArmorId>;
  /** Prevent double-looting the same wipe */
  lootedThisWipe: boolean;
  /**
   * Crash Pad storage — never looted on wipe.
   * Only pocket cash (posse.cash) and gear on units is at risk on the street.
   */
  stashCash: number;
  /** Stack counts of stashed gear (safe from wipe) */
  stashWeapons: Map<WeaponId, number>;
  stashArmors: Map<ArmorId, number>;
  /** Right-click attack-move: chase & fire until target dies or orders change */
  attackTargetId: string | null;
  /** last click-move destination label */
  moveLabel: string | null;
  /** Per-viewer dancer reveal stage at The Titty Twister (npcId → 0..DANCER_MAX_STAGE) */
  dancerStages: Record<string, number>;
  /** Player party id (null = solo) */
  partyId: string | null;
  /** Pending invite to join another player's party */
  pendingInvite: PartyInvitePublic | null;
}

/** Ephemeral multiplayer party within one realm */
interface PlayerParty {
  id: string;
  leaderPosseId: string;
  memberPosseIds: string[];
}

function emptyPartyFields(): Pick<Posse, "partyId" | "pendingInvite"> {
  return { partyId: null, pendingInvite: null };
}

function emptyStashFields(): Pick<Posse, "stashOpen" | "stashCash" | "stashWeapons" | "stashArmors"> {
  return {
    stashOpen: false,
    stashCash: 0,
    stashWeapons: new Map(),
    stashArmors: new Map(),
  };
}

function stashAddWeapon(posse: Posse, id: WeaponId): void {
  if (id === "pipe") return;
  posse.stashWeapons.set(id, (posse.stashWeapons.get(id) ?? 0) + 1);
}

function stashTakeWeapon(posse: Posse, id: WeaponId): boolean {
  const n = posse.stashWeapons.get(id) ?? 0;
  if (n <= 0) return false;
  if (n <= 1) posse.stashWeapons.delete(id);
  else posse.stashWeapons.set(id, n - 1);
  return true;
}

function stashAddArmor(posse: Posse, id: ArmorId): void {
  if (id === "none") return;
  posse.stashArmors.set(id, (posse.stashArmors.get(id) ?? 0) + 1);
}

function stashTakeArmor(posse: Posse, id: ArmorId): boolean {
  const n = posse.stashArmors.get(id) ?? 0;
  if (n <= 0) return false;
  if (n <= 1) posse.stashArmors.delete(id);
  else posse.stashArmors.set(id, n - 1);
  return true;
}

interface CharacterSession {
  characterId: string;
  posseId: string;
  name: string;
  token: string;
  conn: ClientConn | null;
  combatLog: string[];
  lastMapRevision: number;
  lastInside: string | null | undefined;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function facingFromDelta(dx: number, dy: number): number {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return 0;
  const angle = Math.atan2(dy, dx);
  const oct = Math.round((angle + Math.PI) / (Math.PI / 4)) % 8;
  return oct;
}

function defaultStats(partial?: Partial<UnitStats>): UnitStats {
  return {
    aim: 5,
    guts: 5,
    muscle: 5,
    brains: 5,
    speed: 5,
    maxHealth: DEFAULT_HEALTH,
    ...partial,
  };
}

export class GameWorld {
  /** Segregated instance id (see docs/realms.md) */
  readonly realmId: string;
  map = createSkidrowMap();
  tick = 0;
  units = new Map<string, Unit>();
  posses = new Map<string, Posse>();
  sessions = new Map<string, CharacterSession>();
  tokenToChar = new Map<string, string>();
  /** Player parties (invite groups) — scoped to this realm/world */
  parties = new Map<string, PlayerParty>();
  chat: ChatLine[] = [];
  chatSeq = 0;
  private uid = 0;
  mapRevision = 8;
  /** Prop interaction cooldowns: propId -> tick available */
  propReadyAt = new Map<string, number>();
  /** Combat VFX queued this tick, attached to snapshots then cleared */
  private combatFx: CombatFxEvent[] = [];
  /** Throttle district soft-kick messages: posseId -> tick */
  private districtWarnAt = new Map<string, number>();
  /** Throttle spammy combat-log lines: `${posseId}:${key}` -> tick */
  private logThrottleAt = new Map<string, number>();

  constructor(realmId: string = DEFAULT_REALM_ID) {
    this.realmId = realmId;
    this.seedWorld();
  }

  private pushCombatFx(fx: CombatFxEvent): void {
    this.combatFx.push(fx);
    // Hard cap so a firefight never balloons payloads
    if (this.combatFx.length > 48) this.combatFx.shift();
  }

  private nextId(prefix: string): string {
    this.uid += 1;
    return `${prefix}_${this.uid}`;
  }

  private seedWorld(): void {
    for (const n of this.map.npcSpawns) {
      const posseId = `npc_posse_${n.id}`;
      const unitId = n.id;
      this.posses.set(posseId, {
        id: posseId,
        name: n.name,
        leaderId: unitId,
        isPlayer: false,
        hostile: false,
        cash: 0,
        rep: 0,
        heat: 0,
        color: 0x888888,
        aggression: 0,
        threat: 0,
        aggroRange: POSSE_AGGRO_RANGE,
        detectRange: POSSE_DETECT_RANGE,
        gangBlurb: null,
        lastAggroCheck: 0,
        combatUntil: 0,
        selectedUnitId: unitId,
        insideBuildingId: n.buildingId ?? null,
        dialogue: null,
        shop: null,
        jobBoard: null,
        mission: null,
        completedMissions: [],
        tutorialStep: null,
        memorials: [],
        memorialOpen: false,
        memberIds: [unitId],
        lastKillerPosseId: null,
        fallenWeapons: new Set(),
        fallenArmors: new Set(),
        lootedThisWipe: false,
        ...emptyStashFields(),
        attackTargetId: null,
        moveLabel: null,
        dancerStages: {},
        ...emptyPartyFields(),
      });
      // Named NPC genders (bartenders, coaches, street meat, dancers)
      const femaleNpc = /rita|kate|may|sally|jazz|rosa|pepper|cookie|venus|lola|sable|cherry|roxy|nova|storm|ivy|jade|foxy|candy|maid|bomb|sin/i.test(
        n.name,
      );
      const street = n.role === "thug";
      const gender: Gender =
        n.role === "dancer" || femaleNpc
          ? "female"
          : street
            ? Math.random() < 0.4
              ? "female"
              : "male"
            : "male";
      this.units.set(unitId, {
        id: unitId,
        name: n.name,
        kind: "npc",
        ownerId: null,
        posseId,
        x: n.x,
        y: n.y,
        tx: n.x,
        ty: n.y,
        path: [],
        stuckTicks: 0,
        dirX: 0,
        dirY: 0,
        moveMode: "idle",
        health: DEFAULT_HEALTH,
        stats: defaultStats({ brains: 7, guts: 4 }),
        weapon: "pipe",
        armor: "none",
        facing: 2,
        alive: true,
        fireCd: 0,
        isPlayerLeader: false,
        incapacitated: false,
        gender,
        ownedWeapons: new Set(["pipe"]),
        ownedArmors: new Set(["none"]),
        weaponAmmo: new Map(),
        aiWanderT: 0,
        buildingId: n.buildingId ?? null,
        lastHitByPosseId: null,
        npcRole: n.role,
        dancerKey: n.dancerKey,
      });
    }

    for (const a of this.map.aiPosseSpawns) {
      this.spawnAiPosse(a.id, a.name, a.x, a.y, a.color, a.aggression, a.threat ?? 1);
    }
  }

  private spawnAiPosse(
    id: string,
    name: string,
    x: number,
    y: number,
    color: number,
    aggression: number,
    threat = 1,
  ): void {
    const profile = gangProfile(id);
    const displayName = profile?.name ?? name;
    const agg = profile?.aggression ?? aggression;
    const aggroRange = profile?.aggroRange ?? POSSE_AGGRO_RANGE;
    const detectRange = profile?.detectRange ?? POSSE_DETECT_RANGE;
    const gangBlurb = profile?.blurb ?? null;
    const cashMult = profile?.cashMult ?? 1;
    const leaderId = `${id}_boss`;
    const memberIds = [leaderId];
    const cash = Math.round((120 + threat * 80 + Math.floor(Math.random() * 100)) * cashMult);
    this.posses.set(id, {
      id,
      name: displayName,
      leaderId,
      isPlayer: false,
      hostile: false,
      cash,
      rep: 0,
      heat: 0,
      color,
      aggression: agg,
      threat,
      aggroRange,
      detectRange,
      gangBlurb,
      lastAggroCheck: 0,
      combatUntil: 0,
      selectedUnitId: leaderId,
      insideBuildingId: null,
      dialogue: null,
      shop: null,
      jobBoard: null,
      mission: null,
      completedMissions: [],
      tutorialStep: null,
      memorials: [],
      memorialOpen: false,
      memberIds,
      lastKillerPosseId: null,
      fallenWeapons: new Set(),
      fallenArmors: new Set(),
      lootedThisWipe: false,
      ...emptyStashFields(),
      attackTargetId: null,
      moveLabel: null,
      dancerStages: {},
      ...emptyPartyFields(),
    });

    const preferred =
      profile?.preferredWeapons ??
      ({
        shooter: ["pistol", "uzi"] as WeaponId[],
        rusher: ["pipe", "switchblade", "shotgun"] as WeaponId[],
        coward: ["pistol"] as WeaponId[],
      });
    const armorPref = profile?.preferredArmor ?? { boss: "leather" as ArmorId, goon: "none" as ArmorId };
    const statBias = profile?.statBias ?? {};

    const armorsFor = (isBoss: boolean, t: number): ArmorId[] => {
      const base: ArmorId[] = ["none"];
      const pref = isBoss ? armorPref.boss : armorPref.goon;
      if (pref !== "none") base.push(pref);
      if (t >= 3) base.push("kevlar");
      if (t >= 4) base.push("plate");
      return [...new Set(base)];
    };

    const make = (
      uid: string,
      uname: string,
      kind: Unit["kind"],
      ox: number,
      oy: number,
      t: number,
      gender: Gender = "male",
      role: AiCombatRole = "shooter",
      isBoss = false,
    ) => {
      const weapon = pickGangWeapon(preferred[role] ?? preferred.shooter, role, t);
      const ownedWeapons = gangOwnedWeapons(weapon, preferred);
      const base = gangBaseStats(t, statBias, role);
      const stats = {
        aim: Math.min(12, base.aim + Math.floor(Math.random() * 2)),
        guts: Math.min(12, base.guts + Math.floor(Math.random() * 2)),
        muscle: Math.min(12, base.muscle + Math.floor(Math.random() * 2)),
        brains: base.brains,
        speed: Math.min(12, base.speed + Math.floor(Math.random() * 2)),
        maxHealth: base.maxHealth,
      };
      const armor = isBoss ? armorPref.boss : armorPref.goon;
      this.units.set(uid, {
        id: uid,
        name: uname,
        kind,
        ownerId: null,
        posseId: id,
        x: ox,
        y: oy,
        tx: ox,
        ty: oy,
        path: [],
        stuckTicks: 0,
        dirX: 0,
        dirY: 0,
        moveMode: "idle",
        health: stats.maxHealth ?? DEFAULT_HEALTH,
        stats: defaultStats(stats),
        weapon,
        armor,
        facing: Math.floor(Math.random() * 8),
        alive: true,
        fireCd: 0,
        isPlayerLeader: false,
        incapacitated: false,
        gender,
        ownedWeapons,
        ownedArmors: new Set(armorsFor(isBoss, t)),
        weaponAmmo: new Map(), // AI ignores ammo economy
        aiWanderT: Math.random() * 3,
        buildingId: null,
        lastHitByPosseId: null,
        aiRole: role,
      });
    };

    // Boss dead-center; goons on a protective circle with gang-themed names/roles
    const roles = profile
      ? assignGangRoles(3, profile.roleBias, { aggression: agg })
      : assignAiPosseRoles(3, { aggression: agg });
    const bossName = profile ? gangBossName(profile) : `${displayName} Boss`;
    make(leaderId, bossName, "ai_boss", x, y, threat, "male", roles[0] ?? "shooter", true);
    const g1 = `${id}_g1`;
    const g2 = `${id}_g2`;
    const s0 = this.circleSlot(x, y, 0, 2, 1.05);
    const s1 = this.circleSlot(x, y, 1, 2, 1.05);
    const r1 = randomRecruitProfile();
    const r2 = randomRecruitProfile();
    const n1 = profile ? gangGoonName(profile, r1.gender) : r1.name;
    const n2 = profile ? gangGoonName(profile, r2.gender) : r2.name;
    make(g1, n1, "ai_goon", s0.x, s0.y, Math.max(1, threat - 1), r1.gender, roles[1] ?? "rusher");
    make(g2, n2, "ai_goon", s1.x, s1.y, Math.max(1, threat - 1), r2.gender, roles[2] ?? "shooter");
    memberIds.push(g1, g2);
    this.posses.get(id)!.memberIds = memberIds;
  }

  join(
    name: string,
    conn: ClientConn,
  ):
    | { ok: true; characterId: string; posseId: string; token: string; realmId: string }
    | { ok: false; reason: string } {
    const clean = name.trim().slice(0, 20).replace(/[^\w\s\-']/g, "");
    if (clean.length < 2) return { ok: false, reason: "Name too short" };

    for (const s of this.sessions.values()) {
      if (s.name.toLowerCase() === clean.toLowerCase() && s.conn) {
        return { ok: false, reason: "Name already in use" };
      }
    }

    // Reconnect same name if session orphaned
    for (const s of this.sessions.values()) {
      if (s.name.toLowerCase() === clean.toLowerCase() && !s.conn) {
        s.conn = conn;
        conn.characterId = s.characterId;
        return {
          ok: true,
          characterId: s.characterId,
          posseId: s.posseId,
          token: s.token,
          realmId: this.realmId,
        };
      }
    }

    const characterId = this.nextId("char");
    const posseId = this.nextId("posse");
    const leaderId = this.nextId("unit");
    const goon1 = this.nextId("unit");
    const token = this.nextId("tok");
    const spawn = this.map.playerSpawn;

    const posse: Posse = {
      id: posseId,
      name: `${clean}'s Crew`,
      leaderId,
      isPlayer: true,
      hostile: false,
      cash: DEFAULT_CASH,
      rep: 0,
      heat: 0,
      color: 0xf0c040,
      aggression: 0.3,
      threat: 0,
      aggroRange: POSSE_AGGRO_RANGE,
      detectRange: POSSE_DETECT_RANGE,
      gangBlurb: null,
      lastAggroCheck: 0,
      combatUntil: 0,
      selectedUnitId: leaderId,
      insideBuildingId: null,
      dialogue: null,
      shop: null,
      jobBoard: null,
      mission: null,
      completedMissions: [],
      tutorialStep: "go_bar",
      memorials: [],
      memorialOpen: false,
      memberIds: [leaderId, goon1],
      lastKillerPosseId: null,
      fallenWeapons: new Set(),
      fallenArmors: new Set(),
      lootedThisWipe: false,
      ...emptyStashFields(),
      attackTargetId: null,
      moveLabel: null,
      dancerStages: {},
      ...emptyPartyFields(),
    };
    this.posses.set(posseId, posse);

    this.units.set(leaderId, {
      id: leaderId,
      name: clean,
      kind: "player",
      ownerId: characterId,
      posseId,
      x: spawn.x,
      y: spawn.y,
      tx: spawn.x,
      ty: spawn.y,
      path: [],
      stuckTicks: 0,
      dirX: 0,
      dirY: 0,
      moveMode: "idle",
      health: DEFAULT_HEALTH,
      stats: defaultStats({ aim: 6, guts: 6, speed: 6 }),
      weapon: "pistol",
      armor: "none",
      facing: 0,
      alive: true,
      fireCd: 0,
      isPlayerLeader: true,
      incapacitated: false,
      gender: "male",
      ownedWeapons: new Set(STARTER_WEAPONS),
      ownedArmors: new Set(["none"]),
      weaponAmmo: ammoMapForWeapons(STARTER_WEAPONS),
      aiWanderT: 0,
      buildingId: null,
      lastHitByPosseId: null,
    });

    const starterSlot = this.circleSlot(spawn.x, spawn.y, 0, 1, 1.0);
    const starter = randomRecruitProfile();
    this.units.set(goon1, {
      id: goon1,
      name: starter.name,
      kind: "goon",
      ownerId: characterId,
      posseId,
      x: starterSlot.x,
      y: starterSlot.y,
      tx: starterSlot.x,
      ty: starterSlot.y,
      path: [],
      stuckTicks: 0,
      dirX: 0,
      dirY: 0,
      moveMode: "idle",
      health: DEFAULT_HEALTH,
      stats: defaultStats({ aim: 4, guts: 5, muscle: 6 }),
      weapon: "pistol",
      armor: "none",
      facing: 0,
      alive: true,
      fireCd: 0,
      isPlayerLeader: false,
      incapacitated: false,
      gender: starter.gender,
      ownedWeapons: new Set(STARTER_WEAPONS),
      ownedArmors: new Set(["none"]),
      weaponAmmo: ammoMapForWeapons(STARTER_WEAPONS),
      aiWanderT: 0,
      buildingId: null,
      lastHitByPosseId: null,
    });

    const session: CharacterSession = {
      characterId,
      posseId,
      name: clean,
      token,
      conn,
      combatLog: [`Welcome to Skidrow, ${clean}. Don't die broke.`],
      lastMapRevision: -1,
      lastInside: undefined,
    };
    this.sessions.set(characterId, session);
    this.tokenToChar.set(token, characterId);
    conn.characterId = characterId;

    const realmNote =
      this.realmId === DEFAULT_REALM_ID
        ? `${clean} hit the streets.`
        : `${clean} hit the streets in realm ${this.realmId}.`;
    this.pushChat(null, realmNote, true);
    session.combatLog.push(
      this.realmId === DEFAULT_REALM_ID
        ? "Public streets — anyone can show up."
        : `Realm "${this.realmId}" — share the same code with friends.`,
    );
    return { ok: true, characterId, posseId, token, realmId: this.realmId };
  }

  leave(characterId: string): void {
    const s = this.sessions.get(characterId);
    if (!s) return;
    s.conn = null;
    // Keep in world for a bit? For simplicity remove player posse when disconnect
    this.removePlayer(characterId);
  }

  private removePlayer(characterId: string): void {
    const s = this.sessions.get(characterId);
    if (!s) return;
    const posse = this.posses.get(s.posseId);
    if (posse) {
      this.leavePartyInternal(posse, false);
      // Despawn private mission hostiles so they don't leak after disconnect
      // (shared party instances only despawn when no other party mate still uses them)
      this.cleanupMissionInstance(posse);
      posse.mission = null;
      for (const id of posse.memberIds) this.units.delete(id);
      this.posses.delete(s.posseId);
      this.districtWarnAt.delete(s.posseId);
      const throttlePrefix = `${s.posseId}:`;
      for (const k of this.logThrottleAt.keys()) {
        if (k.startsWith(throttlePrefix)) this.logThrottleAt.delete(k);
      }
    }
    // Drop any invites this player sent (pending on others)
    for (const p of this.posses.values()) {
      if (p.pendingInvite?.fromPosseId === s.posseId) p.pendingInvite = null;
    }
    this.tokenToChar.delete(s.token);
    this.sessions.delete(characterId);
    this.pushChat(null, `${s.name} left the neighborhood.`, true);
  }

  handle(characterId: string, msg: ClientMessage): void {
    const session = this.sessions.get(characterId);
    const posse = session ? this.posses.get(session.posseId) : null;
    if (!session || !posse) return;

    switch (msg.type) {
      case "intent.move":
        this.cmdMove(posse, msg.x, msg.y, msg.unitIds, session);
        break;
      case "intent.dir":
        this.cmdDir(posse, msg.dx, msg.dy);
        break;
      case "intent.stop":
        this.cmdStop(posse);
        break;
      case "intent.fire":
        this.cmdFire(session, posse, msg.targetId, msg.x, msg.y);
        break;
      case "intent.select":
        if (posse.memberIds.includes(msg.unitId)) posse.selectedUnitId = msg.unitId;
        break;
      case "intent.interact":
        this.cmdInteract(session, posse, msg.targetUnitId);
        break;
      case "intent.exit":
        this.cmdExitBuilding(session, posse);
        break;
      case "settings.rename":
        this.cmdRename(session, posse, msg.name);
        break;
      case "dialogue.choice":
        this.cmdDialogueChoice(session, posse, msg.choiceId);
        break;
      case "dialogue.close":
        posse.dialogue = null;
        break;
      case "shop.buyWeapon":
        this.cmdBuyWeapon(session, posse, msg.weaponId, msg.unitId);
        break;
      case "shop.buyArmor":
        this.cmdBuyArmor(session, posse, msg.armorId, msg.unitId);
        break;
      case "shop.buyUpgrade":
        this.cmdBuyUpgrade(session, posse, msg.upgradeId, msg.unitId);
        break;
      case "shop.buyAmmo":
        this.cmdBuyAmmo(session, posse, msg.weaponId, msg.unitId);
        break;
      case "shop.close":
        posse.shop = null;
        break;
      case "stash.close":
        posse.stashOpen = false;
        break;
      case "stash.depositCash":
        this.cmdStashDepositCash(session, posse, msg.amount);
        break;
      case "stash.withdrawCash":
        this.cmdStashWithdrawCash(session, posse, msg.amount);
        break;
      case "stash.depositWeapon":
        this.cmdStashDepositWeapon(session, posse, msg.weaponId, msg.unitId);
        break;
      case "stash.withdrawWeapon":
        this.cmdStashWithdrawWeapon(session, posse, msg.weaponId, msg.unitId);
        break;
      case "stash.depositArmor":
        this.cmdStashDepositArmor(session, posse, msg.armorId, msg.unitId);
        break;
      case "stash.withdrawArmor":
        this.cmdStashWithdrawArmor(session, posse, msg.armorId, msg.unitId);
        break;
      case "stash.depositAll":
        this.cmdStashDepositAll(session, posse, msg.unitId);
        break;
      case "jobBoard.accept":
        this.cmdJobBoardAccept(session, posse, msg.missionId);
        break;
      case "jobBoard.close":
        posse.jobBoard = null;
        break;
      case "mission.abandon":
        this.cmdMissionAbandon(session, posse);
        break;
      case "tutorial.skip":
        this.cmdTutorialSkip(session, posse);
        break;
      case "map.ping":
        this.cmdMapPing(session, posse, msg.x, msg.y);
        break;
      case "memorial.open":
        posse.memorialOpen = true;
        posse.dialogue = null;
        posse.shop = null;
        posse.stashOpen = false;
        posse.jobBoard = null;
        break;
      case "memorial.close":
        posse.memorialOpen = false;
        break;
      case "posse.setWeapon":
        this.cmdSetWeapon(posse, msg.unitId, msg.weaponId);
        break;
      case "posse.setArmor":
        this.cmdSetArmor(posse, msg.unitId, msg.armorId);
        break;
      case "party.invite":
        this.cmdPartyInvite(session, posse, msg.targetName);
        break;
      case "party.accept":
        this.cmdPartyAccept(session, posse);
        break;
      case "party.decline":
        this.cmdPartyDecline(session, posse);
        break;
      case "party.leave":
        this.cmdPartyLeave(session, posse);
        break;
      case "party.kick":
        this.cmdPartyKick(session, posse, msg.posseId);
        break;
      case "chat":
        this.cmdChat(session, posse, msg.text, msg.channel);
        break;
      default:
        break;
    }
  }

  private leader(posse: Posse): Unit | undefined {
    return this.units.get(posse.leaderId);
  }

  private members(posse: Posse): Unit[] {
    return posse.memberIds.map((id) => this.units.get(id)).filter((u): u is Unit => !!u && u.alive);
  }

  /** Living bodyguards (everyone except the boss/leader). */
  private goons(posse: Posse): Unit[] {
    const lid = posse.leaderId;
    return this.members(posse).filter((u) => u.id !== lid);
  }

  private formationRadius(goonCount: number): number {
    if (goonCount <= 1) return 0.95;
    if (goonCount === 2) return 1.05;
    if (goonCount === 3) return 1.15;
    return 1.28;
  }

  /** Even circle slots around the boss (index 0 starts "north"). */
  private circleSlot(
    cx: number,
    cy: number,
    index: number,
    count: number,
    radius: number,
  ): { x: number; y: number } {
    if (count <= 0) return { x: cx, y: cy };
    const ang = -Math.PI / 2 + (index / count) * Math.PI * 2;
    return { x: cx + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius };
  }

  /**
   * Front wall between boss and threat — bodyguards line up to shield the boss.
   * index 0..n-1 spread along the perpendicular axis.
   */
  private frontSlot(
    bossX: number,
    bossY: number,
    threatX: number,
    threatY: number,
    index: number,
    count: number,
    lineDist = 1.2,
    spacing = 0.78,
  ): { x: number; y: number } {
    const dx = threatX - bossX;
    const dy = threatY - bossY;
    const d = Math.hypot(dx, dy) || 1;
    const fx = dx / d;
    const fy = dy / d;
    const lx = -fy;
    const ly = fx;
    const midX = bossX + fx * lineDist;
    const midY = bossY + fy * lineDist;
    const offset = (index - (count - 1) / 2) * spacing;
    // Mild crescent: outer goons a hair farther forward
    const arc = 1 + Math.abs(offset) * 0.06;
    return {
      x: midX + lx * offset + fx * (arc - 1) * 0.35,
      y: midY + ly * offset + fy * (arc - 1) * 0.35,
    };
  }

  private clampWorld(x: number, y: number): { x: number; y: number } {
    return {
      x: clamp(x, 0.4, this.map.width - 0.4),
      y: clamp(y, 0.4, this.map.height - 0.4),
    };
  }

  /** Tile walk predicate for A* / walk-line (centers of tiles). */
  private walkTileFn(bid: string | null): (tx: number, ty: number) => boolean {
    return (tx: number, ty: number) => this.canWalk(tx + 0.5, ty + 0.5, bid);
  }

  /** Route around walls (A*); empty path = straight-line + slide. */
  private findPathPoints(
    sx: number,
    sy: number,
    gx: number,
    gy: number,
    bid: string | null,
  ): PathPoint[] {
    const path = findGridPath(sx, sy, gx, gy, this.walkTileFn(bid), {
      // Indoor / combat micro-routes are short — keep budget modest
      maxExpand: bid ? 2800 : 5500,
    });
    return path ?? [];
  }

  /** True if continuous walk from A→B does not cross a wall/void. */
  private walkLineClear(
    sx: number,
    sy: number,
    gx: number,
    gy: number,
    bid: string | null,
  ): boolean {
    return isWalkLineClear(sx, sy, gx, gy, this.walkTileFn(bid));
  }

  /**
   * Set click/formation destination.
   * Long orders and **blocked short hops** (indoor corners, façade graze,
   * combat micro-reposition) get A* waypoints; clear micro-hops stay
   * straight-line + slide for cheap formation jitter.
   */
  private setUnitNav(
    u: Unit,
    x: number,
    y: number,
    bid: string | null,
    opts?: { pathfind?: boolean },
  ): void {
    const p = this.clampWorld(x, y);
    const doPath = opts?.pathfind !== false;
    const goalShift = Math.hypot(u.tx - p.x, u.ty - p.y);
    const modeChanged = u.moveMode !== "target";
    u.moveMode = "target";
    u.dirX = 0;
    u.dirY = 0;
    u.tx = p.x;
    u.ty = p.y;

    if (!doPath) {
      if (goalShift > 0.4 || modeChanged) {
        u.path = [];
        u.stuckTicks = 0;
      }
      return;
    }

    const d = Math.hypot(p.x - u.x, p.y - u.y);
    // Clear micro: straight + slide. Blocked micro or medium+ hops: A*.
    // Indoors use a lower clear threshold so furniture/door edges route.
    const lineClear = d < 0.35 || this.walkLineClear(u.x, u.y, p.x, p.y, bid);
    const clearStraightMax = bid ? 0.75 : 1.25;
    const wantAstar = d > 0.45 && (!lineClear || d > clearStraightMax);

    if (!wantAstar) {
      if (goalShift > 0.4 || modeChanged) {
        u.path = [];
        u.stuckTicks = 0;
      }
      return;
    }

    // Reuse route when combat/formation goal only jittered
    if (u.path.length > 0 && u.stuckTicks < 6 && !modeChanged) {
      const last = u.path[u.path.length - 1]!;
      const endShift = Math.hypot(last.x - p.x, last.y - p.y);
      if (endShift < 1.25) {
        last.x = p.x;
        last.y = p.y;
        return;
      }
      if (goalShift < 0.5) {
        return;
      }
    }

    u.path = this.findPathPoints(u.x, u.y, p.x, p.y, bid);
    u.stuckTicks = 0;
  }

  private parkUnit(u: Unit): void {
    u.moveMode = "idle";
    u.dirX = 0;
    u.dirY = 0;
    u.tx = u.x;
    u.ty = u.y;
    u.path = [];
    u.stuckTicks = 0;
  }

  /** Boss at center, goons in a protective circle. */
  private assignCircleFormation(
    posse: Posse,
    centerX: number,
    centerY: number,
    opts?: { moveBoss?: boolean; radius?: number; pathfind?: boolean },
  ): void {
    const leader = this.leader(posse);
    if (!leader?.alive) return;
    const goons = this.goons(posse);
    const c = this.clampWorld(centerX, centerY);
    const rad = opts?.radius ?? this.formationRadius(goons.length);
    const moveBoss = opts?.moveBoss !== false;
    const bid = posse.insideBuildingId ?? leader.buildingId;
    const pf = opts?.pathfind;

    if (moveBoss) {
      this.setUnitNav(leader, c.x, c.y, bid, { pathfind: pf });
    }

    goons.forEach((u, i) => {
      const slot = this.circleSlot(c.x, c.y, i, goons.length, rad);
      // Escort slots: pathfind on long hops or when a wall blocks the micro-step
      const hop = Math.hypot(slot.x - u.x, slot.y - u.y);
      const autoPf =
        hop > 2.4 || (hop > 0.55 && !this.walkLineClear(u.x, u.y, slot.x, slot.y, bid));
      this.setUnitNav(u, slot.x, slot.y, bid, {
        pathfind: pf === true ? true : pf === false ? false : autoPf,
      });
    });
  }

  /**
   * Role-based combat positioning for AI hostiles.
   * Shooter holds mid-range; rusher closes; coward kites / flees when low HP.
   */
  private assignAiRoleCombat(posse: Posse, threatX: number, threatY: number): void {
    const bid = posse.insideBuildingId;
    for (const u of this.members(posse)) {
      if (!u.alive || u.incapacitated) continue;
      const role: AiCombatRole = u.aiRole ?? (u.kind === "ai_boss" ? "shooter" : "rusher");
      const w = WEAPONS[u.weapon];
      const d = dist(u.x, u.y, threatX, threatY) || 0.01;
      const fx = (threatX - u.x) / d;
      const fy = (threatY - u.y) / d;
      const prefer = preferredEngageRange(role, w.range);
      const hpFrac = u.health / Math.max(1, u.stats.maxHealth);
      const fleeing =
        role === "coward"
          ? hpFrac < AI_FLEE_HEALTH_FRAC + 0.12
          : role === "shooter" && hpFrac < AI_FLEE_HEALTH_FRAC * 0.7;

      let tx = u.x;
      let ty = u.y;
      let shouldMove = false;

      if (fleeing && d < prefer + 1.8) {
        // Back off hard — cowards and battered shooters create space
        const back = Math.max(1.4, prefer - d + 1.2);
        tx = u.x - fx * back;
        ty = u.y - fy * back;
        // Lateral juke so they don't all stack on one retreat line
        const jx = -fy * (0.4 + (u.id.charCodeAt(u.id.length - 1) % 5) * 0.15);
        const jy = fx * (0.4 + (u.id.charCodeAt(u.id.length - 2) % 5) * 0.15);
        tx += jx;
        ty += jy;
        shouldMove = true;
      } else if (role === "rusher") {
        if (d > prefer + 0.25) {
          tx = threatX - fx * prefer * 0.85;
          ty = threatY - fy * prefer * 0.85;
          shouldMove = true;
        } else if (d < 0.85) {
          // Don't stand inside the target
          tx = threatX - fx * 1.0;
          ty = threatY - fy * 1.0;
          shouldMove = true;
        }
      } else {
        // Shooter / healthy coward: band around preferred range
        if (d > prefer + 0.45) {
          tx = threatX - fx * prefer;
          ty = threatY - fy * prefer;
          shouldMove = true;
        } else if (d < prefer * 0.58) {
          tx = u.x - fx * (prefer - d + 0.35);
          ty = u.y - fy * (prefer - d + 0.35);
          shouldMove = true;
        }
      }

      if (shouldMove) {
        const p = this.clampWorld(tx, ty);
        if (this.canWalk(p.x, p.y, bid)) {
          const hop = Math.hypot(p.x - u.x, p.y - u.y);
          // Combat micro-path: A* when blocked or beyond a short clear step
          const pf =
            hop > 2.0 || (hop > 0.5 && !this.walkLineClear(u.x, u.y, p.x, p.y, bid));
          this.setUnitNav(u, p.x, p.y, bid, { pathfind: pf });
        } else {
          // Fallback: step toward/away; pathfind if the step itself is blocked mid-line
          const step = fleeing ? -0.9 : role === "rusher" ? 0.9 : d > prefer ? 0.7 : -0.7;
          const alt = this.clampWorld(u.x + fx * step, u.y + fy * step);
          if (this.canWalk(alt.x, alt.y, bid)) {
            const hop = Math.hypot(alt.x - u.x, alt.y - u.y);
            this.setUnitNav(u, alt.x, alt.y, bid, {
              pathfind: hop > 0.5 && !this.walkLineClear(u.x, u.y, alt.x, alt.y, bid),
            });
          }
        }
      } else if (dist(u.x, u.y, u.tx, u.ty) < 0.4) {
        this.parkUnit(u);
      }
      u.facing = facingFromDelta(threatX - u.x, threatY - u.y);
    }
  }

  /**
   * Combat formation: goons form a front line facing the threat;
   * boss holds behind them (middle / rear).
   */
  private assignFrontFormation(posse: Posse, threatX: number, threatY: number): void {
    const leader = this.leader(posse);
    if (!leader?.alive) return;
    const goons = this.goons(posse);
    const bid = posse.insideBuildingId ?? leader.buildingId;
    const dx = threatX - leader.x;
    const dy = threatY - leader.y;
    const d = Math.hypot(dx, dy) || 1;
    const fx = dx / d;
    const fy = dy / d;
    // Combat slots update often — A* on long approaches or blocked micro-hops
    const navPf = (fromX: number, fromY: number, toX: number, toY: number): boolean => {
      const hop = Math.hypot(toX - fromX, toY - fromY);
      return hop > 2.2 || (hop > 0.5 && !this.walkLineClear(fromX, fromY, toX, toY, bid));
    };

    if (goons.length === 0) {
      // Solo boss — engage at weapon range
      const range = Math.max(1.1, WEAPONS[leader.weapon].range * 0.78);
      if (d > range) {
        const p = this.clampWorld(threatX - fx * range * 0.92, threatY - fy * range * 0.92);
        this.setUnitNav(leader, p.x, p.y, bid, {
          pathfind: navPf(leader.x, leader.y, p.x, p.y),
        });
      } else {
        this.parkUnit(leader);
      }
      return;
    }

    // Boss stays in the middle-rear; approach but don't lead the charge
    const bossHold = Math.max(2.05, Math.min(WEAPONS[leader.weapon].range * 0.55, 3.2));
    if (d > bossHold + 0.35 || d < bossHold - 0.55) {
      const p = this.clampWorld(threatX - fx * bossHold, threatY - fy * bossHold);
      this.setUnitNav(leader, p.x, p.y, bid, {
        pathfind: navPf(leader.x, leader.y, p.x, p.y),
      });
    } else {
      this.parkUnit(leader);
    }

    // Anchor the wall on the boss's current position so the shield moves with him
    const bx = leader.x;
    const by = leader.y;
    const spacing = goons.length <= 2 ? 0.88 : goons.length === 3 ? 0.75 : 0.65;
    const lineDist = 1.25;

    goons.forEach((u, i) => {
      const w = WEAPONS[u.weapon];
      const engage = Math.max(1.05, w.range * 0.78);
      // Advance toward threat if still out of range; keep line facing threat
      let slot: { x: number; y: number };
      if (d > engage + 1.4) {
        // Closing: wall between boss path and enemy
        const midX = threatX - fx * engage;
        const midY = threatY - fy * engage;
        const lx = -fy;
        const ly = fx;
        const offset = (i - (goons.length - 1) / 2) * spacing;
        slot = { x: midX + lx * offset, y: midY + ly * offset };
      } else {
        slot = this.frontSlot(bx, by, threatX, threatY, i, goons.length, lineDist, spacing);
      }
      this.setUnitNav(u, slot.x, slot.y, bid, {
        pathfind: navPf(u.x, u.y, slot.x, slot.y),
      });
    });
  }

  private tileAt(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return "wall" as const;
    return this.map.tiles[ty]![tx]!;
  }

  private canWalk(x: number, y: number, buildingId: string | null): boolean {
    const t = this.tileAt(x, y);
    if (t === "void" || t === "wall") return false;
    const indoor =
      t === "floor" || t === "bar" || t === "shop" || t === "hospital" || t === "gym";
    if (buildingId) {
      // Must resolve mi_* private mission layers to the template warehouse (etc.).
      // Looking up mi_* in map.buildings fails and freezes movement in instances.
      const b = this.resolveBuildingDef(buildingId);
      if (!b) return false;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (tx < b.ix0 - 1 || ty < b.iy0 - 1 || tx > b.ix1 + 1 || ty > b.iy1 + 1) return false;
      return (
        t === "floor" ||
        t === "bar" ||
        t === "shop" ||
        t === "hospital" ||
        t === "gym" ||
        t === "door"
      );
    }
    if (indoor) return false;
    return t === "grass" || t === "road" || t === "sidewalk" || t === "parking" || t === "door";
  }

  private cmdMove(
    posse: Posse,
    x: number,
    y: number,
    _unitIds?: string[],
    session?: CharacterSession,
  ): void {
    if (posse.dialogue || posse.shop || posse.stashOpen || posse.jobBoard) return;
    const leader = this.leader(posse);
    if (!leader || !leader.alive) return;
    posse.attackTargetId = null;
    posse.moveLabel = "GOING";
    // Free roam: never clamp outdoor walks by district rep (that felt like a broken map).
    // Snap click to nearest walkable tile so shells / indoor walls don't cancel the order.
    let c = this.clampWorld(x, y);
    const inside = posse.insideBuildingId;
    if (!inside) {
      c = this.nearestWalkableOutdoor(c.x, c.y) ?? c;
      const dest = districtAt(c.x, c.y);
      if (session && !isDistrictUnlocked(dest, posse.rep)) {
        // Informational only — hot zones still walkable; shops/jobs may still gate gear
        const last = this.districtWarnAt.get(posse.id) ?? 0;
        if (this.tick - last > TICK_HZ * 4) {
          this.districtWarnAt.set(posse.id, this.tick);
          this.log(
            session,
            `${dest.name}: tough turf (rep ${dest.minRep}+ recommended, you have ${posse.rep}). You can still walk — watch your back.`,
          );
        }
      }
    } else {
      c = this.nearestWalkableNear(c.x, c.y, inside, 6) ?? c;
    }
    // Click orders: A* around shells / indoor walls for boss + goons
    this.assignCircleFormation(posse, c.x, c.y, { moveBoss: true, pathfind: true });
  }

  /** Spiral search for a walkable tile near (x,y) — outdoor or indoor by bid. */
  private nearestWalkableNear(
    x: number,
    y: number,
    bid: string | null,
    maxR = 6,
  ): { x: number; y: number } | null {
    const c0 = this.clampWorld(x, y);
    if (this.canWalk(c0.x, c0.y, bid)) return c0;
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const p = this.clampWorld(c0.x + dx, c0.y + dy);
          if (this.canWalk(p.x, p.y, bid)) return p;
        }
      }
    }
    return null;
  }

  /** Spiral search for a walkable outdoor tile near (x,y). */
  private nearestWalkableOutdoor(x: number, y: number, maxR = 6): { x: number; y: number } | null {
    return this.nearestWalkableNear(x, y, null, maxR);
  }

  private cmdMapPing(session: CharacterSession, posse: Posse, x: number, y: number): void {
    const c = this.clampWorld(x, y);
    if (posse.insideBuildingId) {
      this.log(session, "Exit the building before using the city map.");
      return;
    }
    const dest = districtAt(c.x, c.y);
    const note =
      !isDistrictUnlocked(dest, posse.rep)
        ? ` (hot — rep ${dest.minRep}+ recommended)`
        : "";
    this.log(
      session,
      `Map ping: ${dest.short} (${Math.round(c.x)}, ${Math.round(c.y)})${note} — on your way.`,
    );
    this.cmdMove(posse, c.x, c.y, undefined, session);
  }

  /** Nudge a point into any unlocked district (prefer downtown hub). */
  private clampToUnlockedDistrict(x: number, y: number, rep: number): { x: number; y: number } {
    const here = districtAt(x, y);
    if (isDistrictUnlocked(here, rep)) return { x, y };
    // Pull toward downtown landmark
    const hub = { x: 40, y: 28 };
    let best = hub;
    let bestD = Infinity;
    for (const d of DISTRICTS) {
      if (!isDistrictUnlocked(d, rep)) continue;
      const cx = (d.x0 + d.x1) / 2;
      const cy = (d.y0 + d.y1) / 2;
      // Point on boundary toward destination
      const px = clamp(x, d.x0 + 0.5, d.x1 - 0.5);
      const py = clamp(y, d.y0 + 0.5, d.y1 - 0.5);
      const distHere = Math.hypot(px - x, py - y);
      if (distHere < bestD) {
        bestD = distHere;
        best = { x: px, y: py };
      }
      // Also consider center as fallback
      void cx;
      void cy;
    }
    return this.clampWorld(best.x, best.y);
  }

  private districtsPublic(rep: number): DistrictPublic[] {
    return DISTRICTS.map((d) => ({
      id: d.id,
      name: d.name,
      short: d.short,
      blurb: d.blurb,
      minRep: d.minRep,
      unlocked: isDistrictUnlocked(d, rep),
      danger: d.danger,
      landmark: d.landmark,
      x0: d.x0,
      y0: d.y0,
      x1: d.x1,
      y1: d.y1,
    }));
  }

  /**
   * District access is advisory only for free roam (no teleport soft-kicks).
   * Soft-kicks made south/east travel feel like the world was broken.
   * Rep still gates shop stock / mission unlocks; map UI shows recommended rep.
   */
  private enforceDistrictAccess(): void {
    for (const posse of this.posses.values()) {
      if (!posse.isPlayer) continue;
      if (posse.insideBuildingId) continue;
      const leader = this.leader(posse);
      if (!leader?.alive) continue;
      const def = districtAt(leader.x, leader.y);
      if (isDistrictUnlocked(def, posse.rep)) continue;
      const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
      const last = this.districtWarnAt.get(posse.id) ?? 0;
      if (session && this.tick - last > TICK_HZ * 8) {
        this.districtWarnAt.set(posse.id, this.tick);
        this.log(
          session,
          `${def.name} — hot zone (rep ${def.minRep}+ recommended). You can walk freely; jobs & gear still gate on rep.`,
        );
      }
    }
  }

  /** Continuous free movement in world axes (client sends screen-aligned vectors). */
  private cmdDir(posse: Posse, dx: number, dy: number): void {
    if (posse.dialogue || posse.shop || posse.stashOpen) return;
    const leader = this.leader(posse);
    if (!leader || !leader.alive) return;

    const len = Math.hypot(dx, dy);
    const ndx = len > 0.001 ? dx / len : 0;
    const ndy = len > 0.001 ? dy / len : 0;

    if (len >= 0.001) {
      posse.attackTargetId = null;
      posse.moveLabel = "MOVING";
      // Downed boss can't free-run — bodyguards still form up and can retreat with him via click-move
      if (leader.incapacitated) {
        leader.moveMode = "idle";
        leader.dirX = 0;
        leader.dirY = 0;
        this.assignCircleFormation(posse, leader.x, leader.y, { moveBoss: false });
        return;
      }
      // Only the boss steers free; goons escort in a circle (updated each tick)
      leader.moveMode = "dir";
      leader.dirX = ndx;
      leader.dirY = ndy;
      leader.tx = leader.x;
      leader.ty = leader.y;
      leader.path = [];
      leader.stuckTicks = 0;
      this.assignCircleFormation(posse, leader.x, leader.y, { moveBoss: false, pathfind: false });
    } else {
      // Stop → settle into protective circle around boss
      if (!posse.attackTargetId) posse.moveLabel = null;
      leader.dirX = 0;
      leader.dirY = 0;
      this.assignCircleFormation(posse, leader.x, leader.y, { moveBoss: true, pathfind: false });
      this.parkUnit(leader);
    }
  }

  private cmdStop(posse: Posse): void {
    posse.attackTargetId = null;
    posse.moveLabel = null;
    const leader = this.leader(posse);
    if (leader?.alive) {
      this.assignCircleFormation(posse, leader.x, leader.y, { moveBoss: true, pathfind: false });
      this.parkUnit(leader);
    } else {
      for (const u of this.members(posse)) {
        this.parkUnit(u);
      }
    }
  }

  private unitInSafeZone(u: Unit): boolean {
    const p = this.posses.get(u.posseId);
    const inside = p?.insideBuildingId ?? u.buildingId;
    // Mission instance layers are combat zones (warehouse wipe, etc.)
    if (inside && inside.startsWith("mi_")) return false;
    return isSafeWorldPos(u.x, u.y, inside);
  }

  /** Real map building, or template for a private mission layer (`mi_*`). */
  private resolveBuildingDef(id: string | null | undefined): (typeof this.map.buildings)[number] | null {
    if (!id) return null;
    const real = this.map.buildings.find((b) => b.id === id);
    if (real) return real;
    if (id.startsWith("mi_")) {
      for (const p of this.posses.values()) {
        if (p.mission?.instanceLayerId === id && p.mission.templateBuildingId) {
          return this.map.buildings.find((b) => b.id === p.mission!.templateBuildingId) ?? null;
        }
      }
    }
    return null;
  }

  private buildingPublicFromDef(
    b: (typeof this.map.buildings)[number],
    overrideId?: string,
  ) {
    return {
      id: overrideId ?? b.id,
      name: overrideId ? `${b.name} (Private Job)` : b.name,
      kind: b.kind,
      doorX: b.doorX,
      doorY: b.doorY,
      interiorId: overrideId ?? b.id,
      blurb: overrideId ? "Sealed bay — clear hostiles, then extract." : b.blurb,
      ex0: b.ex0,
      ey0: b.ey0,
      ex1: b.ex1,
      ey1: b.ey1,
      ix0: b.ix0,
      iy0: b.iy0,
      ix1: b.ix1,
      iy1: b.iy1,
      exitX: b.exitX,
      exitY: b.exitY,
      stories: b.stories,
      wallColor: b.wallColor,
      roofColor: b.roofColor,
      accentColor: b.accentColor,
    };
  }

  /** Issue attack-move on a hostile (or any non-ally) unit — chase until in range then fire. */
  private cmdAttackMove(posse: Posse, target: Unit): boolean {
    const leader = this.leader(posse);
    if (!leader) return false;
    // Safe downtown: no murders
    if (this.unitInSafeZone(leader) || this.unitInSafeZone(target)) {
      return false;
    }
    posse.attackTargetId = target.id;
    posse.moveLabel = null;
    posse.hostile = true;
    posse.combatUntil = this.tick + TICK_HZ * 20;
    const tp = this.posses.get(target.posseId);
    if (tp) {
      tp.hostile = true;
      tp.combatUntil = this.tick + TICK_HZ * 20;
    }
    // Bodyguards line up in front; boss stays in the middle/rear
    this.assignFrontFormation(posse, target.x, target.y);
    return true;
  }

  private tryMoveUnit(u: Unit, nx: number, ny: number, bid: string | null): boolean {
    let moved = false;
    const dx = nx - u.x;
    const dy = ny - u.y;
    // Axis-separated slide so long click-paths graze building shells instead of dying on contact
    if (this.canWalk(nx, u.y, bid)) {
      u.x = nx;
      moved = true;
    } else if (Math.abs(dx) > 0.001) {
      // Micro-slide along wall in Y to keep X progress when possible
      for (const sy of [0.35, -0.35, 0.55, -0.55]) {
        if (this.canWalk(nx, u.y + sy, bid)) {
          u.x = nx;
          u.y += sy * 0.45;
          moved = true;
          break;
        }
      }
    }
    if (this.canWalk(u.x, ny, bid)) {
      u.y = ny;
      moved = true;
    } else if (Math.abs(dy) > 0.001) {
      for (const sx of [0.35, -0.35, 0.55, -0.55]) {
        if (this.canWalk(u.x + sx, ny, bid)) {
          u.y = ny;
          u.x += sx * 0.45;
          moved = true;
          break;
        }
      }
    }
    return moved;
  }

  private cmdFire(
    session: CharacterSession,
    posse: Posse,
    targetId?: string,
    x?: number,
    y?: number,
  ): void {
    if (posse.dialogue || posse.shop || posse.stashOpen) return;
    const shooter =
      this.units.get(posse.selectedUnitId) ??
      this.leader(posse);
    if (!shooter || !shooter.alive) return;

    let target: Unit | undefined;
    if (targetId) target = this.units.get(targetId);
    if (!target && x !== undefined && y !== undefined) {
      // nearest living enemy near point (generous pick radius for RMB)
      let best: Unit | undefined;
      let bestD = 2.2;
      for (const u of this.units.values()) {
        if (!u.alive || u.posseId === posse.id) continue;
        // same layer only
        const up = this.posses.get(u.posseId);
        const ub = up?.insideBuildingId ?? u.buildingId;
        if (ub !== posse.insideBuildingId) continue;
        const d = dist(u.x, u.y, x, y);
        if (d < bestD) {
          bestD = d;
          best = u;
        }
      }
      target = best;
    }
    if (!target || !target.alive) return;
    if (target.posseId === posse.id) return;

    if (this.unitInSafeZone(shooter) || this.unitInSafeZone(target)) {
      this.logThrottled(
        session,
        "safe_zone_fire",
        "SAFE ZONE — holster it. Take the fight south of the tracks.",
        5,
      );
      return;
    }

    // Always commit attack-move: chase if needed, fire when in range
    if (!this.cmdAttackMove(posse, target)) return;
    const w = WEAPONS[shooter.weapon];
    const d = dist(shooter.x, shooter.y, target.x, target.y);
    if (d <= w.range + 0.35) {
      this.resolveShot(shooter, target, session);
    } else {
      this.logThrottled(
        session,
        `assassinate:${target.id}`,
        `ASSASSINATE ${target.name} — closing in…`,
        3,
      );
    }
  }

  /** True if tile blocks bullets (wall/void). Doors stay open for LoS. */
  private isLosBlockingTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return true;
    return isBlockedTile(this.map.tiles[ty]![tx]!);
  }

  /**
   * Prefer living targets with clear LoS; among those, closest wins.
   * If nobody has LoS, still return closest so units close the gap.
   */
  private pickBestFireTarget(shooter: Unit, candidateIds: string[]): Unit | null {
    let bestLos: Unit | null = null;
    let bestLosD = Infinity;
    let bestAny: Unit | null = null;
    let bestAnyD = Infinity;
    for (const id of candidateIds) {
      const m = this.units.get(id);
      if (!m || !m.alive) continue;
      const dd = dist(shooter.x, shooter.y, m.x, m.y);
      if (dd < bestAnyD) {
        bestAnyD = dd;
        bestAny = m;
      }
      const clear = castLineOfSight(
        shooter.x,
        shooter.y,
        m.x,
        m.y,
        (tx, ty) => this.isLosBlockingTile(tx, ty),
      ).clear;
      if (clear && dd < bestLosD) {
        bestLosD = dd;
        bestLos = m;
      }
    }
    return bestLos ?? bestAny;
  }

  private resolveShot(shooter: Unit, target: Unit, session?: CharacterSession): void {
    if (shooter.fireCd > 0 || !shooter.alive || !target.alive) return;
    // Downed boss cannot fight
    if (shooter.incapacitated) return;
    // No lethal combat in safe downtown
    if (this.unitInSafeZone(shooter) || this.unitInSafeZone(target)) return;

    const isAi =
      shooter.kind === "ai_boss" || shooter.kind === "ai_goon" || shooter.kind === "npc";

    // Player ammo: specials dry; auto-fall back to pistol/melee so auto-fire never stalls
    if (!isAi) {
      const was = shooter.weapon;
      if (!ensureFireableWeapon(shooter)) {
        shooter.fireCd = 0.28;
        if (session) {
          this.logThrottled(
            session,
            `dry:${shooter.id}`,
            `${shooter.name}: OUT OF AMMO — all limited guns dry. Refill at Pawn-O-Matic.`,
            6,
          );
        }
        return;
      }
      if (session && shooter.weapon !== was) {
        this.log(
          session,
          `${shooter.name} swaps to ${WEAPONS[shooter.weapon].name} (dry ${WEAPONS[was].name}).`,
        );
      }
    }

    const w = WEAPONS[shooter.weapon];
    const d = dist(shooter.x, shooter.y, target.x, target.y);
    if (d > w.range + 0.55) return;

    const weapon = shooter.weapon;
    const isMelee = weapon === "pipe" || weapon === "switchblade";
    const isFlame = weapon === "flamethrower";

    // Consume a round on every fire attempt (hit, miss, or brick)
    if (!isAi && !isUnlimitedAmmo(w)) {
      const have = shooter.weaponAmmo.get(weapon) ?? 0;
      shooter.weaponAmmo.set(weapon, Math.max(0, have - w.ammoPerShot));
    }

    // Speed shortens fire cooldown (runners re-engage faster)
    shooter.fireCd = w.fireCooldown * fireCooldownFactor(shooter.stats.speed);
    shooter.facing = facingFromDelta(target.x - shooter.x, target.y - shooter.y);

    // True LoS: walls/void eat the round (melee only needs clear path when not adjacent)
    const needLos = !isMelee || d > 1.15;
    if (needLos) {
      const los = castLineOfSight(
        shooter.x,
        shooter.y,
        target.x,
        target.y,
        (tx, ty) => this.isLosBlockingTile(tx, ty),
      );
      if (!los.clear) {
        // Muzzle + tracer die on the façade
        if (!isMelee) {
          this.pushCombatFx({
            kind: isFlame ? "flame" : "shot",
            x0: shooter.x,
            y0: shooter.y,
            x1: los.hitX,
            y1: los.hitY,
            weapon,
          });
        } else {
          this.pushCombatFx({
            kind: "melee",
            x0: shooter.x,
            y0: shooter.y,
            x1: los.hitX,
            y1: los.hitY,
            weapon,
          });
        }
        this.pushCombatFx({
          kind: "blocked",
          x0: shooter.x,
          y0: shooter.y,
          x1: los.hitX,
          y1: los.hitY,
          weapon,
        });
        if (session && !isAi) {
          this.log(session, `${shooter.name}'s shot eats brick — no line of sight.`);
        }
        return;
      }
    }

    // Always emit attack VFX so shots/swings are visible even on miss
    this.pushCombatFx({
      kind: isMelee ? "melee" : isFlame ? "flame" : "shot",
      x0: shooter.x,
      y0: shooter.y,
      x1: target.x,
      y1: target.y,
      weapon,
    });

    const aim = shooter.stats.aim;
    const muscle = shooter.stats.muscle;

    // Hit chance: Aim hits, target Guts dodges, range hurts (shared formula)
    let hitChance = hitChanceClamped(aim, target.stats.guts, d, { isAi });
    // Soft cover: hug a wall → harder to tag
    if (
      hasAdjacentCover(target.x, target.y, (tx, ty) => this.isLosBlockingTile(tx, ty))
    ) {
      hitChance = Math.max(0.08, hitChance - COMBAT.coverHitPenalty);
    }

    if (Math.random() > hitChance) {
      this.pushCombatFx({
        kind: "miss",
        x0: shooter.x,
        y0: shooter.y,
        x1: target.x + (Math.random() - 0.5) * 0.6,
        y1: target.y + (Math.random() - 0.5) * 0.6,
        weapon,
      });
      if (session && !isAi) {
        const notes: string[] = [];
        if (target.stats.guts >= 7) notes.push(`${target.name}'s guts`);
        if (
          hasAdjacentCover(target.x, target.y, (tx, ty) => this.isLosBlockingTile(tx, ty))
        ) {
          notes.push("cover");
        }
        const dodgeNote = notes.length ? ` (${notes.join(" + ")})` : "";
        this.log(session, `${shooter.name} missed ${target.name}.${dodgeNote}`);
      }
      return;
    }

    // Damage: weapon × (aim + muscle; melee loves muscle) × variance × crit − armor − guts toughness
    const power = damagePower(aim, muscle, isMelee);
    const variance =
      COMBAT.damageVarianceMin +
      Math.random() * (COMBAT.damageVarianceMax - COMBAT.damageVarianceMin);
    const crit = Math.random() < critChance(aim);
    const armor = ARMORS[target.armor];
    const pierce = armorPierce(muscle);
    const armorFactor = 1 - armor.damageReduce * (1 - pierce);
    const tough = gutsDamageTakenFactor(target.stats.guts);

    let dmg = w.damage * power * variance * armorFactor * tough;
    if (crit) dmg *= COMBAT.critMultiplier;
    if (isAi) dmg *= COMBAT.aiDamageFactor;
    dmg = Math.max(1, Math.round(dmg));

    target.health -= dmg;
    target.lastHitByPosseId = shooter.posseId;
    this.pushCombatFx({
      kind: "hit",
      x0: shooter.x,
      y0: shooter.y,
      x1: target.x,
      y1: target.y,
      weapon,
      crit,
      dmg,
    });
    if (session && !isAi) {
      const tag = crit
        ? aim >= 7
          ? "CRIT (aim) "
          : "CRIT "
        : muscle >= 8 && isMelee
          ? "SMASH "
          : "";
      this.log(session, `${shooter.name} ${tag}hit ${target.name} for ${dmg}${crit ? "!" : "."}`);
    }

    if (target.health <= 0) {
      // Boss is kept alive (incapacitated) while bodyguards still stand
      if (this.tryIncapacitateBoss(target, shooter.posseId, session)) {
        return;
      }
      this.killUnit(target, shooter.posseId, session);
    }
  }

  /**
   * If this is a posse boss and goons remain, put the boss in a downed state
   * instead of killing them — they can't fight until healed (or until wipe).
   */
  private tryIncapacitateBoss(
    target: Unit,
    killerPosseId: string | null,
    session?: CharacterSession,
  ): boolean {
    const posse = this.posses.get(target.posseId);
    if (!posse) return false;
    const isBoss = target.id === posse.leaderId || target.isPlayerLeader || target.kind === "ai_boss";
    if (!isBoss) return false;
    if (target.incapacitated) return false; // already downed — allow true death path if forced

    const goonsLeft = this.goons(posse).filter((g) => g.alive && g.id !== target.id).length;
    if (goonsLeft <= 0) return false;

    target.health = Math.max(1, Math.round(target.stats.maxHealth * 0.08));
    target.alive = true;
    target.incapacitated = true;
    target.moveMode = "idle";
    target.dirX = 0;
    target.dirY = 0;
    target.tx = target.x;
    target.ty = target.y;
    if (killerPosseId && killerPosseId !== posse.id) {
      posse.lastKillerPosseId = killerPosseId;
    }
    posse.hostile = true;
    posse.combatUntil = this.tick + TICK_HZ * 20;

    this.pushCombatFx({
      kind: "hit",
      x0: target.x,
      y0: target.y,
      x1: target.x,
      y1: target.y,
      weapon: target.weapon,
      crit: true,
      dmg: 0,
    });

    const victimSession = [...this.sessions.values()].find((s) => s.posseId === posse.id);
    if (victimSession) {
      this.log(
        victimSession,
        `${target.name} is DOWNED — bodyguards cover the boss! Can't fight until the crew falls or you recover.`,
      );
      victimSession.conn?.send({
        type: "notify",
        kind: "downed",
        title: "BOSS DOWNED",
        body: "You're too hurt to fight. Your posse is covering you — stay alive!",
      });
    }
    if (session && session.posseId !== posse.id) {
      this.log(session, `${target.name} is downed — their crew still stands!`);
    }
    return true;
  }

  private killUnit(target: Unit, killerPosseId: string | null, session?: CharacterSession): void {
    target.health = 0;
    target.alive = false;
    target.incapacitated = false;
    target.tx = target.x;
    target.ty = target.y;
    target.moveMode = "idle";
    target.dirX = 0;
    target.dirY = 0;
    this.pushCombatFx({
      kind: "death",
      x0: target.x,
      y0: target.y,
      x1: target.x,
      y1: target.y,
      weapon: target.weapon,
    });
    if (session) this.log(session, `${target.name} is down!`);
    for (const p of this.posses.values()) {
      if (p.attackTargetId === target.id) {
        p.attackTargetId = null;
        p.moveLabel = null;
      }
    }
    this.onUnitDown(target, killerPosseId);
  }

  /** Per-tick: chase attack targets in front-line formation and auto-fire when in range */
  private updateAttackOrders(): void {
    for (const posse of this.posses.values()) {
      if (!posse.attackTargetId) continue;
      const target = this.units.get(posse.attackTargetId);
      if (!target || !target.alive) {
        posse.attackTargetId = null;
        // Reform protective circle on boss
        const leader = this.leader(posse);
        if (leader?.alive) this.assignCircleFormation(posse, leader.x, leader.y, { moveBoss: false });
        continue;
      }
      // Wrong layer (entered building) — cancel
      if ((target.buildingId ?? null) !== (posse.insideBuildingId ?? null)) {
        const tp = this.posses.get(target.posseId);
        if ((tp?.insideBuildingId ?? null) !== posse.insideBuildingId) {
          posse.attackTargetId = null;
          continue;
        }
      }

      // Keep re-issuing front wall so goons stay between boss and threat
      this.assignFrontFormation(posse, target.x, target.y);

      const session = posse.isPlayer
        ? [...this.sessions.values()].find((s) => s.posseId === posse.id)
        : undefined;

      for (const u of this.members(posse)) {
        if (u.incapacitated) continue;
        const w = WEAPONS[u.weapon];
        const d = dist(u.x, u.y, target.x, target.y);
        const engageRange = Math.max(1.1, w.range * 0.88);
        if (d <= engageRange) {
          // Hold fire position (don't idle-clear formation every shot)
          if (dist(u.x, u.y, u.tx, u.ty) < 0.35) {
            u.moveMode = "idle";
          }
          this.resolveShot(u, target, session);
        }
      }
    }
  }

  /**
   * While the boss is on the move (WASD or walking to a click), bodyguards
   * keep a live circle around him so he stays in the middle.
   */
  private updateEscortFormations(): void {
    for (const posse of this.posses.values()) {
      if (posse.attackTargetId) continue;
      if (posse.dialogue || posse.shop || posse.stashOpen) continue;
      const leader = this.leader(posse);
      if (!leader?.alive) continue;
      const goons = this.goons(posse);
      if (goons.length === 0) continue;

      const movingDir =
        leader.moveMode === "dir" && (leader.dirX !== 0 || leader.dirY !== 0);
      const leaderChase =
        leader.path.length > 0 ? leader.path[0]! : { x: leader.tx, y: leader.ty };
      const movingTarget =
        leader.moveMode === "target" && dist(leader.x, leader.y, leaderChase.x, leaderChase.y) > 0.12;
      if (!movingDir && !movingTarget) continue;

      const fx = movingDir
        ? leader.dirX
        : (leaderChase.x - leader.x) /
          Math.max(0.001, dist(leader.x, leader.y, leaderChase.x, leaderChase.y));
      const fy = movingDir
        ? leader.dirY
        : (leaderChase.y - leader.y) /
          Math.max(0.001, dist(leader.x, leader.y, leaderChase.x, leaderChase.y));

      // Circle center tracks the boss (slightly ahead so escorts don't lag into him)
      const cx = leader.x + fx * 0.12;
      const cy = leader.y + fy * 0.12;
      const rad = this.formationRadius(goons.length);
      const bid = posse.insideBuildingId ?? leader.buildingId;
      goons.forEach((u, i) => {
        const slot = this.circleSlot(cx, cy, i, goons.length, rad);
        const p = this.clampWorld(slot.x - fx * 0.1, slot.y - fy * 0.1);
        // Soft escort: no A* thrash every tick
        this.setUnitNav(u, p.x, p.y, bid, { pathfind: false });
      });
    }
  }

  private computeAction(posse: Posse): { action: string; actionDetail: string | null } {
    const leader = this.leader(posse);
    if (!leader) return { action: "IDLE", actionDetail: null };
    if (!leader.alive) return { action: "DOWN", actionDetail: "Awaiting respawn" };
    if (leader.incapacitated) return { action: "DOWNED", actionDetail: "Bodyguards covering boss" };
    if (posse.shop) return { action: "SHOPPING", actionDetail: posse.shop.shopName };
    if (posse.stashOpen) return { action: "STASH", actionDetail: "Crash Pad" };
    if (posse.jobBoard) return { action: "CONTRACTS", actionDetail: posse.jobBoard.npcName };
    if (posse.dialogue) return { action: "PERSUADE", actionDetail: posse.dialogue.npcName };
    if (posse.mission) {
      const def = MISSIONS[posse.mission.defId];
      if (posse.mission.phase === "extract") {
        return { action: "EXTRACT", actionDetail: def?.title ?? "Get to the exit" };
      }
      return { action: "JOB", actionDetail: def?.title ?? "On the job" };
    }

    if (posse.attackTargetId) {
      const t = this.units.get(posse.attackTargetId);
      if (t?.alive) {
        const d = dist(leader.x, leader.y, t.x, t.y);
        const range = WEAPONS[leader.weapon].range;
        if (d > range * 0.85) {
          return { action: "ASSASSINATE", actionDetail: `Closing on ${t.name}` };
        }
        return { action: "ENGAGING", actionDetail: t.name };
      }
    }

    if (leader.moveMode === "dir") return { action: "MOVING", actionDetail: null };
    if (leader.moveMode === "target") {
      const d = dist(leader.x, leader.y, leader.tx, leader.ty);
      if (d > 0.15) return { action: "GOING", actionDetail: null };
    }
    if (posse.hostile && posse.combatUntil > this.tick) {
      return { action: "ALERT", actionDetail: "Weapons free" };
    }
    if (posse.insideBuildingId) {
      const b = this.map.buildings.find((bb) => bb.id === posse.insideBuildingId);
      return { action: "SCANNING", actionDetail: b?.name ?? "Interior" };
    }
    return { action: "IDLE", actionDetail: null };
  }

  private onUnitDown(unit: Unit, killerPosseId: string | null): void {
    const posse = this.posses.get(unit.posseId);
    if (!posse) return;

    // Street heat: player kills raise the thermometer
    const killerId = killerPosseId ?? unit.lastHitByPosseId;
    if (killerId && killerId !== unit.posseId) {
      const killer = this.posses.get(killerId);
      if (killer?.isPlayer) {
        const sess = [...this.sessions.values()].find((s) => s.posseId === killer.id);
        let amt = HEAT.kill;
        if (unit.kind === "ai_boss") amt += HEAT.killBossBonus;
        this.addHeat(killer, amt, sess, unit.kind === "ai_boss" ? "boss drop" : "body");
      }
    }

    // Mission kill objectives (debt collection, etc.)
    this.onMissionUnitKilled(unit, killerPosseId ?? unit.lastHitByPosseId);

    if (killerPosseId && killerPosseId !== posse.id) {
      posse.lastKillerPosseId = killerPosseId;
    } else if (unit.lastHitByPosseId && unit.lastHitByPosseId !== posse.id) {
      posse.lastKillerPosseId = unit.lastHitByPosseId;
    }

    // Player goons: bank gear, remove permanently (no DOWN ghosts)
    if (posse.isPlayer && !unit.isPlayerLeader && unit.id !== posse.leaderId) {
      this.bankUnitGear(posse, unit);
      const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
      this.recordMemorial(posse, unit, session);
      if (session) this.log(session, `${unit.name} is gone. Permanent. (Memorial updated.)`);
      this.removeMember(posse, unit.id, true);
      // If only a downed boss remains, the whole crew falls
      this.finishIncapacitatedBossIfAlone(posse);
      this.tryWipeLoot(posse);
      return;
    }

    if (posse.isPlayer && (unit.isPlayerLeader || unit.id === posse.leaderId)) {
      unit.respawnT = RESPAWN_DELAY_SEC;
      unit.moveMode = "idle";
      unit.dirX = 0;
      unit.dirY = 0;
      unit.tx = unit.x;
      unit.ty = unit.y;
      unit.incapacitated = false;
      posse.stashOpen = false;
      posse.dialogue = null;
      posse.shop = null;
      posse.jobBoard = null;
      const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
      if (session) {
        this.log(session, `You're dead. Waking up at the Crash Pad in ${RESPAWN_DELAY_SEC}s…`);
        session.conn?.send({
          type: "notify",
          kind: "killed",
          title: "YOU'RE DEAD",
          body: `Crew wiped. Street gear & pocket cash go to the killers. Crash Pad stash is safe. Respawn ${RESPAWN_DELAY_SEC}s…`,
        });
      }
      this.purgeDeadGoons(posse);
      this.tryWipeLoot(posse);
      return;
    }

    // AI goon died — maybe finish incapacitated boss
    if (!posse.isPlayer && unit.id !== posse.leaderId) {
      this.finishIncapacitatedBossIfAlone(posse);
    }

    // AI / NPC posses — wipe when nobody left standing
    if (!this.hasLivingMembers(posse) && !posse.isPlayer) {
      this.pushChat(null, `${posse.name} got wiped off the map.`, true);
      this.tryWipeLoot(posse);
      // Mission instance hostiles do not respawn
      if (!posse.id.startsWith("mi_enemy_")) {
        posse.respawnT = TICK_HZ * 20;
      }
    }
  }

  /** When the last bodyguard falls, a downed boss dies for real. */
  private finishIncapacitatedBossIfAlone(posse: Posse): void {
    const leader = this.leader(posse);
    if (!leader || !leader.alive || !leader.incapacitated) return;
    if (this.goons(posse).some((g) => g.alive)) return;
    this.killUnit(leader, posse.lastKillerPosseId);
  }

  private hasLivingMembers(posse: Posse): boolean {
    return posse.memberIds.some((id) => {
      const u = this.units.get(id);
      return !!u && u.alive;
    });
  }

  private bankUnitGear(posse: Posse, unit: Unit): void {
    for (const w of unit.ownedWeapons) {
      if (w !== "pipe") posse.fallenWeapons.add(w);
    }
    for (const a of unit.ownedArmors) {
      if (a !== "none") posse.fallenArmors.add(a);
    }
  }

  /**
   * Full crew wipe: killers take pocket cash + gear currently on units (and banked fallen gear).
   * Crash Pad stash (stashCash / stashWeapons / stashArmors) is never touched.
   * Always strips carried gear even if no killer is attributed.
   */
  private tryWipeLoot(victim: Posse): void {
    if (victim.lootedThisWipe) return;
    if (this.hasLivingMembers(victim)) return;

    victim.lootedThisWipe = true;

    // Carried gear only — not house stash
    const weapons = new Set<WeaponId>(victim.fallenWeapons);
    const armors = new Set<ArmorId>(victim.fallenArmors);
    for (const id of victim.memberIds) {
      const u = this.units.get(id);
      if (!u) continue;
      for (const w of u.ownedWeapons) weapons.add(w);
      for (const a of u.ownedArmors) armors.add(a);
    }
    weapons.delete("pipe");
    armors.delete("none");

    const cashTaken = victim.cash;
    victim.cash = 0;

    // Strip street loadout to pipe / none (stash stays)
    for (const id of victim.memberIds) {
      const u = this.units.get(id);
      if (!u) continue;
      u.ownedWeapons = new Set(["pipe"]);
      u.ownedArmors = new Set(["none"]);
      u.weapon = "pipe";
      u.armor = "none";
      stripLimitedAmmo(u);
    }
    victim.fallenWeapons.clear();
    victim.fallenArmors.clear();

    const killerId = victim.lastKillerPosseId;
    const killer =
      killerId && killerId !== victim.id ? this.posses.get(killerId) : undefined;

    const victimSession = [...this.sessions.values()].find((s) => s.posseId === victim.id);
    const stashNote =
      victim.stashCash > 0 || victim.stashWeapons.size > 0 || victim.stashArmors.size > 0
        ? ` Crash Pad stash intact ($${victim.stashCash} + gear in the house).`
        : "";

    if (!killer) {
      if (victimSession) {
        this.log(
          victimSession,
          `Wiped. Lost pocket cash $${cashTaken} and street gear.${stashNote}`,
        );
      }
      return;
    }

    // Party loot split: cash even among party posses; gear to each party crew (shared copies)
    const lootRecipients = this.partyLootRecipients(killer);
    const shareCount = lootRecipients.length;
    const baseShare = shareCount > 0 ? Math.floor(cashTaken / shareCount) : cashTaken;
    let remainder = shareCount > 0 ? cashTaken - baseShare * shareCount : 0;

    const weaponList = [...weapons];
    const armorList = [...armors];
    const gearTxt =
      [...weaponList.map((w) => WEAPONS[w].name), ...armorList.map((a) => ARMORS[a].name)].join(
        ", ",
      ) || "nothing special";

    for (const recipient of lootRecipients) {
      let cashShare = baseShare;
      // Attributed killer gets leftover pennies so total cash is conserved
      if (remainder > 0 && recipient.id === killer.id) {
        cashShare += remainder;
        remainder = 0;
      } else if (remainder > 0 && recipient === lootRecipients[lootRecipients.length - 1]) {
        cashShare += remainder;
        remainder = 0;
      }
      recipient.cash += cashShare;

      // Snapshot best gear before grant (upgrade toast per recipient)
      let prevBestWeaponScore = 0;
      let prevBestArmorScore = 0;
      for (const m of this.members(recipient)) {
        for (const w of m.ownedWeapons) prevBestWeaponScore = Math.max(prevBestWeaponScore, weaponScore(w));
        for (const a of m.ownedArmors) prevBestArmorScore = Math.max(prevBestArmorScore, armorScore(a));
        prevBestWeaponScore = Math.max(prevBestWeaponScore, weaponScore(m.weapon));
        prevBestArmorScore = Math.max(prevBestArmorScore, armorScore(m.armor));
      }

      const living = this.members(recipient);
      for (const m of living) {
        for (const w of weapons) {
          const had = m.ownedWeapons.has(w);
          m.ownedWeapons.add(w);
          if (!had) grantWeaponAmmo(m, w);
        }
        for (const a of armors) m.ownedArmors.add(a);
      }
      this.equipBestOnLeader(recipient);

      const upgrades: Array<{
        kind: "weapon" | "armor";
        id: string;
        name: string;
        upgrade: boolean;
      }> = [];
      const otherItems: string[] = [];
      for (const w of weapons) {
        const better = weaponScore(w) > prevBestWeaponScore + 0.01;
        const entry = {
          kind: "weapon" as const,
          id: w,
          name: WEAPONS[w].name,
          upgrade: better,
        };
        if (better) upgrades.push(entry);
        else otherItems.push(WEAPONS[w].name);
      }
      for (const a of armors) {
        const better = armorScore(a) > prevBestArmorScore + 0.001;
        const entry = {
          kind: "armor" as const,
          id: a,
          name: ARMORS[a].name,
          upgrade: better,
        };
        if (better) upgrades.push(entry);
        else otherItems.push(ARMORS[a].name);
      }

      const sess = this.sessionForPosse(recipient.id);
      if (sess) {
        const splitNote =
          shareCount > 1
            ? ` Party split: $${cashShare}/${cashTaken} cash (${shareCount}-way).`
            : "";
        this.log(
          sess,
          recipient.id === killer.id
            ? `Wiped ${victim.name}! Looted street gear: ${gearTxt}.${splitNote}`
            : `Party wipe of ${victim.name}! Your cut: $${cashShare} + street gear: ${gearTxt}.`,
        );
        sess.conn?.send({
          type: "notify",
          kind: "loot",
          title: upgrades.length
            ? "GEAR UPGRADE!"
            : shareCount > 1
              ? "PARTY LOOT"
              : "WIPE LOOT",
          subtitle: upgrades.length
            ? `Better iron from ${victim.name}`
            : shareCount > 1
              ? `Split spoils from ${victim.name}`
              : `Spoils from ${victim.name}`,
          cash: cashShare,
          victimName: victim.name,
          upgrades,
          otherItems,
        });
      }
    }

    if (victimSession) {
      const partyNote =
        shareCount > 1
          ? ` ${killer.name}'s party (${shareCount}) split the take.`
          : "";
      this.log(
        victimSession,
        `${killer.name} wiped your crew and took street gear${cashTaken ? ` and $${cashTaken}` : ""}.${partyNote}${stashNote}`,
      );
    }
    this.pushChat(
      null,
      shareCount > 1
        ? `${killer.name}'s party wiped ${victim.name} and split the street loot (${shareCount}-way).`
        : `${killer.name} wiped ${victim.name} and took their street gear.`,
      true,
    );
  }

  /** Player posses that share wipe loot with the attributed killer (party mates + self). */
  private partyLootRecipients(killer: Posse): Posse[] {
    if (!killer.isPlayer) return [killer];
    if (!killer.partyId) return [killer];
    const party = this.parties.get(killer.partyId);
    if (!party) return [killer];
    const out: Posse[] = [];
    for (const mid of party.memberPosseIds) {
      const p = this.posses.get(mid);
      // Only living crews with a session (online) get a cut
      if (!p?.isPlayer) continue;
      if (!this.hasLivingMembers(p)) continue;
      if (!this.sessionForPosse(mid)?.conn) continue;
      out.push(p);
    }
    return out.length ? out : [killer];
  }

  /** Equip the best owned weapon/armor on the living leader (post-loot). */
  private equipBestOnLeader(posse: Posse): void {
    const leader = this.leader(posse);
    if (!leader || !leader.alive || leader.incapacitated) return;
    let bestW: WeaponId = leader.weapon;
    let bestScore = weaponScore(bestW);
    for (const w of leader.ownedWeapons) {
      const score = weaponScore(w);
      if (score > bestScore) {
        bestW = w;
        bestScore = score;
      }
    }
    leader.weapon = bestW;
    let bestA: ArmorId = "none";
    let bestR = 0;
    for (const a of leader.ownedArmors) {
      const r = armorScore(a);
      if (r > bestR) {
        bestR = r;
        bestA = a;
      }
    }
    leader.armor = bestA;
  }

  /** Remove a unit from a posse; optionally delete the entity. */
  private removeMember(posse: Posse, unitId: string, deleteUnit: boolean): void {
    posse.memberIds = posse.memberIds.filter((id) => id !== unitId);
    if (posse.selectedUnitId === unitId) {
      posse.selectedUnitId = posse.leaderId;
    }
    if (deleteUnit) this.units.delete(unitId);
  }

  private purgeDeadGoons(posse: Posse): void {
    const dead = posse.memberIds.filter((id) => {
      const u = this.units.get(id);
      return u && !u.alive && !u.isPlayerLeader;
    });
    const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
    for (const id of dead) {
      const u = this.units.get(id);
      if (u) this.recordMemorial(posse, u, session);
      this.removeMember(posse, id, true);
    }
  }

  private recordMemorial(posse: Posse, unit: Unit, session?: CharacterSession): void {
    if (!posse.isPlayer) return;
    if (unit.isPlayerLeader || unit.id === posse.leaderId) return;
    // Avoid double-record if already purged
    if (posse.memorials.some((m) => m.id === `mem_${unit.id}`)) return;
    const killerPosse = unit.lastHitByPosseId ? this.posses.get(unit.lastHitByPosseId) : null;
    const entry: MemorialEntry = {
      id: `mem_${unit.id}`,
      name: unit.name,
      gender: unit.gender,
      epitaph: randomEpitaph(),
      cause: memorialCause(killerPosse?.name ?? null, !!posse.mission),
      tick: this.tick,
    };
    posse.memorials.unshift(entry);
    if (posse.memorials.length > MAX_MEMORIALS) {
      posse.memorials.length = MAX_MEMORIALS;
    }
    if (session) {
      session.conn?.send({
        type: "notify",
        kind: "mission",
        title: `Memorial: ${unit.name}`,
        body: `"${entry.epitaph}" — ${entry.cause}`,
      });
    }
  }

  /** Pick an outdoor spawn in SAFE DOWNTOWN only (never war zone). */
  private pickQuietRespawn(excludePosseId: string): { x: number; y: number } {
    const all =
      this.map.respawnPoints.length > 0
        ? this.map.respawnPoints
        : [this.map.playerSpawn];
    // Hard filter: only PvE / safe downtown (y < SAFE_Y_MAX)
    let points = all.filter((pt) => pt.y < SAFE_Y_MAX);
    if (points.length === 0) {
      points = [this.map.playerSpawn];
    }

    const playerLeaders: Unit[] = [];
    for (const p of this.posses.values()) {
      if (!p.isPlayer || p.id === excludePosseId) continue;
      const l = this.leader(p);
      if (l?.alive) playerLeaders.push(l);
    }

    const scored = points.map((pt) => {
      let nearby = 0;
      let minD = Infinity;
      for (const pl of playerLeaders) {
        const d = dist(pt.x, pt.y, pl.x, pl.y);
        minD = Math.min(minD, d);
        if (d < 12) nearby += 1;
        if (d < 6) nearby += 2;
      }
      // Prefer empty neighborhoods; slight random noise
      const score = nearby * 100 - minD + Math.random() * 3;
      return { pt, score, nearby };
    });

    scored.sort((a, b) => a.score - b.score);
    // Random among the quietest third (at least 3 candidates)
    const quietCount = Math.max(3, Math.ceil(scored.length / 3));
    const pool = scored.slice(0, quietCount);
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? scored[0]!;
    return { x: pick.pt.x, y: pick.pt.y };
  }

  private cmdInteract(session: CharacterSession, posse: Posse, targetUnitId?: string): void {
    const leader = this.leader(posse);
    if (!leader || !leader.alive) return;

    // Always stop free/click movement when opening doors, talk, or shop
    this.cmdStop(posse);

    // Exit mat: must match client walk-then-interact (~INTERACT_RANGE+0.35 ≈ 2.55).
    // Too tight → click EXIT fires interact while still “not on mat” (safehouse reopened stash).
    // Rusty Nail spawn→exit ~2.55; Crash Pad spawn→exit ~2.0 — keep exit slightly under room diagonal.
    const EXIT_USE_RANGE = 2.55;
    // Client walk-then-interact fires around INTERACT_RANGE+0.35; keep server at least as loose
    // so "click Rita from spawn" (~2.24 tiles) actually opens dialogue instead of empty fail.
    const NPC_TALK_RANGE = INTERACT_RANGE + 0.55;

    const exitDist = (exitX: number, exitY: number): number =>
      dist(leader.x, leader.y, exitX + 0.5, exitY + 0.5);

    const npcLayerOk = (u: Unit): boolean =>
      u.kind === "npc" &&
      u.alive &&
      (u.buildingId ?? null) === (posse.insideBuildingId ?? null);

    /** Prefer explicit click target, else nearest in-layer NPC in talk range. */
    const pickNpcInRange = (): { unit: Unit; d: number } | null => {
      if (targetUnitId) {
        const preferred = this.units.get(targetUnitId);
        if (preferred && npcLayerOk(preferred)) {
          const d = dist(leader.x, leader.y, preferred.x, preferred.y);
          if (d <= NPC_TALK_RANGE) return { unit: preferred, d };
        }
      }
      let best: { unit: Unit; d: number } | null = null;
      for (const u of this.units.values()) {
        if (!npcLayerOk(u)) continue;
        const d = dist(leader.x, leader.y, u.x, u.y);
        if (d > NPC_TALK_RANGE) continue;
        if (!best || d < best.d) best = { unit: u, d };
      }
      return best;
    };

    // 1) Mission instance exit / seal (private warehouse etc.)
    if (posse.mission?.instanceLayerId && posse.insideBuildingId === posse.mission.instanceLayerId) {
      // Ensure phase flips to extract if hostiles already cleared (runtime may not have run yet)
      this.missionRuntime(posse);
      const tmpl = this.resolveBuildingDef(posse.mission.instanceLayerId);
      // Generous extract range — door sits on the north wall tile; stand on the floor under it
      const EXTRACT_RANGE = 2.6;
      if (tmpl && exitDist(tmpl.exitX, tmpl.exitY) <= EXTRACT_RANGE) {
        if (posse.mission.phase === "extract") {
          this.cmdMissionExtract(session, posse);
          return;
        }
        if (!this.hostilesCleared(posse.mission)) {
          this.log(session, "Exit sealed until hostiles are down. (Or abandon the contract.)");
          return;
        }
        // Hostiles dead but phase not updated — force extract path
        posse.mission.phase = "extract";
        this.cmdMissionExtract(session, posse);
        return;
      }
    }

    // 1b) Outdoor enter door
    if (!posse.insideBuildingId) {
      for (const b of this.map.buildings) {
        if (dist(leader.x, leader.y, b.doorX + 0.5, b.doorY + 0.5) <= INTERACT_RANGE) {
          this.enterBuilding(posse, b.id, session);
          this.log(session, `Entered ${b.name}.`);
          return;
        }
      }
    }

    // 2) If shop UI is already open, E closes it (don't re-open)
    if (posse.shop) {
      posse.shop = null;
      this.log(session, "Closed the shop counter.");
      return;
    }
    if (posse.stashOpen) {
      posse.stashOpen = false;
      this.log(session, "Closed the Crash Pad stash.");
      return;
    }

    // 2b) Leave building FIRST when near exit (before stash / NPCs).
    // Click-to-exit walk-then-E used to open Crash Pad stash when still ~2 tiles from the door.
    if (posse.insideBuildingId) {
      const bLeave = this.resolveBuildingDef(posse.insideBuildingId);
      if (bLeave && exitDist(bLeave.exitX, bLeave.exitY) <= EXIT_USE_RANGE) {
        this.enterBuilding(posse, null);
        this.log(session, `Left ${bLeave.name}.`);
        return;
      }
    }

    // 2c) Crash Pad stash — only when clearly away from the exit (not every E in the house)
    if (posse.insideBuildingId) {
      const bHere = this.resolveBuildingDef(posse.insideBuildingId);
      const farFromExit =
        !!bHere && exitDist(bHere.exitX, bHere.exitY) > EXIT_USE_RANGE + 0.35;
      if (farFromExit && (bHere?.kind === "safehouse" || bHere?.id === "safehouse")) {
        posse.stashOpen = true;
        posse.dialogue = null;
        posse.shop = null;
        this.log(
          session,
          "Crash Pad stash. Deposit cash & gear so a wipe only costs what you're packing.",
        );
        // First-session tip: open stash to complete tutorial
        this.advanceTutorial(session, posse, "stash_pad");
        return;
      }
    }

    // 3) NPCs — skip when on exit mat without a click-target (leave already handled)
    const onExitMat =
      !!posse.insideBuildingId &&
      (() => {
        const b = this.resolveBuildingDef(posse.insideBuildingId);
        return !!b && exitDist(b.exitX, b.exitY) <= EXIT_USE_RANGE;
      })();
    const npcPick = pickNpcInRange();
    if (npcPick && !(onExitMat && !targetUnitId)) {
      const u = npcPick.unit;
      const spawn = this.map.npcSpawns.find((n) => n.id === u.id);
      if (spawn?.role === "dealer") {
        // Outdoor fence: dialogue hustles (no shop building)
        if (!spawn.buildingId) {
          const dlg = this.buildDialogue(u, posse);
          dlg.gender = u.gender;
          posse.dialogue = dlg;
          posse.shop = null;
          return;
        }
        const b = this.map.buildings.find((bb) => bb.id === (u.buildingId ?? posse.insideBuildingId));
        const n = u.name.toLowerCase();
        let openLine = "phil_open";
        let greetLog = "Cash only. No refunds on regrets.";
        if (n.includes("kate") || n.includes("caliber")) {
          openLine = "kate_open";
          greetLog = "Show me the cash, I'll show you the hardware.";
        } else if (n.includes("bob") || n.includes("bottle")) {
          openLine = "bob_open";
          greetLog = "Drink special is whatever I haven't spilled yet.";
        }
        posse.shop = {
          buildingId: b?.id ?? "shop_pawn",
          shopName: b?.name ?? "Pawn-O-Matic",
          voiceLineId: openLine,
        };
        posse.dialogue = null;
        this.log(session, `${u.name}: "${greetLog}"`);
        return;
      }
      if (spawn?.role === "doc") {
        this.serviceHeal(session, posse);
        return;
      }
      if (spawn?.role === "coach") {
        // Dialogue menu: train selected / whole posse (don't auto-bill on talk)
        const dlg = this.buildDialogue(u, posse);
        dlg.gender = u.gender;
        posse.dialogue = dlg;
        posse.shop = null;
        session.conn?.send({ type: "voice.play", lineId: "coach_greet" });
        return;
      }
      const dlg = this.buildDialogue(u, posse);
      dlg.gender = u.gender;
      posse.dialogue = dlg;
      posse.shop = null;
      return;
    }

    // 4) Standing on special indoor tiles
    if (posse.insideBuildingId) {
      const t = this.tileAt(leader.x, leader.y);
      if (t === "shop") {
        const b = this.map.buildings.find((bb) => bb.id === posse.insideBuildingId);
        posse.shop = { buildingId: b?.id ?? "shop_pawn", shopName: b?.name ?? "Shop" };
        posse.dialogue = null;
        return;
      }
      if (t === "hospital") {
        this.serviceHeal(session, posse);
        return;
      }
      if (t === "gym") {
        this.serviceGym(session, posse);
        return;
      }
    }

    // 5) Outdoor props / street hustles
    if (!posse.insideBuildingId) {
      for (const p of this.map.props) {
        if (dist(leader.x, leader.y, p.x, p.y) <= INTERACT_RANGE + 0.3) {
          this.interactProp(session, posse, p.id);
          return;
        }
      }
    }

    this.log(
      session,
      "Nothing to interact with. Try a door, NPC, dumpster, booth, mailbox, or corner.",
    );
  }

  private serviceHeal(session: CharacterSession, posse: Posse): void {
    const cost = 80;
    if (posse.cash < cost) {
      this.log(session, "Doc Bandage: \"Come back when your wallet's breathing.\"");
      session.conn?.send({ type: "voice.play", lineId: "doc_greet" });
      return;
    }
    posse.cash -= cost;
    let healed = 0;
    for (const u of this.members(posse)) {
      const before = u.health;
      u.health = u.stats.maxHealth;
      if (!u.alive) {
        u.alive = true;
      }
      // Full stitch job gets you back on your feet — not limping at 0.35× forever
      u.incapacitated = false;
      healed += u.health - before;
    }
    session.conn?.send({ type: "voice.play", lineId: "doc_heal" });
    this.log(
      session,
      `Doc Bandage stitches the crew for $${cost}. (+${Math.round(healed)} HP total) "Try not to leak on the floor."`,
    );
  }

  /**
   * Iron Temple workout. mode:
   *  - one: selected goon $150 +1 random combat stat
   *  - muscle: selected $180 +1 muscle
   *  - posse: every living crewmate $100 each +1 random stat
   */
  private serviceGym(
    session: CharacterSession,
    posse: Posse,
    mode: "one" | "muscle" | "posse" = "one",
  ): void {
    const living = this.members(posse).filter((u) => u.alive);
    if (living.length === 0) return;

    const pickStat = (prefer?: keyof UnitStats): keyof UnitStats => {
      if (prefer) return prefer;
      const picks: (keyof UnitStats)[] = ["aim", "guts", "muscle", "speed"];
      return picks[Math.floor(Math.random() * picks.length)]!;
    };

    const trainUnit = (unit: Unit, prefer?: keyof UnitStats): string => {
      const pick = pickStat(prefer);
      unit.stats[pick] = (unit.stats[pick] as number) + 1;
      if (Math.random() < 0.3) {
        unit.stats.maxHealth += 5;
        unit.health = Math.min(unit.stats.maxHealth, unit.health + 5);
      }
      return `${unit.name} +1 ${String(pick).toUpperCase()}`;
    };

    if (mode === "posse") {
      const cost = 100 * living.length;
      if (posse.cash < cost) {
        this.log(
          session,
          `Coach Brick: "Crew session is $${cost}. Come back when the wallet can bench press."`,
        );
        session.conn?.send({ type: "voice.play", lineId: "coach_greet" });
        return;
      }
      posse.cash -= cost;
      const lines = living.map((u) => trainUnit(u));
      session.conn?.send({ type: "voice.play", lineId: "coach_train" });
      this.log(
        session,
        `Coach Brick runs the whole posse through hell (−$${cost}). ${lines.join(" · ")}. "Pain is just weakness leaving the bullet holes."`,
      );
      return;
    }

    const unit =
      this.units.get(posse.selectedUnitId) &&
      this.units.get(posse.selectedUnitId)!.posseId === posse.id &&
      this.units.get(posse.selectedUnitId)!.alive
        ? this.units.get(posse.selectedUnitId)!
        : living[0]!;
    const cost = mode === "muscle" ? 180 : 150;
    if (posse.cash < cost) {
      this.log(session, "Coach Brick: \"Guts ain't free, champ.\"");
      session.conn?.send({ type: "voice.play", lineId: "coach_greet" });
      return;
    }
    posse.cash -= cost;
    const line = trainUnit(unit, mode === "muscle" ? "muscle" : undefined);
    session.conn?.send({ type: "voice.play", lineId: "coach_train" });
    this.log(
      session,
      `Coach Brick screams until ${line}. (−$${cost}) "Again. Harder. Or leave the weights for the dead."`,
    );
  }

  private setPropCooldown(propId: string, kind: string): void {
    const sec = hustleCooldownSec(kind);
    this.propReadyAt.set(propId, this.tick + TICK_HZ * sec);
  }

  private interactProp(
    session: CharacterSession,
    posse: Posse,
    propId: string,
  ): void {
    const prop = this.map.props.find((p) => p.id === propId);
    if (!prop) return;

    // Mission smash objectives bypass hustle cooldown and complete the job first
    if (this.onMissionPropInteract(session, posse, propId)) {
      // Still give a small flavor payout so the smash feels real
      const cash = 15 + Math.floor(Math.random() * 25);
      posse.cash += cash;
      this.log(session, `Loose cash in the crate: $${cash}.`);
      this.setPropCooldown(propId, prop.kind);
      return;
    }

    const ready = this.propReadyAt.get(propId) ?? 0;
    if (this.tick < ready) {
      const sec = Math.ceil((ready - this.tick) / TICK_HZ);
      this.log(session, `Nothing left… try again in ~${sec}s.`);
      return;
    }

    if (prop.kind === "dumpster") {
      this.setPropCooldown(propId, prop.kind);
      const roll = Math.random();
      if (roll < 0.35) {
        const cash = 20 + Math.floor(Math.random() * 60);
        posse.cash += cash;
        this.log(session, `Dumpster dive: $${cash} and a smell that will never leave. (${prop.label ?? "dumpster"})`);
      } else if (roll < 0.55) {
        const unit = this.leader(posse);
        if (unit) {
          unit.health = Math.max(1, unit.health - 8);
          this.log(session, "You found a raccoon. The raccoon found your face. (−8 HP)");
        }
      } else if (roll < 0.7) {
        const unit = this.leader(posse);
        if (unit && !unit.ownedWeapons.has("switchblade")) {
          unit.ownedWeapons.add("switchblade");
          this.log(session, "A sticky switchblade. Free is free.");
        } else {
          posse.cash += 15;
          this.log(session, "Bottle deposit money. $15. Living the dream.");
        }
      } else {
        this.log(session, "Just trash. Philosophical trash, but still trash.");
      }
      return;
    }

    if (prop.kind === "protection") {
      this.setPropCooldown(propId, prop.kind);
      const cash = 40 + Math.floor(Math.random() * 80) + Math.floor(posse.rep * 2);
      posse.cash += cash;
      posse.rep += 1;
      this.addHeat(posse, HEAT.protection, session, "protection racket");
      this.log(
        session,
        `Shook down ${prop.label ?? "the corner"} for $${cash}. Rep +1. "Nice block you got here…"`,
      );
      return;
    }

    if (prop.kind === "car" || prop.kind === "motorcycle") {
      this.setPropCooldown(propId, prop.kind);
      const cash = 30 + Math.floor(Math.random() * 100);
      posse.cash += cash;
      this.addHeat(posse, HUSTLE_HEAT.carJack, session, "vehicle jack");
      const loud = Math.random() < 0.22;
      this.log(
        session,
        prop.kind === "motorcycle"
          ? `Yanked $${cash} from ${prop.label ?? "a bike"}. The tank still smells like regret.${loud ? " Alarm: yes." : ""}`
          : `Liberated $${cash} from ${prop.label ?? "a car"}. The radio only plays static now.${loud ? " Alarm's screaming." : ""}`,
      );
      if (loud) {
        this.addHeat(posse, HEAT.hustleSoft, session, "car alarm");
      }
      return;
    }

    if (prop.kind === "crate") {
      this.setPropCooldown(propId, prop.kind);
      const unit = this.leader(posse);
      if (unit && Math.random() < 0.4 && !unit.ownedWeapons.has("uzi")) {
        unit.ownedWeapons.add("uzi");
        grantWeaponAmmo(unit, "uzi");
        this.log(session, "Crate says 'farm equipment'. Contains an Uzi. Farming is evolving.");
      } else {
        const cash = 25 + Math.floor(Math.random() * 50);
        posse.cash += cash;
        this.log(session, `Crate cash: $${cash}. Definitely not guns. (It was guns-adjacent.)`);
      }
      return;
    }

    if (prop.kind === "phonebooth") {
      this.setPropCooldown(propId, prop.kind);
      const roll = Math.random();
      const label = prop.label ?? "the booth";
      if (roll < 0.32) {
        // Tip line — pay for intel
        const cost = 15;
        if (posse.cash < cost) {
          this.log(session, `${label}: dead line. Also your wallet is dead. Need $${cost} for the tip line.`);
          // still on CD — they tried
          return;
        }
        posse.cash -= cost;
        posse.rep += 1;
        this.log(
          session,
          `${label}: tip line. (−$${cost}, rep +1) "Dogs west, wreckers further west, choir south of Our Lady, rats fringe, lizards far lot, slicks east, chrome knuckles mid-fringe, toll strip, freeze crate docks, vipers south neon, Iron Temple after hours. Don't call this number again."`,
        );
      } else if (roll < 0.58) {
        // Collect-call scam
        const cash = 25 + Math.floor(Math.random() * 55);
        posse.cash += cash;
        this.addHeat(posse, HUSTLE_HEAT.phoneScam, session, "phone scam");
        this.log(
          session,
          `${label}: reverse charges from a 'lawyer in Bermuda'. +$${cash}. Heat up. The operator cried.`,
        );
      } else if (roll < 0.78) {
        const unit = this.leader(posse);
        if (unit) {
          unit.health = Math.max(1, unit.health - 5);
          this.log(session, `${label}: wrong number. A guy named Spike promised to find you. (−5 HP from the receiver slam)`);
        }
      } else {
        this.log(session, `${label}: dial tone and existential dread. No cash. No mercy.`);
      }
      return;
    }

    if (prop.kind === "mailbox") {
      this.setPropCooldown(propId, prop.kind);
      const roll = Math.random();
      const label = prop.label ?? "the box";
      if (roll < 0.4) {
        const cash = 18 + Math.floor(Math.random() * 45);
        posse.cash += cash;
        this.addHeat(posse, HUSTLE_HEAT.mailbox, session, "mail theft");
        this.log(session, `${label}: birthday checks and divorce papers. +$${cash}. Heat + a little federal curiosity.`);
      } else if (roll < 0.62) {
        posse.rep += 1;
        this.log(session, `${label}: anonymous love letter addressed to 'whoever smells like gun oil.' Rep +1. Weird flex.`);
      } else if (roll < 0.8) {
        this.addHeat(posse, HEAT.hustleSoft + 1, session, "opened warrant");
        this.log(session, `${label}: opened someone else's warrant. Heat up. Congratulations, you play yourself.`);
      } else {
        this.log(session, `${label}: catalogs and coupons for a funeral home. Mood: accurate.`);
      }
      return;
    }

    if (prop.kind === "hydrant") {
      this.setPropCooldown(propId, prop.kind);
      const roll = Math.random();
      const label = prop.label ?? "hydrant";
      if (roll < 0.35) {
        const cash = 10 + Math.floor(Math.random() * 30);
        posse.cash += cash;
        this.log(session, `${label}: city workers left a bribe in the cap. +$${cash}. Wet socks optional.`);
      } else if (roll < 0.55) {
        const before = posse.heat;
        posse.heat = Math.max(0, posse.heat - 6);
        this.log(
          session,
          `${label}: cold spray washes the stink off. Heat ${Math.round(before)} → ${Math.round(posse.heat)}.`,
        );
      } else if (roll < 0.78) {
        const unit = this.leader(posse);
        if (unit) {
          unit.health = Math.max(1, unit.health - 6);
          this.addHeat(posse, HUSTLE_HEAT.hydrant, session, "hydrant spray");
          this.log(session, `${label}: valve fights back. Face full of street water. (−6 HP)`);
        }
      } else {
        this.log(session, `${label}: rust, pressure, and civic pride. Nothing to steal but dignity.`);
      }
      return;
    }

    if (prop.kind === "neon") {
      this.setPropCooldown(propId, prop.kind);
      const roll = Math.random();
      const label = prop.label ?? "neon";
      if (roll < 0.45) {
        const cash = 35 + Math.floor(Math.random() * 70);
        posse.cash += cash;
        this.addHeat(posse, HUSTLE_HEAT.neonSmash, session, "neon smash");
        this.log(
          session,
          `Smashed "${label}" for scrap copper and pride. +$${cash}. Loud. Heat up.`,
        );
      } else if (roll < 0.7) {
        const unit = this.leader(posse);
        if (unit) {
          unit.health = Math.max(1, unit.health - 10);
          this.addHeat(posse, HEAT.hustleSoft, session, "glass rain");
          this.log(session, `"${label}" glass rain. (−10 HP) Neon cuts deeper than feelings.`);
        }
      } else {
        posse.rep += 1;
        this.log(session, `You pose under "${label}" like a tourist. Photo not included. Rep +1 for the aesthetic.`);
      }
      return;
    }

    if (prop.kind === "cone") {
      this.setPropCooldown(propId, prop.kind);
      const roll = Math.random();
      const label = prop.label ?? "cone";
      if (roll < 0.4) {
        const cash = 12 + Math.floor(Math.random() * 28);
        posse.cash += cash;
        this.log(session, `Moved ${label}. Union dues fell out. +$${cash}. "That's a reorg."`);
      } else if (roll < 0.65) {
        this.addHeat(posse, HUSTLE_HEAT.coneTrouble, session, "traffic cone");
        this.log(session, `${label}: a meter maid saw that. Heat up. The cone had witnesses.`);
      } else if (roll < 0.85) {
        const unit = this.leader(posse);
        if (unit) {
          unit.health = Math.max(1, unit.health - 4);
          this.log(session, `Tripped over ${label}. (−4 HP) It was personal.`);
        }
      } else {
        this.log(session, `${label}: still orange. Still judging you.`);
      }
      return;
    }
  }

  private enterBuilding(posse: Posse, buildingId: string | null, session?: CharacterSession): void {
    const members = this.members(posse);
    // Cancel movement / attack so nobody pathfinds into the teleport
    posse.attackTargetId = null;
    posse.moveLabel = null;
    if (!buildingId) {
      const prev = this.resolveBuildingDef(posse.insideBuildingId);
      posse.insideBuildingId = null;
      posse.dialogue = null;
      posse.shop = null;
      posse.stashOpen = false;
      posse.jobBoard = null;
      const sx = prev?.exteriorSpawnX ?? this.map.playerSpawn.x;
      const sy = prev?.exteriorSpawnY ?? this.map.playerSpawn.y;
      let i = 0;
      for (const u of members) {
        u.buildingId = null;
        u.x = sx + (i % 2) * 0.4;
        u.y = sy + Math.floor(i / 2) * 0.4;
        u.tx = u.x;
        u.ty = u.y;
        u.dirX = 0;
        u.dirY = 0;
        u.moveMode = "idle";
        i++;
      }
      return;
    }
    // Virtual mission layers use template geometry
    const b =
      this.map.buildings.find((bb) => bb.id === buildingId) ??
      this.resolveBuildingDef(buildingId);
    if (!b) return;
    posse.insideBuildingId = buildingId;
    posse.dialogue = null;
    posse.shop = null;
    posse.stashOpen = false;
    posse.jobBoard = null;
    let i = 0;
    for (const u of members) {
      u.buildingId = buildingId;
      u.x = b.spawnX + (i % 2) * 0.35;
      u.y = b.spawnY - Math.floor(i / 2) * 0.35;
      u.tx = u.x;
      u.ty = u.y;
      u.dirX = 0;
      u.dirY = 0;
      u.moveMode = "idle";
      i++;
    }
    // Tutorial: entered The Rusty Nail
    if (buildingId === "bar_rusty" && session) {
      this.advanceTutorial(session, posse, "go_bar");
    }
  }

  private cmdExitBuilding(session: CharacterSession, posse: Posse): void {
    if (!posse.insideBuildingId) return;
    // Instanced jobs: only extract door completes, or abandon
    if (posse.mission?.instanceLayerId && posse.insideBuildingId === posse.mission.instanceLayerId) {
      this.missionRuntime(posse);
      if (posse.mission.phase === "extract" || this.hostilesCleared(posse.mission)) {
        this.cmdMissionExtract(session, posse);
        return;
      }
      this.log(session, "You're sealed in. Clear the bay, then use the exit — or abandon the job.");
      return;
    }
    this.enterBuilding(posse, null);
  }

  /** Rename the player boss (display name + crew label). Unique per realm. */
  private cmdRename(session: CharacterSession, posse: Posse, rawName: string): void {
    if (!posse.isPlayer) return;
    const clean = rawName.trim().slice(0, 20).replace(/[^\w\s\-']/g, "");
    if (clean.length < 2) {
      this.log(session, "Name too short. Pick something the streets can yell.");
      return;
    }
    const lower = clean.toLowerCase();
    if (lower === session.name.toLowerCase()) {
      this.log(session, "You're already going by that.");
      return;
    }
    for (const s of this.sessions.values()) {
      if (s.characterId !== session.characterId && s.name.toLowerCase() === lower) {
        this.log(session, "That name's already walking these streets.");
        return;
      }
    }
    const old = session.name;
    session.name = clean;
    const leader = this.leader(posse);
    if (leader) leader.name = clean;
    posse.name = `${clean}'s Crew`;
    this.log(session, `Street name updated: ${old} → ${clean}. The crew still answers to you.`);
  }

  private assertStashAccess(session: CharacterSession, posse: Posse): boolean {
    if (!posse.isPlayer) return false;
    const b = this.map.buildings.find((bb) => bb.id === posse.insideBuildingId);
    if (!b || (b.kind !== "safehouse" && b.id !== "safehouse")) {
      this.log(session, "Stash is only at the Crash Pad.");
      posse.stashOpen = false;
      return false;
    }
    return true;
  }

  private buildStashState(posse: Posse): StashState {
    // Expand stacks so the client can show multiple of the same id
    const weapons: WeaponId[] = [];
    for (const [id, n] of posse.stashWeapons) {
      if (id === "pipe") continue;
      for (let i = 0; i < n; i++) weapons.push(id);
    }
    const armors: ArmorId[] = [];
    for (const [id, n] of posse.stashArmors) {
      if (id === "none") continue;
      for (let i = 0; i < n; i++) armors.push(id);
    }
    return {
      cash: posse.stashCash,
      weapons,
      armors,
      pocketCash: posse.cash,
    };
  }

  private cmdStashDepositCash(session: CharacterSession, posse: Posse, amount: number): void {
    if (!this.assertStashAccess(session, posse)) return;
    posse.stashOpen = true;
    const n = amount <= 0 ? posse.cash : Math.min(posse.cash, Math.floor(amount));
    if (n <= 0) {
      this.log(session, "Nothing in your pockets to stash.");
      return;
    }
    posse.cash -= n;
    posse.stashCash += n;
    this.log(session, `Stashed $${n}. Pocket $${posse.cash} · Stash $${posse.stashCash}.`);
  }

  private cmdStashWithdrawCash(session: CharacterSession, posse: Posse, amount: number): void {
    if (!this.assertStashAccess(session, posse)) return;
    posse.stashOpen = true;
    const n = amount <= 0 ? posse.stashCash : Math.min(posse.stashCash, Math.floor(amount));
    if (n <= 0) {
      this.log(session, "Stash is empty of cash.");
      return;
    }
    posse.stashCash -= n;
    posse.cash += n;
    this.log(session, `Withdrew $${n}. Pocket $${posse.cash} · Stash $${posse.stashCash}.`);
  }

  private cmdStashDepositWeapon(
    session: CharacterSession,
    posse: Posse,
    weaponId: WeaponId,
    unitId: string,
  ): void {
    if (!this.assertStashAccess(session, posse)) return;
    if (weaponId === "pipe") {
      this.log(session, "Even the rats won't take that pipe.");
      return;
    }
    if (!posse.memberIds.includes(unitId)) return;
    const u = this.units.get(unitId);
    if (!u || !u.ownedWeapons.has(weaponId)) {
      this.log(session, "They aren't carrying that.");
      return;
    }
    posse.stashOpen = true;
    u.ownedWeapons.delete(weaponId);
    if (u.weapon === weaponId) u.weapon = "pipe";
    stashAddWeapon(posse, weaponId);
    this.log(session, `Stashed ${WEAPONS[weaponId].name} from ${u.name}.`);
  }

  private cmdStashWithdrawWeapon(
    session: CharacterSession,
    posse: Posse,
    weaponId: WeaponId,
    unitId: string,
  ): void {
    if (!this.assertStashAccess(session, posse)) return;
    if (!posse.memberIds.includes(unitId)) return;
    const u = this.units.get(unitId);
    if (!u || !u.alive) return;
    if (u.ownedWeapons.has(weaponId)) {
      this.log(session, `${u.name} already packs a ${WEAPONS[weaponId].name}.`);
      return;
    }
    if (!stashTakeWeapon(posse, weaponId)) {
      this.log(session, "Not in the stash.");
      return;
    }
    posse.stashOpen = true;
    u.ownedWeapons.add(weaponId);
    grantWeaponAmmo(u, weaponId);
    if (u.weapon === "pipe" || weaponScore(weaponId) > weaponScore(u.weapon)) {
      u.weapon = weaponId;
    }
    this.log(session, `${u.name} pulled ${WEAPONS[weaponId].name} from the stash.`);
  }

  private cmdStashDepositArmor(
    session: CharacterSession,
    posse: Posse,
    armorId: ArmorId,
    unitId: string,
  ): void {
    if (!this.assertStashAccess(session, posse)) return;
    if (armorId === "none") return;
    if (!posse.memberIds.includes(unitId)) return;
    const u = this.units.get(unitId);
    if (!u || !u.ownedArmors.has(armorId)) {
      this.log(session, "They aren't wearing/storing that.");
      return;
    }
    posse.stashOpen = true;
    u.ownedArmors.delete(armorId);
    if (u.armor === armorId) u.armor = "none";
    stashAddArmor(posse, armorId);
    this.log(session, `Stashed ${ARMORS[armorId].name} from ${u.name}.`);
  }

  private cmdStashWithdrawArmor(
    session: CharacterSession,
    posse: Posse,
    armorId: ArmorId,
    unitId: string,
  ): void {
    if (!this.assertStashAccess(session, posse)) return;
    if (!posse.memberIds.includes(unitId)) return;
    const u = this.units.get(unitId);
    if (!u || !u.alive) return;
    if (u.ownedArmors.has(armorId)) {
      this.log(session, `${u.name} already has ${ARMORS[armorId].name}.`);
      return;
    }
    if (!stashTakeArmor(posse, armorId)) {
      this.log(session, "Not in the stash.");
      return;
    }
    posse.stashOpen = true;
    u.ownedArmors.add(armorId);
    if (u.armor === "none" || armorScore(armorId) > armorScore(u.armor)) {
      u.armor = armorId;
    }
    this.log(session, `${u.name} suited up with ${ARMORS[armorId].name} from the stash.`);
  }

  private cmdStashDepositAll(session: CharacterSession, posse: Posse, unitId: string): void {
    if (!this.assertStashAccess(session, posse)) return;
    posse.stashOpen = true;
    if (posse.cash > 0) {
      this.cmdStashDepositCash(session, posse, 0);
    }
    if (!posse.memberIds.includes(unitId)) return;
    const u = this.units.get(unitId);
    if (!u) return;
    const weapons = [...u.ownedWeapons].filter((w) => w !== "pipe");
    for (const w of weapons) {
      u.ownedWeapons.delete(w);
      if (u.weapon === w) u.weapon = "pipe";
      stashAddWeapon(posse, w);
    }
    const armors = [...u.ownedArmors].filter((a) => a !== "none");
    for (const a of armors) {
      u.ownedArmors.delete(a);
      if (u.armor === a) u.armor = "none";
      stashAddArmor(posse, a);
    }
    if (weapons.length || armors.length) {
      this.log(
        session,
        `Dumped ${u.name}'s loadout into the stash (${weapons.length} weapons, ${armors.length} armor).`,
      );
    }
  }

  /** Map NPC identity → greeter voice line ids (random pick). */
  private greeterVoiceIds(npc: Unit, role: string): string[] {
    const name = npc.name.toLowerCase();
    const female = npc.gender === "female";
    if (role === "bartender") {
      if (female || name.includes("venus")) return ["venus_greet_1", "venus_greet_2", "venus_greet_3"];
      return ["vince_greet_1", "vince_greet_2"];
    }
    if (role === "fixer") return ["rita_greet"];
    if (role === "dealer") {
      if (name.includes("kate") || name.includes("caliber")) return ["kate_greet"];
      if (name.includes("bob") || name.includes("bottle")) return ["bob_greet"];
      return ["phil_greet"];
    }
    if (role === "doc") return ["doc_greet"];
    if (role === "coach") return ["coach_greet"];
    if (role === "priest") return ["priest_greet"];
    if (role === "mechanic") return ["tony_greet"];
    if (role === "thug") return female ? ["thug_greet_f"] : ["thug_greet_m"];
    if (role === "dancer") return ["dancer_greet_1", "dancer_greet_2", "dancer_greet_3"];
    return ["generic_bye"];
  }

  private isFemaleBartender(npc: Unit | undefined): boolean {
    if (!npc) return false;
    return npc.gender === "female" || /venus/i.test(npc.name);
  }

  private setDialogueVoice(d: DialogueState, lineId: string | undefined): void {
    if (lineId) d.voiceLineId = lineId;
    else delete d.voiceLineId;
  }

  private buildDialogue(npc: Unit, playerPosse?: Posse): DialogueState {
    const spawn = this.map.npcSpawns.find((n) => n.id === npc.id);
    const role = spawn?.role ?? "thug";
    const heat = playerPosse?.heat ?? 0;
    const voiceLineId = pickVoiceLineId(this.greeterVoiceIds(npc, role));

    if (role === "bartender") {
      const cost = layLowCost(heat);
      const female = this.isFemaleBartender(npc);
      const text = female
        ? `${npc.name} leans over the sticky bar, neon catching every curve. "Hello daddy — drink, hire, or stare? Clock's ticking."`
        : `${npc.name} wipes a glass that will never be clean. "You lookin' to hire muscle or start a funeral?"`;
      return {
        npcId: npc.id,
        npcName: npc.name,
        text,
        voiceLineId,
        choices: [
          { id: "hire", label: "I need a warm body for the crew. ($150)", tone: "business" },
          {
            id: "lay_low",
            label:
              heat < 5
                ? "I'm already cool. (no heat)"
                : `Lay low. Drop heat (−${LAY_LOW_HEAT_REDUCE}, $${cost})`,
            tone: "smooth",
          },
          { id: "rumor", label: "What's the word on the street?", tone: "smooth" },
          {
            id: "insult",
            label: female ? "Nice outfit. Tips pay the rent?" : "Nice dump. Rats pay rent?",
            tone: "insult",
          },
          { id: "bye", label: "Later.", tone: "smooth" },
        ],
      };
    }
    if (role === "fixer") {
      return {
        npcId: npc.id,
        npcName: npc.name,
        text: "Rita doesn't look up from her notepad. \"Jobs, tips, or trouble. Pick one.\"",
        voiceLineId,
        choices: [
          { id: "job", label: "Got work?", tone: "business" },
          { id: "tip", label: "Who should I watch for?", tone: "smooth" },
          { id: "threat", label: "Maybe I take your book.", tone: "threaten" },
          { id: "bye", label: "I'm out.", tone: "smooth" },
        ],
      };
    }
    if (role === "dealer") {
      // Outdoor fence — no counter, just dirty deals
      if (!spawn?.buildingId) {
        return {
          npcId: npc.id,
          npcName: npc.name,
          text: `${npc.name} leans on a railing that isn't structural. "I move things. You bring cash. We pretend this is legal."`,
          voiceLineId,
          choices: [
            {
              id: "fence_ammo",
              label: "Dirty clip — top up special ammo. ($55)",
              tone: "business",
            },
            {
              id: "street_tip",
              label: "Buy a tip. ($25, rep +1)",
              tone: "smooth",
            },
            {
              id: "fence_buy",
              label: "Got anything loose? ($40 mystery bag)",
              tone: "business",
            },
            { id: "haggle", label: "You're robbing me.", tone: "insult" },
            { id: "bye", label: "Later, fence.", tone: "smooth" },
          ],
        };
      }
      return {
        npcId: npc.id,
        npcName: npc.name,
        text: `${npc.name} grins. "Guns, jackets, miracles. Cash only. Browse the counter when you're ready."`,
        voiceLineId,
        choices: [
          { id: "open_shop", label: "Show me the goods.", tone: "business" },
          { id: "haggle", label: "Prices are criminal.", tone: "insult" },
          { id: "bye", label: "Just looking.", tone: "smooth" },
        ],
      };
    }
    if (role === "priest") {
      const n = playerPosse?.memorials.length ?? 0;
      return {
        npcId: npc.id,
        npcName: npc.name,
        text: "Father Trouble lights a cigarette on a candle. \"Confession is $50. Absolution is extra.\"",
        voiceLineId,
        choices: [
          {
            id: "memorial",
            label: n > 0 ? `Visit the memorial wall (${n} names)` : "Visit the memorial wall",
            tone: "smooth",
          },
          { id: "bless", label: "Bless the crew. ($50)", tone: "business" },
          { id: "rumor", label: "Any holy intel?", tone: "smooth" },
          { id: "insult", label: "Nice smoke for a holy man.", tone: "insult" },
          { id: "bye", label: "Amen.", tone: "smooth" },
        ],
      };
    }
    if (role === "mechanic") {
      return {
        npcId: npc.id,
        npcName: npc.name,
        text: "Grease Tony wipes his hands on something that used to be a shirt. \"You need wheels or just moral support?\"",
        voiceLineId,
        choices: [
          { id: "tip", label: "What's hot on the lot?", tone: "smooth" },
          { id: "insult", label: "Your cars look terminal.", tone: "insult" },
          { id: "bye", label: "Later, greaseball.", tone: "smooth" },
        ],
      };
    }
    if (role === "doc") {
      return {
        npcId: npc.id,
        npcName: npc.name,
        text: "Doc Bandage snaps on gloves that have seen things. \"Bleed on the mat, not the furniture.\"",
        voiceLineId,
        choices: [{ id: "bye", label: "I'll… use the equipment.", tone: "business" }],
      };
    }
    if (role === "coach") {
      const crew = playerPosse ? this.members(playerPosse).filter((m) => m.alive).length : 1;
      const posseCost = 100 * Math.max(1, crew);
      return {
        npcId: npc.id,
        npcName: npc.name,
        text: "Coach Brick flexes a vein the size of a garden hose. \"Iron Temple. Pain builds character — or corpses. Pick a program.\"",
        voiceLineId,
        choices: [
          {
            id: "train_one",
            label: "Train selected goon. ($150 · +1 random stat)",
            tone: "business",
          },
          {
            id: "train_posse",
            label: `Train whole posse. ($${posseCost} · +1 each)`,
            tone: "business",
          },
          {
            id: "train_muscle",
            label: "Muscle day — selected. ($180 · +1 muscle)",
            tone: "threaten",
          },
          { id: "bye", label: "I'm just looking at the free weights.", tone: "smooth" },
        ],
      };
    }
    if (role === "dancer") {
      const stage = playerPosse?.dancerStages[npc.id] ?? 0;
      const tip = dancerTipCost(stage);
      const stageBlurb =
        stage <= 0
          ? "She's in a glamorous stage dress — smiling like your wallet already said yes."
          : stage === 1
            ? "Outfit's getting thinner. The room feels warmer."
            : "Almost nothing left but attitude, heels, and neon. The house still wants more tips… for the memory.";
      const tipLabel =
        tip == null
          ? "She's as undressed as the stage allows."
          : `Tip her. Reveal more. ($${tip})`;
      return {
        npcId: npc.id,
        npcName: npc.name,
        text: `${npc.name} rolls her hips on the edge of the stage. ${stageBlurb} "Tip sweet, sugar. Clothes are optional. Cash isn't."`,
        voiceLineId,
        gender: "female",
        dancerKey: npc.dancerKey,
        revealStage: stage,
        choices: [
          {
            id: "tip_dancer",
            label: tipLabel,
            tone: "business",
          },
          { id: "flirt_dancer", label: "You're killing me.", tone: "smooth" },
          { id: "bye", label: "Maybe later.", tone: "smooth" },
        ],
      };
    }
    // Street thug (default + outdoor meat)
    return {
      npcId: npc.id,
      npcName: npc.name,
      text: `${npc.name} spits on the sidewalk. "You hiring, buying gossip, or looking for a broken nose?"`,
      voiceLineId,
      choices: [
        { id: "hire_street", label: "Join the crew. ($100)", tone: "business" },
        {
          id: "street_tip",
          label: "Buy a tip. ($25, rep +1)",
          tone: "smooth",
        },
        {
          id: "shake_down",
          label: "Shake them down. (risk)",
          tone: "threaten",
        },
        { id: "insult", label: "You're the waste.", tone: "insult" },
        { id: "bye", label: "Forget it.", tone: "smooth" },
      ],
    };
  }

  private cmdDialogueChoice(session: CharacterSession, posse: Posse, choiceId: string): void {
    const d = posse.dialogue;
    if (!d) return;
    const npc = this.units.get(d.npcId);

    if (choiceId === "bye") {
      posse.dialogue = null;
      return;
    }

    if (
      (choiceId === "train_one" ||
        choiceId === "train_posse" ||
        choiceId === "train_muscle") &&
      (npc?.npcRole === "coach" || d.npcName === "Coach Brick")
    ) {
      if (choiceId === "train_one") this.serviceGym(session, posse, "one");
      else if (choiceId === "train_muscle") this.serviceGym(session, posse, "muscle");
      else this.serviceGym(session, posse, "posse");
      posse.dialogue = null;
      return;
    }

    if (choiceId === "tip_dancer" && npc) {
      const stage = posse.dancerStages[npc.id] ?? 0;
      const cost = dancerTipCost(stage);
      if (cost == null) {
        const line = "dancer_tip_max";
        d.text = `${npc.name} blows a kiss, almost wearing nothing but confidence. "That's the floor show, daddy. Anything else is a fairy tale."`;
        this.setDialogueVoice(d, line);
        session.conn?.send({ type: "voice.play", lineId: line });
        this.log(session, `${npc.name}: max reveal. Your wallet is lighter; your memory is not.`);
        return;
      }
      if (posse.cash < cost) {
        const line = "dancer_broke";
        d.text = `${npc.name} tugs a strap back up and smirks. "Empty pockets? Cute. Come back when you can afford the view."`;
        this.setDialogueVoice(d, line);
        session.conn?.send({ type: "voice.play", lineId: line });
        this.log(session, `${npc.name}: broke. No tip, no peel.`);
        return;
      }
      posse.cash -= cost;
      const next = Math.min(DANCER_MAX_STAGE, stage + 1);
      posse.dancerStages[npc.id] = next;
      const line = next >= DANCER_MAX_STAGE ? "dancer_tip_max" : next === 1 ? "dancer_tip_1" : "dancer_tip_2";
      const look =
        next === 1
          ? "She peels the dress like a promise — crop top, tiny shorts, way more skin."
          : "Micro bikini, neon sweat, and a smile that bills interest. The stage is hers.";
      d.text = `${npc.name} takes the cash with two fingers and a wicked grin. ${look}`;
      d.revealStage = next;
      d.dancerKey = npc.dancerKey;
      d.gender = "female";
      this.setDialogueVoice(d, line);
      session.conn?.send({ type: "voice.play", lineId: line });
      // Refresh choices for next tip
      const tip = dancerTipCost(next);
      d.choices = [
        {
          id: "tip_dancer",
          label: tip == null ? "She's as undressed as the stage allows." : `Tip her. Reveal more. ($${tip})`,
          tone: "business",
        },
        { id: "flirt_dancer", label: "You're killing me.", tone: "smooth" },
        { id: "bye", label: "I need air.", tone: "smooth" },
      ];
      this.log(session, `Tipped ${npc.name} $${cost}. Reveal stage ${next}/${DANCER_MAX_STAGE}.`);
      return;
    }

    if (choiceId === "flirt_dancer" && npc) {
      const line = "dancer_flirt";
      d.text = `${npc.name} laughs low, tracing a finger along her own collarbone. "Careful, boss… keep talking sweet and I might actually like you. Then you'll really go broke."`;
      this.setDialogueVoice(d, line);
      session.conn?.send({ type: "voice.play", lineId: line });
      return;
    }

    if (choiceId === "open_shop") {
      posse.dialogue = null;
      const b = this.map.buildings.find((bb) => bb.id === (npc?.buildingId ?? posse.insideBuildingId));
      const name = (npc?.name ?? "").toLowerCase();
      let openLine = "phil_open";
      if (name.includes("kate") || name.includes("caliber")) openLine = "kate_open";
      else if (name.includes("bob") || name.includes("bottle")) openLine = "bob_open";
      posse.shop = {
        buildingId: b?.id ?? "shop_pawn",
        shopName: b?.name ?? "Shop",
        voiceLineId: openLine,
      };
      return;
    }

    if (choiceId === "bless") {
      if (posse.cash < 50) {
        d.text = "\"Faith without funds is just hope.\"";
        this.setDialogueVoice(d, "priest_broke");
        d.choices = [{ id: "bye", label: "I'll pass the plate later.", tone: "smooth" }];
        return;
      }
      posse.cash -= 50;
      for (const u of this.members(posse)) {
        u.health = Math.min(u.stats.maxHealth, u.health + 15);
      }
      d.text = "\"You're blessed. Marginally. Don't test it in traffic.\"";
      this.setDialogueVoice(d, "priest_bless");
      d.choices = [{ id: "bye", label: "Thanks, Padre.", tone: "smooth" }];
      this.log(session, "Crew blessed (+15 HP). Probably placebo. (−$50)");
      return;
    }

    if (choiceId === "memorial") {
      posse.dialogue = null;
      posse.memorialOpen = true;
      const n = posse.memorials.length;
      this.log(
        session,
        n === 0
          ? "Father Trouble: \"Empty wall. Lucky you. Or unlucky recruits.\" "
          : `Father Trouble nods at ${n} name${n === 1 ? "" : "s"}. \"They almost made it.\"`,
      );
      return;
    }

    if (choiceId === "lay_low") {
      const femaleBar = this.isFemaleBartender(npc);
      if (posse.heat < 5) {
        d.text = "\"You're already a nobody. Congrats.\"";
        this.setDialogueVoice(d, femaleBar ? "venus_laylow_ok" : "vince_laylow_cool");
        d.choices = [{ id: "bye", label: "I'll take that as a compliment.", tone: "smooth" }];
        return;
      }
      const cost = layLowCost(posse.heat);
      if (posse.cash < cost) {
        d.text = `"Cooling off costs $${cost}. Your wallet is still hot."`;
        this.setDialogueVoice(d, femaleBar ? "venus_hire_broke" : "vince_laylow_broke");
        d.choices = [{ id: "bye", label: "I'll be back with cash.", tone: "business" }];
        return;
      }
      posse.cash -= cost;
      const before = Math.round(posse.heat);
      posse.heat = Math.max(0, posse.heat - LAY_LOW_HEAT_REDUCE);
      d.text = `"Sit. Drink water. Forget your name for twenty minutes." Heat ${before} → ${Math.round(posse.heat)}.`;
      this.setDialogueVoice(d, femaleBar ? "venus_laylow_ok" : "vince_laylow_ok");
      d.choices = [{ id: "bye", label: femaleBar ? "Thanks, Venus." : "Thanks, Vince.", tone: "smooth" }];
      this.log(session, `Laid low (−$${cost}). Heat ${before} → ${Math.round(posse.heat)}.`);
      return;
    }

    if (choiceId === "hire" || choiceId === "hire_street") {
      const cost = choiceId === "hire" ? 150 : 100;
      const femaleBar = this.isFemaleBartender(npc);
      const femaleNpc = npc?.gender === "female";
      if (posse.memberIds.length >= MAX_ACTIVE_GOONS + 1) {
        d.text = "\"Crew's full, boss. Fire someone first.\"";
        this.setDialogueVoice(d, femaleBar ? "venus_hire_broke" : "vince_hire_full");
        d.choices = [{ id: "bye", label: "Alright.", tone: "smooth" }];
        return;
      }
      if (posse.cash < cost) {
        d.text = "\"Come back when your pockets ain't empty.\"";
        this.setDialogueVoice(d, femaleBar ? "venus_hire_broke" : "vince_hire_broke");
        d.choices = [{ id: "bye", label: "Whatever.", tone: "insult" }];
        return;
      }

      const spawn = npc ? this.map.npcSpawns.find((n) => n.id === npc.id) : undefined;
      // Street thugs join themselves (leave the world as independent NPCs).
      // Bartender "hire" refers random meat — spawn a new goon.
      const recruitNpc =
        choiceId === "hire_street" || spawn?.role === "thug" ? npc : null;

      posse.cash -= cost;
      if (recruitNpc) {
        const name = this.recruitNpcAsGoon(session, posse, recruitNpc);
        const role = streetRole(recruitNpc.stats);
        d.text = `"${name}" cracks their neck. "Alright boss. I'm with you." (${role.label})`;
        this.setDialogueVoice(d, femaleNpc ? "thug_join_f" : "thug_join");
        this.log(session, `${name} joined the posse for $${cost} (${role.label}).`);
      } else {
        const hired = this.hireGoon(session, posse);
        d.text = `"${hired.name}" — ${hired.archetypeLabel}. ${hired.hireLine} Try not to get 'em killed in the first five minutes.`;
        this.setDialogueVoice(d, femaleBar ? "venus_hire_ok" : "vince_hire_ok");
        this.log(
          session,
          `Hired ${hired.name} (${hired.archetypeLabel}) for $${cost}.`,
        );
      }
      d.choices = [{ id: "bye", label: "Welcome to the posse.", tone: "business" }];
      posse.dialogue = d;
      this.advanceTutorial(session, posse, "hire_vince");
      return;
    }

    if (choiceId === "rumor" || choiceId === "tip" || choiceId === "street_tip") {
      const femaleBar = this.isFemaleBartender(npc);
      const isRita = /rita/i.test(npc?.name ?? d.npcName);
      if (choiceId === "street_tip") {
        const cost = 25;
        if (posse.cash < cost) {
          d.text = "\"Tips ain't free, genius. Come back with twenty-five or shut up.\"";
          d.choices = [{ id: "bye", label: "Tight week.", tone: "smooth" }];
          return;
        }
        posse.cash -= cost;
      }
      d.text =
        "\"Dumpster Dogs west, West End Wreckers further west with crowbars, Choir of Pain south of Our Lady (Last Hymn if Rita's paying), Rail Rats on the fringe, Parking Racket south. Lot Lizards far lot, Southside Slicks east of the tracks, Chrome Fists mid-fringe if you like polished knuckles. Unofficial Toll on the war strip, freeze crate on the docks, Neon Vipers south of the Twister if you hate living. Phone booths and mailboxes pay if you're shameless. Warehouse, Chop Shop, Cold Storage, Chapel Cleanse, Temple Sweat (Iron Temple after hours) for sealed rooms. And for fuck's sake — stash cash at the Crash Pad before you die broke.\"";
      this.setDialogueVoice(
        d,
        isRita ? "rita_tip" : femaleBar ? "venus_rumor" : "vince_rumor",
      );
      d.choices = [{ id: "bye", label: "Good looking out.", tone: "smooth" }];
      posse.rep += 1;
      if (choiceId === "street_tip") {
        this.log(session, `Paid $${25} for street intel. Rep +1.`);
      }
      return;
    }

    if (choiceId === "shake_down" && npc) {
      const roll = Math.random();
      if (roll < 0.4) {
        const cash = 30 + Math.floor(Math.random() * 70);
        posse.cash += cash;
        this.addHeat(posse, HUSTLE_HEAT.shake, session, "street shake");
        d.text = `"Alright, alright — take it!" They empty a greasy wallet. +$${cash}.`;
        this.log(session, `Shook down ${npc.name} for $${cash}. Heat up.`);
      } else if (roll < 0.7) {
        const unit = this.leader(posse);
        if (unit) {
          unit.health = Math.max(1, unit.health - 12);
        }
        this.addHeat(posse, HEAT.hustleSoft, session, "bad shake");
        d.text = "They slug you first. \"Try that again and I'll feed you to the dumpster dogs.\"";
        this.log(session, `${npc.name} fought back. (−12 HP)`);
      } else {
        d.text = "They laugh and walk. \"You're broke and obvious. Work on the act.\"";
        this.log(session, `Shake failed. ${npc.name} is unimpressed.`);
      }
      d.choices = [{ id: "bye", label: "We're done.", tone: "smooth" }];
      return;
    }

    if (choiceId === "fence_ammo" && npc) {
      const cost = 55;
      if (posse.cash < cost) {
        d.text = "\"No cash, no clip. Physics.\"";
        d.choices = [{ id: "bye", label: "Later.", tone: "smooth" }];
        return;
      }
      const unit = this.leader(posse);
      if (!unit) {
        posse.dialogue = null;
        return;
      }
      posse.cash -= cost;
      // Prefer topping a limited gun they already own (+20 rounds, capped at max)
      const limited: WeaponId[] = ["uzi", "shotgun", "tommy", "minigun", "flamethrower"];
      let topped: WeaponId | null = null;
      for (const w of limited) {
        if (unit.ownedWeapons.has(w)) {
          const def = WEAPONS[w];
          if (def?.maxAmmo != null) {
            const cur = unit.weaponAmmo.get(w) ?? 0;
            unit.weaponAmmo.set(w, Math.min(def.maxAmmo, cur + 20));
            topped = w;
            break;
          }
        }
      }
      if (!topped) {
        unit.ownedWeapons.add("uzi");
        grantWeaponAmmo(unit, "uzi");
        const def = WEAPONS.uzi;
        if (def?.maxAmmo != null) {
          const cur = unit.weaponAmmo.get("uzi") ?? 0;
          unit.weaponAmmo.set("uzi", Math.min(def.maxAmmo, cur + 20));
        }
        topped = "uzi";
      }
      d.text = `"Here's a dirty ${topped} top-up. Don't ask where the brass slept."`;
      this.log(session, `Fence sold ammo for ${topped} (−$${cost}).`);
      d.choices = [{ id: "bye", label: "Pleasure.", tone: "business" }];
      return;
    }

    if (choiceId === "fence_buy" && npc) {
      const cost = 40;
      if (posse.cash < cost) {
        d.text = "\"Mystery bag requires non-mystery money.\"";
        d.choices = [{ id: "bye", label: "Fair.", tone: "smooth" }];
        return;
      }
      posse.cash -= cost;
      const roll = Math.random();
      if (roll < 0.35) {
        const cash = 50 + Math.floor(Math.random() * 40);
        posse.cash += cash;
        d.text = `"Huh. That bag had cash. Don't tell the previous owner." +$${cash} (net +$${cash - cost}).`;
        this.log(session, `Mystery bag: net +$${cash - cost}.`);
      } else if (roll < 0.6) {
        const unit = this.leader(posse);
        if (unit && !unit.ownedWeapons.has("switchblade")) {
          unit.ownedWeapons.add("switchblade");
          d.text = "\"Switchblade. Sticky. Still sharp. You're welcome.\"";
          this.log(session, `Mystery bag: switchblade (−$${cost}).`);
        } else {
          posse.cash += 20;
          d.text = "\"Spare change and a half-smoked cigar. Living large.\" +$20 back.";
          this.log(session, `Mystery bag: $20 scrap (−$${cost} paid).`);
        }
      } else if (roll < 0.8) {
        this.addHeat(posse, HEAT.hustleSoft, session, "hot bag");
        d.text = "\"Whoops. That was hot. Heat's on you now.\"";
        this.log(session, `Mystery bag was hot. Heat up. (−$${cost})`);
      } else {
        d.text = "\"Empty bag. Educational experience. Tuition: forty bucks.\"";
        this.log(session, `Mystery bag: empty. (−$${cost})`);
      }
      d.choices = [{ id: "bye", label: "Classic.", tone: "insult" }];
      return;
    }

    if (choiceId === "job") {
      if (posse.mission) {
        const cur = MISSIONS[posse.mission.defId];
        d.text = `"You're already on \"${cur?.title ?? "a job"}.\" Finish it or abandon first — I don't double-book amateurs."`;
        this.setDialogueVoice(d, "rita_busy");
        d.choices = [
          { id: "abandon_hint", label: "How do I walk?", tone: "smooth" },
          { id: "bye", label: "Right.", tone: "business" },
        ];
        return;
      }
      // Open job board (snapshot UI) — leave the dialogue
      posse.dialogue = null;
      posse.shop = null;
      posse.jobBoard = {
        npcId: d.npcId,
        npcName: d.npcName,
        title: "Rita's Job Book",
        offers: listMissionOffers({ completedIds: posse.completedMissions }),
      };
      session.conn?.send({ type: "voice.play", lineId: "rita_job_open" });
      this.log(session, `${d.npcName} flips open a greasy notepad of contracts.`);
      this.advanceTutorial(session, posse, "talk_rita");
      return;
    }

    if (choiceId === "abandon_hint") {
      d.text = "\"Hit abandon on the contract, or ask me again when you're done.\" (Esc / abandon from the job HUD.)";
      this.setDialogueVoice(d, "rita_abandon_hint");
      d.choices = [{ id: "bye", label: "Got it.", tone: "smooth" }];
      return;
    }

    if (choiceId === "insult" || choiceId === "threat" || choiceId === "haggle") {
      const femaleBar = this.isFemaleBartender(npc);
      const isRita = /rita/i.test(npc?.name ?? d.npcName);
      const name = (npc?.name ?? "").toLowerCase();
      if (choiceId === "haggle") {
        d.text = "\"Prices are criminal? Buddy, look around. You're shopping in a crime scene.\"";
        this.setDialogueVoice(d, "phil_haggle");
      } else if (isRita) {
        d.text = "\"I will fucking bury you.\" She means it as a greeting and a promise.";
        this.setDialogueVoice(d, "rita_threat");
      } else if (femaleBar) {
        d.text = "\"Keep talking, honey. I'll bury you heels first.\"";
        this.setDialogueVoice(d, "venus_insult");
      } else {
        d.text = "\"I will fucking bury you.\" He means it as a greeting and a promise.";
        this.setDialogueVoice(d, name.includes("vince") ? "vince_insult" : "generic_bury");
      }
      d.choices = [{ id: "bye", label: "(Back off)", tone: "smooth" }];
      if (npc && Math.random() < 0.35) {
        this.log(session, "That could have gone better.");
      }
      return;
    }

    posse.dialogue = null;
  }

  private resolveKillTargetUnitId(def: (typeof MISSIONS)[MissionId]): string | null {
    let targetUnitId: string | null = null;
    for (const obj of def.objectives) {
      if (obj.kind === "kill_unit" && obj.targetPosseId) {
        const boss = this.units.get(`${obj.targetPosseId}_boss`);
        if (boss?.alive) targetUnitId = boss.id;
        else {
          const ai = this.posses.get(obj.targetPosseId);
          if (ai) {
            for (const id of ai.memberIds) {
              const u = this.units.get(id);
              if (u?.alive && u.kind === "ai_boss") {
                targetUnitId = u.id;
                break;
              }
            }
            if (!targetUnitId) {
              for (const id of ai.memberIds) {
                const u = this.units.get(id);
                if (u?.alive) {
                  targetUnitId = u.id;
                  break;
                }
              }
            }
          }
        }
      }
    }
    return targetUnitId;
  }

  /** Free party mates (same party, no active job) who can share a co-op start */
  private freePartyMates(posse: Posse): Posse[] {
    if (!posse.partyId) return [];
    const party = this.parties.get(posse.partyId);
    if (!party) return [];
    const out: Posse[] = [];
    for (const mid of party.memberPosseIds) {
      if (mid === posse.id) continue;
      const p = this.posses.get(mid);
      if (!p?.isPlayer || p.mission) continue;
      out.push(p);
    }
    return out;
  }

  private assignMissionToPosse(
    posse: Posse,
    def: (typeof MISSIONS)[MissionId],
    opts: {
      targetUnitId: string | null;
      instanceLayerId: string | null;
      templateBuildingId: string | null;
      enemyPosseId: string | null;
      phase?: PosseMission["phase"];
    },
  ): void {
    posse.mission = {
      defId: def.id,
      holdAccum: 0,
      rewardGranted: false,
      targetUnitId: opts.targetUnitId,
      instanceLayerId: opts.instanceLayerId,
      templateBuildingId: opts.templateBuildingId,
      enemyPosseId: opts.enemyPosseId,
      phase: opts.phase ?? "active",
      extracted: false,
    };
  }

  private notifyMissionStart(session: CharacterSession, def: (typeof MISSIONS)[MissionId], coOpNote?: string): void {
    const body = coOpNote ? `${def.blurb} ${coOpNote}` : def.blurb;
    session.conn?.send({
      type: "notify",
      kind: "mission",
      title: def.title,
      body,
      cash: def.rewardCash,
      rep: def.rewardRep,
    });
  }

  private cmdJobBoardAccept(session: CharacterSession, posse: Posse, missionId: string): void {
    if (!posse.jobBoard) {
      this.log(session, "No job board open.");
      return;
    }
    if (posse.mission) {
      this.log(session, "Already on a job. Finish or abandon first.");
      return;
    }
    const def = MISSIONS[missionId as MissionId];
    if (!def) {
      this.log(session, "That contract fell off the book. Pick another.");
      return;
    }
    if (posse.completedMissions.includes(def.id)) {
      this.log(session, "You already pulled that job. Rita scratched it off the pad.");
      return;
    }

    const targetUnitId = this.resolveKillTargetUnitId(def);

    posse.jobBoard = null;
    posse.dialogue = null;
    posse.shop = null;

    const mates = this.freePartyMates(posse);
    const partyKey = posse.partyId ?? posse.id;
    const layerId = def.instance ? `mi_${partyKey}` : null;
    const templateId = def.instance?.templateBuildingId ?? null;

    this.assignMissionToPosse(posse, def, {
      targetUnitId,
      instanceLayerId: layerId,
      templateBuildingId: templateId,
      enemyPosseId: null,
    });

    if (def.instance && layerId && templateId) {
      // Shared (or solo) instance: teleport into sealed bay + spawn hostiles once
      if (posse.insideBuildingId && !posse.insideBuildingId.startsWith("mi_")) {
        posse.insideBuildingId = null;
        for (const u of this.members(posse)) {
          u.buildingId = null;
        }
      }
      this.enterBuilding(posse, layerId);
      const enemyId = this.spawnMissionInstanceHostiles(posse, def);
      posse.mission!.enemyPosseId = enemyId;
      const enemies = this.posses.get(enemyId);
      if (enemies) {
        enemies.hostile = true;
        enemies.combatUntil = this.tick + TICK_HZ * 120;
        posse.hostile = true;
        posse.combatUntil = this.tick + TICK_HZ * 120;
      }
      const coOp = mates.length > 0;
      this.log(
        session,
        coOp
          ? `JOB ACCEPTED: ${def.title} (PARTY INSTANCE). Crew pulled in. Clear hostiles, then extract. Pay $${def.rewardCash} + ${def.rewardRep} rep.`
          : `JOB ACCEPTED: ${def.title} (INSTANCE). Clear hostiles, then extract. Pay $${def.rewardCash} + ${def.rewardRep} rep.`,
      );
      this.notifyMissionStart(
        session,
        def,
        coOp ? "Party co-op — same bay, same freeloaders." : undefined,
      );

      for (const mate of mates) {
        const mateSess = [...this.sessions.values()].find((s) => s.posseId === mate.id);
        if (mate.insideBuildingId && !mate.insideBuildingId.startsWith("mi_")) {
          mate.insideBuildingId = null;
          for (const u of this.members(mate)) u.buildingId = null;
        }
        this.assignMissionToPosse(mate, def, {
          targetUnitId,
          instanceLayerId: layerId,
          templateBuildingId: templateId,
          enemyPosseId: enemyId,
        });
        this.enterBuilding(mate, layerId);
        mate.hostile = true;
        mate.combatUntil = this.tick + TICK_HZ * 120;
        mate.jobBoard = null;
        mate.dialogue = null;
        mate.shop = null;
        if (mateSess) {
          this.log(
            mateSess,
            `PARTY JOB: ${def.title} (INSTANCE) — ${session.name} pulled you in. Clear & extract. Pay $${def.rewardCash} + ${def.rewardRep} rep.`,
          );
          this.notifyMissionStart(mateSess, def, `Co-op with ${session.name}.`);
        }
      }
    } else {
      // Outdoor hub objective — free party mates get the same contract
      if (posse.insideBuildingId) this.enterBuilding(posse, null);
      const coOp = mates.length > 0;
      this.log(
        session,
        coOp
          ? `JOB ACCEPTED: ${def.title} (PARTY). Crew got the same contract. $${def.rewardCash} + ${def.rewardRep} rep when done.`
          : `JOB ACCEPTED: ${def.title}. $${def.rewardCash} + ${def.rewardRep} rep when done. ${def.blurb}`,
      );
      this.notifyMissionStart(
        session,
        def,
        coOp ? "Party shares this outdoor contract." : undefined,
      );

      for (const mate of mates) {
        const mateSess = [...this.sessions.values()].find((s) => s.posseId === mate.id);
        if (mate.insideBuildingId) this.enterBuilding(mate, null);
        this.assignMissionToPosse(mate, def, {
          targetUnitId,
          instanceLayerId: null,
          templateBuildingId: null,
          enemyPosseId: null,
        });
        mate.jobBoard = null;
        mate.dialogue = null;
        mate.shop = null;
        if (mateSess) {
          this.log(
            mateSess,
            `PARTY JOB: ${def.title} — ${session.name} signed you up. $${def.rewardCash} + ${def.rewardRep} rep when done.`,
          );
          this.notifyMissionStart(mateSess, def, `Co-op with ${session.name}.`);
        }
      }
    }

    this.advanceTutorial(session, posse, "take_job");
    this.tryCompleteMission(session, posse);
  }

  /** Spawn a private AI posse inside the mission layer (warehouse / chop shop / etc.). */
  private spawnMissionInstanceHostiles(playerPosse: Posse, def: (typeof MISSIONS)[MissionId]): string {
    const m = playerPosse.mission!;
    const layer = m.instanceLayerId!;
    const tmpl = this.map.buildings.find((b) => b.id === m.templateBuildingId)!;
    // Layer-keyed so party co-op shares one enemy posse
    const enemyPosseId = `mi_enemy_${layer}`;
    // Clean leftover if re-accept after bug
    this.despawnMissionEnemies(enemyPosseId);

    const threat = def.instance?.enemyThreat ?? 1;
    const goonN = Math.max(1, def.instance?.enemyCount ?? 2);
    const label = def.instance?.enemyLabel ?? "Bay";
    const flavor = instanceGangFlavor(label);
    const cx = (tmpl.ix0 + tmpl.ix1) / 2;
    const cy = (tmpl.iy0 + tmpl.iy1) / 2;
    // Higher threat = slightly tankier instance crew
    const bossHp = 50 + threat * 8 + (flavor.statBias.maxHealth ?? 0);
    const goonHp = 36 + threat * 4 + Math.floor((flavor.statBias.maxHealth ?? 0) * 0.5);

    const bossId = `${enemyPosseId}_boss`;
    const memberIds = [bossId];
    this.posses.set(enemyPosseId, {
      id: enemyPosseId,
      name: `${label} Freeloaders`,
      leaderId: bossId,
      isPlayer: false,
      hostile: true,
      cash: 80 + threat * 20,
      rep: 0,
      heat: 0,
      color: 0xa44,
      aggression: flavor.aggression,
      threat,
      aggroRange: POSSE_AGGRO_RANGE + 1,
      detectRange: POSSE_DETECT_RANGE + 2,
      gangBlurb: flavor.blurb,
      lastAggroCheck: 0,
      combatUntil: this.tick + TICK_HZ * 120,
      selectedUnitId: bossId,
      insideBuildingId: layer,
      dialogue: null,
      shop: null,
      jobBoard: null,
      mission: null,
      completedMissions: [],
      tutorialStep: null,
      memorials: [],
      memorialOpen: false,
      memberIds,
      lastKillerPosseId: null,
      fallenWeapons: new Set(),
      fallenArmors: new Set(),
      lootedThisWipe: false,
      ...emptyStashFields(),
      attackTargetId: null,
      moveLabel: null,
      dancerStages: {},
      ...emptyPartyFields(),
      respawnT: undefined,
    });

    const roles = assignGangRoles(1 + goonN, flavor.roleBias, { aggression: flavor.aggression });
    const mk = (
      uid: string,
      uname: string,
      kind: Unit["kind"],
      x: number,
      y: number,
      hp: number,
      role: AiCombatRole,
      isBoss: boolean,
      gender: Gender,
    ) => {
      const weapon = pickGangWeapon(flavor.preferredWeapons[role] ?? flavor.preferredWeapons.shooter, role, threat);
      const base = gangBaseStats(threat, flavor.statBias, role);
      // Instance fights stay readable — clamp HP to instance budgets, keep themed stats
      const stats = defaultStats({
        aim: base.aim,
        guts: base.guts,
        muscle: base.muscle,
        brains: base.brains,
        speed: base.speed,
        maxHealth: hp,
      });
      const armor = isBoss
        ? flavor.preferredArmor.boss
        : threat >= 2
          ? flavor.preferredArmor.goon === "none"
            ? "leather"
            : flavor.preferredArmor.goon
          : flavor.preferredArmor.goon;
      this.units.set(uid, {
        id: uid,
        name: uname,
        kind,
        ownerId: null,
        posseId: enemyPosseId,
        x,
        y,
        tx: x,
        ty: y,
        path: [],
        stuckTicks: 0,
        dirX: 0,
        dirY: 0,
        moveMode: "idle",
        health: stats.maxHealth,
        stats,
        weapon,
        armor,
        facing: 4,
        alive: true,
        fireCd: 0,
        isPlayerLeader: false,
        incapacitated: false,
        gender,
        ownedWeapons: gangOwnedWeapons(weapon, flavor.preferredWeapons),
        ownedArmors: new Set(["none", "leather"]),
        weaponAmmo: new Map(), // AI ignores ammo economy
        aiWanderT: 0.5,
        buildingId: layer,
        lastHitByPosseId: null,
        aiRole: role,
      });
    };

    const bossGender: Gender = Math.random() < 0.25 ? "female" : "male";
    mk(
      bossId,
      flavor.bossTitle,
      "ai_boss",
      cx + 1.2,
      cy,
      bossHp,
      roles[0] ?? "shooter",
      true,
      bossGender,
    );
    for (let i = 0; i < goonN; i++) {
      const gid = `${enemyPosseId}_g${i}`;
      memberIds.push(gid);
      const ang = (i / goonN) * Math.PI * 2;
      const g = randomRecruitProfile();
      const gName = gangGoonName(flavor, g.gender);
      mk(
        gid,
        gName,
        "ai_goon",
        cx + Math.cos(ang) * 1.4,
        cy + Math.sin(ang) * 1.1,
        goonHp,
        roles[i + 1] ?? (i === 0 ? "rusher" : "shooter"),
        false,
        g.gender,
      );
    }
    const ep = this.posses.get(enemyPosseId)!;
    ep.memberIds = memberIds;
    // Do not auto-respawn instance enemies
    ep.respawnT = undefined;
    return enemyPosseId;
  }

  private despawnMissionEnemies(enemyPosseId: string | null): void {
    if (!enemyPosseId) return;
    const ep = this.posses.get(enemyPosseId);
    if (ep) {
      for (const id of ep.memberIds) this.units.delete(id);
      this.posses.delete(enemyPosseId);
    }
  }

  private cleanupMissionInstance(posse: Posse): void {
    const m = posse.mission;
    if (!m) return;
    // Shared party instances: only despawn hostiles when no other posse still uses them
    if (m.enemyPosseId) {
      let shared = false;
      for (const p of this.posses.values()) {
        if (p.id === posse.id || !p.isPlayer) continue;
        if (p.mission?.enemyPosseId === m.enemyPosseId) {
          shared = true;
          break;
        }
      }
      if (!shared) this.despawnMissionEnemies(m.enemyPosseId);
    }
    if (m.instanceLayerId && posse.insideBuildingId === m.instanceLayerId) {
      this.enterBuilding(posse, null);
    }
  }

  private cmdMissionAbandon(session: CharacterSession, posse: Posse): void {
    if (!posse.mission) {
      this.log(session, "No active job to abandon.");
      return;
    }
    const title = MISSIONS[posse.mission.defId]?.title ?? "Job";
    this.cleanupMissionInstance(posse);
    posse.mission = null;
    this.log(session, `Abandoned: ${title}. Rita will remember. Briefly.`);
  }

  private cmdTutorialSkip(session: CharacterSession, posse: Posse): void {
    if (!posse.tutorialStep) {
      this.log(session, "Tutorial already done.");
      return;
    }
    posse.tutorialStep = null;
    this.log(session, "Tutorial skipped. You're on your own, boss. (Rita still has jobs.)");
    session.conn?.send({
      type: "notify",
      kind: "mission",
      title: "Tutorial skipped",
      body: "No hand-holding. The Rusty Nail and Rita Fix are still northwest if you get lonely.",
    });
  }

  private tutorialPublic(posse: Posse): TutorialState | null {
    if (!posse.tutorialStep) return null;
    const def = TUTORIAL_STEPS.find((s) => s.id === posse.tutorialStep);
    if (!def) return null;
    const idx = TUTORIAL_ORDER.indexOf(posse.tutorialStep);
    return {
      step: def.id,
      title: def.title,
      body: def.body,
      stepIndex: idx + 1,
      stepCount: TUTORIAL_ORDER.length,
      hintX: def.hintX,
      hintY: def.hintY,
    };
  }

  /** Advance one step if current matches expected; rewards on finish. */
  private advanceTutorial(
    session: CharacterSession,
    posse: Posse,
    completedStep: TutorialStepId,
  ): void {
    if (posse.tutorialStep !== completedStep) return;
    const nxt = nextTutorialStep(completedStep);
    if (nxt) {
      posse.tutorialStep = nxt;
      const def = TUTORIAL_STEPS.find((s) => s.id === nxt);
      this.log(session, `TUTORIAL: ${def?.title ?? nxt}`);
    } else {
      posse.tutorialStep = null;
      posse.cash += 100;
      posse.rep += 1;
      this.log(
        session,
        "TUTORIAL COMPLETE. +$100, +1 rep. \"You're almost a professional. Don't prove me wrong.\" — Rita",
      );
      session.conn?.send({
        type: "notify",
        kind: "mission",
        title: "First session complete",
        body: "Bar → hire → fixer → job → Crash Pad stash. Bank the take before the war zone. +$100 and a little street cred.",
        cash: 100,
        rep: 1,
      });
    }
  }

  private cmdMissionExtract(session: CharacterSession, posse: Posse): void {
    const m = posse.mission;
    if (!m) return;
    // If hostiles are gone, allow extract even if phase lagged a tick
    if (m.phase !== "extract") {
      if (m.phase === "active" && this.hostilesCleared(m)) {
        m.phase = "extract";
      } else {
        return;
      }
    }
    m.extracted = true;
    // Room clear + walking out — get living crew off the 0.35× downed limp
    for (const u of this.members(posse)) {
      if (u.alive && u.incapacitated) {
        u.incapacitated = false;
      }
    }
    this.log(session, "Extract confirmed. Walking out like you own the bay.");
    this.tryCompleteMission(session, posse);
  }

  private hostilesCleared(m: PosseMission): boolean {
    if (!m.enemyPosseId) return true;
    const ep = this.posses.get(m.enemyPosseId);
    if (!ep) return true;
    return ep.memberIds.every((id) => !this.units.get(id)?.alive);
  }

  private missionRuntime(posse: Posse): MissionRuntime | null {
    const m = posse.mission;
    if (!m) return null;
    const def = MISSIONS[m.defId];
    if (!def) return null;

    const objectives = def.objectives.map((o) => {
      let done = false;
      if (o.kind === "hold") {
        const need = o.holdSeconds ?? 10;
        done = m.holdAccum >= need;
      } else if (o.kind === "interact_prop") {
        done = m.holdAccum >= 1;
      } else if (o.kind === "kill_unit") {
        if (m.targetUnitId) {
          const t = this.units.get(m.targetUnitId);
          done = !t || !t.alive;
        } else if (o.targetPosseId) {
          const ai = this.posses.get(o.targetPosseId);
          done = !ai || ai.memberIds.every((id) => !this.units.get(id)?.alive);
        }
      } else if (o.kind === "clear_hostiles") {
        done = this.hostilesCleared(m);
      } else if (o.kind === "extract") {
        done = m.extracted;
      }
      return { id: o.id, label: o.label, done };
    });

    // Advance instance phase when combat objective done
    if (m.phase === "active" && def.instance) {
      const combatDone = objectives
        .filter((o) => {
          const d = def.objectives.find((x) => x.id === o.id);
          return d && d.kind !== "extract";
        })
        .every((o) => o.done);
      if (combatDone) {
        m.phase = "extract";
        // One-shot log so the player knows the door is open
        if (!m.extractAnnounced) {
          m.extractAnnounced = true;
          const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
          if (session) {
            this.log(
              session,
              "Room clear. Get to the EXIT door and press E / click EXIT to extract.",
            );
          }
        }
      }
    }

    const allDone = objectives.every((o) => o.done);
    let phase: MissionRuntime["phase"] = m.phase;
    if (m.phase === "failed") phase = "failed";
    else if (allDone) phase = "complete";
    else if (m.phase === "extract") phase = "extract";
    else phase = "active";

    let progress: number | undefined;
    let timeLeft: number | undefined;
    let holdersOnPoint: number | undefined;
    let holdersTotal: number | undefined;
    const holdObj = def.objectives.find((o) => o.kind === "hold");
    if (holdObj) {
      const need = holdObj.holdSeconds ?? 10;
      progress = Math.min(1, m.holdAccum / need);
      timeLeft = Math.max(0, need - m.holdAccum);
      // Party co-op: surface how many mates are on the point (shared meter)
      const coHold = this.partyHoldGroup(posse, def.id);
      if (coHold.length > 1 && holdObj.propId) {
        const prop = this.map.props.find((p) => p.id === holdObj.propId);
        const range = holdObj.range ?? 2.5;
        holdersTotal = coHold.length;
        holdersOnPoint = 0;
        if (prop) {
          for (const mate of coHold) {
            if (this.isPosseHoldingProp(mate, prop.x, prop.y, range)) holdersOnPoint++;
          }
        }
      }
    }

    const tmpl = m.templateBuildingId
      ? this.map.buildings.find((b) => b.id === m.templateBuildingId)
      : null;

    return {
      id: def.id,
      title: def.title,
      phase,
      objectives,
      progress,
      timeLeft,
      holdersOnPoint,
      holdersTotal,
      rewardCash: def.rewardCash,
      rewardRep: def.rewardRep,
      hintX: def.hintX ?? (tmpl ? tmpl.exitX : undefined),
      hintY: def.hintY ?? (tmpl ? tmpl.exitY : undefined),
      instanced: !!m.instanceLayerId,
    };
  }

  private tryCompleteMission(session: CharacterSession, posse: Posse): void {
    const m = posse.mission;
    if (!m || m.rewardGranted) return;
    const runtime = this.missionRuntime(posse);
    if (!runtime || runtime.phase !== "complete") return;

    const def = MISSIONS[m.defId];
    if (!def) {
      this.cleanupMissionInstance(posse);
      posse.mission = null;
      return;
    }

    m.rewardGranted = true;
    posse.cash += def.rewardCash;
    posse.rep += def.rewardRep;
    if (!posse.completedMissions.includes(def.id)) {
      posse.completedMissions.push(def.id);
    }
    const heatGain = def.instance || def.objectives.some((o) => o.kind === "kill_unit" || o.kind === "clear_hostiles")
      ? HEAT.missionCombat
      : HEAT.missionSoft;
    this.addHeat(posse, heatGain, session, "job complete");
    this.cleanupMissionInstance(posse);
    posse.mission = null;

    const line = `JOB COMPLETE: ${def.title}. +$${def.rewardCash}, +${def.rewardRep} rep. "Lovely work. Almost nobody died permanently."`;
    this.log(session, line);
    session.conn?.send({
      type: "notify",
      kind: "mission",
      title: `Complete: ${def.title}`,
      body: `Paid $${def.rewardCash} and +${def.rewardRep} street rep. Rita nods once — high praise.`,
      cash: def.rewardCash,
      rep: def.rewardRep,
      outcome: "complete",
    });
    this.advanceTutorial(session, posse, "finish_job");
  }

  private failMission(session: CharacterSession, posse: Posse, reason: string): void {
    const m = posse.mission;
    if (!m || m.rewardGranted) return;
    const title = MISSIONS[m.defId]?.title ?? "Job";
    m.phase = "failed";
    this.cleanupMissionInstance(posse);
    posse.mission = null;
    this.log(session, `JOB FAILED: ${title}. ${reason}`);
    session.conn?.send({
      type: "notify",
      kind: "mission",
      title: `Failed: ${title}`,
      body: reason,
      outcome: "failed",
    });
  }

  /**
   * Party members sharing the same outdoor mission def (including self).
   * Solo → [posse] only.
   */
  private partyHoldGroup(posse: Posse, defId: string): Posse[] {
    if (!posse.mission || posse.mission.defId !== defId) return [];
    if (!posse.partyId) return [posse];
    const party = this.parties.get(posse.partyId);
    if (!party) return [posse];
    const out: Posse[] = [];
    for (const mid of party.memberPosseIds) {
      const p = this.posses.get(mid);
      if (p?.isPlayer && p.mission?.defId === defId && !p.mission.instanceLayerId) {
        out.push(p);
      }
    }
    return out.length ? out : [posse];
  }

  /** Leader outdoors and within range of a hold prop */
  private isPosseHoldingProp(posse: Posse, px: number, py: number, range: number): boolean {
    if (posse.insideBuildingId) return false;
    const leader = this.leader(posse);
    if (!leader?.alive) return false;
    return dist(leader.x, leader.y, px, py) <= range;
  }

  /** Hold / kill / instance progress each tick */
  private updateMissions(dt: number): void {
    /** Keys already advanced this tick: `partyId:defId` or `posseId:defId` for solo */
    const holdAdvanced = new Set<string>();

    for (const posse of this.posses.values()) {
      if (!posse.isPlayer || !posse.mission) continue;
      const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
      if (!session) continue;

      const def = MISSIONS[posse.mission.defId];
      if (!def) {
        posse.mission = null;
        continue;
      }

      const leader = this.leader(posse);
      // Fail instanced job if boss dies (wipe in the bay)
      if (def.instance && leader && !leader.alive) {
        this.failMission(
          session,
          posse,
          "You went down on the job. Contract void. Try not to die next time.",
        );
        continue;
      }
      if (!leader?.alive) continue;

      for (const obj of def.objectives) {
        if (obj.kind === "hold" && obj.propId) {
          const prop = this.map.props.find((p) => p.id === obj.propId);
          if (!prop) continue;
          const range = obj.range ?? 2.5;
          const group = this.partyHoldGroup(posse, def.id);
          const holdKey =
            group.length > 1 && posse.partyId
              ? `${posse.partyId}:${def.id}`
              : `${posse.id}:${def.id}`;
          if (!holdAdvanced.has(holdKey)) {
            holdAdvanced.add(holdKey);
            // Shared hold: any living party mate on the point advances everyone's meter once
            const anyoneOnPoint = group.some((mate) =>
              this.isPosseHoldingProp(mate, prop.x, prop.y, range),
            );
            if (anyoneOnPoint) {
              for (const mate of group) {
                if (mate.mission && mate.mission.defId === def.id) {
                  mate.mission.holdAccum += dt;
                }
              }
            }
          }
        }
        if (obj.kind === "kill_unit" && !posse.mission.targetUnitId && obj.targetPosseId) {
          const boss = this.units.get(`${obj.targetPosseId}_boss`);
          if (boss?.alive) posse.mission.targetUnitId = boss.id;
        }
      }

      // Keep instance hostiles aggro'd on player
      if (posse.mission.enemyPosseId) {
        const ep = this.posses.get(posse.mission.enemyPosseId);
        if (ep && !this.hostilesCleared(posse.mission)) {
          ep.hostile = true;
          ep.combatUntil = Math.max(ep.combatUntil, this.tick + TICK_HZ * 5);
          ep.attackTargetId = leader.id;
        }
      }

      this.tryCompleteMission(session, posse);
    }
  }

  private onMissionPropInteract(
    session: CharacterSession,
    posse: Posse,
    propId: string,
  ): boolean {
    const m = posse.mission;
    if (!m) return false;
    const def = MISSIONS[m.defId];
    if (!def) return false;
    const obj = def.objectives.find((o) => o.kind === "interact_prop" && o.propId === propId);
    if (!obj) return false;
    if (m.holdAccum >= 1) return false;
    m.holdAccum = 1;
    this.log(session, `Stash cracked for the job (${obj.label}).`);
    this.tryCompleteMission(session, posse);
    return true;
  }

  private onMissionUnitKilled(dead: Unit, killerPosseId: string | null): void {
    // Outdoor kill_unit objectives
    if (killerPosseId) {
      const posse = this.posses.get(killerPosseId);
      if (posse?.isPlayer && posse.mission) {
        const m = posse.mission;
        const def = MISSIONS[m.defId];
        if (def) {
          const killObj = def.objectives.find((o) => o.kind === "kill_unit");
          if (killObj) {
            const isTarget =
              (m.targetUnitId && dead.id === m.targetUnitId) ||
              (killObj.targetPosseId && dead.posseId === killObj.targetPosseId);
            if (isTarget) {
              m.targetUnitId = dead.id;
              const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
              if (session) this.tryCompleteMission(session, posse);
            }
          }
          // clear_hostiles: try complete when any enemy falls
          if (def.objectives.some((o) => o.kind === "clear_hostiles") && m.enemyPosseId === dead.posseId) {
            const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
            if (session) this.tryCompleteMission(session, posse);
          }
        }
      }
    }

    // Player boss down in instance → fail is handled in updateMissions
  }

  /**
   * Spawn a fresh goon on the protective circle around the boss.
   * Returns name + archetype label for dialogue / log.
   */
  private hireGoon(
    session: CharacterSession,
    posse: Posse,
  ): { name: string; archetypeLabel: string; hireLine: string } {
    const leader = this.leader(posse);
    if (!leader) return { name: "Nobody", archetypeLabel: "street meat", hireLine: "" };
    const id = this.nextId("unit");
    const profile = randomRecruitProfile();
    const arch = pickRecruitArchetype();
    const stats = rollRecruitStats(arch);
    const weapon =
      arch.weaponHint === "pipe"
        ? "pipe"
        : arch.weaponHint === "switchblade"
          ? "switchblade"
          : "pistol";
    const ownedWeapons = new Set(STARTER_WEAPONS);
    ownedWeapons.add(weapon);
    const nextCount = this.goons(posse).length + 1;
    const slot = this.circleSlot(leader.x, leader.y, nextCount - 1, nextCount, this.formationRadius(nextCount));
    const goon: Unit = {
      id,
      name: profile.name,
      kind: "goon",
      ownerId: session.characterId,
      posseId: posse.id,
      x: slot.x,
      y: slot.y,
      tx: slot.x,
      ty: slot.y,
      path: [],
      stuckTicks: 0,
      dirX: 0,
      dirY: 0,
      moveMode: "idle",
      health: stats.maxHealth,
      stats: defaultStats(stats),
      weapon,
      armor: "none",
      facing: leader.facing,
      alive: true,
      fireCd: 0,
      isPlayerLeader: false,
      incapacitated: false,
      gender: profile.gender,
      ownedWeapons,
      ownedArmors: new Set(["none"]),
      weaponAmmo: ammoMapForWeapons(ownedWeapons),
      aiWanderT: 0,
      buildingId: posse.insideBuildingId,
      lastHitByPosseId: null,
    };
    this.units.set(id, goon);
    posse.memberIds.push(id);
    // Re-space full circle so the boss stays centered
    this.assignCircleFormation(posse, leader.x, leader.y, { moveBoss: false });
    return { name: profile.name, archetypeLabel: arch.label, hireLine: arch.hireLine };
  }

  /**
   * Convert a world NPC into a player goon and remove them as an independent NPC.
   * (They leave the bar stool / corner — can respawn later as content.)
   */
  private recruitNpcAsGoon(session: CharacterSession, posse: Posse, npc: Unit): string {
    const leader = this.leader(posse);
    const oldPosseId = npc.posseId;
    const oldPosse = this.posses.get(oldPosseId);

    // Detach from NPC posse / world role
    if (oldPosse && oldPosse.id !== posse.id) {
      oldPosse.memberIds = oldPosse.memberIds.filter((id) => id !== npc.id);
      if (oldPosse.memberIds.length === 0) {
        this.posses.delete(oldPosseId);
      }
    }

    npc.kind = "goon";
    npc.ownerId = session.characterId;
    npc.posseId = posse.id;
    npc.isPlayerLeader = false;
    npc.incapacitated = false;
    if (!npc.gender) npc.gender = "male";
    npc.alive = true;
    npc.health = Math.max(npc.health, npc.stats.maxHealth * 0.8);
    npc.weapon = "pistol";
    npc.armor = npc.armor === "none" ? "none" : npc.armor;
    npc.ownedWeapons = new Set(STARTER_WEAPONS);
    npc.ownedArmors = new Set(["none", ...(npc.armor !== "none" ? [npc.armor] : [])]);
    npc.weaponAmmo = ammoMapForWeapons(npc.ownedWeapons);
    npc.buildingId = posse.insideBuildingId;
    npc.moveMode = "idle";
    npc.dirX = 0;
    npc.dirY = 0;
    npc.lastHitByPosseId = null;

    if (!posse.memberIds.includes(npc.id)) {
      posse.memberIds.push(npc.id);
    }

    // Slot onto the circle around the boss
    if (leader) {
      const goons = this.goons(posse);
      const idx = Math.max(0, goons.findIndex((g) => g.id === npc.id));
      const slot = this.circleSlot(
        leader.x,
        leader.y,
        idx >= 0 ? idx : goons.length - 1,
        Math.max(1, goons.length),
        this.formationRadius(goons.length),
      );
      npc.x = slot.x;
      npc.y = slot.y;
      npc.tx = slot.x;
      npc.ty = slot.y;
      npc.facing = leader.facing;
      this.assignCircleFormation(posse, leader.x, leader.y, { moveBoss: false });
    }

    // Mark spawn used so they don't keep an ambient world slot (future: respawn timer)
    const spawn = this.map.npcSpawns.find((n) => n.id === npc.id);
    if (spawn) {
      // Soft-disable: park spawn far / mark via mutating role isn't ideal;
      // remove from active list so nothing re-queries them as ambient NPC
      const idx = this.map.npcSpawns.indexOf(spawn);
      if (idx >= 0) this.map.npcSpawns.splice(idx, 1);
    }

    return npc.name;
  }

  private resolveShopUnit(posse: Posse, unitId: string): Unit | undefined {
    let unit = this.units.get(unitId);
    if (unit && unit.posseId === posse.id && unit.alive) return unit;
    // Fallback to selected / leader so buys still work if UI unit id is stale
    unit = this.units.get(posse.selectedUnitId);
    if (unit && unit.posseId === posse.id && unit.alive) return unit;
    return this.leader(posse);
  }

  private cmdBuyWeapon(session: CharacterSession, posse: Posse, weaponId: WeaponId, unitId: string): void {
    if (!posse.shop) {
      this.log(session, "You're not in the shop.");
      return;
    }
    const unit = this.resolveShopUnit(posse, unitId);
    if (!unit) {
      this.log(session, "No crew member to buy for.");
      return;
    }
    const def = WEAPONS[weaponId];
    if (!def) return;
    if (!SHOP_WEAPON_ORDER.includes(weaponId)) return;
    if (unit.ownedWeapons.has(weaponId)) {
      unit.weapon = weaponId;
      this.log(session, `Equipped ${def.name} on ${unit.name}.`);
      return;
    }
    const needRep = def.minRep ?? 0;
    if (posse.rep < needRep) {
      this.log(session, `Need rep ${needRep} for ${def.name} (you have ${posse.rep}). Do more jobs.`);
      return;
    }
    const price = this.effectiveShopPrice(def.price, posse);
    if (price > 0 && posse.cash < price) {
      this.log(session, `Not enough cash (need $${price}${price !== def.price ? ` heat tax, list $${def.price}` : ""}).`);
      return;
    }
    if (price > 0) posse.cash -= price;
    unit.ownedWeapons.add(weaponId);
    unit.weapon = weaponId;
    grantWeaponAmmo(unit, weaponId);
    const ammoNote =
      !isUnlimitedAmmo(def) && def.maxAmmo != null
        ? ` · ${unit.weaponAmmo.get(weaponId) ?? 0}/${def.maxAmmo} rounds`
        : "";
    this.log(session, `Bought ${def.name} for ${unit.name} ($${price})${ammoNote}.`);
  }

  private cmdBuyAmmo(
    session: CharacterSession,
    posse: Posse,
    weaponId: WeaponId,
    unitId: string,
  ): void {
    if (!posse.shop) {
      this.log(session, "You're not in the shop.");
      return;
    }
    const unit = this.resolveShopUnit(posse, unitId);
    if (!unit) {
      this.log(session, "No crew member to buy for.");
      return;
    }
    const def = WEAPONS[weaponId];
    if (!def || isUnlimitedAmmo(def) || def.maxAmmo == null) {
      this.log(session, `${def?.name ?? "That iron"} never needs a refill.`);
      return;
    }
    if (!unit.ownedWeapons.has(weaponId)) {
      this.log(session, `${unit.name} doesn't own a ${def.name}.`);
      return;
    }
    const cur = unit.weaponAmmo.get(weaponId) ?? 0;
    if (cur >= def.maxAmmo) {
      this.log(session, `${unit.name}'s ${def.name} is already topped off (${cur}/${def.maxAmmo}).`);
      return;
    }
    const price = this.effectiveShopPrice(def.refillPrice, posse);
    if (price > 0 && posse.cash < price) {
      this.log(session, `Not enough cash for ammo (need $${price}).`);
      return;
    }
    if (price > 0) posse.cash -= price;
    unit.weaponAmmo.set(weaponId, def.maxAmmo);
    this.log(
      session,
      `Refilled ${def.name} for ${unit.name} → ${def.maxAmmo}/${def.maxAmmo} (−$${price}).`,
    );
  }

  private cmdBuyArmor(session: CharacterSession, posse: Posse, armorId: ArmorId, unitId: string): void {
    if (!posse.shop) {
      this.log(session, "You're not in the shop.");
      return;
    }
    const unit = this.resolveShopUnit(posse, unitId);
    if (!unit) {
      this.log(session, "No crew member to buy for.");
      return;
    }
    const def = ARMORS[armorId];
    if (!def) return;
    if (!SHOP_ARMOR_ORDER.includes(armorId)) return;
    if (unit.ownedArmors.has(armorId)) {
      unit.armor = armorId;
      this.log(session, `Equipped ${def.name} on ${unit.name}.`);
      return;
    }
    const needRep = def.minRep ?? 0;
    if (posse.rep < needRep) {
      this.log(session, `Need rep ${needRep} for ${def.name} (you have ${posse.rep}).`);
      return;
    }
    const price = this.effectiveShopPrice(def.price, posse);
    if (price > 0 && posse.cash < price) {
      this.log(session, `Not enough cash (need $${price}).`);
      return;
    }
    if (price > 0) posse.cash -= price;
    unit.ownedArmors.add(armorId);
    unit.armor = armorId;
    this.log(session, `Bought ${def.name} for ${unit.name} ($${price}).`);
  }

  private cmdBuyUpgrade(
    session: CharacterSession,
    posse: Posse,
    upgradeId: UpgradeId,
    unitId: string,
  ): void {
    if (!posse.shop) {
      this.log(session, "You're not in the shop.");
      return;
    }
    const unit = this.resolveShopUnit(posse, unitId);
    if (!unit) {
      this.log(session, "No crew member to buy for.");
      return;
    }
    const def = UPGRADES[upgradeId];
    if (!def || !SHOP_UPGRADE_ORDER.includes(upgradeId)) return;
    const needRep = def.minRep ?? 0;
    if (posse.rep < needRep) {
      this.log(session, `Need rep ${needRep} for ${def.name} (you have ${posse.rep}).`);
      return;
    }
    const price = this.effectiveShopPrice(def.price, posse);
    if (posse.cash < price) {
      this.log(session, `Not enough cash (need $${price}).`);
      return;
    }
    posse.cash -= price;
    if (def.stats) {
      for (const [k, v] of Object.entries(def.stats)) {
        const key = k as keyof UnitStats;
        unit.stats[key] = (unit.stats[key] ?? 0) + (v as number);
      }
      if (def.stats.maxHealth) {
        unit.health = Math.min(unit.stats.maxHealth, unit.health + (def.stats.maxHealth ?? 0));
      } else {
        unit.health = Math.min(unit.stats.maxHealth, unit.health);
      }
      const role = streetRole(unit.stats);
      this.log(
        session,
        `${unit.name}: ${def.name} (−$${price}) → ${role.label} · A${unit.stats.aim} G${unit.stats.guts} M${unit.stats.muscle} S${unit.stats.speed}`,
      );
    } else if (def.heal) {
      unit.health = Math.min(unit.stats.maxHealth, unit.health + def.heal);
      if (!unit.alive && unit.health > 0) unit.alive = true;
      this.log(session, `${def.name} on ${unit.name} (−$${price}). HP ${Math.round(unit.health)}.`);
    } else {
      this.log(session, `Bought ${def.name} for ${unit.name} (−$${price}).`);
    }
  }

  private cmdSetWeapon(posse: Posse, unitId: string, weaponId: WeaponId): void {
    const unit = this.units.get(unitId);
    if (!unit || unit.posseId !== posse.id) return;
    if (!unit.ownedWeapons.has(weaponId)) return;
    unit.weapon = weaponId;
  }

  private cmdSetArmor(posse: Posse, unitId: string, armorId: ArmorId): void {
    const unit = this.units.get(unitId);
    if (!unit || unit.posseId !== posse.id) return;
    if (!unit.ownedArmors.has(armorId)) return;
    unit.armor = armorId;
  }

  private sessionForPosse(posseId: string): CharacterSession | undefined {
    for (const s of this.sessions.values()) {
      if (s.posseId === posseId) return s;
    }
    return undefined;
  }

  private partyPublic(posse: Posse): PartyState | null {
    if (!posse.partyId) return null;
    const party = this.parties.get(posse.partyId);
    if (!party) return null;
    const members = party.memberPosseIds
      .map((mid) => {
        const p = this.posses.get(mid);
        const sess = this.sessionForPosse(mid);
        if (!p || !sess) return null;
        const defTitle = p.mission ? MISSIONS[p.mission.defId]?.title : undefined;
        return {
          posseId: mid,
          name: sess.name,
          isLeader: mid === party.leaderPosseId,
          ...(defTitle ? { missionTitle: defTitle } : {}),
        };
      })
      .filter((m): m is NonNullable<typeof m> => !!m);
    if (members.length === 0) return null;
    return {
      id: party.id,
      leaderPosseId: party.leaderPosseId,
      isLeader: party.leaderPosseId === posse.id,
      members,
    };
  }

  private presencePublic(selfPosse: Posse): PresenceEntry[] {
    const out: PresenceEntry[] = [];
    for (const s of this.sessions.values()) {
      if (!s.conn) continue;
      const p = this.posses.get(s.posseId);
      if (!p?.isPlayer) continue;
      const lead = this.leader(p);
      let where = "Streets";
      if (p.insideBuildingId) {
        if (p.insideBuildingId.startsWith("mi_")) where = "On a job";
        else {
          const b = this.map.buildings.find((bb) => bb.id === p.insideBuildingId);
          where = b?.name ?? "Inside";
        }
      } else if (lead) {
        where = districtAt(lead.x, lead.y).short || districtAt(lead.x, lead.y).name;
      }
      out.push({
        posseId: p.id,
        name: s.name,
        where,
        inParty: !!p.partyId,
        isSelf: p.id === selfPosse.id,
      });
    }
    out.sort((a, b) => {
      if (a.isSelf && !b.isSelf) return -1;
      if (!a.isSelf && b.isSelf) return 1;
      return a.name.localeCompare(b.name);
    });
    return out;
  }

  private ensureParty(posse: Posse): PlayerParty {
    if (posse.partyId) {
      const existing = this.parties.get(posse.partyId);
      if (existing) return existing;
    }
    const id = this.nextId("party");
    const party: PlayerParty = {
      id,
      leaderPosseId: posse.id,
      memberPosseIds: [posse.id],
    };
    this.parties.set(id, party);
    posse.partyId = id;
    return party;
  }

  private leavePartyInternal(posse: Posse, announce: boolean): void {
    const partyId = posse.partyId;
    if (!partyId) {
      posse.pendingInvite = null;
      return;
    }
    const party = this.parties.get(partyId);
    posse.partyId = null;
    posse.pendingInvite = null;
    if (!party) return;

    party.memberPosseIds = party.memberPosseIds.filter((id) => id !== posse.id);
    const sess = this.sessionForPosse(posse.id);

    if (party.memberPosseIds.length === 0) {
      this.parties.delete(partyId);
      if (announce && sess) this.log(sess, "Party dissolved.");
      return;
    }

    if (party.leaderPosseId === posse.id) {
      party.leaderPosseId = party.memberPosseIds[0]!;
      const newLead = this.sessionForPosse(party.leaderPosseId);
      if (newLead) this.log(newLead, "You're the new party leader.");
    }

    if (announce && sess) {
      this.log(sess, "Left the party.");
    }
    for (const mid of party.memberPosseIds) {
      const ms = this.sessionForPosse(mid);
      if (ms && sess) this.log(ms, `${sess.name} left the party.`);
    }

    // Solo leftover → dissolve (party of 1 is just solo)
    if (party.memberPosseIds.length < 2) {
      const lastId = party.memberPosseIds[0]!;
      const last = this.posses.get(lastId);
      if (last) last.partyId = null;
      this.parties.delete(partyId);
      const ls = this.sessionForPosse(lastId);
      if (ls) this.log(ls, "Party dissolved — you're solo again.");
    }
  }

  private cmdPartyInvite(session: CharacterSession, posse: Posse, targetName: string): void {
    const name = targetName.trim().slice(0, 20);
    if (!name) {
      this.log(session, "Invite who? Use a display name.");
      return;
    }
    if (name.toLowerCase() === session.name.toLowerCase()) {
      this.log(session, "You can't invite yourself. Lonely isn't a party.");
      return;
    }

    let targetSess: CharacterSession | null = null;
    for (const s of this.sessions.values()) {
      if (s.conn && s.name.toLowerCase() === name.toLowerCase()) {
        targetSess = s;
        break;
      }
    }
    if (!targetSess) {
      this.log(session, `Nobody online named "${name}" in this realm.`);
      return;
    }
    const target = this.posses.get(targetSess.posseId);
    if (!target?.isPlayer) {
      this.log(session, "Can't invite that.");
      return;
    }
    if (target.partyId && target.partyId === posse.partyId && posse.partyId) {
      this.log(session, "They're already in your party.");
      return;
    }
    if (target.partyId) {
      this.log(session, `${targetSess.name} is already in another party.`);
      return;
    }
    if (target.pendingInvite) {
      this.log(session, `${targetSess.name} already has a pending invite.`);
      return;
    }

    const party = this.ensureParty(posse);
    if (party.memberPosseIds.length >= PARTY_MAX) {
      this.log(session, `Party full (${PARTY_MAX}). Kick someone or get a bigger van.`);
      // If we just created a solo party for invite, clean it up
      if (party.memberPosseIds.length === 1 && party.memberPosseIds[0] === posse.id) {
        this.parties.delete(party.id);
        posse.partyId = null;
      }
      return;
    }

    target.pendingInvite = {
      fromPosseId: posse.id,
      fromName: session.name,
      partyId: party.id,
    };
    this.log(session, `Invite sent to ${targetSess.name}.`);
    this.log(targetSess, `${session.name} invited you to a party. Accept from the PARTY panel.`);
    targetSess.conn?.send({
      type: "notify",
      kind: "mission",
      title: "Party invite",
      body: `${session.name} wants you in their crew. Open PARTY to accept or decline.`,
    });
  }

  private cmdPartyAccept(session: CharacterSession, posse: Posse): void {
    const inv = posse.pendingInvite;
    if (!inv) {
      this.log(session, "No pending party invite.");
      return;
    }
    posse.pendingInvite = null;

    if (posse.partyId) {
      this.log(session, "Leave your current party first.");
      return;
    }

    const party = this.parties.get(inv.partyId);
    if (!party) {
      this.log(session, "That invite expired.");
      return;
    }
    // Inviter still online and leading / in party
    const leader = this.posses.get(party.leaderPosseId);
    if (!leader || leader.partyId !== party.id) {
      this.log(session, "That party is gone.");
      return;
    }
    if (party.memberPosseIds.length >= PARTY_MAX) {
      this.log(session, "Party filled up while you were thinking.");
      return;
    }
    if (party.memberPosseIds.includes(posse.id)) {
      this.log(session, "Already in that party.");
      return;
    }

    party.memberPosseIds.push(posse.id);
    posse.partyId = party.id;
    this.log(session, `Joined ${inv.fromName}'s party.`);
    for (const mid of party.memberPosseIds) {
      if (mid === posse.id) continue;
      const ms = this.sessionForPosse(mid);
      if (ms) this.log(ms, `${session.name} joined the party.`);
    }
    this.pushChat(null, `${session.name} joined ${inv.fromName}'s party.`, true);
  }

  private cmdPartyDecline(session: CharacterSession, posse: Posse): void {
    const inv = posse.pendingInvite;
    if (!inv) {
      this.log(session, "No pending invite.");
      return;
    }
    posse.pendingInvite = null;
    this.log(session, `Declined ${inv.fromName}'s party invite.`);
    const from = this.sessionForPosse(inv.fromPosseId);
    if (from) this.log(from, `${session.name} declined your party invite.`);
    // Dissolve solo stub party if inviter is alone
    const party = this.parties.get(inv.partyId);
    if (party && party.memberPosseIds.length === 1) {
      const only = this.posses.get(party.memberPosseIds[0]!);
      if (only) only.partyId = null;
      this.parties.delete(party.id);
    }
  }

  private cmdPartyLeave(session: CharacterSession, posse: Posse): void {
    if (!posse.partyId) {
      this.log(session, "You're not in a party.");
      return;
    }
    this.leavePartyInternal(posse, true);
  }

  private cmdPartyKick(session: CharacterSession, posse: Posse, targetPosseId: string): void {
    if (!posse.partyId) {
      this.log(session, "Not in a party.");
      return;
    }
    const party = this.parties.get(posse.partyId);
    if (!party || party.leaderPosseId !== posse.id) {
      this.log(session, "Only the party leader can kick.");
      return;
    }
    if (targetPosseId === posse.id) {
      this.log(session, "Use leave if you want out.");
      return;
    }
    if (!party.memberPosseIds.includes(targetPosseId)) {
      this.log(session, "They're not in your party.");
      return;
    }
    const target = this.posses.get(targetPosseId);
    if (!target) return;
    const targetSess = this.sessionForPosse(targetPosseId);
    this.leavePartyInternal(target, false);
    if (targetSess) {
      this.log(targetSess, `${session.name} kicked you from the party.`);
    }
    this.log(session, targetSess ? `Kicked ${targetSess.name}.` : "Kicked.");
    for (const mid of party.memberPosseIds) {
      const ms = this.sessionForPosse(mid);
      if (ms && targetSess) this.log(ms, `${targetSess.name} was kicked from the party.`);
    }
  }

  private cmdChat(
    session: CharacterSession,
    posse: Posse,
    text: string,
    channel?: "proximity" | "party",
  ): void {
    let clean = text.trim().slice(0, MAX_CHAT_LEN);
    if (!clean) return;
    // `/p ` or `/party ` prefix forces party channel
    let ch: "proximity" | "party" = channel === "party" ? "party" : "proximity";
    const lower = clean.toLowerCase();
    if (lower.startsWith("/p ") || lower.startsWith("/party ")) {
      ch = "party";
      clean = clean.replace(/^\/(p|party)\s+/i, "").trim().slice(0, MAX_CHAT_LEN);
      if (!clean) return;
    }
    const leader = this.leader(posse);
    if (!leader) return;
    if (ch === "party") {
      if (!posse.partyId) {
        this.log(session, "Not in a party. Invite someone first (or drop /p).");
        return;
      }
      this.pushChat(session.name, clean, false, leader.x, leader.y, "party", posse.partyId);
      return;
    }
    this.pushChat(session.name, clean, false, leader.x, leader.y, "proximity");
  }

  private pushChat(
    from: string | null,
    text: string,
    system: boolean,
    x?: number,
    y?: number,
    channel: "proximity" | "party" = "proximity",
    partyId?: string | null,
  ): void {
    this.chatSeq += 1;
    const line: ChatLine = {
      id: `c${this.chatSeq}`,
      from: from ?? "City",
      text: channel === "party" && !system ? `[P] ${text}` : text,
      t: Date.now(),
      system,
      ...(system ? {} : { channel }),
    };
    this.chat.push(line);
    if (this.chat.length > 100) this.chat.shift();

    for (const s of this.sessions.values()) {
      if (!s.conn) continue;
      const p = this.posses.get(s.posseId);
      const leader = p ? this.leader(p) : null;
      if (!leader) continue;
      if (system) {
        s.conn.send({ type: "chat", line });
        continue;
      }
      if (channel === "party") {
        if (partyId && p?.partyId === partyId) {
          s.conn.send({ type: "chat", line });
        }
        continue;
      }
      if (x === undefined || y === undefined) continue;
      if (dist(leader.x, leader.y, x, y) <= CHAT_RANGE) {
        s.conn.send({ type: "chat", line });
      }
    }
  }

  private log(session: CharacterSession, text: string): void {
    session.combatLog.push(text);
    if (session.combatLog.length > 40) session.combatLog.shift();
    session.conn?.send({ type: "event", text });
  }

  /**
   * Combat-log helper that drops repeats within `cooldownSec` (default 5s).
   * Used for safe-zone holster spam, dry-ammo nag, assassinate re-clicks, etc.
   */
  private logThrottled(
    session: CharacterSession,
    key: string,
    text: string,
    cooldownSec = 5,
  ): boolean {
    const id = `${session.posseId}:${key}`;
    const last = this.logThrottleAt.get(id) ?? 0;
    if (this.tick - last < TICK_HZ * cooldownSec) return false;
    this.logThrottleAt.set(id, this.tick);
    this.log(session, text);
    return true;
  }

  private addHeat(posse: Posse, amount: number, session?: CharacterSession, reason?: string): void {
    if (!posse.isPlayer || amount <= 0) return;
    const before = posse.heat;
    posse.heat = Math.min(HEAT.max, posse.heat + amount);
    if (session && Math.floor(posse.heat) > Math.floor(before)) {
      const msg = reason
        ? `HEAT +${Math.round(amount)} (${reason}) → ${Math.round(posse.heat)}`
        : `HEAT +${Math.round(amount)} → ${Math.round(posse.heat)}`;
      // Only log meaningful jumps (≥3) to avoid spam
      if (amount >= 3) this.log(session, msg);
    }
  }

  private decayHeat(dt: number): void {
    for (const posse of this.posses.values()) {
      if (!posse.isPlayer || posse.heat <= 0) continue;
      // Slow decay while actively fighting
      if (posse.hostile && posse.combatUntil > this.tick) continue;
      let rate = HEAT.decayPerSec;
      if (posse.heat >= HEAT.decaySlowAbove) rate *= HEAT.decaySlowFactor;
      // Bar / interiors cool slightly faster (laying low ambient)
      if (posse.insideBuildingId && !posse.insideBuildingId.startsWith("mi_")) {
        rate *= 1.35;
      }
      posse.heat = Math.max(0, posse.heat - rate * dt);
    }
  }

  private effectiveShopPrice(base: number, posse: Posse): number {
    return shopPrice(base, posse.heat);
  }

  step(dt: number): void {
    this.tick += 1;
    const now = this.tick;

    // Street heat cools off over time
    this.decayHeat(dt);

    // Active job progress (hold timers, complete checks)
    this.updateMissions(dt);

    // Movement (free dir OR click target — sub-tile continuous)
    for (const u of this.units.values()) {
      if (!u.alive) continue;
      if (u.fireCd > 0) u.fireCd = Math.max(0, u.fireCd - dt);

      // Downed boss: crawl slowly if forced to move with formation, no free sprint
      // Speed stat drives move rate (shared formula)
      const baseSpeed = moveSpeedTilesPerSec(u.stats.speed);
      const speed = u.incapacitated ? baseSpeed * 0.35 : baseSpeed;
      const posse = this.posses.get(u.posseId);
      const bid = posse?.insideBuildingId ?? u.buildingId;

      if (u.incapacitated && u.moveMode === "dir") {
        // Boss can be dragged with the crew but not free-run alone
        u.moveMode = "idle";
        u.dirX = 0;
        u.dirY = 0;
      }

      if (u.moveMode === "dir" && (u.dirX !== 0 || u.dirY !== 0)) {
        const step = speed * dt;
        const nx = u.x + u.dirX * step;
        const ny = u.y + u.dirY * step;
        this.tryMoveUnit(u, nx, ny, bid);
        u.facing = facingFromDelta(u.dirX, u.dirY);
        u.tx = u.x;
        u.ty = u.y;
        u.path = [];
        continue;
      }

      if (u.moveMode !== "target") continue;

      // Follow next A* waypoint, else final tx/ty
      while (u.path.length > 0) {
        const wp = u.path[0]!;
        if (Math.hypot(wp.x - u.x, wp.y - u.y) < 0.28) {
          u.path.shift();
          continue;
        }
        break;
      }

      const chase = u.path.length > 0 ? u.path[0]! : { x: u.tx, y: u.ty };
      const dx = chase.x - u.x;
      const dy = chase.y - u.y;
      const d = Math.hypot(dx, dy);
      const finalD = Math.hypot(u.tx - u.x, u.ty - u.y);

      if (d > 0.04) {
        const step = Math.min(d, speed * dt);
        const nx = u.x + (dx / d) * step;
        const ny = u.y + (dy / d) * step;
        const ox = u.x;
        const oy = u.y;
        const moved = this.tryMoveUnit(u, nx, ny, bid);
        const progressed = Math.hypot(u.x - ox, u.y - oy) > 1e-5;

        if (progressed) {
          u.stuckTicks = 0;
        } else {
          u.stuckTicks += 1;
        }

        if (!moved || !progressed) {
          // Only abandon if basically on final target
          if (finalD < 0.4) {
            this.parkUnit(u);
          } else {
            // Nudge final goal onto walkable ground (shell / indoor edge)
            if (!this.canWalk(u.tx, u.ty, bid)) {
              const alt = this.nearestWalkableNear(u.tx, u.ty, bid, 8);
              if (alt) {
                u.tx = alt.x;
                u.ty = alt.y;
              }
            }
            // Stuck recovery: repath around façades / indoor walls (~0.3s)
            if (u.stuckTicks >= 8 && u.stuckTicks % 8 === 0) {
              const fresh = this.findPathPoints(u.x, u.y, u.tx, u.ty, bid);
              if (fresh.length > 0) {
                u.path = fresh;
              } else if (u.path.length > 0) {
                // Skip jammed waypoint and try the next
                u.path.shift();
              }
            }
            // Hard stuck against wall — escape step outdoor or indoor, then repath
            if (u.stuckTicks > 45) {
              const escape = this.nearestWalkableNear(
                u.x + dx * 0.5,
                u.y + dy * 0.5,
                bid,
                5,
              );
              if (escape && Math.hypot(escape.x - u.x, escape.y - u.y) > 0.3) {
                const rest = this.findPathPoints(escape.x, escape.y, u.tx, u.ty, bid);
                u.path = [{ x: escape.x, y: escape.y }, ...rest];
                u.stuckTicks = 0;
              } else if (
                !this.canWalk(u.x + 0.2, u.y, bid) &&
                !this.canWalk(u.x - 0.2, u.y, bid) &&
                !this.canWalk(u.x, u.y + 0.2, bid) &&
                !this.canWalk(u.x, u.y - 0.2, bid)
              ) {
                this.parkUnit(u);
              }
            }
          }
        }
        u.facing = facingFromDelta(dx, dy);
      } else if (u.path.length === 0 && finalD <= 0.04) {
        this.parkUnit(u);
      } else if (u.path.length > 0) {
        u.path.shift();
      } else {
        this.parkUnit(u);
      }
    }

    // Escort circle while boss free-moves
    this.updateEscortFormations();

    // Player attack-move / continuous engage (front-line shield)
    this.updateAttackOrders();

    // AI posse behavior
    for (const posse of this.posses.values()) {
      if (posse.isPlayer) continue;
      if (posse.memberIds.every((id) => !this.units.get(id)?.alive)) {
        if (posse.id.startsWith("mi_enemy_")) {
          // Instance hostiles stay dead until despawned with the job
          continue;
        }
        if (posse.respawnT !== undefined) {
          posse.respawnT -= 1;
          if (posse.respawnT <= 0) {
            for (const id of posse.memberIds) this.units.delete(id);
            const respawnId = posse.id;
            const respawnName = posse.name;
            const respawnColor = posse.color;
            const respawnAggression = posse.aggression;
            const respawnThreat = posse.threat || 1;
            const mapSpawn = this.map.aiPosseSpawns.find((s) => s.id === respawnId);
            this.posses.delete(posse.id);
            this.spawnAiPosse(
              respawnId,
              respawnName,
              mapSpawn?.x ?? 10 + Math.random() * 20,
              mapSpawn?.y ?? 10 + Math.random() * 15,
              respawnColor,
              respawnAggression,
              mapSpawn?.threat ?? respawnThreat,
            );
          }
        }
        continue;
      }

      const leader = this.leader(posse);
      if (!leader || !leader.alive) continue;

      // AI only fights in the war zone — never aggro in safe downtown
      // (mission instance layers are not safe — see unitInSafeZone)
      if (this.unitInSafeZone(leader)) {
        posse.hostile = false;
        continue;
      }

      // Find nearest player posse (same layer; outdoor war zone or mission instance)
      let nearestPlayer: Posse | null = null;
      let nearestD = Infinity;
      for (const p of this.posses.values()) {
        if (!p.isPlayer) continue;
        // Same layer only (outdoor null, or shared mission instance id)
        if ((p.insideBuildingId ?? null) !== (posse.insideBuildingId ?? null)) continue;
        // Hub interiors (non-mission) — no AI murder
        if (p.insideBuildingId && !p.insideBuildingId.startsWith("mi_")) continue;
        const pl = this.leader(p);
        if (!pl || !pl.alive) continue;
        if (this.unitInSafeZone(pl)) continue;
        const d = dist(leader.x, leader.y, pl.x, pl.y);
        if (d < nearestD) {
          nearestD = d;
          nearestPlayer = p;
        }
      }

      if (posse.combatUntil < now) posse.hostile = false;

      const detectR = posse.detectRange || POSSE_DETECT_RANGE;
      const aggroR = posse.aggroRange || POSSE_AGGRO_RANGE;
      if (nearestPlayer && nearestD < detectR) {
        if (now - posse.lastAggroCheck > TICK_HZ * 2) {
          posse.lastAggroCheck = now;
          if (!posse.hostile && nearestD < aggroR) {
            if (Math.random() < FIGHT_CHANCE * posse.aggression + 0.15) {
              posse.hostile = true;
              posse.combatUntil = now + TICK_HZ * 15;
              nearestPlayer.hostile = true;
              nearestPlayer.combatUntil = now + TICK_HZ * 15;
              const s = [...this.sessions.values()].find((ss) => ss.posseId === nearestPlayer!.id);
              if (s) {
                const roles = this.members(posse)
                  .filter((u) => u.alive && u.aiRole)
                  .map((u) => u.aiRole!);
                const mix = roles.length
                  ? ` (${[...new Set(roles)].join(" / ")})`
                  : "";
                const flavor = posse.gangBlurb ? ` — ${posse.gangBlurb}` : "";
                this.log(s, `${posse.name}${flavor} wants a piece of you!${mix}`);
              }
            } else {
              const s = [...this.sessions.values()].find((ss) => ss.posseId === nearestPlayer!.id);
              if (s && Math.random() < 0.4) {
                const flavor = posse.gangBlurb ? ` (${posse.gangBlurb})` : "";
                this.log(s, `${posse.name} sizes you up${flavor}... and keeps walking.`);
              }
            }
          }
        }
      }

      if (posse.hostile && nearestPlayer) {
        const pl = this.leader(nearestPlayer);
        if (pl) {
          // Role-based AI: rushers charge, shooters hold band, cowards kite/flee
          this.assignAiRoleCombat(posse, pl.x, pl.y);
          for (const u of this.members(posse)) {
            if (u.incapacitated) continue;
            const best = this.pickBestFireTarget(u, nearestPlayer.memberIds);
            if (best) this.resolveShot(u, best);
          }
          // Player posse auto-return fire if hostile (keep own front if attacking, else circle fire)
          if (!nearestPlayer.attackTargetId) {
            this.assignFrontFormation(nearestPlayer, leader.x, leader.y);
          }
          for (const id of nearestPlayer.memberIds) {
            const u = this.units.get(id);
            if (!u || !u.alive) continue;
            const best = this.pickBestFireTarget(u, posse.memberIds);
            if (best) this.resolveShot(u, best);
          }
        }
      } else {
        // Wander: boss drifts; bodyguards keep circle around him
        leader.aiWanderT -= dt;
        if (leader.aiWanderT <= 0) {
          leader.aiWanderT = 2.5 + Math.random() * 4;
          const ang = Math.random() * Math.PI * 2;
          const rad = 1.2 + Math.random() * 3.5;
          const tx = clamp(leader.x + Math.cos(ang) * rad, 1, this.map.width - 2);
          const ty = clamp(leader.y + Math.sin(ang) * rad, 1, this.map.height - 2);
          if (this.canWalk(tx, ty, null)) {
            this.assignCircleFormation(posse, tx, ty, { moveBoss: true });
          } else {
            this.assignCircleFormation(posse, leader.x, leader.y, { moveBoss: false });
          }
        } else {
          // Soft maintain circle while idle-wandering
          if (leader.moveMode === "idle" || dist(leader.x, leader.y, leader.tx, leader.ty) < 0.2) {
            this.assignCircleFormation(posse, leader.x, leader.y, { moveBoss: false });
          }
        }
      }
    }

    // Player leader respawn → Crash Pad (safehouse interior)
    for (const u of this.units.values()) {
      if (u.kind !== "player" || u.alive) continue;
      if (u.respawnT === undefined) u.respawnT = RESPAWN_DELAY_SEC;
      u.respawnT -= dt;
      if (u.respawnT > 0) continue;

      u.alive = true;
      u.health = u.stats.maxHealth * 0.6;
      u.incapacitated = false;
      u.fireCd = 0.5;
      u.lastHitByPosseId = null;
      u.moveMode = "idle";
      u.dirX = 0;
      u.dirY = 0;
      delete u.respawnT;

      const posse = this.posses.get(u.posseId);
      if (posse) {
        posse.hostile = false;
        posse.dialogue = null;
        posse.shop = null;
        posse.stashOpen = false;
        posse.jobBoard = null;
        posse.lastKillerPosseId = null;
        posse.lootedThisWipe = false;
        this.purgeDeadGoons(posse);
        posse.selectedUnitId = u.id;

        const crash =
          this.map.buildings.find((b) => b.id === "safehouse") ??
          this.map.buildings.find((b) => b.kind === "safehouse");
        if (crash) {
          // Place leader + remaining goons inside Crash Pad
          this.enterBuilding(posse, crash.id);
          posse.stashOpen = true; // open stash so they can re-gear
          const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
          if (session) {
            this.log(
              session,
              `Back at the Crash Pad. Pocket was cleaned — stash still has $${posse.stashCash}. Press E to close/open the stash.`,
            );
          }
        } else {
          const spawn = this.pickQuietRespawn(u.posseId);
          u.x = spawn.x;
          u.y = spawn.y;
          u.tx = u.x;
          u.ty = u.y;
          u.buildingId = null;
          posse.insideBuildingId = null;
          let i = 0;
          for (const mid of posse.memberIds) {
            const m = this.units.get(mid);
            if (!m || m.id === u.id || !m.alive) continue;
            m.buildingId = null;
            m.x = spawn.x + (i % 2 === 0 ? -0.6 : 0.6);
            m.y = spawn.y + (i >= 2 ? 0.5 : -0.3);
            m.tx = m.x;
            m.ty = m.y;
            m.moveMode = "idle";
            i++;
          }
          const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
          if (session) this.log(session, "Back on the street. Try a quieter block this time.");
        }
      }
    }

    // Soft district locks (rep-gated deep war / docks / neon)
    this.enforceDistrictAccess();

    // Broadcast snapshots (include this tick's combat FX, then clear)
    if (this.tick % 1 === 0) {
      const fxBatch = this.combatFx.length ? [...this.combatFx] : undefined;
      this.combatFx = [];
      for (const s of this.sessions.values()) {
        if (!s.conn) continue;
        s.conn.send({ type: "snapshot", data: this.buildSnapshot(s, fxBatch) });
      }
    }
  }

  private buildSnapshot(session: CharacterSession, fxBatch?: CombatFxEvent[]): WorldSnapshot {
    const posse = this.posses.get(session.posseId)!;
    const needMap =
      session.lastMapRevision !== this.mapRevision ||
      session.lastInside !== posse.insideBuildingId;
    session.lastMapRevision = this.mapRevision;
    session.lastInside = posse.insideBuildingId;

    let floors: WorldSnapshot["floors"];
    let blocked: WorldSnapshot["blocked"];
    if (needMap) {
      floors = [];
      blocked = [];
      for (let y = 0; y < this.map.height; y++) {
        for (let x = 0; x < this.map.width; x++) {
          const t = this.map.tiles[y]![x]!;
          if (t === "wall" || t === "void") blocked.push({ x, y, type: t });
          else floors.push({ x, y, type: t });
        }
      }
    }

    const units: UnitPublic[] = [];
    for (const u of this.units.values()) {
      // Hide units in other interiors
      const up = this.posses.get(u.posseId);
      const ub = up?.insideBuildingId ?? u.buildingId;
      if (ub !== posse.insideBuildingId) {
        // still show if both outside
        if (!(ub === null && posse.insideBuildingId === null)) continue;
      }
      // Skip dead non-leaders entirely (corpses are cleaned up; don't list as DOWN)
      if (!u.alive && !u.isPlayerLeader && u.kind !== "player") continue;

      const pub: UnitPublic = {
        id: u.id,
        name: u.name,
        kind: u.kind,
        ownerId: u.ownerId,
        posseId: u.posseId,
        x: u.x,
        y: u.y,
        health: u.health,
        maxHealth: u.stats.maxHealth,
        weapon: u.weapon,
        armor: u.armor,
        stats: { ...u.stats },
        facing: u.facing,
        alive: u.alive,
        isPlayerLeader: u.isPlayerLeader,
        incapacitated: u.incapacitated || undefined,
        gender: u.gender,
      };
      if (u.npcRole) pub.npcRole = u.npcRole;
      if (u.dancerKey) {
        pub.dancerKey = u.dancerKey;
        pub.revealStage = posse.dancerStages[u.id] ?? 0;
      }
      if (u.aiRole) pub.aiRole = u.aiRole;
      if (u.posseId === posse.id) {
        pub.ownedWeapons = [...u.ownedWeapons];
        pub.ownedArmors = [...u.ownedArmors];
        if (u.weaponAmmo.size > 0) {
          const ammo: Partial<Record<WeaponId, number>> = {};
          for (const [wid, n] of u.weaponAmmo) ammo[wid] = n;
          pub.weaponAmmo = ammo;
        }
      }
      units.push(pub);
    }

    return {
      tick: this.tick,
      dayPhase: dayPhaseFromTick(this.tick),
      weather: weatherFromTick(this.tick),
      you: {
        characterId: session.characterId,
        posseId: session.posseId,
        cash: posse.cash,
        rep: posse.rep,
        heat: Math.round(posse.heat),
        selectedUnitId: posse.selectedUnitId,
        insideBuildingId: posse.insideBuildingId,
        stashCash: posse.stashCash,
        realmId: this.realmId,
        realmLabel: realmLabel(this.realmId),
        partyId: posse.partyId,
        respawnIn: (() => {
          const lead = this.leader(posse);
          if (!lead || lead.alive) return null;
          return Math.max(0, lead.respawnT ?? RESPAWN_DELAY_SEC);
        })(),
        ...(() => {
          const a = this.computeAction(posse);
          const lead = this.leader(posse);
          const safe = lead ? this.unitInSafeZone(lead) : true;
          let districtId = "interior";
          let districtName = "Interior";
          let districtUnlocked = true;
          if (posse.insideBuildingId) {
            if (posse.insideBuildingId.startsWith("mi_")) {
              districtId = "mission";
              districtName = "Job Instance";
            } else {
              const b = this.map.buildings.find((bb) => bb.id === posse.insideBuildingId);
              districtId = posse.insideBuildingId;
              districtName = b?.name ?? "Interior";
            }
          } else if (lead) {
            const d = districtAt(lead.x, lead.y);
            districtId = d.id;
            districtName = d.name;
            districtUnlocked = isDistrictUnlocked(d, posse.rep);
          }
          return {
            action: a.action,
            actionDetail: a.actionDetail,
            inSafeZone: safe,
            districtId,
            districtName,
            districtUnlocked,
          };
        })(),
      },
      districts: this.districtsPublic(posse.rep),
      units,
      posses: [...this.posses.values()]
        .filter((p) => {
          // filter by same "layer"
          if (p.isPlayer && p.id === posse.id) return true;
          if (posse.insideBuildingId) return p.insideBuildingId === posse.insideBuildingId;
          return !p.insideBuildingId || p.isPlayer;
        })
        .map((p) => ({
          id: p.id,
          name: p.name,
          leaderId: p.leaderId,
          isPlayer: p.isPlayer,
          hostile: p.hostile,
          cash: p.isPlayer && p.id === posse.id ? p.cash : undefined,
          color: p.color,
        })),
      buildings: (() => {
        const list = this.map.buildings.map((b) => this.buildingPublicFromDef(b));
        // Private mission layer: clone warehouse (etc.) under mi_* id so client renders interior
        if (posse.insideBuildingId?.startsWith("mi_") && posse.mission?.templateBuildingId) {
          const tmpl = this.map.buildings.find((b) => b.id === posse.mission!.templateBuildingId);
          if (tmpl) {
            list.push(this.buildingPublicFromDef(tmpl, posse.insideBuildingId));
          }
        }
        return list;
      })(),
      props: posse.insideBuildingId
        ? []
        : this.map.props.map((p) => {
            const readyTick = this.propReadyAt.get(p.id) ?? 0;
            const readyIn =
              this.tick < readyTick
                ? Math.ceil((readyTick - this.tick) / TICK_HZ)
                : 0;
            return {
              id: p.id,
              kind: p.kind,
              x: p.x,
              y: p.y,
              label: p.label,
              ...(readyIn > 0 ? { readyIn } : {}),
            };
          }),
      mapWidth: this.map.width,
      mapHeight: this.map.height,
      mapRevision: this.mapRevision,
      ...(needMap ? { blocked, floors } : {}),
      dialogue: posse.dialogue,
      shop: posse.shop,
      stash: posse.stashOpen ? this.buildStashState(posse) : null,
      jobBoard: posse.jobBoard,
      mission: this.missionRuntime(posse),
      tutorial: this.tutorialPublic(posse),
      memorials: posse.memorials.slice(0, MAX_MEMORIALS),
      memorialOpen: posse.memorialOpen,
      party: this.partyPublic(posse),
      partyInvite: posse.pendingInvite,
      presence: this.presencePublic(posse),
      recentChat: this.chat.filter((c) => {
        if (c.system) return true;
        // approximate: last lines only for UI; proximity already filtered on send
        return true;
      }).slice(-30),
      combatLog: session.combatLog.slice(-12),
      ...(fxBatch && fxBatch.length
        ? {
            // Only send FX near the player's layer / outdoor proximity
            fx: fxBatch.filter((f) => {
              // Show combat FX outdoors; also when inside only if both ends near 0,0 interior
              const lead = this.leader(posse);
              if (!lead) return true;
              const mx = (f.x0 + f.x1) / 2;
              const my = (f.y0 + f.y1) / 2;
              return dist(lead.x, lead.y, mx, my) < 36;
            }),
          }
        : {}),
    };
  }

}
