import {
  TILE_H,
  TILE_W,
  type BuildingPublic,
  type PropPublic,
  type UnitPublic,
  type WorldSnapshot,
} from "@loose-cannon/shared";
import { Application, Container, Graphics, Text } from "pixi.js";
import { screenToWorld, worldToScreen } from "./iso.js";

function armorBulk(armor: string): number {
  if (armor === "plate") return 3;
  if (armor === "kevlar") return 2;
  if (armor === "leather") return 1;
  return 0;
}

function weaponTier(weapon: string): number {
  const order = ["pipe", "switchblade", "pistol", "uzi", "shotgun", "tommy", "flamethrower"];
  return Math.max(0, order.indexOf(weapon));
}

function threatPips(u: UnitPublic): number {
  const bulk = armorBulk(u.armor);
  const wt = weaponTier(u.weapon);
  const stats =
    Math.max(0, u.stats.aim - 5) +
    Math.max(0, u.stats.guts - 5) +
    Math.max(0, u.stats.muscle - 5);
  return Math.min(5, Math.floor(bulk + wt * 0.5 + stats * 0.25));
}

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, ((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.max(0, ((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.max(0, (color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

interface UnitVisual {
  x: number;
  y: number;
  facing: number;
  phase: number;
  moving: boolean;
}

const FLOOR_PX = 18; // pixels of height per building story

export class WorldView {
  app: Application;
  root = new Container();
  mapLayer = new Container();
  buildingLayer = new Container();
  propGfx = new Graphics();
  entityLayer = new Container();
  private tileGfx = new Graphics();
  private buildingGfx = new Graphics();
  private entityGfx = new Graphics();
  private fxGfx = new Graphics();
  private labels = new Container();
  private overlayLayer = new Container();
  private camX = 0;
  private camY = 0;
  private followX = 0;
  private followY = 0;
  private mapBuiltFor = "";
  private cachedFloors: WorldSnapshot["floors"] = [];
  private cachedBlocked: WorldSnapshot["blocked"] = [];
  private lastSnap: WorldSnapshot | null = null;
  private visuals = new Map<string, UnitVisual>();
  private fx: Array<{ x: number; y: number; life: number; kind: "muzzle" | "blood" | "spark" }> =
    [];
  private time = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.app = new Application();
  }

  async init(): Promise<void> {
    await this.app.init({
      canvas: this.canvas,
      resizeTo: window,
      background: 0x0a0c12,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.app.stage.addChild(this.root);
    this.root.addChild(
      this.mapLayer,
      this.buildingLayer,
      this.propGfx,
      this.entityLayer,
      this.overlayLayer,
    );
    this.mapLayer.addChild(this.tileGfx);
    this.buildingLayer.addChild(this.buildingGfx);
    this.entityLayer.addChild(this.entityGfx, this.fxGfx, this.labels);
    this.app.ticker.add((ticker) => {
      const dt = Math.min(0.05, ticker.deltaMS / 1000);
      this.time += dt;
      this.tickFx(dt);
      this.interpolateUnits(dt);
      if (this.lastSnap) {
        this.drawEntities(this.lastSnap);
        this.updateCamera(dt);
      }
    });
  }

  getSnapshot(): WorldSnapshot | null {
    return this.lastSnap;
  }

  burstFx(x: number, y: number, kind: "muzzle" | "blood" | "spark"): void {
    this.fx.push({ x, y, life: kind === "muzzle" ? 0.12 : 0.28, kind });
  }

  applySnapshot(snap: WorldSnapshot): void {
    if (snap.floors) this.cachedFloors = snap.floors;
    if (snap.blocked) this.cachedBlocked = snap.blocked;
    this.lastSnap = snap;

    const me =
      snap.units.find(
        (u) => u.posseId === snap.you.posseId && (u.isPlayerLeader || u.kind === "player"),
      ) ?? snap.units.find((u) => u.posseId === snap.you.posseId);
    if (me) {
      this.followX = me.x;
      this.followY = me.y;
    }

    // Seed / update visual targets
    const seen = new Set<string>();
    for (const u of snap.units) {
      seen.add(u.id);
      let v = this.visuals.get(u.id);
      if (!v) {
        v = { x: u.x, y: u.y, facing: u.facing, phase: Math.random() * Math.PI * 2, moving: false };
        this.visuals.set(u.id, v);
      }
    }
    for (const id of [...this.visuals.keys()]) {
      if (!seen.has(id)) this.visuals.delete(id);
    }

    const key = `${snap.mapRevision}:${snap.you.insideBuildingId ?? "out"}`;
    if (key !== this.mapBuiltFor && this.cachedFloors?.length) {
      this.mapBuiltFor = key;
      this.drawMap(snap);
      this.drawBuildings(snap);
    }
    this.drawProps(snap.props ?? []);
  }

  private interpolateUnits(dt: number): void {
    const snap = this.lastSnap;
    if (!snap) return;
    for (const u of snap.units) {
      const v = this.visuals.get(u.id);
      if (!v) continue;
      const dx = u.x - v.x;
      const dy = u.y - v.y;
      const dist = Math.hypot(dx, dy);
      const speed = 12; // catch-up rate
      if (dist > 0.001) {
        const step = Math.min(1, speed * dt);
        v.x += dx * step;
        v.y += dy * step;
        v.moving = dist > 0.04;
        if (dist > 0.02) {
          // 8-dir facing from motion
          const ang = Math.atan2(dy, dx);
          v.facing = Math.round(((ang + Math.PI) / (Math.PI / 4))) % 8;
        }
        v.phase += dt * (6 + dist * 8);
      } else {
        v.x = u.x;
        v.y = u.y;
        v.moving = false;
        v.facing = u.facing;
      }
    }
  }

  private drawMap(snap: WorldSnapshot): void {
    const g = this.tileGfx;
    g.clear();
    const inside = snap.you.insideBuildingId;

    for (const f of this.cachedFloors ?? []) {
      // Hide exterior void/wall clutter when outdoors — walls still in blocked
      if (!inside && f.type === "floor") continue; // interior floors only when inside layer
      this.drawGroundTile(g, f.x, f.y, f.type);
    }
    // When outside, don't draw void tiles as black holes under buildings — buildings cover them
    for (const b of this.cachedBlocked ?? []) {
      if (b.type === "void" && !inside) continue;
      if (b.type === "wall" && !inside) {
        // walls form building footprint base only (thin)
        this.drawGroundTile(g, b.x, b.y, "sidewalk");
        continue;
      }
      this.drawGroundTile(g, b.x, b.y, b.type, true);
    }
  }

  private drawGroundTile(g: Graphics, x: number, y: number, type: string, raised = false): void {
    const { sx, sy } = worldToScreen(x, y);
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const lift = raised && type === "wall" ? 10 : 0;
    const top = sy - lift;

    let color = 0x3d4a2c;
    if (type === "road") color = 0x363640;
    else if (type === "sidewalk") color = 0x6e685f;
    else if (type === "parking") color = 0x32323c;
    else if (type === "wall") color = 0x2c2622;
    else if (type === "floor") color = 0x4a4038;
    else if (type === "door") color = 0x9a6230;
    else if (type === "bar") color = 0x6a3030;
    else if (type === "shop") color = 0x30506a;
    else if (type === "hospital") color = 0x405868;
    else if (type === "gym") color = 0x4a4030;
    else if (type === "void") color = 0x0c0c10;
    else if (type === "grass") color = (x + y * 3) % 5 === 0 ? 0x42522e : 0x3a4a2a;

    g.poly([sx, top, sx + hw, top + hh, sx, top + TILE_H, sx - hw, top + hh]);
    g.fill({ color });

    // subtle top highlight edge
    g.poly([sx, top, sx + hw, top + hh, sx, top + 2, sx - hw, top + hh]);
    g.fill({ color: shade(color, 1.12), alpha: 0.15 });

    if (type === "road" && (x + y) % 3 === 0) {
      g.rect(sx - 6, sy + 8, 12, 2);
      g.fill({ color: 0xc9a227, alpha: 0.45 });
    }
    if (type === "parking" && x % 2 === 0) {
      g.rect(sx - 1, sy + 4, 2, 12);
      g.fill({ color: 0xffffff, alpha: 0.1 });
    }
    if (type === "sidewalk" && (x * 5 + y) % 9 === 0) {
      g.rect(sx - 10, sy + 12, 20, 1);
      g.fill({ color: 0x000000, alpha: 0.12 });
    }
    if (type === "door") {
      g.roundRect(sx - 5, sy + 2, 10, 12, 1);
      g.fill({ color: 0x5a3018 });
      g.circle(sx + 3, sy + 8, 1.5);
      g.fill({ color: 0xc9a227 });
    }
    if (type === "bar" || type === "shop" || type === "hospital" || type === "gym") {
      const glow =
        type === "bar" ? 0xff4060 : type === "shop" ? 0x40a0ff : type === "hospital" ? 0xe05050 : 0xe0a030;
      g.circle(sx, sy + 6, 4);
      g.fill({ color: glow, alpha: 0.35 + Math.sin(this.time * 3 + x) * 0.1 });
    }
  }

  /** True isometric multi-story buildings */
  private drawBuildings(snap: WorldSnapshot): void {
    const g = this.buildingGfx;
    g.clear();
    this.overlayLayer.removeChildren();

    if (snap.you.insideBuildingId) {
      // Interior mode: soft ambient frame only
      return;
    }

    const buildings = [...snap.buildings]
      .filter((b) => b.ex0 != null && b.ey0 != null)
      .sort((a, b) => a.ex0! + a.ey0! + a.ex1! + a.ey1! - (b.ex0! + b.ey0! + b.ex1! + b.ey1!));

    for (const b of buildings) {
      this.drawIsoBuilding(g, b);
      const { sx, sy } = worldToScreen((b.ex0! + b.ex1!) / 2, (b.ey0! + b.ey1!) / 2);
      const h = (b.stories ?? 2) * FLOOR_PX;
      const title = new Text({
        text: b.name,
        style: {
          fontSize: 11,
          fill: 0xffe0a0,
          fontWeight: "700",
          fontFamily: "SF Pro Display, Segoe UI, system-ui, sans-serif",
        },
      });
      title.alpha = 0.95;
      title.x = sx - title.width / 2;
      title.y = sy - h - 28;
      this.overlayLayer.addChild(title);
      if (b.blurb) {
        const sub = new Text({
          text: b.blurb,
          style: { fontSize: 9, fill: 0x9a9088, fontFamily: "system-ui, sans-serif" },
        });
        sub.x = sx - sub.width / 2;
        sub.y = sy - h - 14;
        this.overlayLayer.addChild(sub);
      }
    }
  }

  private drawIsoBuilding(g: Graphics, b: BuildingPublic): void {
    const x0 = b.ex0!;
    const y0 = b.ey0!;
    const x1 = b.ex1!;
    const y1 = b.ey1!;
    const stories = b.stories ?? 2;
    const h = stories * FLOOR_PX;
    const wall = b.wallColor ?? 0x3a3430;
    const roof = b.roofColor ?? 0x1a1816;
    const accent = b.accentColor ?? 0xc9a227;

    // Four corners of footprint in screen space (top of walls = base - h)
    const c00 = worldToScreen(x0, y0);
    const c10 = worldToScreen(x1 + 1, y0);
    const c01 = worldToScreen(x0, y1 + 1);
    const c11 = worldToScreen(x1 + 1, y1 + 1);

    const top = (c: { sx: number; sy: number }) => ({ sx: c.sx, sy: c.sy - h });

    const t00 = top(c00);
    const t10 = top(c10);
    const t01 = top(c01);
    const t11 = top(c11);

    // Left wall face (darker)
    g.poly([c00.sx, c00.sy, c01.sx, c01.sy, t01.sx, t01.sy, t00.sx, t00.sy]);
    g.fill({ color: shade(wall, 0.72) });

    // Right wall face
    g.poly([c00.sx, c00.sy, c10.sx, c10.sy, t10.sx, t10.sy, t00.sx, t00.sy]);
    g.fill({ color: shade(wall, 0.9) });

    // Far walls for thickness feel (only if large enough)
    g.poly([c01.sx, c01.sy, c11.sx, c11.sy, t11.sx, t11.sy, t01.sx, t01.sy]);
    g.fill({ color: shade(wall, 0.65), alpha: 0.9 });
    g.poly([c10.sx, c10.sy, c11.sx, c11.sy, t11.sx, t11.sy, t10.sx, t10.sy]);
    g.fill({ color: shade(wall, 0.8), alpha: 0.9 });

    // Windows on right face
    const floors = stories;
    for (let f = 0; f < floors; f++) {
      const fy = 1 - (f + 0.55) / floors;
      // sample along right edge from c00->c10
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        const bx = c00.sx + (c10.sx - c00.sx) * t;
        const by = c00.sy + (c10.sy - c00.sy) * t;
        const wx = bx;
        const wy = by - h * fy;
        const lit = (b.id.charCodeAt(0) + f * 3 + i) % 3 !== 0;
        g.rect(wx - 3, wy - 4, 6, 5);
        g.fill({ color: lit ? accent : 0x1a2030, alpha: lit ? 0.85 : 0.5 });
        if (lit) {
          g.rect(wx - 3, wy - 4, 6, 5);
          g.stroke({ color: shade(accent, 1.3), width: 0.5, alpha: 0.4 });
        }
      }
    }

    // Windows on left face
    for (let f = 0; f < floors; f++) {
      const fy = 1 - (f + 0.55) / floors;
      for (let i = 1; i <= 2; i++) {
        const t = i / 3;
        const bx = c00.sx + (c01.sx - c00.sx) * t;
        const by = c00.sy + (c01.sy - c00.sy) * t;
        const wx = bx;
        const wy = by - h * fy;
        const lit = (b.id.charCodeAt(1) + f + i) % 2 === 0;
        g.rect(wx - 2, wy - 4, 5, 5);
        g.fill({ color: lit ? shade(accent, 0.9) : 0x15202a, alpha: 0.75 });
      }
    }

    // Roof (diamond)
    g.poly([t00.sx, t00.sy, t10.sx, t10.sy, t11.sx, t11.sy, t01.sx, t01.sy]);
    g.fill({ color: roof });
    // Roof highlight
    g.poly([t00.sx, t00.sy, t10.sx, t10.sy, t11.sx, t11.sy]);
    g.fill({ color: shade(roof, 1.25), alpha: 0.25 });
    // Roof edge
    g.poly([t00.sx, t00.sy, t10.sx, t10.sy, t11.sx, t11.sy, t01.sx, t01.sy]);
    g.stroke({ color: shade(accent, 0.7), width: 1, alpha: 0.5 });

    // Accent strip / sign on front
    const mid = worldToScreen(b.doorX + 0.5, b.doorY + 0.2);
    g.roundRect(mid.sx - 10, mid.sy - h * 0.55 - 6, 20, 8, 1);
    g.fill({ color: accent, alpha: 0.85 });

    // Door recess
    const door = worldToScreen(b.doorX + 0.5, b.doorY + 0.5);
    g.roundRect(door.sx - 6, door.sy - 14, 12, 16, 1);
    g.fill({ color: 0x1a1008 });
    g.roundRect(door.sx - 5, door.sy - 13, 10, 14, 1);
    g.fill({ color: shade(wall, 0.45) });
    g.circle(door.sx + 3, door.sy - 5, 1.2);
    g.fill({ color: 0xc9a227 });

    // Ground footprint soft shadow
    g.poly([c00.sx, c00.sy + 4, c10.sx, c10.sy + 4, c11.sx, c11.sy + 4, c01.sx, c01.sy + 4]);
    g.fill({ color: 0x000000, alpha: 0.2 });
  }

  private drawProps(props: PropPublic[]): void {
    const g = this.propGfx;
    g.clear();
    for (const p of props) {
      const { sx, sy } = worldToScreen(p.x, p.y);
      if (p.kind === "dumpster") {
        g.roundRect(sx - 14, sy - 12, 28, 18, 2);
        g.fill({ color: 0x2a4a32 });
        g.roundRect(sx - 14, sy - 12, 28, 18, 2);
        g.stroke({ color: 0x1a2a1a, width: 1 });
        g.rect(sx - 12, sy - 16, 24, 6);
        g.fill({ color: 0x3a5a3a });
        g.rect(sx - 12, sy - 16, 24, 6);
        g.stroke({ color: 0x1a301a, width: 1 });
      } else if (p.kind === "car") {
        g.ellipse(sx, sy + 6, 16, 5);
        g.fill({ color: 0x000000, alpha: 0.25 });
        g.roundRect(sx - 16, sy - 10, 32, 16, 4);
        g.fill({ color: 0x5a2828 });
        g.roundRect(sx - 10, sy - 14, 10, 6, 1);
        g.fill({ color: 0x88b0d0, alpha: 0.75 });
        g.circle(sx - 10, sy + 6, 3.5);
        g.fill({ color: 0x1a1a1a });
        g.circle(sx + 10, sy + 6, 3.5);
        g.fill({ color: 0x1a1a1a });
      } else if (p.kind === "protection") {
        const pulse = 0.45 + Math.sin(this.time * 3 + p.x) * 0.2;
        g.circle(sx, sy, 10);
        g.stroke({ color: 0xf0a030, width: 2, alpha: pulse });
        g.circle(sx, sy, 4);
        g.fill({ color: 0xffcc33, alpha: pulse });
      } else if (p.kind === "crate") {
        g.rect(sx - 9, sy - 10, 18, 16);
        g.fill({ color: 0x6a5030 });
        g.rect(sx - 9, sy - 10, 18, 16);
        g.stroke({ color: 0x3a2810, width: 1 });
        g.moveTo(sx - 9, sy - 2);
        g.lineTo(sx + 9, sy - 2);
        g.stroke({ color: 0x3a2810, width: 1 });
      } else if (p.kind === "neon") {
        const pulse = 0.55 + Math.sin(this.time * 5) * 0.35;
        g.roundRect(sx - 14, sy - 20, 28, 12, 2);
        g.fill({ color: 0x180818 });
        g.roundRect(sx - 12, sy - 18, 24, 8, 1);
        g.fill({ color: 0xff40aa, alpha: pulse });
      } else if (p.kind === "hydrant") {
        g.roundRect(sx - 4, sy - 12, 8, 14, 1);
        g.fill({ color: 0xc04030 });
        g.circle(sx, sy - 14, 5);
        g.fill({ color: 0xe05040 });
      }
    }
  }

  private drawEntities(snap: WorldSnapshot): void {
    const g = this.entityGfx;
    g.clear();
    this.labels.removeChildren();

    const sorted = [...snap.units].sort((a, b) => {
      const va = this.visuals.get(a.id) ?? a;
      const vb = this.visuals.get(b.id) ?? b;
      return va.x + va.y - (vb.x + vb.y);
    });
    for (const u of sorted) this.drawUnit(g, u, snap);

    const sel = snap.units.find((u) => u.id === snap.you.selectedUnitId);
    if (sel?.alive) {
      const v = this.visuals.get(sel.id) ?? sel;
      const { sx, sy } = worldToScreen(v.x, v.y);
      const pulse = 0.55 + Math.sin(this.time * 4) * 0.2;
      g.circle(sx, sy + 12, 13);
      g.stroke({ color: 0xffcc33, width: 1.5, alpha: pulse });
    }
  }

  private drawUnit(g: Graphics, u: UnitPublic, snap: WorldSnapshot): void {
    const vis = this.visuals.get(u.id) ?? {
      x: u.x,
      y: u.y,
      facing: u.facing,
      phase: 0,
      moving: false,
    };
    const bob = vis.moving ? Math.sin(vis.phase) * 1.8 : 0;
    const sway = vis.moving ? Math.sin(vis.phase * 0.5) * 0.8 : 0;
    const { sx, sy: baseSy } = worldToScreen(vis.x, vis.y);
    const sy = baseSy + bob;

    const posse = snap.posses.find((p) => p.id === u.posseId);
    const color = posse?.color ?? 0xaaaaaa;
    const mine = u.posseId === snap.you.posseId;
    const bulk = armorBulk(u.armor);
    const threat = threatPips(u);

    // Shadow (stable on ground)
    g.ellipse(sx + sway * 0.3, baseSy + 11, 10 + bulk + (vis.moving ? 1 : 0), 4.5);
    g.fill({ color: 0x000000, alpha: 0.32 });

    if (!u.alive) {
      g.ellipse(sx, baseSy + 4, 13, 6);
      g.fill({ color: 0x4a2020, alpha: 0.85 });
      return;
    }

    // Legs with walk cycle
    const leg = vis.moving ? Math.sin(vis.phase) * 3 : 0;
    g.rect(sx - 5 + sway * 0.2, baseSy - 1 + Math.max(0, leg), 3, 7 - Math.abs(leg) * 0.3);
    g.fill({ color: 0x252530 });
    g.rect(sx + 2 + sway * 0.2, baseSy - 1 + Math.max(0, -leg), 3, 7 - Math.abs(leg) * 0.3);
    g.fill({ color: 0x252530 });

    // Body
    const bw = 11 + bulk * 2;
    const bh = 15 + bulk;
    const bodyColor =
      u.armor === "plate"
        ? 0x5a6a72
        : u.armor === "kevlar"
          ? 0x3a4a3a
          : u.armor === "leather"
            ? 0x5a4030
            : shade(color, 0.85);
    g.roundRect(sx - bw / 2 + sway, sy - bh - 2, bw, bh, 2);
    g.fill({ color: bodyColor });
    // body highlight
    g.rect(sx - bw / 2 + 2 + sway, sy - bh, 2, bh - 4);
    g.fill({ color: 0xffffff, alpha: 0.08 });

    if (mine) {
      g.roundRect(sx - bw / 2 + sway, sy - bh - 2, bw, bh, 2);
      g.stroke({ color: 0xffe080, width: 1, alpha: 0.9 });
    }
    if (posse?.hostile && !mine) {
      g.circle(sx + bw / 2 + 2 + sway, sy - bh - 5, 3);
      g.fill({ color: 0xff3030 });
    }
    if (bulk >= 2) {
      g.rect(sx - bw / 2 + 2 + sway, sy - bh + 3, bw - 4, 2);
      g.fill({ color: 0x9aafc0, alpha: 0.45 });
    }

    // Head
    g.circle(sx + sway * 0.5, sy - bh - 5, 4.5);
    g.fill({ color: u.kind === "npc" ? 0xd0b090 : 0xe8c8a0 });
    // eyes
    const eyeOff = vis.facing >= 4 ? -1 : 1;
    g.circle(sx - 1.5 + eyeOff + sway * 0.5, sy - bh - 5.5, 0.8);
    g.fill({ color: 0x1a1a1a });
    g.circle(sx + 1.5 + eyeOff + sway * 0.5, sy - bh - 5.5, 0.8);
    g.fill({ color: 0x1a1a1a });

    this.drawWeapon(g, sx + sway, sy - bh / 2 - 2, u.weapon, mine, vis.facing);

    // Threat pips
    if (threat > 0) {
      for (let i = 0; i < threat; i++) {
        g.roundRect(sx - threat * 3 + i * 6, sy - bh - 17, 4, 3, 0.5);
        g.fill({ color: i < 3 ? 0x60c080 : 0xffcc33 });
      }
    }

    if (u.health < u.maxHealth || posse?.hostile) {
      g.roundRect(sx - 12, sy - bh - 21, 24, 3, 1);
      g.fill({ color: 0x1a1a1a });
      g.roundRect(sx - 12, sy - bh - 21, 24 * Math.max(0, u.health / u.maxHealth), 3, 1);
      g.fill({ color: mine ? 0x60c080 : 0xe04040 });
    }

    const label = new Text({
      text: u.name.split(" ")[0] ?? u.name,
      style: {
        fontSize: 10,
        fill: mine ? 0xffe080 : threat >= 3 ? 0xffa0a0 : 0xe8e8e8,
        fontWeight: mine || threat >= 3 ? "700" : "500",
        fontFamily: "SF Pro Text, Segoe UI, system-ui, sans-serif",
      },
    });
    label.x = sx - label.width / 2;
    label.y = sy - bh - 34;
    this.labels.addChild(label);

    if (!mine && (threat >= 2 || u.armor !== "none")) {
      const gear = new Text({
        text: `${u.weapon}${u.armor !== "none" ? " · " + u.armor : ""}`,
        style: { fontSize: 8, fill: 0xa8b0c0, fontFamily: "system-ui, sans-serif" },
      });
      gear.x = sx - gear.width / 2;
      gear.y = sy - bh - 23;
      this.labels.addChild(gear);
    }

    if (mine && u.id === snap.you.selectedUnitId) {
      const n = new Text({
        text: "▼",
        style: { fontSize: 11, fill: 0xffcc33 },
      });
      n.x = sx - 5;
      n.y = sy - bh - 46 + Math.sin(this.time * 4) * 2;
      this.labels.addChild(n);
    }
  }

  private drawWeapon(
    g: Graphics,
    sx: number,
    sy: number,
    weapon: string,
    mine: boolean,
    facing: number,
  ): void {
    const flip = facing >= 4 ? -1 : 1;
    const col = mine ? 0xe8e0d0 : 0xb0b0b0;
    const dark = 0x3a3a42;
    const ox = sx + flip * 6;
    if (weapon === "pipe" || weapon === "switchblade") {
      g.rect(ox, sy - 1, flip * 11, 2);
      g.fill({ color: col });
    } else if (weapon === "pistol") {
      g.rect(ox, sy - 1, flip * 9, 3);
      g.fill({ color: dark });
      g.rect(ox + flip * 1, sy + 2, flip * 2, 4);
      g.fill({ color: dark });
    } else if (weapon === "uzi" || weapon === "tommy") {
      g.rect(ox, sy - 2, flip * 14, 3);
      g.fill({ color: dark });
      g.rect(ox + flip * 4, sy + 1, flip * 4, 5);
      g.fill({ color: 0x555 });
      if (weapon === "tommy") {
        g.circle(ox + flip * 6, sy + 4, 3);
        g.fill({ color: 0x4a4a4a });
      }
    } else if (weapon === "shotgun") {
      g.rect(ox, sy - 1, flip * 16, 2);
      g.fill({ color: col });
      g.rect(ox + flip * 1, sy + 1, flip * 3, 4);
      g.fill({ color: dark });
    } else if (weapon === "flamethrower") {
      g.rect(ox, sy - 2, flip * 12, 3);
      g.fill({ color: dark });
      g.circle(ox + flip * 13, sy - 2, 3);
      g.fill({ color: 0xff6020, alpha: 0.85 });
    }
  }

  private tickFx(dt: number): void {
    const g = this.fxGfx;
    g.clear();
    const next: typeof this.fx = [];
    for (const f of this.fx) {
      f.life -= dt;
      if (f.life <= 0) continue;
      next.push(f);
      const { sx, sy } = worldToScreen(f.x, f.y);
      const a = Math.max(0, f.life * 5);
      if (f.kind === "muzzle") {
        g.circle(sx + 12, sy - 12, 5 + (0.12 - f.life) * 25);
        g.fill({ color: 0xffcc44, alpha: a });
      } else if (f.kind === "blood") {
        g.circle(sx, sy, 3 + (0.28 - f.life) * 8);
        g.fill({ color: 0xa02020, alpha: a * 0.8 });
      } else {
        g.circle(sx, sy - 8, 2);
        g.fill({ color: 0xffffff, alpha: a });
      }
    }
    this.fx = next;
  }

  private updateCamera(dt: number): void {
    const { sx, sy } = worldToScreen(this.followX, this.followY);
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    const targetX = sx - w / 2;
    const targetY = sy - h / 2;
    const k = 1 - Math.exp(-8 * dt);
    this.camX += (targetX - this.camX) * k;
    this.camY += (targetY - this.camY) * k;
    this.root.x = -this.camX;
    this.root.y = -this.camY;
  }

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return screenToWorld(sx, sy, this.camX, this.camY);
  }

  pickUnit(clientX: number, clientY: number, radius = 1.2): string | null {
    const snap = this.lastSnap;
    if (!snap) return null;
    const w = this.screenToWorld(clientX, clientY);
    let best: UnitPublic | null = null;
    let bestD = radius;
    for (const u of snap.units) {
      if (!u.alive) continue;
      const v = this.visuals.get(u.id) ?? u;
      const d = Math.hypot(v.x - w.x, v.y - w.y);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best?.id ?? null;
  }
}
