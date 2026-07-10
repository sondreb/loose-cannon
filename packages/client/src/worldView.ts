import {
  MOVE_SPEED,
  SAFE_Y_MAX,
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
  tx: number;
  ty: number;
  facing: number;
  phase: number;
  moving: boolean;
  /** Local prediction active (WASD / click) */
  predicted: boolean;
  predDirX: number;
  predDirY: number;
  lastServerX: number;
  lastServerY: number;
}

const FLOOR_PX = 18;
/** Snapshots can arrive at 30Hz; render every frame with prediction */
const PRED_SPEED = MOVE_SPEED;

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
  private labelPool = new Map<string, Text>();
  private fx: Array<{ x: number; y: number; life: number; kind: "muzzle" | "blood" | "spark" }> =
    [];
  private time = 0;
  private localPosseId: string | null = null;
  private entitiesDirty = true;
  private frame = 0;
  /** Last camera cell used for map viewport redraw */
  private mapCamCellX = Number.NaN;
  private mapCamCellY = Number.NaN;
  private mapRedrawPending = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.app = new Application();
  }

  async init(): Promise<void> {
    await this.app.init({
      canvas: this.canvas,
      resizeTo: window,
      background: 0x0a0c12,
      antialias: false,
      // Cap resolution for stable 60fps on integrated GPUs
      resolution: Math.min(window.devicePixelRatio || 1, 1),
      autoDensity: true,
      powerPreference: "high-performance",
      // Prefer round pixels — cheaper than subpixel AA
      roundPixels: true,
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
    this.app.ticker.maxFPS = 60;
    this.app.ticker.minFPS = 30;
    this.app.ticker.add((ticker) => {
      const dt = Math.min(0.05, ticker.deltaMS / 1000);
      this.time += dt;
      this.frame++;
      this.tickFx(dt);
      this.stepPrediction(dt);
      this.interpolateRemotes(dt);
      this.updateCamera(dt);
      // Viewport-culled ground only when camera cell changes (not every frame)
      if (this.mapRedrawPending && this.lastSnap) {
        this.drawMapViewport(this.lastSnap);
        this.mapRedrawPending = false;
      }
      if (this.lastSnap) this.drawEntities(this.lastSnap);
      this.entitiesDirty = false;
    });
  }

  getSnapshot(): WorldSnapshot | null {
    return this.lastSnap;
  }

  /**
   * Instant local prediction for WASD — call every frame while keys held.
   * World-space unit vector (same as intent.dir).
   */
  setLocalPrediction(dirX: number, dirY: number): void {
    if (!this.lastSnap || !this.localPosseId) return;
    const len = Math.hypot(dirX, dirY);
    for (const u of this.lastSnap.units) {
      if (u.posseId !== this.localPosseId || !u.alive) continue;
      const v = this.visuals.get(u.id);
      if (!v) continue;
      if (len < 0.01) {
        v.predicted = false;
        v.predDirX = 0;
        v.predDirY = 0;
        v.moving = false;
      } else {
        v.predicted = true;
        v.predDirX = dirX / len;
        v.predDirY = dirY / len;
        v.moving = true;
      }
    }
    this.entitiesDirty = true;
  }

  /** Instant click-to-move prediction toward world point */
  predictClickMove(wx: number, wy: number): void {
    if (!this.lastSnap || !this.localPosseId) return;
    let i = 0;
    for (const u of this.lastSnap.units) {
      if (u.posseId !== this.localPosseId || !u.alive) continue;
      const v = this.visuals.get(u.id);
      if (!v) continue;
      const ox = (i % 2 === 0 ? -0.45 : 0.45) * (u.isPlayerLeader || u.kind === "player" ? 0 : 1);
      const oy = (i >= 2 ? 0.45 : -0.15) * (u.isPlayerLeader || u.kind === "player" ? 0 : 1);
      v.tx = wx + ox;
      v.ty = wy + oy;
      v.predicted = true;
      v.predDirX = 0;
      v.predDirY = 0;
      // flag click-follow via non-zero distance
      v.moving = true;
      i++;
    }
    this.entitiesDirty = true;
  }

  clearLocalPrediction(): void {
    for (const v of this.visuals.values()) {
      v.predicted = false;
      v.predDirX = 0;
      v.predDirY = 0;
    }
  }

  burstFx(x: number, y: number, kind: "muzzle" | "blood" | "spark"): void {
    this.fx.push({ x, y, life: kind === "muzzle" ? 0.1 : 0.2, kind });
  }

  applySnapshot(snap: WorldSnapshot): void {
    if (snap.floors) this.cachedFloors = snap.floors;
    if (snap.blocked) this.cachedBlocked = snap.blocked;
    this.lastSnap = snap;
    this.localPosseId = snap.you.posseId;

    const me =
      snap.units.find(
        (u) => u.posseId === snap.you.posseId && (u.isPlayerLeader || u.kind === "player"),
      ) ?? snap.units.find((u) => u.posseId === snap.you.posseId);
    if (me) {
      const v = this.visuals.get(me.id);
      // Follow predicted position if predicting, else server
      this.followX = v?.predicted ? v.x : me.x;
      this.followY = v?.predicted ? v.y : me.y;
    }

    const seen = new Set<string>();
    for (const u of snap.units) {
      seen.add(u.id);
      let v = this.visuals.get(u.id);
      if (!v) {
        v = {
          x: u.x,
          y: u.y,
          tx: u.x,
          ty: u.y,
          facing: u.facing,
          phase: Math.random() * 6,
          moving: false,
          predicted: false,
          predDirX: 0,
          predDirY: 0,
          lastServerX: u.x,
          lastServerY: u.y,
        };
        this.visuals.set(u.id, v);
      } else {
        v.lastServerX = u.x;
        v.lastServerY = u.y;
        // Soft-correct if not predicted, or if far from server (desync)
        if (!v.predicted) {
          v.tx = u.x;
          v.ty = u.y;
        } else {
          const err = Math.hypot(v.x - u.x, v.y - u.y);
          if (err > 2.2) {
            // hard snap if badly desynced
            v.x = u.x;
            v.y = u.y;
          } else if (err > 0.08) {
            // gentle reconcile so prediction stays glued to authority
            v.x += (u.x - v.x) * 0.22;
            v.y += (u.y - v.y) * 0.22;
          }
        }
      }
    }
    for (const id of [...this.visuals.keys()]) {
      if (!seen.has(id)) {
        this.visuals.delete(id);
        const lab = this.labelPool.get(id);
        if (lab) {
          lab.destroy();
          this.labelPool.delete(id);
        }
      }
    }

    const key = `${snap.mapRevision}:${snap.you.insideBuildingId ?? "out"}`;
    if (key !== this.mapBuiltFor && this.cachedFloors?.length) {
      this.mapBuiltFor = key;
      this.mapCamCellX = Number.NaN;
      this.mapCamCellY = Number.NaN;
      this.mapRedrawPending = true;
      this.drawBuildings(snap);
      this.drawProps(snap.props ?? []);
    }
    this.entitiesDirty = true;
  }

  private stepPrediction(dt: number): void {
    if (!this.lastSnap || !this.localPosseId) return;
    const speed = PRED_SPEED;
    for (const u of this.lastSnap.units) {
      if (u.posseId !== this.localPosseId || !u.alive) continue;
      const v = this.visuals.get(u.id);
      if (!v || !v.predicted) continue;

      if (v.predDirX !== 0 || v.predDirY !== 0) {
        // Continuous WASD prediction
        v.x += v.predDirX * speed * dt;
        v.y += v.predDirY * speed * dt;
        v.facing = Math.round((Math.atan2(v.predDirY, v.predDirX) + Math.PI) / (Math.PI / 4)) % 8;
        v.phase += dt * 10;
        v.moving = true;
      } else {
        // Click-move prediction toward tx,ty
        const dx = v.tx - v.x;
        const dy = v.ty - v.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.04) {
          const step = Math.min(d, speed * dt);
          v.x += (dx / d) * step;
          v.y += (dy / d) * step;
          v.facing = Math.round((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)) % 8;
          v.phase += dt * 10;
          v.moving = true;
        } else {
          v.moving = false;
          // Keep predicted until server catches up, then release
          const err = Math.hypot(v.x - v.lastServerX, v.y - v.lastServerY);
          if (err < 0.2) v.predicted = false;
        }
      }
    }
    // Camera follows predicted leader
    const me = this.lastSnap.units.find(
      (u) => u.posseId === this.localPosseId && (u.isPlayerLeader || u.kind === "player"),
    );
    if (me) {
      const v = this.visuals.get(me.id);
      if (v) {
        this.followX = v.x;
        this.followY = v.y;
      }
    }
  }

  private interpolateRemotes(dt: number): void {
    if (!this.lastSnap) return;
    const k = 1 - Math.exp(-18 * dt); // snappy catch-up
    for (const u of this.lastSnap.units) {
      if (u.posseId === this.localPosseId) continue; // locals use prediction
      const v = this.visuals.get(u.id);
      if (!v) continue;
      const dx = u.x - v.x;
      const dy = u.y - v.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        v.x += dx * k;
        v.y += dy * k;
        v.moving = dist > 0.05;
        if (dist > 0.03) {
          v.facing = Math.round((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)) % 8;
          v.phase += dt * 9;
        }
      } else {
        v.moving = false;
      }
    }
  }

  /**
   * Draw only tiles near the camera. Skip plain grass outdoors (base fill covers
   * that). Full 110×90 Graphics mesh tanks FPS — culling + grass skip keeps ~60.
   */
  private drawMapViewport(snap: WorldSnapshot): void {
    const g = this.tileGfx;
    g.clear();
    const inside = snap.you.insideBuildingId;
    const { sx: camSx, sy: camSy } = worldToScreen(this.followX, this.followY);
    const halfW = this.app.renderer.width * 0.65 + TILE_W * 10;
    const halfH = this.app.renderer.height * 0.65 + TILE_H * 12;

    // Solid outdoor ground under sparse tiles (avoids 9k grass polygons)
    if (!inside) {
      g.rect(camSx - halfW, camSy - halfH, halfW * 2, halfH * 2);
      g.fill({ color: 0x2e3a24 });
    }

    const inView = (x: number, y: number): boolean => {
      const p = worldToScreen(x, y);
      return Math.abs(p.sx - camSx) < halfW && Math.abs(p.sy - camSy) < halfH;
    };

    // Sparse grass sprinkle for texture
    if (!inside) {
      for (const f of this.cachedFloors ?? []) {
        if (f.type !== "grass") continue;
        if ((f.x + f.y * 3) % 7 !== 0) continue;
        if (!inView(f.x, f.y)) continue;
        this.drawGroundTile(g, f.x, f.y, "grass");
      }
    }

    for (const f of this.cachedFloors ?? []) {
      if (f.type === "grass" && !inside) continue;
      if (!inside && f.type === "floor") continue;
      if (!inView(f.x, f.y)) continue;
      this.drawGroundTile(g, f.x, f.y, f.type);
    }
    for (const b of this.cachedBlocked ?? []) {
      if (!inView(b.x, b.y)) continue;
      if (b.type === "void" && !inside) continue;
      if (b.type === "wall" && !inside) {
        this.drawGroundTile(g, b.x, b.y, "sidewalk");
        continue;
      }
      this.drawGroundTile(g, b.x, b.y, b.type);
    }
  }

  private drawGroundTile(g: Graphics, x: number, y: number, type: string): void {
    const { sx, sy } = worldToScreen(x, y);
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;

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

    g.poly([sx, sy, sx + hw, sy + hh, sx, sy + TILE_H, sx - hw, sy + hh]);
    g.fill({ color });

    if (type === "road" && (x + y) % 3 === 0) {
      g.rect(sx - 6, sy + 8, 12, 2);
      g.fill({ color: 0xc9a227, alpha: 0.4 });
    }
    if (type === "door") {
      g.roundRect(sx - 5, sy + 2, 10, 12, 1);
      g.fill({ color: 0x5a3018 });
    }
  }

  private drawBuildings(snap: WorldSnapshot): void {
    const g = this.buildingGfx;
    g.clear();
    this.overlayLayer.removeChildren();
    if (snap.you.insideBuildingId) return;

    // Safe/war zone divider visual
    this.drawZoneDivider(g);

    const buildings = [...snap.buildings]
      .filter((b) => b.ex0 != null)
      .sort((a, b) => a.ex0! + a.ey0! - (b.ex0! + b.ey0!));

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
          fontFamily: "system-ui, sans-serif",
        },
      });
      title.x = sx - title.width / 2;
      title.y = sy - h - 28;
      this.overlayLayer.addChild(title);
    }
  }

  private drawZoneDivider(g: Graphics): void {
    // Visual line at SAFE_Y_MAX (PvE north / PvP south)
    const y = SAFE_Y_MAX;
    for (let x = 0; x < 110; x += 3) {
      const a = worldToScreen(x, y);
      const b = worldToScreen(x + 3, y);
      g.moveTo(a.sx, a.sy);
      g.lineTo(b.sx, b.sy);
    }
    g.stroke({ color: 0xff4040, width: 2, alpha: 0.4 });
    // Fewer labels along the war line
    for (const midX of [28, 55, 82]) {
      const mid = worldToScreen(midX, SAFE_Y_MAX - 0.8);
      const safe = new Text({
        text: "▲ SAFE (PvE)",
        style: { fontSize: 11, fill: 0x60c080, fontWeight: "700" },
      });
      safe.x = mid.sx - safe.width / 2;
      safe.y = mid.sy - 28;
      this.overlayLayer.addChild(safe);
      const war = new Text({
        text: "▼ WAR (PvP)",
        style: { fontSize: 11, fill: 0xff6060, fontWeight: "700" },
      });
      war.x = mid.sx - war.width / 2;
      war.y = mid.sy + 6;
      this.overlayLayer.addChild(war);
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

    const c00 = worldToScreen(x0, y0);
    const c10 = worldToScreen(x1 + 1, y0);
    const c01 = worldToScreen(x0, y1 + 1);
    const c11 = worldToScreen(x1 + 1, y1 + 1);
    const top = (c: { sx: number; sy: number }) => ({ sx: c.sx, sy: c.sy - h });
    const t00 = top(c00);
    const t10 = top(c10);
    const t01 = top(c01);
    const t11 = top(c11);

    g.poly([c00.sx, c00.sy, c01.sx, c01.sy, t01.sx, t01.sy, t00.sx, t00.sy]);
    g.fill({ color: shade(wall, 0.72) });
    g.poly([c00.sx, c00.sy, c10.sx, c10.sy, t10.sx, t10.sy, t00.sx, t00.sy]);
    g.fill({ color: shade(wall, 0.9) });
    g.poly([c01.sx, c01.sy, c11.sx, c11.sy, t11.sx, t11.sy, t01.sx, t01.sy]);
    g.fill({ color: shade(wall, 0.65), alpha: 0.9 });
    g.poly([c10.sx, c10.sy, c11.sx, c11.sy, t11.sx, t11.sy, t10.sx, t10.sy]);
    g.fill({ color: shade(wall, 0.8), alpha: 0.9 });

    // Fewer windows for perf
    for (let f = 0; f < stories; f++) {
      const fy = 1 - (f + 0.55) / stories;
      for (let i = 1; i <= 2; i++) {
        const t = i / 3;
        const bx = c00.sx + (c10.sx - c00.sx) * t;
        const by = c00.sy + (c10.sy - c00.sy) * t;
        const lit = (b.id.charCodeAt(0) + f + i) % 2 === 0;
        g.rect(bx - 3, by - h * fy - 4, 6, 5);
        g.fill({ color: lit ? accent : 0x1a2030, alpha: lit ? 0.8 : 0.45 });
      }
    }

    g.poly([t00.sx, t00.sy, t10.sx, t10.sy, t11.sx, t11.sy, t01.sx, t01.sy]);
    g.fill({ color: roof });
    g.poly([t00.sx, t00.sy, t10.sx, t10.sy, t11.sx, t11.sy, t01.sx, t01.sy]);
    g.stroke({ color: shade(accent, 0.7), width: 1, alpha: 0.45 });

    const door = worldToScreen(b.doorX + 0.5, b.doorY + 0.5);
    g.roundRect(door.sx - 6, door.sy - 14, 12, 16, 1);
    g.fill({ color: 0x1a1008 });
    g.roundRect(door.sx - 5, door.sy - 13, 10, 14, 1);
    g.fill({ color: shade(wall, 0.45) });
  }

  private drawProps(props: PropPublic[]): void {
    const g = this.propGfx;
    g.clear();
    for (const p of props) {
      const { sx, sy } = worldToScreen(p.x, p.y);
      if (p.kind === "dumpster") {
        g.roundRect(sx - 14, sy - 12, 28, 18, 2);
        g.fill({ color: 0x2a4a32 });
      } else if (p.kind === "car") {
        g.roundRect(sx - 16, sy - 10, 32, 16, 4);
        g.fill({ color: 0x5a2828 });
        g.circle(sx - 10, sy + 6, 3);
        g.fill({ color: 0x1a1a1a });
        g.circle(sx + 10, sy + 6, 3);
        g.fill({ color: 0x1a1a1a });
      } else if (p.kind === "protection") {
        g.circle(sx, sy, 9);
        g.stroke({ color: 0xf0a030, width: 2, alpha: 0.55 });
        g.circle(sx, sy, 3);
        g.fill({ color: 0xffcc33, alpha: 0.5 });
      } else if (p.kind === "crate") {
        g.rect(sx - 9, sy - 10, 18, 16);
        g.fill({ color: 0x6a5030 });
      } else if (p.kind === "neon") {
        g.roundRect(sx - 12, sy - 18, 24, 10, 2);
        g.fill({ color: 0xff40aa, alpha: 0.7 });
      } else if (p.kind === "hydrant") {
        g.roundRect(sx - 4, sy - 12, 8, 14, 1);
        g.fill({ color: 0xc04030 });
      }
    }
  }

  private getLabel(id: string, text: string, style: ConstructorParameters<typeof Text>[0] extends infer T ? T : never): Text {
    let lab = this.labelPool.get(id);
    if (!lab) {
      lab = new Text({ text, style: { fontSize: 10, fill: 0xffffff, fontFamily: "system-ui,sans-serif" } });
      this.labelPool.set(id, lab);
      this.labels.addChild(lab);
    }
    if (lab.text !== text) lab.text = text;
    return lab;
  }

  private drawEntities(snap: WorldSnapshot): void {
    const g = this.entityGfx;
    g.clear();

    // Hide unused labels
    const used = new Set<string>();
    const { sx: camSx, sy: camSy } = worldToScreen(this.followX, this.followY);
    const cullR = Math.max(this.app.renderer.width, this.app.renderer.height) * 0.75;

    const sorted = snap.units
      .filter((u) => {
        const v = this.visuals.get(u.id) ?? u;
        const p = worldToScreen(v.x, v.y);
        // Always draw own posse (prediction) even if slightly off-screen
        if (u.posseId === snap.you.posseId) return true;
        return Math.hypot(p.sx - camSx, p.sy - camSy) < cullR;
      })
      .sort((a, b) => {
        const va = this.visuals.get(a.id) ?? a;
        const vb = this.visuals.get(b.id) ?? b;
        return va.x + va.y - (vb.x + vb.y);
      });

    for (const u of sorted) {
      this.drawUnit(g, u, snap, used);
    }

    for (const [id, lab] of this.labelPool) {
      if (!used.has(id) && !used.has(id + ":g")) {
        lab.visible = false;
      }
    }

    const sel = snap.units.find((u) => u.id === snap.you.selectedUnitId);
    if (sel?.alive) {
      const v = this.visuals.get(sel.id) ?? sel;
      const { sx, sy } = worldToScreen(v.x, v.y);
      g.circle(sx, sy + 12, 12);
      g.stroke({ color: 0xffcc33, width: 1.5, alpha: 0.7 });
    }
  }

  private drawUnit(g: Graphics, u: UnitPublic, snap: WorldSnapshot, used: Set<string>): void {
    const vis = this.visuals.get(u.id) ?? {
      x: u.x,
      y: u.y,
      tx: u.x,
      ty: u.y,
      facing: u.facing,
      phase: 0,
      moving: false,
      predicted: false,
      predDirX: 0,
      predDirY: 0,
      lastServerX: u.x,
      lastServerY: u.y,
    };
    const bob = vis.moving ? Math.sin(vis.phase) * 1.6 : 0;
    const sway = vis.moving ? Math.sin(vis.phase * 0.5) * 0.7 : 0;
    const { sx, sy: baseSy } = worldToScreen(vis.x, vis.y);
    const sy = baseSy + bob;

    const posse = snap.posses.find((p) => p.id === u.posseId);
    const color = posse?.color ?? 0xaaaaaa;
    const mine = u.posseId === snap.you.posseId;
    const bulk = armorBulk(u.armor);
    const threat = threatPips(u);

    g.ellipse(sx, baseSy + 11, 10 + bulk, 4.5);
    g.fill({ color: 0x000000, alpha: 0.3 });

    if (!u.alive) {
      g.ellipse(sx, baseSy + 4, 12, 6);
      g.fill({ color: 0x4a2020, alpha: 0.8 });
      return;
    }

    const leg = vis.moving ? Math.sin(vis.phase) * 2.5 : 0;
    g.rect(sx - 5 + sway * 0.2, baseSy - 1 + Math.max(0, leg), 3, 7);
    g.fill({ color: 0x252530 });
    g.rect(sx + 2 + sway * 0.2, baseSy - 1 + Math.max(0, -leg), 3, 7);
    g.fill({ color: 0x252530 });

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
    if (mine) {
      g.roundRect(sx - bw / 2 + sway, sy - bh - 2, bw, bh, 2);
      g.stroke({ color: 0xffe080, width: 1 });
    }
    if (posse?.hostile && !mine) {
      g.circle(sx + bw / 2 + 2 + sway, sy - bh - 5, 3);
      g.fill({ color: 0xff3030 });
    }
    if (bulk >= 2) {
      g.rect(sx - bw / 2 + 2 + sway, sy - bh + 3, bw - 4, 2);
      g.fill({ color: 0x9aafc0, alpha: 0.4 });
    }

    g.circle(sx + sway * 0.5, sy - bh - 5, 4.5);
    g.fill({ color: u.kind === "npc" ? 0xd0b090 : 0xe8c8a0 });

    this.drawWeapon(g, sx + sway, sy - bh / 2 - 2, u.weapon, mine, vis.facing);

    if (threat > 0) {
      for (let i = 0; i < threat; i++) {
        g.rect(sx - threat * 3 + i * 6, sy - bh - 17, 4, 3);
        g.fill({ color: i < 3 ? 0x60c080 : 0xffcc33 });
      }
    }

    if (u.health < u.maxHealth || posse?.hostile) {
      g.rect(sx - 12, sy - bh - 21, 24, 3);
      g.fill({ color: 0x1a1a1a });
      g.rect(sx - 12, sy - bh - 21, 24 * Math.max(0, u.health / u.maxHealth), 3);
      g.fill({ color: mine ? 0x60c080 : 0xe04040 });
    }

    // Pooled name label
    const name = u.name.split(" ")[0] ?? u.name;
    let lab = this.labelPool.get(u.id);
    if (!lab) {
      lab = new Text({
        text: name,
        style: {
          fontSize: 10,
          fill: 0xffffff,
          fontWeight: "600",
          fontFamily: "system-ui,sans-serif",
        },
      });
      this.labelPool.set(u.id, lab);
      this.labels.addChild(lab);
    }
    lab.visible = true;
    if (lab.text !== name) lab.text = name;
    lab.style.fill = mine ? 0xffe080 : threat >= 3 ? 0xffa0a0 : 0xe8e8e8;
    lab.x = sx - lab.width / 2;
    lab.y = sy - bh - 34;
    used.add(u.id);

    if (!mine && (threat >= 2 || u.armor !== "none")) {
      const gid = u.id + ":g";
      const gtxt = `${u.weapon}${u.armor !== "none" ? " · " + u.armor : ""}`;
      let gl = this.labelPool.get(gid);
      if (!gl) {
        gl = new Text({
          text: gtxt,
          style: { fontSize: 8, fill: 0xa8b0c0, fontFamily: "system-ui,sans-serif" },
        });
        this.labelPool.set(gid, gl);
        this.labels.addChild(gl);
      }
      gl.visible = true;
      if (gl.text !== gtxt) gl.text = gtxt;
      gl.x = sx - gl.width / 2;
      gl.y = sy - bh - 23;
      used.add(gid);
    }

    if (mine && u.id === snap.you.selectedUnitId) {
      g.moveTo(sx, sy - bh - 40);
      g.lineTo(sx - 4, sy - bh - 34);
      g.lineTo(sx + 4, sy - bh - 34);
      g.closePath();
      g.fill({ color: 0xffcc33 });
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
    } else if (weapon === "uzi" || weapon === "tommy") {
      g.rect(ox, sy - 2, flip * 14, 3);
      g.fill({ color: dark });
      if (weapon === "tommy") {
        g.circle(ox + flip * 6, sy + 3, 2.5);
        g.fill({ color: 0x4a4a4a });
      }
    } else if (weapon === "shotgun") {
      g.rect(ox, sy - 1, flip * 16, 2);
      g.fill({ color: col });
    } else if (weapon === "flamethrower") {
      g.rect(ox, sy - 2, flip * 12, 3);
      g.fill({ color: dark });
      g.circle(ox + flip * 13, sy - 2, 3);
      g.fill({ color: 0xff6020, alpha: 0.8 });
    }
  }

  private tickFx(dt: number): void {
    if (this.fx.length === 0) {
      this.fxGfx.clear();
      return;
    }
    const g = this.fxGfx;
    g.clear();
    const next: typeof this.fx = [];
    for (const f of this.fx) {
      f.life -= dt;
      if (f.life <= 0) continue;
      next.push(f);
      const { sx, sy } = worldToScreen(f.x, f.y);
      const a = Math.max(0, f.life * 5);
      g.circle(sx + 10, sy - 10, 4);
      g.fill({ color: f.kind === "blood" ? 0xa02020 : 0xffcc44, alpha: a });
    }
    this.fx = next;
  }

  private updateCamera(dt: number): void {
    const { sx, sy } = worldToScreen(this.followX, this.followY);
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    const targetX = sx - w / 2;
    const targetY = sy - h / 2;
    // Snappier follow so predicted movement doesn't feel laggy on camera
    const k = 1 - Math.exp(-18 * dt);
    this.camX += (targetX - this.camX) * k;
    this.camY += (targetY - this.camY) * k;
    this.root.x = -this.camX;
    this.root.y = -this.camY;

    // Rebuild ground mesh when camera moves ~4 tiles (keeps tile count low)
    const cellX = Math.floor(this.followX / 4);
    const cellY = Math.floor(this.followY / 4);
    if (cellX !== this.mapCamCellX || cellY !== this.mapCamCellY) {
      this.mapCamCellX = cellX;
      this.mapCamCellY = cellY;
      this.mapRedrawPending = true;
    }
  }

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return screenToWorld(clientX - rect.left, clientY - rect.top, this.camX, this.camY);
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
