import {
  ARMORS,
  CHAT_RANGE,
  DEFAULT_CASH,
  DEFAULT_HEALTH,
  FIGHT_CHANCE,
  INTERACT_RANGE,
  MAX_ACTIVE_GOONS,
  MAX_CHAT_LEN,
  MOVE_SPEED,
  POSSE_AGGRO_RANGE,
  POSSE_DETECT_RANGE,
  PROTOCOL_VERSION,
  RESPAWN_DELAY_SEC,
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
  ownedWeapons: Set<WeaponId>;
  ownedArmors: Set<ArmorId>;
  aiWanderT: number;
  buildingId: string | null;
  respawnT?: number;
  /** Posse that last damaged this unit (for wipe loot attribution) */
  lastHitByPosseId: string | null;
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
  mapRevision = 1;

  constructor() {
    this.seedWorld();
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
        ownedWeapons: new Set(["pipe"]),
        ownedArmors: new Set(["none"]),
        aiWanderT: 0,
        buildingId: n.buildingId ?? null,
        lastHitByPosseId: null,
      });
    }

    for (const a of this.map.aiPosseSpawns) {
      this.spawnAiPosse(a.id, a.name, a.x, a.y, a.color, a.aggression);
    }
  }

  private spawnAiPosse(
    id: string,
    name: string,
    x: number,
    y: number,
    color: number,
    aggression: number,
  ): void {
    const leaderId = `${id}_boss`;
    const memberIds = [leaderId];
    this.posses.set(id, {
      id,
      name,
      leaderId,
      isPlayer: false,
      hostile: false,
      cash: 200,
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
    });

    const make = (
      uid: string,
      uname: string,
      kind: Unit["kind"],
      ox: number,
      oy: number,
      weapon: WeaponId,
    ) => {
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
        health: DEFAULT_HEALTH,
        stats: defaultStats({
          aim: 4 + Math.floor(Math.random() * 4),
          guts: 4 + Math.floor(Math.random() * 4),
          speed: 4 + Math.floor(Math.random() * 3),
        }),
        weapon,
        armor: Math.random() > 0.6 ? "leather" : "none",
        facing: Math.floor(Math.random() * 8),
        alive: true,
        fireCd: 0,
        isPlayerLeader: false,
        ownedWeapons: new Set([weapon, "pipe", "pistol"]),
        ownedArmors: new Set(["none", "leather"]),
        aiWanderT: Math.random() * 3,
        buildingId: null,
        lastHitByPosseId: null,
      });
    };

    make(leaderId, `${name} Boss`, "ai_boss", x, y, "pistol");
    const g1 = `${id}_g1`;
    const g2 = `${id}_g2`;
    make(g1, randomGoonName(), "ai_goon", x + 0.8, y + 0.4, "pistol");
    make(g2, randomGoonName(), "ai_goon", x - 0.6, y + 0.5, "uzi");
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
      ownedWeapons: new Set(STARTER_WEAPONS),
      ownedArmors: new Set(["none"]),
      aiWanderT: 0,
      buildingId: null,
      lastHitByPosseId: null,
    });

    this.units.set(goon1, {
      id: goon1,
      name: randomGoonName(),
      kind: "goon",
      ownerId: characterId,
      posseId,
      x: spawn.x - 0.8,
      y: spawn.y + 0.4,
      tx: spawn.x - 0.8,
      ty: spawn.y + 0.4,
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

  private tileAt(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return "wall" as const;
    return this.map.tiles[ty]![tx]!;
  }

  private canWalk(x: number, y: number, buildingId: string | null): boolean {
    const t = this.tileAt(x, y);
    if (t === "void" || t === "wall") return false;
    const indoor = t === "floor" || t === "bar" || t === "shop";
    if (buildingId) {
      const b = this.map.buildings.find((bb) => bb.id === buildingId);
      if (!b) return false;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (tx < b.ix0 - 1 || ty < b.iy0 - 1 || tx > b.ix1 + 1 || ty > b.iy1 + 1) return false;
      return t === "floor" || t === "bar" || t === "shop" || t === "door";
    }
    if (indoor) return false;
    return t === "grass" || t === "road" || t === "sidewalk" || t === "door";
  }

  private cmdMove(posse: Posse, x: number, y: number, unitIds?: string[]): void {
    if (posse.dialogue || posse.shop) return;
    const leader = this.leader(posse);
    if (!leader || !leader.alive) return;
    const ids = unitIds?.length ? unitIds.filter((id) => posse.memberIds.includes(id)) : posse.memberIds;
    // Clamp target near walkable
    const tx = clamp(x, 0.3, this.map.width - 0.3);
    const ty = clamp(y, 0.3, this.map.height - 0.3);
    let i = 0;
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u || !u.alive) continue;
      // formation offset for goons
      const ox = (i % 2 === 0 ? -0.45 : 0.45) * (u.isPlayerLeader ? 0 : 1);
      const oy = (i >= 2 ? 0.45 : -0.15) * (u.isPlayerLeader ? 0 : 1);
      u.moveMode = "target";
      u.dirX = 0;
      u.dirY = 0;
      u.tx = tx + ox;
      u.ty = ty + oy;
      i++;
    }
  }

  /** Continuous free movement in world axes (client sends screen-aligned vectors). */
  private cmdDir(posse: Posse, dx: number, dy: number): void {
    if (posse.dialogue || posse.shop) return;
    const leader = this.leader(posse);
    if (!leader || !leader.alive) return;

    const len = Math.hypot(dx, dy);
    const ndx = len > 0.001 ? dx / len : 0;
    const ndy = len > 0.001 ? dy / len : 0;

    for (const u of this.members(posse)) {
      if (len < 0.001) {
        u.moveMode = "idle";
        u.dirX = 0;
        u.dirY = 0;
        u.tx = u.x;
        u.ty = u.y;
      } else {
        u.moveMode = "dir";
        u.dirX = ndx;
        u.dirY = ndy;
        // Keep target parked so we don't mix modes
        u.tx = u.x;
        u.ty = u.y;
      }
    }
  }

  private cmdStop(posse: Posse): void {
    for (const u of this.members(posse)) {
      u.moveMode = "idle";
      u.dirX = 0;
      u.dirY = 0;
      u.tx = u.x;
      u.ty = u.y;
    }
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
    if (!shooter || !shooter.alive || shooter.fireCd > 0) return;

    let target: Unit | undefined;
    if (targetId) target = this.units.get(targetId);
    if (!target && x !== undefined && y !== undefined) {
      // nearest living enemy near point
      let best: Unit | undefined;
      let bestD = 1.5;
      for (const u of this.units.values()) {
        if (!u.alive || u.posseId === posse.id) continue;
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

    const w = WEAPONS[shooter.weapon];
    const d = dist(shooter.x, shooter.y, target.x, target.y);
    if (d > w.range + 0.4) {
      this.log(session, "Out of range.");
      return;
    }

    // Enter mutual hostility
    const tp = this.posses.get(target.posseId);
    if (tp) {
      tp.hostile = true;
      tp.combatUntil = this.tick + TICK_HZ * 12;
    }
    posse.hostile = true;
    posse.combatUntil = this.tick + TICK_HZ * 12;

    this.resolveShot(shooter, target, session);
  }

  private resolveShot(shooter: Unit, target: Unit, session?: CharacterSession): void {
    if (shooter.fireCd > 0 || !shooter.alive || !target.alive) return;
    const w = WEAPONS[shooter.weapon];
    const d = dist(shooter.x, shooter.y, target.x, target.y);
    if (d > w.range + 0.5) return;

    shooter.fireCd = w.fireCooldown;
    shooter.facing = facingFromDelta(target.x - shooter.x, target.y - shooter.y);

    const aimBonus = shooter.stats.aim * 0.03;
    const hitChance = clamp(0.55 + aimBonus - d * 0.04, 0.2, 0.95);
    if (Math.random() > hitChance) {
      if (session) this.log(session, `${shooter.name} missed ${target.name}.`);
      return;
    }

    const armor = ARMORS[target.armor];
    const dmg = Math.max(
      1,
      Math.round(w.damage * (1 - armor.damageReduce) * (0.85 + Math.random() * 0.3)),
    );
    target.health -= dmg;
    target.lastHitByPosseId = shooter.posseId;
    if (session) this.log(session, `${shooter.name} hit ${target.name} for ${dmg}.`);

    if (target.health <= 0) {
      target.health = 0;
      target.alive = false;
      target.tx = target.x;
      target.ty = target.y;
      target.moveMode = "idle";
      target.dirX = 0;
      target.dirY = 0;
      if (session) this.log(session, `${target.name} is down!`);
      this.onUnitDown(target, shooter.posseId);
    }
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
    if (posse.isPlayer && !unit.isPlayerLeader) {
      this.bankUnitGear(posse, unit);
      const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
      if (session) this.log(session, `${unit.name} is gone. Permanent.`);
      this.removeMember(posse, unit.id, true);
      this.tryWipeLoot(posse);
      return;
    }

    if (posse.isPlayer && unit.isPlayerLeader) {
      unit.respawnT = RESPAWN_DELAY_SEC;
      unit.moveMode = "idle";
      unit.dirX = 0;
      unit.dirY = 0;
      unit.tx = unit.x;
      unit.ty = unit.y;
      const session = [...this.sessions.values()].find((s) => s.posseId === posse.id);
      if (session) {
        this.log(session, `You're down. Respawning in ${RESPAWN_DELAY_SEC}s…`);
      }
      this.purgeDeadGoons(posse);
      this.tryWipeLoot(posse);
      return;
    }

    // AI / NPC posses — wipe when nobody left standing
    if (!this.hasLivingMembers(posse) && !posse.isPlayer) {
      this.pushChat(null, `${posse.name} got wiped off the map.`, true);
      this.tryWipeLoot(posse);
      posse.respawnT = TICK_HZ * 20;
    }
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
   */
  private tryWipeLoot(victim: Posse): void {
    if (victim.lootedThisWipe) return;
    if (this.hasLivingMembers(victim)) return;

    const killerId = victim.lastKillerPosseId;
    if (!killerId || killerId === victim.id) return;
    const killer = this.posses.get(killerId);
    if (!killer) return;

    victim.lootedThisWipe = true;

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
    if (leader && leader.alive) {
      let bestW: WeaponId = leader.weapon;
      let bestD = WEAPONS[bestW]?.damage ?? 0;
      for (const w of leader.ownedWeapons) {
        const d = WEAPONS[w]?.damage ?? 0;
        // Prefer higher damage; machine gun/tommy over pistol slightly via dps-ish
        const score = d / Math.max(0.05, WEAPONS[w].fireCooldown);
        const bestScore = bestD / Math.max(0.05, WEAPONS[bestW].fireCooldown);
        if (score > bestScore) {
          bestW = w;
          bestD = d;
        }
      }
      leader.weapon = bestW;
      let bestA: ArmorId = "none";
      let bestR = 0;
      for (const a of leader.ownedArmors) {
        const r = ARMORS[a]?.damageReduce ?? 0;
        if (r > bestR) {
          bestR = r;
          bestA = a;
        }
      }
      leader.armor = bestA;
    }

    const gearList = [
      ...[...weapons].map((w) => WEAPONS[w].name),
      ...[...armors].map((a) => ARMORS[a].name),
    ];
    const gearTxt = gearList.length ? gearList.join(", ") : "nothing special";

    const killerSession = [...this.sessions.values()].find((s) => s.posseId === killer.id);
    const victimSession = [...this.sessions.values()].find((s) => s.posseId === victim.id);
    if (killerSession) {
      this.log(
        killerSession,
        `Wiped ${victim.name}! Looted $${cashTaken} and gear: ${gearTxt}.`,
      );
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

  /** Pick an outdoor spawn with few nearby player leaders */
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
        posse.shop = { buildingId: "shop_pawn", shopName: "Pawn-O-Matic" };
        posse.dialogue = null;
        this.log(session, "Pawnshop Phil: \"Cash only. No refunds on regrets.\"");
        return;
      }
      posse.dialogue = this.buildDialogue(u);
      posse.shop = null;
      return;
    }

    // 4) Standing on shop counter tile
    if (posse.insideBuildingId === "shop_pawn") {
      const t = this.tileAt(leader.x, leader.y);
      if (t === "shop") {
        posse.shop = { buildingId: "shop_pawn", shopName: "Pawn-O-Matic" };
        posse.dialogue = null;
        return;
      }
    }

    this.log(session, "Nothing to interact with. Get closer to a door, NPC, or counter.");
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
        text: "Phil grins. \"Guns, jackets, miracles. Cash only. Browse the counter when you're ready.\"",
        choices: [
          { id: "open_shop", label: "Show me the goods.", tone: "business" },
          { id: "haggle", label: "Prices are criminal.", tone: "insult" },
          { id: "bye", label: "Just looking.", tone: "smooth" },
        ],
      };
    }
    return {
      npcId: npc.id,
      npcName: npc.name,
      text: "Carl spits on the sidewalk. \"You hiring or wasting oxygen?\"",
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
      posse.shop = { buildingId: "shop_pawn", shopName: "Pawn-O-Matic" };
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

  /** Spawn a fresh goon at the leader (bar "hire muscle"). Returns name. */
  private hireGoon(session: CharacterSession, posse: Posse): string {
    const leader = this.leader(posse);
    if (!leader) return "Nobody";
    const id = this.nextId("unit");
    const name = randomGoonName();
    const goon: Unit = {
      id,
      name,
      kind: "goon",
      ownerId: session.characterId,
      posseId: posse.id,
      x: leader.x + 0.5,
      y: leader.y + 0.5,
      tx: leader.x + 0.5,
      ty: leader.y + 0.5,
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
      ownedWeapons: new Set(STARTER_WEAPONS),
      ownedArmors: new Set(["none"]),
      aiWanderT: 0,
      buildingId: posse.insideBuildingId,
      lastHitByPosseId: null,
    };
    this.units.set(id, goon);
    posse.memberIds.push(id);
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
    if (leader) {
      npc.x = leader.x + 0.6;
      npc.y = leader.y + 0.4;
      npc.tx = npc.x;
      npc.ty = npc.y;
      npc.facing = leader.facing;
    }

    if (!posse.memberIds.includes(npc.id)) {
      posse.memberIds.push(npc.id);
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

      const speed = MOVE_SPEED * (0.7 + u.stats.speed * 0.06);
      const posse = this.posses.get(u.posseId);
      const bid = posse?.insideBuildingId ?? u.buildingId;

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
            this.spawnAiPosse(spawn.id, spawn.name, spawn.x, spawn.y, spawn.color, spawn.aggression);
          }
        }
        continue;
      }

      const leader = this.leader(posse);
      if (!leader || !leader.alive) continue;

      // Find nearest player posse
      let nearestPlayer: Posse | null = null;
      let nearestD = Infinity;
      for (const p of this.posses.values()) {
        if (!p.isPlayer) continue;
        if (p.insideBuildingId) continue; // don't aggro into buildings for simplicity
        const pl = this.leader(p);
        if (!pl || !pl.alive) continue;
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
          // Chase and shoot
          let i = 0;
          for (const id of posse.memberIds) {
            const u = this.units.get(id);
            if (!u || !u.alive) continue;
            u.moveMode = "target";
            u.dirX = 0;
            u.dirY = 0;
            u.tx = pl.x + Math.cos(i) * 1.2;
            u.ty = pl.y + Math.sin(i) * 1.2;
            // shoot nearest player member
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
            i++;
          }
          // player goons auto-return fire if hostile
          for (const id of nearestPlayer.memberIds) {
            const u = this.units.get(id);
            if (!u || !u.alive || u.kind === "player") continue;
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
        // Wander
        for (const id of posse.memberIds) {
          const u = this.units.get(id);
          if (!u || !u.alive) continue;
          u.aiWanderT -= dt;
          if (u.aiWanderT <= 0) {
            u.aiWanderT = 2 + Math.random() * 4;
            const ang = Math.random() * Math.PI * 2;
            const rad = 1 + Math.random() * 3;
            u.moveMode = "target";
            u.dirX = 0;
            u.dirY = 0;
            u.tx = clamp(leader.x + Math.cos(ang) * rad, 1, this.map.width - 2);
            u.ty = clamp(leader.y + Math.sin(ang) * rad, 1, this.map.height - 2);
            // keep outdoors
            if (!this.canWalk(u.tx, u.ty, null)) {
              u.tx = leader.x;
              u.ty = leader.y;
            }
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

    // Broadcast snapshots
    if (this.tick % 1 === 0) {
      for (const s of this.sessions.values()) {
        if (!s.conn) continue;
        s.conn.send({ type: "snapshot", data: this.buildSnapshot(s) });
      }
    }
  }

  private buildSnapshot(session: CharacterSession): WorldSnapshot {
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
    };
  }

}
