import {
  ARMORS,
  CHAT_RANGE,
  COMBAT,
  DEFAULT_CASH,
  DEFAULT_HEALTH,
  FIGHT_CHANCE,
  INTERACT_RANGE,
  isSafeWorldPos,
  MAX_ACTIVE_GOONS,
  MAX_CHAT_LEN,
  MOVE_SPEED,
  POSSE_AGGRO_RANGE,
  POSSE_DETECT_RANGE,
  PROTOCOL_VERSION,
  RESPAWN_DELAY_SEC,
  SAFE_Y_MAX,
  SHOP_ARMOR_ORDER,
  SHOP_UPGRADE_ORDER,
  SHOP_WEAPON_ORDER,
  TICK_HZ,
  UPGRADES,
  WEAPONS,
  createSkidrowMap,
  type ArmorId,
  type ChatLine,
  type ClientMessage,
  type CombatFxEvent,
  type DialogueState,
  type ShopState,
  type UnitPublic,
  type UnitStats,
  type UpgradeId,
  type WeaponId,
  type WorldSnapshot,
} from "@loose-cannon/shared";
import { randomGoonName } from "./names.js";
import type { ClientConn } from "./net.js";

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
  ownedWeapons: Set<WeaponId>;
  ownedArmors: Set<ArmorId>;
  aiWanderT: number;
  buildingId: string | null;
  respawnT?: number;
  /** Posse that last damaged this unit (for wipe loot attribution) */
  lastHitByPosseId: string | null;
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
  color: number;
  aggression: number;
  lastAggroCheck: number;
  combatUntil: number;
  selectedUnitId: string;
  insideBuildingId: string | null;
  dialogue: DialogueState | null;
  shop: ShopState | null;
  memberIds: string[];
  respawnT?: number;
  /** Last posse that killed one of our members */
  lastKillerPosseId: string | null;
  /** Gear banked from goons who died before a full wipe */
  fallenWeapons: Set<WeaponId>;
  fallenArmors: Set<ArmorId>;
  /** Prevent double-looting the same wipe */
  lootedThisWipe: boolean;
  /** Right-click attack-move: chase & fire until target dies or orders change */
  attackTargetId: string | null;
  /** last click-move destination label */
  moveLabel: string | null;
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
  map = createSkidrowMap();
  tick = 0;
  units = new Map<string, Unit>();
  posses = new Map<string, Posse>();
  sessions = new Map<string, CharacterSession>();
  tokenToChar = new Map<string, string>();
  chat: ChatLine[] = [];
  chatSeq = 0;
  private uid = 0;
  mapRevision = 6;
  /** Prop interaction cooldowns: propId -> tick available */
  propReadyAt = new Map<string, number>();
  /** Combat VFX queued this tick, attached to snapshots then cleared */
  private combatFx: CombatFxEvent[] = [];

  constructor() {
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
        color: 0x888888,
        aggression: 0,
        lastAggroCheck: 0,
        combatUntil: 0,
        selectedUnitId: unitId,
        insideBuildingId: n.buildingId ?? null,
        dialogue: null,
        shop: null,
        memberIds: [unitId],
        lastKillerPosseId: null,
        fallenWeapons: new Set(),
        fallenArmors: new Set(),
        lootedThisWipe: false,
        attackTargetId: null,
        moveLabel: null,
      });
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
        ownedWeapons: new Set(["pipe"]),
        ownedArmors: new Set(["none"]),
        aiWanderT: 0,
        buildingId: n.buildingId ?? null,
        lastHitByPosseId: null,
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
    const leaderId = `${id}_boss`;
    const memberIds = [leaderId];
    const cash = 120 + threat * 80 + Math.floor(Math.random() * 100);
    this.posses.set(id, {
      id,
      name,
      leaderId,
      isPlayer: false,
      hostile: false,
      cash,
      rep: 0,
      color,
      aggression,
      lastAggroCheck: 0,
      combatUntil: 0,
      selectedUnitId: leaderId,
      insideBuildingId: null,
      dialogue: null,
      shop: null,
      memberIds,
      lastKillerPosseId: null,
      fallenWeapons: new Set(),
      fallenArmors: new Set(),
      lootedThisWipe: false,
      attackTargetId: null,
      moveLabel: null,
    });

    const gearFor = (t: number): { weapon: WeaponId; armor: ArmorId; weapons: WeaponId[]; armors: ArmorId[]; stats: Partial<UnitStats> } => {
      if (t >= 4) {
        return {
          weapon: "minigun",
          armor: "plate",
          weapons: ["pipe", "pistol", "uzi", "tommy", "shotgun", "minigun"],
          armors: ["none", "leather", "kevlar", "plate"],
          stats: { aim: 9, guts: 8, muscle: 8, speed: 7, maxHealth: 130 },
        };
      }
      if (t >= 3) {
        return {
          weapon: "shotgun",
          armor: "kevlar",
          weapons: ["pipe", "pistol", "uzi", "shotgun"],
          armors: ["none", "leather", "kevlar"],
          stats: { aim: 7, guts: 7, muscle: 7, speed: 6, maxHealth: 115 },
        };
      }
      if (t >= 2) {
        return {
          weapon: "uzi",
          armor: "leather",
          weapons: ["pipe", "pistol", "uzi"],
          armors: ["none", "leather"],
          stats: { aim: 6, guts: 6, muscle: 5, speed: 6, maxHealth: 105 },
        };
      }
      return {
        weapon: "pistol",
        armor: "none",
        weapons: ["pipe", "pistol"],
        armors: ["none"],
        stats: { aim: 4, guts: 5, muscle: 5, speed: 5, maxHealth: 100 },
      };
    };

    const make = (
      uid: string,
      uname: string,
      kind: Unit["kind"],
      ox: number,
      oy: number,
      t: number,
    ) => {
      const g = gearFor(t);
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
        dirX: 0,
        dirY: 0,
        moveMode: "idle",
        health: g.stats.maxHealth ?? DEFAULT_HEALTH,
        stats: defaultStats({
          aim: (g.stats.aim ?? 5) + Math.floor(Math.random() * 2),
          guts: (g.stats.guts ?? 5) + Math.floor(Math.random() * 2),
          muscle: (g.stats.muscle ?? 5) + Math.floor(Math.random() * 2),
          speed: (g.stats.speed ?? 5) + Math.floor(Math.random() * 2),
          maxHealth: g.stats.maxHealth ?? 100,
        }),
        weapon: g.weapon,
        armor: g.armor,
        facing: Math.floor(Math.random() * 8),
        alive: true,
        fireCd: 0,
        isPlayerLeader: false,
        incapacitated: false,
        ownedWeapons: new Set(g.weapons),
        ownedArmors: new Set(g.armors),
        aiWanderT: Math.random() * 3,
        buildingId: null,
        lastHitByPosseId: null,
      });
    };

    // Boss dead-center; goons on a protective circle
    make(leaderId, `${name} Boss`, "ai_boss", x, y, threat);
    const g1 = `${id}_g1`;
    const g2 = `${id}_g2`;
    const s0 = this.circleSlot(x, y, 0, 2, 1.05);
    const s1 = this.circleSlot(x, y, 1, 2, 1.05);
    make(g1, randomGoonName(), "ai_goon", s0.x, s0.y, Math.max(1, threat - 1));
    make(g2, randomGoonName(), "ai_goon", s1.x, s1.y, Math.max(1, threat - 1));
    memberIds.push(g1, g2);
    this.posses.get(id)!.memberIds = memberIds;
  }

  join(name: string, conn: ClientConn): { ok: true; characterId: string; posseId: string; token: string } | { ok: false; reason: string } {
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
        return { ok: true, characterId: s.characterId, posseId: s.posseId, token: s.token };
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
      color: 0xf0c040,
      aggression: 0.3,
      lastAggroCheck: 0,
      combatUntil: 0,
      selectedUnitId: leaderId,
      insideBuildingId: null,
      dialogue: null,
      shop: null,
      memberIds: [leaderId, goon1],
      lastKillerPosseId: null,
      fallenWeapons: new Set(),
      fallenArmors: new Set(),
      lootedThisWipe: false,
      attackTargetId: null,
      moveLabel: null,
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
      ownedWeapons: new Set(STARTER_WEAPONS),
      ownedArmors: new Set(["none"]),
      aiWanderT: 0,
      buildingId: null,
      lastHitByPosseId: null,
    });

    const starterSlot = this.circleSlot(spawn.x, spawn.y, 0, 1, 1.0);
    this.units.set(goon1, {
      id: goon1,
      name: randomGoonName(),
      kind: "goon",
      ownerId: characterId,
      posseId,
      x: starterSlot.x,
      y: starterSlot.y,
      tx: starterSlot.x,
      ty: starterSlot.y,
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
      ownedWeapons: new Set(STARTER_WEAPONS),
      ownedArmors: new Set(["none"]),
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

    this.pushChat(null, `${clean} hit the streets.`, true);
    return { ok: true, characterId, posseId, token };
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
      for (const id of posse.memberIds) this.units.delete(id);
      this.posses.delete(s.posseId);
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
        this.cmdMove(posse, msg.x, msg.y, msg.unitIds);
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
        this.cmdInteract(session, posse);
        break;
      case "intent.exit":
        this.cmdExitBuilding(posse);
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
      case "shop.close":
        posse.shop = null;
        break;
      case "posse.setWeapon":
        this.cmdSetWeapon(posse, msg.unitId, msg.weaponId);
        break;
      case "posse.setArmor":
        this.cmdSetArmor(posse, msg.unitId, msg.armorId);
        break;
      case "chat":
        this.cmdChat(session, posse, msg.text);
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

  /** Boss at center, goons in a protective circle. */
  private assignCircleFormation(
    posse: Posse,
    centerX: number,
    centerY: number,
    opts?: { moveBoss?: boolean; radius?: number },
  ): void {
    const leader = this.leader(posse);
    if (!leader?.alive) return;
    const goons = this.goons(posse);
    const c = this.clampWorld(centerX, centerY);
    const rad = opts?.radius ?? this.formationRadius(goons.length);
    const moveBoss = opts?.moveBoss !== false;

    if (moveBoss) {
      leader.moveMode = "target";
      leader.dirX = 0;
      leader.dirY = 0;
      leader.tx = c.x;
      leader.ty = c.y;
    }

    goons.forEach((u, i) => {
      const slot = this.circleSlot(c.x, c.y, i, goons.length, rad);
      const p = this.clampWorld(slot.x, slot.y);
      u.moveMode = "target";
      u.dirX = 0;
      u.dirY = 0;
      u.tx = p.x;
      u.ty = p.y;
    });
  }

  /**
   * Combat formation: goons form a front line facing the threat;
   * boss holds behind them (middle / rear).
   */
  private assignFrontFormation(posse: Posse, threatX: number, threatY: number): void {
    const leader = this.leader(posse);
    if (!leader?.alive) return;
    const goons = this.goons(posse);
    const dx = threatX - leader.x;
    const dy = threatY - leader.y;
    const d = Math.hypot(dx, dy) || 1;
    const fx = dx / d;
    const fy = dy / d;

    if (goons.length === 0) {
      // Solo boss — engage at weapon range
      const range = Math.max(1.1, WEAPONS[leader.weapon].range * 0.78);
      leader.moveMode = "target";
      leader.dirX = 0;
      leader.dirY = 0;
      if (d > range) {
        const p = this.clampWorld(threatX - fx * range * 0.92, threatY - fy * range * 0.92);
        leader.tx = p.x;
        leader.ty = p.y;
      } else {
        leader.moveMode = "idle";
        leader.tx = leader.x;
        leader.ty = leader.y;
      }
      return;
    }

    // Boss stays in the middle-rear; approach but don't lead the charge
    const bossHold = Math.max(2.05, Math.min(WEAPONS[leader.weapon].range * 0.55, 3.2));
    leader.moveMode = "target";
    leader.dirX = 0;
    leader.dirY = 0;
    if (d > bossHold + 0.35 || d < bossHold - 0.55) {
      const p = this.clampWorld(threatX - fx * bossHold, threatY - fy * bossHold);
      leader.tx = p.x;
      leader.ty = p.y;
    } else {
      leader.moveMode = "idle";
      leader.tx = leader.x;
      leader.ty = leader.y;
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
      const p = this.clampWorld(slot.x, slot.y);
      u.moveMode = "target";
      u.dirX = 0;
      u.dirY = 0;
      u.tx = p.x;
      u.ty = p.y;
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
      const b = this.map.buildings.find((bb) => bb.id === buildingId);
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

  private cmdMove(posse: Posse, x: number, y: number, _unitIds?: string[]): void {
    if (posse.dialogue || posse.shop) return;
    const leader = this.leader(posse);
    if (!leader || !leader.alive) return;
    posse.attackTargetId = null;
    posse.moveLabel = "GOING";
    // Boss walks to the click; bodyguards take circle slots around him
    const c = this.clampWorld(x, y);
    this.assignCircleFormation(posse, c.x, c.y, { moveBoss: true });
  }

  /** Continuous free movement in world axes (client sends screen-aligned vectors). */
  private cmdDir(posse: Posse, dx: number, dy: number): void {
    if (posse.dialogue || posse.shop) return;
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
      this.assignCircleFormation(posse, leader.x, leader.y, { moveBoss: false });
    } else {
      // Stop → settle into protective circle around boss
      if (!posse.attackTargetId) posse.moveLabel = null;
      leader.dirX = 0;
      leader.dirY = 0;
      this.assignCircleFormation(posse, leader.x, leader.y, { moveBoss: true });
      // Boss already at center — park him
      leader.moveMode = "idle";
      leader.tx = leader.x;
      leader.ty = leader.y;
    }
  }

  private cmdStop(posse: Posse): void {
    posse.attackTargetId = null;
    posse.moveLabel = null;
    const leader = this.leader(posse);
    if (leader?.alive) {
      this.assignCircleFormation(posse, leader.x, leader.y, { moveBoss: true });
      leader.moveMode = "idle";
      leader.dirX = 0;
      leader.dirY = 0;
      leader.tx = leader.x;
      leader.ty = leader.y;
    } else {
      for (const u of this.members(posse)) {
        u.moveMode = "idle";
        u.dirX = 0;
        u.dirY = 0;
        u.tx = u.x;
        u.ty = u.y;
      }
    }
  }

  private unitInSafeZone(u: Unit): boolean {
    const p = this.posses.get(u.posseId);
    const inside = p?.insideBuildingId ?? u.buildingId;
    return isSafeWorldPos(u.x, u.y, inside);
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
    if (this.canWalk(nx, u.y, bid)) {
      u.x = nx;
      moved = true;
    } else if (Math.abs(dx) > 0.001 && this.canWalk(nx, u.y + Math.sign(dy || 1) * 0.25, bid)) {
      u.x = nx;
      u.y += Math.sign(dy || 1) * 0.1;
      moved = true;
    }
    if (this.canWalk(u.x, ny, bid)) {
      u.y = ny;
      moved = true;
    } else if (Math.abs(dy) > 0.001 && this.canWalk(u.x + Math.sign(dx || 1) * 0.25, ny, bid)) {
      u.y = ny;
      u.x += Math.sign(dx || 1) * 0.1;
      moved = true;
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
    if (posse.dialogue || posse.shop) return;
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
      this.log(session, "SAFE ZONE — holster it. Take the fight south of the tracks.");
      return;
    }

    // Always commit attack-move: chase if needed, fire when in range
    if (!this.cmdAttackMove(posse, target)) return;
    const w = WEAPONS[shooter.weapon];
    const d = dist(shooter.x, shooter.y, target.x, target.y);
    if (d <= w.range + 0.35) {
      this.resolveShot(shooter, target, session);
    } else {
      this.log(session, `ASSASSINATE ${target.name} — closing in…`);
    }
  }

  private resolveShot(shooter: Unit, target: Unit, session?: CharacterSession): void {
    if (shooter.fireCd > 0 || !shooter.alive || !target.alive) return;
    // Downed boss cannot fight
    if (shooter.incapacitated) return;
    // No lethal combat in safe downtown
    if (this.unitInSafeZone(shooter) || this.unitInSafeZone(target)) return;
    const w = WEAPONS[shooter.weapon];
    const d = dist(shooter.x, shooter.y, target.x, target.y);
    if (d > w.range + 0.55) return;

    shooter.fireCd = w.fireCooldown;
    shooter.facing = facingFromDelta(target.x - shooter.x, target.y - shooter.y);

    // Always emit attack VFX so shots/swings are visible even on miss
    const weapon = shooter.weapon;
    const isMelee = weapon === "pipe" || weapon === "switchblade";
    const isFlame = weapon === "flamethrower";
    this.pushCombatFx({
      kind: isMelee ? "melee" : isFlame ? "flame" : "shot",
      x0: shooter.x,
      y0: shooter.y,
      x1: target.x,
      y1: target.y,
      weapon,
    });

    const isAi =
      shooter.kind === "ai_boss" || shooter.kind === "ai_goon" || shooter.kind === "npc";
    const aim = shooter.stats.aim;
    const muscle = shooter.stats.muscle;
    const guts = target.stats.guts;

    // Hit chance: aim dominates, guts dodges a bit, range hurts
    let hitChance =
      COMBAT.baseHit +
      aim * COMBAT.aimHitPerPoint -
      guts * COMBAT.gutsDodgePerPoint -
      d * COMBAT.rangeHitPenalty;
    if (isAi) hitChance -= COMBAT.aiHitPenalty;
    else hitChance += COMBAT.playerHitBonus;
    hitChance = clamp(hitChance, 0.1, 0.94);

    if (Math.random() > hitChance) {
      this.pushCombatFx({
        kind: "miss",
        x0: shooter.x,
        y0: shooter.y,
        x1: target.x + (Math.random() - 0.5) * 0.6,
        y1: target.y + (Math.random() - 0.5) * 0.6,
        weapon,
      });
      if (session && !isAi) this.log(session, `${shooter.name} missed ${target.name}.`);
      return;
    }

    // Damage: weapon base × (aim + muscle power) × variance × optional crit − armor
    const power =
      1 + aim * COMBAT.aimDamagePerPoint + muscle * COMBAT.muscleDamagePerPoint;
    const variance =
      COMBAT.damageVarianceMin +
      Math.random() * (COMBAT.damageVarianceMax - COMBAT.damageVarianceMin);
    const critChance = clamp(
      COMBAT.critBase + aim * COMBAT.critPerAim,
      0.03,
      0.4,
    );
    const crit = Math.random() < critChance;
    const armor = ARMORS[target.armor];
    const pierce = clamp(muscle * COMBAT.muscleArmorPierce, 0, 0.35);
    const armorFactor = 1 - armor.damageReduce * (1 - pierce);

    let dmg = w.damage * power * variance * armorFactor;
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
      this.log(
        session,
        `${shooter.name} ${crit ? "CRIT " : ""}hit ${target.name} for ${dmg}${crit ? "!" : "."}`,
      );
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
      if (posse.dialogue || posse.shop) continue;
      const leader = this.leader(posse);
      if (!leader?.alive) continue;
      const goons = this.goons(posse);
      if (goons.length === 0) continue;

      const movingDir =
        leader.moveMode === "dir" && (leader.dirX !== 0 || leader.dirY !== 0);
      const movingTarget =
        leader.moveMode === "target" && dist(leader.x, leader.y, leader.tx, leader.ty) > 0.12;
      if (!movingDir && !movingTarget) continue;

      const fx = movingDir
        ? leader.dirX
        : (leader.tx - leader.x) / Math.max(0.001, dist(leader.x, leader.y, leader.tx, leader.ty));
      const fy = movingDir
        ? leader.dirY
        : (leader.ty - leader.y) / Math.max(0.001, dist(leader.x, leader.y, leader.tx, leader.ty));

      // Circle center tracks the boss (slightly ahead so escorts don't lag into him)
      const cx = leader.x + fx * 0.12;
      const cy = leader.y + fy * 0.12;
      const rad = this.formationRadius(goons.length);
      goons.forEach((u, i) => {
        const slot = this.circleSlot(cx, cy, i, goons.length, rad);
        const p = this.clampWorld(slot.x - fx * 0.1, slot.y - fy * 0.1);
        u.moveMode = "target";
        u.dirX = 0;
        u.dirY = 0;
        u.tx = p.x;
        u.ty = p.y;
      });
    }
  }

  private computeAction(posse: Posse): { action: string; actionDetail: string | null } {
    const leader = this.leader(posse);
    if (!leader) return { action: "IDLE", actionDetail: null };
    if (!leader.alive) return { action: "DOWN", actionDetail: "Awaiting respawn" };
    if (leader.incapacitated) return { action: "DOWNED", actionDetail: "Bodyguards covering boss" };
    if (posse.shop) return { action: "SHOPPING", actionDetail: posse.shop.shopName };
    if (posse.dialogue) return { action: "PERSUADE", actionDetail: posse.dialogue.npcName };

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

    if (killerPosseId && killerPosseId !== posse.id) {
      posse.lastKillerPosseId = killerPosseId;
    } else if (unit.lastHitByPosseId && unit.lastHitByPosseId !== posse.id) {
      posse.lastKillerPosseId = unit.lastHitByPosseId;
    }

    // Player goons: bank gear, remove permanently (no DOWN ghosts)
    if (posse.isPlayer && !unit.isPlayerLeader && unit.id !== posse.leaderId) {
      this.bankUnitGear(posse, unit);
      const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
      if (session) this.log(session, `${unit.name} is gone. Permanent.`);
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
      const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
      if (session) {
        this.log(session, `You're dead. Respawning in ${RESPAWN_DELAY_SEC}s…`);
        session.conn?.send({
          type: "notify",
          kind: "killed",
          title: "YOU'RE DEAD",
          body: `The crew is wiped. Respawning in ${RESPAWN_DELAY_SEC}s…`,
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
      posse.respawnT = TICK_HZ * 20;
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
   * If the whole crew is down, the killer posse steals all weapons, armor, and cash.
   * Better gear than the killer already owned gets a fancy upgrade toast.
   */
  private tryWipeLoot(victim: Posse): void {
    if (victim.lootedThisWipe) return;
    if (this.hasLivingMembers(victim)) return;

    const killerId = victim.lastKillerPosseId;
    if (!killerId || killerId === victim.id) return;
    const killer = this.posses.get(killerId);
    if (!killer) return;

    victim.lootedThisWipe = true;

    // Snapshot killer's best gear before loot (for upgrade detection)
    let prevBestWeaponScore = 0;
    let prevBestArmorScore = 0;
    for (const m of this.members(killer)) {
      for (const w of m.ownedWeapons) prevBestWeaponScore = Math.max(prevBestWeaponScore, weaponScore(w));
      for (const a of m.ownedArmors) prevBestArmorScore = Math.max(prevBestArmorScore, armorScore(a));
      prevBestWeaponScore = Math.max(prevBestWeaponScore, weaponScore(m.weapon));
      prevBestArmorScore = Math.max(prevBestArmorScore, armorScore(m.armor));
    }

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
    killer.cash += cashTaken;

    // Strip victims to basics
    for (const id of victim.memberIds) {
      const u = this.units.get(id);
      if (!u) continue;
      u.ownedWeapons = new Set(["pipe"]);
      u.ownedArmors = new Set(["none"]);
      u.weapon = "pipe";
      u.armor = "none";
    }
    victim.fallenWeapons.clear();
    victim.fallenArmors.clear();

    // Give everything to all living killer members; equip best on leader
    const living = this.members(killer);
    for (const m of living) {
      for (const w of weapons) m.ownedWeapons.add(w);
      for (const a of armors) m.ownedArmors.add(a);
    }
    const leader = this.leader(killer);
    if (leader && leader.alive && !leader.incapacitated) {
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

    // Classify loot vs upgrades
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

    const gearTxt = [...upgrades.map((u) => u.name), ...otherItems].join(", ") || "nothing special";

    const killerSession = [...this.sessions.values()].find((s) => s.posseId === killer.id);
    const victimSession = [...this.sessions.values()].find((s) => s.posseId === victim.id);
    if (killerSession) {
      this.log(
        killerSession,
        `Wiped ${victim.name}! Looted $${cashTaken} and gear: ${gearTxt}.`,
      );
      killerSession.conn?.send({
        type: "notify",
        kind: "loot",
        title: upgrades.length ? "GEAR UPGRADE!" : "WIPE LOOT",
        subtitle: upgrades.length
          ? `Better iron from ${victim.name}`
          : `Spoils from ${victim.name}`,
        cash: cashTaken,
        victimName: victim.name,
        upgrades,
        otherItems,
      });
    }
    if (victimSession) {
      this.log(
        victimSession,
        `${killer.name} wiped your crew and stole your gear${cashTaken ? ` and $${cashTaken}` : ""}.`,
      );
    }
    this.pushChat(
      null,
      `${killer.name} wiped ${victim.name} and took their gear.`,
      true,
    );
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
    for (const id of dead) this.removeMember(posse, id, true);
  }

  /** Pick an outdoor spawn with few nearby player leaders — prefer safe downtown */
  private pickQuietRespawn(excludePosseId: string): { x: number; y: number } {
    const points =
      this.map.respawnPoints.length > 0
        ? this.map.respawnPoints
        : [this.map.playerSpawn];

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
      // Prefer empty neighborhoods + safe downtown (PvE); slight random noise
      const warPenalty = pt.y >= SAFE_Y_MAX ? 40 : 0;
      const score = nearby * 100 - minD + warPenalty + Math.random() * 3;
      return { pt, score, nearby };
    });

    scored.sort((a, b) => a.score - b.score);
    // Random among the quietest third (at least 3 candidates)
    const quietCount = Math.max(3, Math.ceil(scored.length / 3));
    const pool = scored.slice(0, quietCount);
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? scored[0]!;
    return { x: pick.pt.x, y: pick.pt.y };
  }

  private cmdInteract(session: CharacterSession, posse: Posse): void {
    const leader = this.leader(posse);
    if (!leader || !leader.alive) return;

    // Always stop free/click movement when opening doors, talk, or shop
    this.cmdStop(posse);

    // 1) Exit / enter doors FIRST so a counter NPC never traps you at the door
    for (const b of this.map.buildings) {
      if (posse.insideBuildingId === b.id) {
        if (dist(leader.x, leader.y, b.exitX + 0.5, b.exitY + 0.5) <= INTERACT_RANGE + 0.35) {
          this.enterBuilding(posse, null);
          this.log(session, `Left ${b.name}.`);
          return;
        }
      } else if (!posse.insideBuildingId) {
        if (dist(leader.x, leader.y, b.doorX + 0.5, b.doorY + 0.5) <= INTERACT_RANGE) {
          this.enterBuilding(posse, b.id);
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

    // 3) NPCs / shop counter (only when clearly away from exit)
    for (const u of this.units.values()) {
      if (u.kind !== "npc" || !u.alive) continue;
      if ((u.buildingId ?? null) !== (posse.insideBuildingId ?? null)) continue;
      if (dist(leader.x, leader.y, u.x, u.y) > INTERACT_RANGE) continue;

      // Don't treat dealer as interactable if we're still basically at the exit tile
      if (posse.insideBuildingId) {
        const b = this.map.buildings.find((bb) => bb.id === posse.insideBuildingId);
        if (b && dist(leader.x, leader.y, b.exitX + 0.5, b.exitY + 0.5) <= INTERACT_RANGE + 0.5) {
          continue;
        }
      }

      const spawn = this.map.npcSpawns.find((n) => n.id === u.id);
      if (spawn?.role === "dealer") {
        const b = this.map.buildings.find((bb) => bb.id === (u.buildingId ?? posse.insideBuildingId));
        posse.shop = {
          buildingId: b?.id ?? "shop_pawn",
          shopName: b?.name ?? "Pawn-O-Matic",
        };
        posse.dialogue = null;
        this.log(session, `${u.name}: "Cash only. No refunds on regrets."`);
        return;
      }
      if (spawn?.role === "doc") {
        this.serviceHeal(session, posse);
        return;
      }
      if (spawn?.role === "coach") {
        this.serviceGym(session, posse);
        return;
      }
      posse.dialogue = this.buildDialogue(u);
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

    this.log(session, "Nothing to interact with. Try a door, NPC, dumpster, or corner.");
  }

  private serviceHeal(session: CharacterSession, posse: Posse): void {
    const cost = 80;
    if (posse.cash < cost) {
      this.log(session, "Doc Bandage: \"Come back when your wallet's breathing.\"");
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
      healed += u.health - before;
    }
    this.log(
      session,
      `Doc Bandage stitches the crew for $${cost}. (+${Math.round(healed)} HP total) "Try not to leak on the floor."`,
    );
  }

  private serviceGym(session: CharacterSession, posse: Posse): void {
    const cost = 150;
    const unit =
      this.units.get(posse.selectedUnitId) &&
      this.units.get(posse.selectedUnitId)!.posseId === posse.id
        ? this.units.get(posse.selectedUnitId)!
        : this.leader(posse);
    if (!unit || !unit.alive) return;
    if (posse.cash < cost) {
      this.log(session, "Coach Brick: \"Guts ain't free, champ.\"");
      return;
    }
    posse.cash -= cost;
    const picks: (keyof UnitStats)[] = ["aim", "guts", "muscle", "speed"];
    const pick = picks[Math.floor(Math.random() * picks.length)]!;
    unit.stats[pick] = (unit.stats[pick] as number) + 1;
    if (Math.random() < 0.35) {
      unit.stats.maxHealth += 5;
      unit.health = Math.min(unit.stats.maxHealth, unit.health + 5);
    }
    this.log(
      session,
      `Coach Brick screams at ${unit.name} until +1 ${pick.toUpperCase()} appears. (−$${cost}) "Pain is just weakness leaving the bullet holes."`,
    );
  }

  private interactProp(
    session: CharacterSession,
    posse: Posse,
    propId: string,
  ): void {
    const prop = this.map.props.find((p) => p.id === propId);
    if (!prop) return;
    const ready = this.propReadyAt.get(propId) ?? 0;
    if (this.tick < ready) {
      const sec = Math.ceil((ready - this.tick) / TICK_HZ);
      this.log(session, `Nothing left… try again in ~${sec}s.`);
      return;
    }

    if (prop.kind === "dumpster") {
      this.propReadyAt.set(propId, this.tick + TICK_HZ * 45);
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
      this.propReadyAt.set(propId, this.tick + TICK_HZ * 60);
      const cash = 40 + Math.floor(Math.random() * 80) + Math.floor(posse.rep * 2);
      posse.cash += cash;
      posse.rep += 1;
      this.log(
        session,
        `Shook down ${prop.label ?? "the corner"} for $${cash}. Rep +1. "Nice block you got here…"`,
      );
      return;
    }

    if (prop.kind === "car") {
      this.propReadyAt.set(propId, this.tick + TICK_HZ * 90);
      const cash = 30 + Math.floor(Math.random() * 100);
      posse.cash += cash;
      this.log(session, `Liberated $${cash} from ${prop.label ?? "a car"}. The radio only plays static now.`);
      return;
    }

    if (prop.kind === "crate") {
      this.propReadyAt.set(propId, this.tick + TICK_HZ * 70);
      const unit = this.leader(posse);
      if (unit && Math.random() < 0.4 && !unit.ownedWeapons.has("uzi")) {
        unit.ownedWeapons.add("uzi");
        this.log(session, "Crate says 'farm equipment'. Contains an Uzi. Farming is evolving.");
      } else {
        const cash = 25 + Math.floor(Math.random() * 50);
        posse.cash += cash;
        this.log(session, `Crate cash: $${cash}. Definitely not guns. (It was guns-adjacent.)`);
      }
      return;
    }

    if (prop.kind === "neon" || prop.kind === "hydrant") {
      this.log(session, prop.label ? `"${prop.label}" flickers judgmentally.` : "You stare. It stares back.");
      return;
    }
  }

  private enterBuilding(posse: Posse, buildingId: string | null): void {
    const members = this.members(posse);
    if (!buildingId) {
      const prev = this.map.buildings.find((b) => b.id === posse.insideBuildingId);
      posse.insideBuildingId = null;
      posse.dialogue = null;
      posse.shop = null;
      const sx = prev?.exteriorSpawnX ?? this.map.playerSpawn.x;
      const sy = prev?.exteriorSpawnY ?? this.map.playerSpawn.y;
      let i = 0;
      for (const u of members) {
        u.buildingId = null;
        u.x = sx + (i % 2) * 0.4;
        u.y = sy + Math.floor(i / 2) * 0.4;
        u.tx = u.x;
        u.ty = u.y;
        i++;
      }
      return;
    }
    const b = this.map.buildings.find((bb) => bb.id === buildingId);
    if (!b) return;
    posse.insideBuildingId = buildingId;
    posse.dialogue = null;
    posse.shop = null;
    let i = 0;
    for (const u of members) {
      u.buildingId = buildingId;
      u.x = b.spawnX + (i % 2) * 0.35;
      u.y = b.spawnY - Math.floor(i / 2) * 0.35;
      u.tx = u.x;
      u.ty = u.y;
      i++;
    }
  }

  private cmdExitBuilding(posse: Posse): void {
    if (posse.insideBuildingId) this.enterBuilding(posse, null);
  }

  private buildDialogue(npc: Unit): DialogueState {
    const spawn = this.map.npcSpawns.find((n) => n.id === npc.id);
    const role = spawn?.role ?? "thug";

    if (role === "bartender") {
      return {
        npcId: npc.id,
        npcName: npc.name,
        text: "Vince wipes a glass that will never be clean. \"You lookin' to hire muscle or start a funeral?\"",
        choices: [
          { id: "hire", label: "I need a warm body for the crew. ($150)", tone: "business" },
          { id: "rumor", label: "What's the word on the street?", tone: "smooth" },
          { id: "insult", label: "Nice dump. Rats pay rent?", tone: "insult" },
          { id: "bye", label: "Later.", tone: "smooth" },
        ],
      };
    }
    if (role === "fixer") {
      return {
        npcId: npc.id,
        npcName: npc.name,
        text: "Rita doesn't look up from her notepad. \"Jobs, tips, or trouble. Pick one.\"",
        choices: [
          { id: "job", label: "Got work?", tone: "business" },
          { id: "tip", label: "Who should I watch for?", tone: "smooth" },
          { id: "threat", label: "Maybe I take your book.", tone: "threaten" },
          { id: "bye", label: "I'm out.", tone: "smooth" },
        ],
      };
    }
    if (role === "dealer") {
      return {
        npcId: npc.id,
        npcName: npc.name,
        text: `${npc.name} grins. "Guns, jackets, miracles. Cash only. Browse the counter when you're ready."`,
        choices: [
          { id: "open_shop", label: "Show me the goods.", tone: "business" },
          { id: "haggle", label: "Prices are criminal.", tone: "insult" },
          { id: "bye", label: "Just looking.", tone: "smooth" },
        ],
      };
    }
    if (role === "priest") {
      return {
        npcId: npc.id,
        npcName: npc.name,
        text: "Father Trouble lights a cigarette on a candle. \"Confession is $50. Absolution is extra.\"",
        choices: [
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
        choices: [
          { id: "tip", label: "What's hot on the lot?", tone: "smooth" },
          { id: "insult", label: "Your cars look terminal.", tone: "insult" },
          { id: "bye", label: "Later, greaseball.", tone: "smooth" },
        ],
      };
    }
    if (role === "doc" || role === "coach") {
      return {
        npcId: npc.id,
        npcName: npc.name,
        text:
          role === "doc"
            ? "Doc Bandage snaps on gloves that have seen things. \"Bleed on the mat, not the furniture.\""
            : "Coach Brick flexes a vein the size of a garden hose. \"Pain builds character. Or corpses.\"",
        choices: [
          { id: "bye", label: "I'll… use the equipment.", tone: "business" },
        ],
      };
    }
    return {
      npcId: npc.id,
      npcName: npc.name,
      text: `${npc.name} spits on the sidewalk. "You hiring or wasting oxygen?"`,
      choices: [
        { id: "hire_street", label: "Join the crew. ($100)", tone: "business" },
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

    if (choiceId === "open_shop") {
      posse.dialogue = null;
      const b = this.map.buildings.find((bb) => bb.id === (npc?.buildingId ?? posse.insideBuildingId));
      posse.shop = { buildingId: b?.id ?? "shop_pawn", shopName: b?.name ?? "Shop" };
      return;
    }

    if (choiceId === "bless") {
      if (posse.cash < 50) {
        d.text = "\"Faith without funds is just hope.\"";
        d.choices = [{ id: "bye", label: "I'll pass the plate later.", tone: "smooth" }];
        return;
      }
      posse.cash -= 50;
      for (const u of this.members(posse)) {
        u.health = Math.min(u.stats.maxHealth, u.health + 15);
      }
      d.text = "\"You're blessed. Marginally. Don't test it in traffic.\"";
      d.choices = [{ id: "bye", label: "Thanks, Padre.", tone: "smooth" }];
      this.log(session, "Crew blessed (+15 HP). Probably placebo. (−$50)");
      return;
    }

    if (choiceId === "hire" || choiceId === "hire_street") {
      const cost = choiceId === "hire" ? 150 : 100;
      if (posse.memberIds.length >= MAX_ACTIVE_GOONS + 1) {
        d.text = "\"Crew's full, boss. Fire someone first.\"";
        d.choices = [{ id: "bye", label: "Alright.", tone: "smooth" }];
        return;
      }
      if (posse.cash < cost) {
        d.text = "\"Come back when your pockets ain't empty.\"";
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
        d.text = `"${name}" cracks their neck. "Alright boss. I'm with you."`;
        this.log(session, `${name} joined the posse for $${cost}.`);
      } else {
        const name = this.hireGoon(session, posse);
        d.text = "\"They're yours. Try not to get 'em killed in the first five minutes.\"";
        this.log(session, `Hired ${name} for $${cost}.`);
      }
      d.choices = [{ id: "bye", label: "Welcome to the posse.", tone: "business" }];
      posse.dialogue = d;
      // Close talk after hire so we don't re-open on a deleted NPC
      if (recruitNpc) {
        // keep brief farewell text one more frame — next choice "bye" closes
      }
      return;
    }

    if (choiceId === "rumor" || choiceId === "tip") {
      d.text =
        "\"Dumpster Dogs prowl the west road. Silk Street plays nice until they don't. Watch the warehouse.\"";
      d.choices = [{ id: "bye", label: "Good looking out.", tone: "smooth" }];
      posse.rep += 1;
      return;
    }

    if (choiceId === "job") {
      d.text =
        "\"No formal contracts yet — this city runs on impulse. Rough up rival crews, buy better iron, come back famous.\"";
      d.choices = [{ id: "bye", label: "I can do that.", tone: "business" }];
      return;
    }

    if (choiceId === "insult" || choiceId === "threat" || choiceId === "haggle") {
      d.text = "\"I will fucking bury you.\" He means it as a greeting and a promise.";
      d.choices = [{ id: "bye", label: "(Back off)", tone: "smooth" }];
      if (npc && Math.random() < 0.35) {
        this.log(session, "That could have gone better.");
      }
      return;
    }

    posse.dialogue = null;
  }

  /** Spawn a fresh goon on the protective circle around the boss. Returns name. */
  private hireGoon(session: CharacterSession, posse: Posse): string {
    const leader = this.leader(posse);
    if (!leader) return "Nobody";
    const id = this.nextId("unit");
    const name = randomGoonName();
    const nextCount = this.goons(posse).length + 1;
    const slot = this.circleSlot(leader.x, leader.y, nextCount - 1, nextCount, this.formationRadius(nextCount));
    const goon: Unit = {
      id,
      name,
      kind: "goon",
      ownerId: session.characterId,
      posseId: posse.id,
      x: slot.x,
      y: slot.y,
      tx: slot.x,
      ty: slot.y,
      dirX: 0,
      dirY: 0,
      moveMode: "idle",
      health: DEFAULT_HEALTH,
      stats: defaultStats({
        aim: 3 + Math.floor(Math.random() * 4),
        guts: 3 + Math.floor(Math.random() * 5),
        muscle: 4 + Math.floor(Math.random() * 4),
        speed: 4 + Math.floor(Math.random() * 3),
      }),
      weapon: "pistol",
      armor: "none",
      facing: leader.facing,
      alive: true,
      fireCd: 0,
      isPlayerLeader: false,
      incapacitated: false,
      ownedWeapons: new Set(STARTER_WEAPONS),
      ownedArmors: new Set(["none"]),
      aiWanderT: 0,
      buildingId: posse.insideBuildingId,
      lastHitByPosseId: null,
    };
    this.units.set(id, goon);
    posse.memberIds.push(id);
    // Re-space full circle so the boss stays centered
    this.assignCircleFormation(posse, leader.x, leader.y, { moveBoss: false });
    return name;
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
    npc.alive = true;
    npc.health = Math.max(npc.health, npc.stats.maxHealth * 0.8);
    npc.weapon = "pistol";
    npc.armor = npc.armor === "none" ? "none" : npc.armor;
    npc.ownedWeapons = new Set(STARTER_WEAPONS);
    npc.ownedArmors = new Set(["none", ...(npc.armor !== "none" ? [npc.armor] : [])]);
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
    if (def.price > 0 && posse.cash < def.price) {
      this.log(session, `Not enough cash (need $${def.price}).`);
      return;
    }
    if (def.price > 0) posse.cash -= def.price;
    unit.ownedWeapons.add(weaponId);
    unit.weapon = weaponId;
    this.log(session, `Bought ${def.name} for ${unit.name} ($${def.price}).`);
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
    if (def.price > 0 && posse.cash < def.price) {
      this.log(session, `Not enough cash (need $${def.price}).`);
      return;
    }
    if (def.price > 0) posse.cash -= def.price;
    unit.ownedArmors.add(armorId);
    unit.armor = armorId;
    this.log(session, `Bought ${def.name} for ${unit.name} ($${def.price}).`);
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
    if (posse.cash < def.price) {
      this.log(session, `Not enough cash (need $${def.price}).`);
      return;
    }
    posse.cash -= def.price;
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
    }
    if (def.heal) {
      unit.health = Math.min(unit.stats.maxHealth, unit.health + def.heal);
      if (!unit.alive && unit.health > 0) unit.alive = true;
    }
    this.log(session, `Bought ${def.name} for ${unit.name} (−$${def.price}).`);
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

  private cmdChat(session: CharacterSession, posse: Posse, text: string): void {
    const clean = text.trim().slice(0, MAX_CHAT_LEN);
    if (!clean) return;
    const leader = this.leader(posse);
    if (!leader) return;
    this.pushChat(session.name, clean, false, leader.x, leader.y);
  }

  private pushChat(
    from: string | null,
    text: string,
    system: boolean,
    x?: number,
    y?: number,
  ): void {
    this.chatSeq += 1;
    const line: ChatLine = {
      id: `c${this.chatSeq}`,
      from: from ?? "City",
      text,
      t: Date.now(),
      system,
    };
    this.chat.push(line);
    if (this.chat.length > 100) this.chat.shift();

    // Deliver proximity or system-wide
    for (const s of this.sessions.values()) {
      if (!s.conn) continue;
      const p = this.posses.get(s.posseId);
      const leader = p ? this.leader(p) : null;
      if (!leader) continue;
      if (system) {
        s.conn.send({ type: "chat", line });
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

  step(dt: number): void {
    this.tick += 1;
    const now = this.tick;

    // Movement (free dir OR click target — sub-tile continuous)
    for (const u of this.units.values()) {
      if (!u.alive) continue;
      if (u.fireCd > 0) u.fireCd = Math.max(0, u.fireCd - dt);

      // Downed boss: crawl slowly if forced to move with formation, no free sprint
      const baseSpeed = MOVE_SPEED * (0.7 + u.stats.speed * 0.06);
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
        continue;
      }

      if (u.moveMode !== "target") continue;

      const dx = u.tx - u.x;
      const dy = u.ty - u.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.04) {
        const step = Math.min(d, speed * dt);
        const nx = u.x + (dx / d) * step;
        const ny = u.y + (dy / d) * step;
        const moved = this.tryMoveUnit(u, nx, ny, bid);
        if (!moved && d < 0.35) {
          u.tx = u.x;
          u.ty = u.y;
          u.moveMode = "idle";
        }
        u.facing = facingFromDelta(dx, dy);
      } else {
        u.moveMode = "idle";
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
        if (posse.respawnT !== undefined) {
          posse.respawnT -= 1;
          if (posse.respawnT <= 0) {
            for (const id of posse.memberIds) this.units.delete(id);
            this.posses.delete(posse.id);
            const spawn = this.map.aiPosseSpawns.find((s) => s.id === posse.id) ?? {
              id: posse.id,
              name: posse.name,
              x: 10 + Math.random() * 20,
              y: 10 + Math.random() * 15,
              color: posse.color,
              aggression: posse.aggression,
            };
            this.spawnAiPosse(
              spawn.id,
              spawn.name,
              spawn.x,
              spawn.y,
              spawn.color,
              spawn.aggression,
              spawn.threat ?? 1,
            );
          }
        }
        continue;
      }

      const leader = this.leader(posse);
      if (!leader || !leader.alive) continue;

      // AI only fights in the war zone — never aggro in safe downtown
      if (this.unitInSafeZone(leader)) {
        posse.hostile = false;
        continue;
      }

      // Find nearest player posse (must also be outside safe zone)
      let nearestPlayer: Posse | null = null;
      let nearestD = Infinity;
      for (const p of this.posses.values()) {
        if (!p.isPlayer) continue;
        if (p.insideBuildingId) continue;
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

      if (nearestPlayer && nearestD < POSSE_DETECT_RANGE) {
        if (now - posse.lastAggroCheck > TICK_HZ * 2) {
          posse.lastAggroCheck = now;
          if (!posse.hostile && nearestD < POSSE_AGGRO_RANGE) {
            if (Math.random() < FIGHT_CHANCE * posse.aggression + 0.15) {
              posse.hostile = true;
              posse.combatUntil = now + TICK_HZ * 15;
              nearestPlayer.hostile = true;
              nearestPlayer.combatUntil = now + TICK_HZ * 15;
              const s = [...this.sessions.values()].find((ss) => ss.posseId === nearestPlayer!.id);
              if (s) this.log(s, `${posse.name} wants a piece of you!`);
            } else {
              const s = [...this.sessions.values()].find((ss) => ss.posseId === nearestPlayer!.id);
              if (s && Math.random() < 0.4) {
                this.log(s, `${posse.name} sizes you up... and keeps walking.`);
              }
            }
          }
        }
      }

      if (posse.hostile && nearestPlayer) {
        const pl = this.leader(nearestPlayer);
        if (pl) {
          // AI uses same front-line shield: goons up front, boss middle/rear
          this.assignFrontFormation(posse, pl.x, pl.y);
          for (const u of this.members(posse)) {
            let best: Unit | null = null;
            let bd = Infinity;
            for (const mid of nearestPlayer.memberIds) {
              const m = this.units.get(mid);
              if (!m || !m.alive) continue;
              const dd = dist(u.x, u.y, m.x, m.y);
              if (dd < bd) {
                bd = dd;
                best = m;
              }
            }
            if (best) this.resolveShot(u, best);
          }
          // Player posse auto-return fire if hostile (keep own front if attacking, else circle fire)
          if (!nearestPlayer.attackTargetId) {
            this.assignFrontFormation(nearestPlayer, leader.x, leader.y);
          }
          for (const id of nearestPlayer.memberIds) {
            const u = this.units.get(id);
            if (!u || !u.alive) continue;
            let best: Unit | null = null;
            let bd = Infinity;
            for (const eid of posse.memberIds) {
              const e = this.units.get(eid);
              if (!e || !e.alive) continue;
              const dd = dist(u.x, u.y, e.x, e.y);
              if (dd < bd) {
                bd = dd;
                best = e;
              }
            }
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

    // Player leader respawn (fixed delay, quiet random spot)
    for (const u of this.units.values()) {
      if (u.kind !== "player" || u.alive) continue;
      if (u.respawnT === undefined) u.respawnT = RESPAWN_DELAY_SEC;
      u.respawnT -= dt;
      if (u.respawnT > 0) continue;

      const spawn = this.pickQuietRespawn(u.posseId);
      u.alive = true;
      u.health = u.stats.maxHealth * 0.6;
      u.incapacitated = false;
      u.x = spawn.x;
      u.y = spawn.y;
      u.tx = u.x;
      u.ty = u.y;
      u.buildingId = null;
      u.fireCd = 0.5;
      u.lastHitByPosseId = null;
      delete u.respawnT;

      const posse = this.posses.get(u.posseId);
      if (posse) {
        posse.insideBuildingId = null;
        posse.hostile = false;
        posse.dialogue = null;
        posse.shop = null;
        posse.lastKillerPosseId = null;
        posse.lootedThisWipe = false;
        this.purgeDeadGoons(posse);
        let i = 0;
        for (const mid of posse.memberIds) {
          const m = this.units.get(mid);
          if (!m || m.id === u.id) continue;
          m.buildingId = null;
          if (!m.alive) continue;
          m.x = spawn.x + (i % 2 === 0 ? -0.6 : 0.6);
          m.y = spawn.y + (i >= 2 ? 0.5 : -0.3);
          m.tx = m.x;
          m.ty = m.y;
          m.moveMode = "idle";
          i++;
        }
        posse.selectedUnitId = u.id;
        const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
        if (session) this.log(session, "Back on the street. Try a quieter block this time.");
      }
    }

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
      };
      if (u.posseId === posse.id) {
        pub.ownedWeapons = [...u.ownedWeapons];
        pub.ownedArmors = [...u.ownedArmors];
      }
      units.push(pub);
    }

    return {
      tick: this.tick,
      you: {
        characterId: session.characterId,
        posseId: session.posseId,
        cash: posse.cash,
        rep: posse.rep,
        selectedUnitId: posse.selectedUnitId,
        insideBuildingId: posse.insideBuildingId,
        respawnIn: (() => {
          const lead = this.leader(posse);
          if (!lead || lead.alive) return null;
          return Math.max(0, lead.respawnT ?? RESPAWN_DELAY_SEC);
        })(),
        ...(() => {
          const a = this.computeAction(posse);
          const lead = this.leader(posse);
          const safe = lead ? this.unitInSafeZone(lead) : true;
          return {
            action: a.action,
            actionDetail: a.actionDetail,
            inSafeZone: safe,
          };
        })(),
      },
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
      buildings: this.map.buildings.map((b) => ({
        id: b.id,
        name: b.name,
        kind: b.kind,
        doorX: b.doorX,
        doorY: b.doorY,
        interiorId: b.id,
        blurb: b.blurb,
        ex0: b.ex0,
        ey0: b.ey0,
        ex1: b.ex1,
        ey1: b.ey1,
        stories: b.stories,
        wallColor: b.wallColor,
        roofColor: b.roofColor,
        accentColor: b.accentColor,
      })),
      props: posse.insideBuildingId
        ? []
        : this.map.props.map((p) => ({
            id: p.id,
            kind: p.kind,
            x: p.x,
            y: p.y,
            label: p.label,
          })),
      mapWidth: this.map.width,
      mapHeight: this.map.height,
      mapRevision: this.mapRevision,
      ...(needMap ? { blocked, floors } : {}),
      dialogue: posse.dialogue,
      shop: posse.shop,
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
