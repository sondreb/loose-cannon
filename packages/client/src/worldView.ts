import {
  INTERACT_RANGE,
  MOVE_SPEED,
  SAFE_Y_MAX,
  TILE_H,
  TILE_W,
  type BuildingPublic,
  type CombatFxEvent,
  type PropPublic,
  type UnitPublic,
  type WeaponId,
  type WorldSnapshot,
} from "@loose-cannon/shared";
import { Application, Container, Graphics, Text } from "pixi.js";
import { screenToWorld as isoScreenToWorld, worldToScreen } from "./iso.js";

type FxParticle =
  | { kind: "muzzle"; x: number; y: number; life: number; max: number; ang: number; big: boolean }
  | {
      kind: "tracer";
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      life: number;
      max: number;
      color: number;
      wide: boolean;
    }
  | { kind: "slash"; x0: number; y0: number; x1: number; y1: number; life: number; max: number }
  | { kind: "blood"; x: number; y: number; life: number; max: number; vx: number; vy: number; r: number }
  | { kind: "spark"; x: number; y: number; life: number; max: number; vx: number; vy: number }
  | { kind: "flame"; x: number; y: number; life: number; max: number; vx: number; vy: number; r: number }
  | { kind: "impact"; x: number; y: number; life: number; max: number; crit: boolean }
  | { kind: "shell"; x: number; y: number; life: number; max: number; vx: number; vy: number };

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

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** War-zone darkness increases south of the safe line */
function warFactor(y: number): number {
  if (y < SAFE_Y_MAX) return 0;
  return Math.min(1, (y - SAFE_Y_MAX) / 28);
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
  /** "dir" = WASD, "click" = path to point */
  predMode: "none" | "dir" | "click";
  predDirX: number;
  predDirY: number;
  lastServerX: number;
  lastServerY: number;
}

export type HoverTarget =
  | { kind: "unit"; id: string; label: string; action: string }
  | { kind: "building"; id: string; label: string; action: string }
  | { kind: "prop"; id: string; label: string; action: string }
  | null;

const FLOOR_PX = 18;
const PRED_SPEED = MOVE_SPEED;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.4;
const ZOOM_STEP = 0.08;

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
  private hoverGfx = new Graphics();
  private fxGfx = new Graphics();
  private labels = new Container();
  private overlayLayer = new Container();
  private camX = 0;
  private camY = 0;
  private followX = 0;
  private followY = 0;
  private zoom = 1;
  private zoomTarget = 1;
  private mapBuiltFor = "";
  private cachedFloors: WorldSnapshot["floors"] = [];
  private cachedBlocked: WorldSnapshot["blocked"] = [];
  private lastSnap: WorldSnapshot | null = null;
  private visuals = new Map<string, UnitVisual>();
  private labelPool = new Map<string, Text>();
  private fx: FxParticle[] = [];
  private moveMarker: { x: number; y: number; life: number } | null = null;
  private hover: HoverTarget = null;
  private time = 0;
  private localPosseId: string | null = null;
  private frame = 0;
  private mapCamCellX = Number.NaN;
  private mapCamCellY = Number.NaN;
  private mapZoomCell = -1;
  private mapRedrawPending = false;
  private buildingLabelPool: Text[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.app = new Application();
  }

  async init(): Promise<void> {
    await this.app.init({
      canvas: this.canvas,
      resizeTo: window,
      background: 0x1a2018,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio || 1, 1),
      autoDensity: true,
      powerPreference: "high-performance",
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
    this.entityLayer.addChild(this.entityGfx, this.hoverGfx, this.fxGfx, this.labels);
    this.app.ticker.maxFPS = 60;
    this.app.ticker.minFPS = 30;
    this.app.ticker.add((ticker) => {
      const dt = Math.min(0.05, ticker.deltaMS / 1000);
      this.time += dt;
      this.frame++;
      this.tickFx(dt);
      this.stepPrediction(dt);
      this.interpolateLocals(dt);
      this.interpolateRemotes(dt);
      this.updateCamera(dt);
      if (this.mapRedrawPending && this.lastSnap) {
        this.drawMapViewport(this.lastSnap);
        this.mapRedrawPending = false;
      }
      if (this.lastSnap) {
        this.drawEntities(this.lastSnap);
        this.drawHoverOverlay(this.lastSnap);
      }
    });
  }

  getSnapshot(): WorldSnapshot | null {
    return this.lastSnap;
  }

  getZoom(): number {
    return this.zoom;
  }

  /** Smooth zoom toward target (clamped). Positive = zoom in. */
  adjustZoom(delta: number): void {
    this.zoomTarget = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoomTarget + delta));
  }

  setZoom(z: number): void {
    this.zoomTarget = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }

  getHover(): HoverTarget {
    return this.hover;
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
        v.predMode = "none";
        v.predDirX = 0;
        v.predDirY = 0;
        v.moving = false;
      } else {
        v.predicted = true;
        v.predMode = "dir";
        v.predDirX = dirX / len;
        v.predDirY = dirY / len;
        v.moving = true;
      }
    }
    this.moveMarker = null;
  }

  /** Instant click-to-move prediction toward world point */
  predictClickMove(wx: number, wy: number): void {
    if (!this.lastSnap || !this.localPosseId) return;
    let i = 0;
    for (const u of this.lastSnap.units) {
      if (u.posseId !== this.localPosseId || !u.alive) continue;
      const v = this.visuals.get(u.id);
      if (!v) continue;
      const isLead = u.isPlayerLeader || u.kind === "player";
      const ox = (i % 2 === 0 ? -0.45 : 0.45) * (isLead ? 0 : 1);
      const oy = (i >= 2 ? 0.45 : -0.15) * (isLead ? 0 : 1);
      v.tx = wx + ox;
      v.ty = wy + oy;
      v.predicted = true;
      v.predMode = "click";
      v.predDirX = 0;
      v.predDirY = 0;
      v.moving = true;
      i++;
    }
    this.moveMarker = { x: wx, y: wy, life: 2.5 };
  }

  clearLocalPrediction(): void {
    for (const v of this.visuals.values()) {
      v.predicted = false;
      v.predMode = "none";
      v.predDirX = 0;
      v.predDirY = 0;
    }
  }

  burstFx(x: number, y: number, kind: "muzzle" | "blood" | "spark"): void {
    if (kind === "muzzle") {
      this.fx.push({
        kind: "muzzle",
        x,
        y,
        life: 0.12,
        max: 0.12,
        ang: 0,
        big: false,
      });
    } else if (kind === "blood") {
      for (let i = 0; i < 4; i++) {
        this.fx.push({
          kind: "blood",
          x,
          y,
          life: 0.35,
          max: 0.35,
          vx: (Math.random() - 0.5) * 2.5,
          vy: (Math.random() - 0.5) * 2.5,
          r: 2 + Math.random() * 3,
        });
      }
    } else {
      this.fx.push({
        kind: "spark",
        x,
        y,
        life: 0.2,
        max: 0.2,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
      });
    }
  }

  /** Apply server combat VFX (shots, melee, hits). */
  applyCombatFx(events: CombatFxEvent[]): void {
    for (const e of events) this.spawnCombatFx(e);
  }

  /** Optimistic local muzzle when player issues fire. */
  playLocalShot(fromX: number, fromY: number, toX: number, toY: number, weapon: WeaponId): void {
    this.spawnCombatFx({
      kind:
        weapon === "pipe" || weapon === "switchblade"
          ? "melee"
          : weapon === "flamethrower"
            ? "flame"
            : "shot",
      x0: fromX,
      y0: fromY,
      x1: toX,
      y1: toY,
      weapon,
    });
  }

  private spawnCombatFx(e: CombatFxEvent): void {
    const dx = e.x1 - e.x0;
    const dy = e.y1 - e.y0;
    const ang = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy) || 0.01;

    if (e.kind === "shot" || e.kind === "flame" || e.kind === "melee") {
      const big = e.weapon === "shotgun" || e.weapon === "tommy";
      // Muzzle flash at shooter
      if (e.kind !== "melee") {
        this.fx.push({
          kind: "muzzle",
          x: e.x0 + Math.cos(ang) * 0.35,
          y: e.y0 + Math.sin(ang) * 0.35,
          life: big ? 0.14 : 0.1,
          max: big ? 0.14 : 0.1,
          ang,
          big,
        });
        // Ejected casing
        if (e.weapon !== "flamethrower") {
          const side = ang + Math.PI / 2;
          this.fx.push({
            kind: "shell",
            x: e.x0,
            y: e.y0,
            life: 0.45,
            max: 0.45,
            vx: Math.cos(side) * (1.2 + Math.random()) + Math.cos(ang) * -0.3,
            vy: Math.sin(side) * (1.2 + Math.random()) + Math.sin(ang) * -0.3,
          });
        }
      }

      if (e.kind === "melee") {
        // Arc slash toward target
        this.fx.push({
          kind: "slash",
          x0: e.x0 + Math.cos(ang) * 0.2,
          y0: e.y0 + Math.sin(ang) * 0.2,
          x1: e.x0 + Math.cos(ang) * Math.min(1.4, dist),
          y1: e.y0 + Math.sin(ang) * Math.min(1.4, dist),
          life: 0.16,
          max: 0.16,
        });
      } else if (e.kind === "flame") {
        const n = 8 + Math.floor(dist * 2);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const jx = (Math.random() - 0.5) * 0.25;
          const jy = (Math.random() - 0.5) * 0.25;
          this.fx.push({
            kind: "flame",
            x: e.x0 + dx * t + jx,
            y: e.y0 + dy * t + jy,
            life: 0.22 + Math.random() * 0.15,
            max: 0.35,
            vx: Math.cos(ang) * 1.5 + (Math.random() - 0.5),
            vy: Math.sin(ang) * 1.5 + (Math.random() - 0.5),
            r: 3 + Math.random() * 5,
          });
        }
      } else {
        // Bullet tracer(s)
        const pellets = e.weapon === "shotgun" ? 5 : e.weapon === "uzi" || e.weapon === "tommy" ? 2 : 1;
        const color =
          e.weapon === "shotgun"
            ? 0xffe080
            : e.weapon === "tommy" || e.weapon === "uzi"
              ? 0xffd040
              : 0xfff0a0;
        for (let i = 0; i < pellets; i++) {
          const spread = pellets > 1 ? (i - (pellets - 1) / 2) * 0.08 : 0;
          const px = -Math.sin(ang) * spread;
          const py = Math.cos(ang) * spread;
          this.fx.push({
            kind: "tracer",
            x0: e.x0 + Math.cos(ang) * 0.4 + px,
            y0: e.y0 + Math.sin(ang) * 0.4 + py,
            x1: e.x1 + px * 3 + (Math.random() - 0.5) * 0.15,
            y1: e.y1 + py * 3 + (Math.random() - 0.5) * 0.15,
            life: e.weapon === "shotgun" ? 0.1 : 0.08,
            max: 0.1,
            color,
            wide: e.weapon === "shotgun",
          });
        }
      }
    }

    if (e.kind === "hit") {
      const n = e.crit ? 10 : 5;
      for (let i = 0; i < n; i++) {
        this.fx.push({
          kind: "blood",
          x: e.x1,
          y: e.y1,
          life: 0.3 + Math.random() * 0.25,
          max: 0.55,
          vx: (Math.random() - 0.5) * (e.crit ? 4 : 2.5),
          vy: (Math.random() - 0.5) * (e.crit ? 4 : 2.5) - 0.5,
          r: 2 + Math.random() * (e.crit ? 5 : 3),
        });
      }
      this.fx.push({
        kind: "impact",
        x: e.x1,
        y: e.y1,
        life: e.crit ? 0.22 : 0.14,
        max: e.crit ? 0.22 : 0.14,
        crit: !!e.crit,
      });
      // Melee impact sparks
      if (e.weapon === "pipe" || e.weapon === "switchblade") {
        for (let i = 0; i < 4; i++) {
          this.fx.push({
            kind: "spark",
            x: e.x1,
            y: e.y1,
            life: 0.18,
            max: 0.18,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
          });
        }
      }
    }

    if (e.kind === "miss") {
      for (let i = 0; i < 3; i++) {
        this.fx.push({
          kind: "spark",
          x: e.x1,
          y: e.y1,
          life: 0.15 + Math.random() * 0.1,
          max: 0.25,
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3,
        });
      }
    }

    if (e.kind === "death") {
      for (let i = 0; i < 14; i++) {
        this.fx.push({
          kind: "blood",
          x: e.x0,
          y: e.y0,
          life: 0.45 + Math.random() * 0.35,
          max: 0.8,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5 - 0.8,
          r: 2 + Math.random() * 5,
        });
      }
      this.fx.push({
        kind: "impact",
        x: e.x0,
        y: e.y0,
        life: 0.28,
        max: 0.28,
        crit: true,
      });
    }

    // Cap particles for FPS
    if (this.fx.length > 220) this.fx.splice(0, this.fx.length - 220);
  }

  applySnapshot(snap: WorldSnapshot): void {
    if (snap.floors) this.cachedFloors = snap.floors;
    if (snap.blocked) this.cachedBlocked = snap.blocked;
    this.lastSnap = snap;
    this.localPosseId = snap.you.posseId;

    if (snap.fx?.length) this.applyCombatFx(snap.fx);

    const me =
      snap.units.find(
        (u) => u.posseId === snap.you.posseId && (u.isPlayerLeader || u.kind === "player"),
      ) ?? snap.units.find((u) => u.posseId === snap.you.posseId);
    if (me) {
      const v = this.visuals.get(me.id);
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
          predMode: "none",
          predDirX: 0,
          predDirY: 0,
          lastServerX: u.x,
          lastServerY: u.y,
        };
        this.visuals.set(u.id, v);
      } else {
        v.lastServerX = u.x;
        v.lastServerY = u.y;
        if (!v.predicted) {
          // server targets for interpolation (locals + remotes)
          v.tx = u.x;
          v.ty = u.y;
        } else if (v.predMode === "dir") {
          const err = Math.hypot(v.x - u.x, v.y - u.y);
          if (err > 2.8) {
            v.x = u.x;
            v.y = u.y;
          } else if (err > 0.2) {
            v.x += (u.x - v.x) * 0.1;
            v.y += (u.y - v.y) * 0.1;
          }
        } else if (v.predMode === "click") {
          // Never pull backward toward a lagging server position —
          // only blend if authority is ahead toward the click target.
          const myDist = Math.hypot(v.tx - v.x, v.ty - v.y);
          const srvDist = Math.hypot(v.tx - u.x, v.ty - u.y);
          const err = Math.hypot(v.x - u.x, v.y - u.y);
          if (err > 3.5) {
            v.x = u.x;
            v.y = u.y;
          } else if (srvDist + 0.12 < myDist) {
            v.x += (u.x - v.x) * 0.28;
            v.y += (u.y - v.y) * 0.28;
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
        const gl = this.labelPool.get(id + ":g");
        if (gl) {
          gl.destroy();
          this.labelPool.delete(id + ":g");
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
  }

  private stepPrediction(dt: number): void {
    if (!this.lastSnap || !this.localPosseId) return;
    const speed = PRED_SPEED;
    for (const u of this.lastSnap.units) {
      if (u.posseId !== this.localPosseId || !u.alive) continue;
      const v = this.visuals.get(u.id);
      if (!v || !v.predicted) continue;

      if (v.predMode === "dir" && (v.predDirX !== 0 || v.predDirY !== 0)) {
        v.x += v.predDirX * speed * dt;
        v.y += v.predDirY * speed * dt;
        v.facing = Math.round((Math.atan2(v.predDirY, v.predDirX) + Math.PI) / (Math.PI / 4)) % 8;
        v.phase += dt * 10;
        v.moving = true;
      } else if (v.predMode === "click") {
        const dx = v.tx - v.x;
        const dy = v.ty - v.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.05) {
          const step = Math.min(d, speed * dt);
          v.x += (dx / d) * step;
          v.y += (dy / d) * step;
          v.facing = Math.round((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)) % 8;
          v.phase += dt * 10;
          v.moving = true;
        } else {
          v.x = v.tx;
          v.y = v.ty;
          v.moving = false;
          // Hold prediction until server arrives nearby, then hand off to interpolation
          const err = Math.hypot(v.x - v.lastServerX, v.y - v.lastServerY);
          if (err < 0.35) {
            v.predicted = false;
            v.predMode = "none";
          }
        }
      }
    }
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

  /** Smooth local units when not actively predicting (prevents teleports). */
  private interpolateLocals(dt: number): void {
    if (!this.lastSnap || !this.localPosseId) return;
    const k = 1 - Math.exp(-12 * dt);
    for (const u of this.lastSnap.units) {
      if (u.posseId !== this.localPosseId || !u.alive) continue;
      const v = this.visuals.get(u.id);
      if (!v || v.predicted) continue;
      const dx = u.x - v.x;
      const dy = u.y - v.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        // Cap step so we never jump a huge gap in one frame
        const maxStep = PRED_SPEED * dt * 1.4;
        if (dist > maxStep * 4) {
          // still walk toward rather than teleport
          v.x += (dx / dist) * maxStep * 2;
          v.y += (dy / dist) * maxStep * 2;
        } else {
          v.x += dx * k;
          v.y += dy * k;
        }
        v.moving = dist > 0.04;
        if (dist > 0.03) {
          v.facing = Math.round((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)) % 8;
          v.phase += dt * 9;
        }
      } else {
        v.moving = false;
      }
    }
    // Camera follows even when interpolating
    const me = this.lastSnap.units.find(
      (u) => u.posseId === this.localPosseId && (u.isPlayerLeader || u.kind === "player"),
    );
    if (me) {
      const v = this.visuals.get(me.id);
      if (v && !v.predicted) {
        this.followX = v.x;
        this.followY = v.y;
      }
    }
  }

  private interpolateRemotes(dt: number): void {
    if (!this.lastSnap) return;
    const k = 1 - Math.exp(-16 * dt);
    for (const u of this.lastSnap.units) {
      if (u.posseId === this.localPosseId) continue;
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

  private drawMapViewport(snap: WorldSnapshot): void {
    const g = this.tileGfx;
    g.clear();
    const inside = snap.you.insideBuildingId;
    const { sx: camSx, sy: camSy } = worldToScreen(this.followX, this.followY);
    const halfW = (this.app.renderer.width / this.zoom) * 0.65 + TILE_W * 10;
    const halfH = (this.app.renderer.height / this.zoom) * 0.65 + TILE_H * 12;

    // Split base fill: PvE green-grey vs war scorched
    if (!inside) {
      const wf = warFactor(this.followY);
      const base = lerpColor(0x2e3a24, 0x2a1814, wf);
      g.rect(camSx - halfW, camSy - halfH, halfW * 2, halfH * 2);
      g.fill({ color: base });
    }

    const inView = (x: number, y: number): boolean => {
      const p = worldToScreen(x, y);
      return Math.abs(p.sx - camSx) < halfW && Math.abs(p.sy - camSy) < halfH;
    };

    if (!inside) {
      for (const f of this.cachedFloors ?? []) {
        if (f.type !== "grass") continue;
        if ((f.x + f.y * 3) % 7 !== 0) continue;
        if (!inView(f.x, f.y)) continue;
        this.drawGroundTile(g, f.x, f.y, "grass");
      }
      // War-zone scars
      for (const f of this.cachedFloors ?? []) {
        if (f.y < SAFE_Y_MAX) continue;
        if ((f.x * 5 + f.y * 11) % 13 !== 0) continue;
        if (!inView(f.x, f.y)) continue;
        const p = worldToScreen(f.x + 0.5, f.y + 0.5);
        g.circle(p.sx, p.sy + 4, 5 + ((f.x + f.y) % 4));
        g.fill({ color: 0x1a100c, alpha: 0.45 });
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
    const war = warFactor(y + 0.5);

    let color = 0x3d4a2c;
    if (type === "road") color = lerpColor(0x3a3a46, 0x2a2220, war);
    else if (type === "sidewalk") color = lerpColor(0x6e685f, 0x4a3a34, war);
    else if (type === "parking") color = lerpColor(0x32323c, 0x282018, war);
    else if (type === "wall") color = 0x2c2622;
    else if (type === "floor") color = 0x4a4038;
    else if (type === "door") color = 0x9a6230;
    else if (type === "bar") color = 0x6a3030;
    else if (type === "shop") color = 0x30506a;
    else if (type === "hospital") color = 0x405868;
    else if (type === "gym") color = 0x4a4030;
    else if (type === "void") color = 0x0c0c10;
    else if (type === "grass") {
      const base = (x + y * 3) % 5 === 0 ? 0x42522e : 0x3a4a2a;
      color = lerpColor(base, 0x2a2418, war);
    }

    g.poly([sx, sy, sx + hw, sy + hh, sx, sy + TILE_H, sx - hw, sy + hh]);
    g.fill({ color });

    if (type === "road" && (x + y) % 3 === 0) {
      // PvE: yellow lane marks; war: broken / blood-stained
      const mark = war > 0.35 ? 0x6a3030 : 0xc9a227;
      g.rect(sx - 6, sy + 8, 12, 2);
      g.fill({ color: mark, alpha: 0.35 + war * 0.2 });
    }
    if (type === "sidewalk" && war > 0.2 && (x + y) % 4 === 0) {
      g.rect(sx - 4, sy + 6, 8, 3);
      g.fill({ color: 0x1a1210, alpha: 0.35 });
    }
    if (type === "door") {
      g.roundRect(sx - 5, sy + 2, 10, 12, 1);
      g.fill({ color: 0x5a3018 });
    }
  }

  private drawBuildings(snap: WorldSnapshot): void {
    const g = this.buildingGfx;
    g.clear();
    for (const t of this.buildingLabelPool) t.destroy();
    this.buildingLabelPool = [];
    this.overlayLayer.removeChildren();
    if (snap.you.insideBuildingId) return;

    this.drawZoneDivider(g);

    const buildings = [...snap.buildings]
      .filter((b) => b.ex0 != null)
      .sort((a, b) => a.ex0! + a.ey0! - (b.ex0! + b.ey0!));

    for (const b of buildings) {
      const midY = ((b.ey0 ?? 0) + (b.ey1 ?? 0)) / 2;
      this.drawIsoBuilding(g, b, warFactor(midY));
      const { sx, sy } = worldToScreen((b.ex0! + b.ex1!) / 2, (b.ey0! + b.ey1!) / 2);
      const h = (b.stories ?? 2) * FLOOR_PX;
      const title = new Text({
        text: b.name,
        style: {
          fontSize: 11,
          fill: midY >= SAFE_Y_MAX ? 0xffb0a0 : 0xffe0a0,
          fontWeight: "700",
          fontFamily: "system-ui, sans-serif",
        },
      });
      title.x = sx - title.width / 2;
      title.y = sy - h - 28;
      this.overlayLayer.addChild(title);
      this.buildingLabelPool.push(title);
    }
  }

  private drawZoneDivider(g: Graphics): void {
    const y = SAFE_Y_MAX;
    for (let x = 0; x < 110; x += 3) {
      const a = worldToScreen(x, y);
      const b = worldToScreen(x + 3, y);
      g.moveTo(a.sx, a.sy);
      g.lineTo(b.sx, b.sy);
    }
    g.stroke({ color: 0xff4040, width: 2.5, alpha: 0.45 });
    // Barricade ticks
    for (let x = 2; x < 110; x += 6) {
      const p = worldToScreen(x, y);
      g.rect(p.sx - 3, p.sy - 6, 6, 10);
      g.fill({ color: 0x5a4030, alpha: 0.7 });
    }
    for (const midX of [28, 55, 82]) {
      const mid = worldToScreen(midX, SAFE_Y_MAX - 0.8);
      const safe = new Text({
        text: "▲ SAFE DOWNTOWN",
        style: { fontSize: 11, fill: 0x60c080, fontWeight: "700" },
      });
      safe.x = mid.sx - safe.width / 2;
      safe.y = mid.sy - 28;
      this.overlayLayer.addChild(safe);
      this.buildingLabelPool.push(safe);
      const war = new Text({
        text: "▼ WARZONE",
        style: { fontSize: 11, fill: 0xff6060, fontWeight: "700" },
      });
      war.x = mid.sx - war.width / 2;
      war.y = mid.sy + 8;
      this.overlayLayer.addChild(war);
      this.buildingLabelPool.push(war);
    }
  }

  private drawIsoBuilding(g: Graphics, b: BuildingPublic, war: number): void {
    const x0 = b.ex0!;
    const y0 = b.ey0!;
    const x1 = b.ex1!;
    const y1 = b.ey1!;
    const stories = b.stories ?? 2;
    const h = stories * FLOOR_PX;
    let wall = b.wallColor ?? 0x3a3430;
    let roof = b.roofColor ?? 0x1a1816;
    const accent = b.accentColor ?? 0xc9a227;
    if (war > 0.15) {
      wall = lerpColor(wall, 0x2a2018, war);
      roof = lerpColor(roof, 0x14100c, war);
    }

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

    for (let f = 0; f < stories; f++) {
      const fy = 1 - (f + 0.55) / stories;
      for (let i = 1; i <= 2; i++) {
        const t = i / 3;
        const bx = c00.sx + (c10.sx - c00.sx) * t;
        const by = c00.sy + (c10.sy - c00.sy) * t;
        const broken = war > 0.25 && (b.id.charCodeAt(0) + f + i) % 3 === 0;
        const lit = !broken && (b.id.charCodeAt(0) + f + i) % 2 === 0;
        g.rect(bx - 3, by - h * fy - 4, 6, 5);
        if (broken) {
          g.fill({ color: 0x0a0808, alpha: 0.85 });
          // jagged edge
          g.rect(bx - 1, by - h * fy - 2, 3, 2);
          g.fill({ color: 0x3a2010, alpha: 0.6 });
        } else {
          g.fill({ color: lit ? accent : 0x1a2030, alpha: lit ? 0.8 : 0.45 });
        }
      }
    }

    g.poly([t00.sx, t00.sy, t10.sx, t10.sy, t11.sx, t11.sy, t01.sx, t01.sy]);
    g.fill({ color: roof });
    if (war > 0.4) {
      // damaged roof corner
      g.poly([t10.sx, t10.sy, t11.sx, t11.sy, (t10.sx + t11.sx) / 2, t10.sy + 6]);
      g.fill({ color: 0x0c0a08, alpha: 0.7 });
    } else {
      g.poly([t00.sx, t00.sy, t10.sx, t10.sy, t11.sx, t11.sy, t01.sx, t01.sy]);
      g.stroke({ color: shade(accent, 0.7), width: 1, alpha: 0.45 });
    }

    const door = worldToScreen(b.doorX + 0.5, b.doorY + 0.5);
    g.roundRect(door.sx - 6, door.sy - 14, 12, 16, 1);
    g.fill({ color: 0x1a1008 });
    g.roundRect(door.sx - 5, door.sy - 13, 10, 14, 1);
    g.fill({ color: shade(wall, 0.45) });
    // Door glow — interactive cue
    g.circle(door.sx, door.sy - 4, 8);
    g.stroke({ color: 0xffcc66, width: 1, alpha: 0.25 });
  }

  private drawProps(props: PropPublic[]): void {
    const g = this.propGfx;
    g.clear();
    for (const p of props) {
      const { sx, sy } = worldToScreen(p.x, p.y);
      const war = warFactor(p.y);
      if (p.kind === "dumpster") {
        g.roundRect(sx - 14, sy - 12, 28, 18, 2);
        g.fill({ color: lerpColor(0x2a4a32, 0x2a3020, war) });
        g.rect(sx - 12, sy - 14, 24, 4);
        g.fill({ color: 0x1a2a1a, alpha: 0.8 });
      } else if (p.kind === "car") {
        // wrecked in war zone
        g.roundRect(sx - 16, sy - 10, 32, 16, 4);
        g.fill({ color: war > 0.3 ? 0x3a2820 : 0x5a2828 });
        if (war > 0.3) {
          g.rect(sx - 8, sy - 14, 10, 6);
          g.fill({ color: 0x2a1810, alpha: 0.7 });
        }
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
        g.fill({ color: war > 0.4 ? 0x603040 : 0xff40aa, alpha: war > 0.4 ? 0.4 : 0.7 });
      } else if (p.kind === "hydrant") {
        g.roundRect(sx - 4, sy - 12, 8, 14, 1);
        g.fill({ color: 0xc04030 });
      }
    }
  }

  private drawEntities(snap: WorldSnapshot): void {
    const g = this.entityGfx;
    g.clear();

    // Click move marker
    if (this.moveMarker) {
      this.moveMarker.life -= 1 / 60;
      if (this.moveMarker.life <= 0) this.moveMarker = null;
      else {
        const { sx, sy } = worldToScreen(this.moveMarker.x, this.moveMarker.y);
        const pulse = 0.55 + Math.sin(this.time * 8) * 0.25;
        g.moveTo(sx, sy - 8);
        g.lineTo(sx + 10, sy);
        g.lineTo(sx, sy + 8);
        g.lineTo(sx - 10, sy);
        g.closePath();
        g.stroke({ color: 0x80c0ff, width: 2, alpha: pulse });
        g.circle(sx, sy, 3);
        g.fill({ color: 0xa0d0ff, alpha: pulse });
      }
    }

    const used = new Set<string>();
    const { sx: camSx, sy: camSy } = worldToScreen(this.followX, this.followY);
    const cullR =
      (Math.max(this.app.renderer.width, this.app.renderer.height) / this.zoom) * 0.8;

    const sorted = snap.units
      .filter((u) => {
        const v = this.visuals.get(u.id) ?? u;
        const p = worldToScreen(v.x, v.y);
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
      if (!used.has(id) && !used.has(id + ":g") && id !== "hoverTip") {
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

  private drawHoverOverlay(snap: WorldSnapshot): void {
    const g = this.hoverGfx;
    g.clear();
    const tip = this.labelPool.get("hoverTip");
    if (tip) tip.visible = false;
    if (!this.hover) return;

    const pulse = 0.55 + Math.sin(this.time * 6) * 0.3;

    if (this.hover.kind === "unit") {
      const u = snap.units.find((x) => x.id === this.hover!.id);
      if (!u) return;
      const v = this.visuals.get(u.id) ?? u;
      const { sx, sy } = worldToScreen(v.x, v.y);
      const mine = u.posseId === snap.you.posseId;
      const isNpc = u.kind === "npc";
      const col = mine ? 0xffe080 : isNpc ? 0x60d0ff : 0xff6060;
      g.circle(sx, sy + 10, 16 + Math.sin(this.time * 5) * 2);
      g.stroke({ color: col, width: 2, alpha: pulse });
      g.circle(sx, sy + 10, 5);
      g.fill({ color: col, alpha: 0.25 });
      this.showHoverTip(sx, sy - 48, `${this.hover.label} — ${this.hover.action}`, col);
    } else if (this.hover.kind === "building") {
      const b = snap.buildings.find((x) => x.id === this.hover!.id);
      if (!b || b.ex0 == null) return;
      const door = worldToScreen(b.doorX + 0.5, b.doorY + 0.5);
      g.circle(door.sx, door.sy - 4, 14 + Math.sin(this.time * 5) * 2);
      g.stroke({ color: 0xffcc66, width: 2, alpha: pulse });
      // Footprint outline (simple diamond of center)
      const cx = (b.ex0! + b.ex1! + 1) / 2;
      const cy = (b.ey0! + b.ey1! + 1) / 2;
      const c = worldToScreen(cx, cy);
      const h = (b.stories ?? 2) * FLOOR_PX;
      g.rect(c.sx - 18, c.sy - h - 8, 36, 6);
      g.fill({ color: 0xffcc66, alpha: 0.35 * pulse });
      this.showHoverTip(door.sx, door.sy - 36, `${this.hover.label} — ${this.hover.action}`, 0xffcc66);
    } else if (this.hover.kind === "prop") {
      const p = snap.props.find((x) => x.id === this.hover!.id);
      if (!p) return;
      const { sx, sy } = worldToScreen(p.x, p.y);
      g.circle(sx, sy, 14 + Math.sin(this.time * 5) * 2);
      g.stroke({ color: 0xa0e080, width: 2, alpha: pulse });
      this.showHoverTip(sx, sy - 28, `${this.hover.label} — ${this.hover.action}`, 0xa0e080);
    }
  }

  private showHoverTip(sx: number, sy: number, text: string, color: number): void {
    let lab = this.labelPool.get("hoverTip");
    if (!lab) {
      lab = new Text({
        text,
        style: {
          fontSize: 12,
          fill: 0xffffff,
          fontWeight: "700",
          fontFamily: "system-ui,sans-serif",
        },
      });
      this.labelPool.set("hoverTip", lab);
      this.labels.addChild(lab);
    }
    lab.visible = true;
    lab.text = text;
    lab.style.fill = color;
    lab.x = sx - lab.width / 2;
    lab.y = sy;
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
      predMode: "none" as const,
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
    const isNpc = u.kind === "npc";

    g.ellipse(sx, baseSy + 11, 10 + bulk, 4.5);
    g.fill({ color: 0x000000, alpha: 0.3 });

    if (!u.alive) {
      g.ellipse(sx, baseSy + 4, 12, 6);
      g.fill({ color: 0x4a2020, alpha: 0.8 });
      return;
    }

    // Ambient interact ring for NPCs (subtle always-on cue)
    if (isNpc && !mine) {
      g.circle(sx, baseSy + 10, 13);
      g.stroke({ color: 0x60b0e0, width: 1, alpha: 0.28 + Math.sin(this.time * 3 + u.x) * 0.08 });
    }
    // Hostile gang threat ring
    if (!mine && !isNpc && (posse?.hostile || threat >= 2)) {
      g.circle(sx, baseSy + 10, 14);
      g.stroke({ color: 0xe04040, width: 1, alpha: 0.3 });
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
    if (isNpc) {
      g.roundRect(sx - bw / 2 + sway, sy - bh - 2, bw, bh, 2);
      g.stroke({ color: 0x70c8f0, width: 1, alpha: 0.55 });
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
    g.fill({ color: isNpc ? 0xd0b090 : 0xe8c8a0 });

    this.drawWeapon(g, sx + sway, sy - bh / 2 - 2, u.weapon, mine, vis.facing);

    if (threat > 0 && !isNpc) {
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
    lab.style.fill = mine ? 0xffe080 : isNpc ? 0x90d8ff : threat >= 3 ? 0xffa0a0 : 0xe8e8e8;
    lab.x = sx - lab.width / 2;
    lab.y = sy - bh - 34;
    used.add(u.id);

    if (!mine && !isNpc && (threat >= 2 || u.armor !== "none")) {
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
    const g = this.fxGfx;
    g.clear();
    if (this.fx.length === 0) return;

    const next: FxParticle[] = [];
    for (const f of this.fx) {
      f.life -= dt;
      if (f.life <= 0) continue;

      // Motion
      if (f.kind === "blood" || f.kind === "spark" || f.kind === "shell" || f.kind === "flame") {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.kind === "blood" || f.kind === "shell") f.vy += 3 * dt; // gravity-ish
        if (f.kind === "flame") {
          f.vx *= 0.92;
          f.vy *= 0.92;
          f.r *= 0.98;
        }
      }

      next.push(f);
      const t = Math.max(0, f.life / f.max);
      const a = Math.min(1, t * 1.4);

      if (f.kind === "muzzle") {
        const p = worldToScreen(f.x, f.y);
        const r = (f.big ? 14 : 9) * (0.5 + t);
        g.circle(p.sx, p.sy - 10, r);
        g.fill({ color: 0xfff0a0, alpha: a * 0.9 });
        g.circle(p.sx, p.sy - 10, r * 0.45);
        g.fill({ color: 0xffffff, alpha: a });
        // cone
        const len = (f.big ? 22 : 14) * t;
        const cos = Math.cos(f.ang);
        const sin = Math.sin(f.ang);
        // Approximate cone in screen space using iso-ish offset
        const tip = worldToScreen(f.x + cos * 0.55, f.y + sin * 0.55);
        g.moveTo(p.sx, p.sy - 10);
        g.lineTo(tip.sx + sin * 6, tip.sy - 10 - cos * 3);
        g.lineTo(tip.sx - sin * 6, tip.sy - 10 + cos * 3);
        g.closePath();
        g.fill({ color: 0xffaa40, alpha: a * 0.65 });
      } else if (f.kind === "tracer") {
        const a0 = worldToScreen(f.x0, f.y0);
        const a1 = worldToScreen(f.x1, f.y1);
        // Short bright segment that travels along the line (stylized)
        const head = 1 - t; // 0→1 over life
        const seg = f.wide ? 0.35 : 0.22;
        const s0 = Math.max(0, head - seg);
        const s1 = Math.min(1, head + 0.05);
        const x0 = a0.sx + (a1.sx - a0.sx) * s0;
        const y0 = a0.sy - 12 + (a1.sy - a0.sy) * s0;
        const x1 = a0.sx + (a1.sx - a0.sx) * s1;
        const y1 = a0.sy - 12 + (a1.sy - a0.sy) * s1;
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke({ color: f.color, width: f.wide ? 3 : 1.8, alpha: a });
        g.circle(x1, y1, f.wide ? 3 : 2);
        g.fill({ color: 0xffffff, alpha: a * 0.9 });
        // faint full path
        g.moveTo(a0.sx, a0.sy - 12);
        g.lineTo(a1.sx, a1.sy - 12);
        g.stroke({ color: f.color, width: 1, alpha: a * 0.2 });
      } else if (f.kind === "slash") {
        const a0 = worldToScreen(f.x0, f.y0);
        const a1 = worldToScreen(f.x1, f.y1);
        g.moveTo(a0.sx, a0.sy - 8);
        g.lineTo(a1.sx, a1.sy - 14);
        g.stroke({ color: 0xe8e8f0, width: 3, alpha: a * 0.9 });
        g.moveTo(a0.sx + 2, a0.sy - 4);
        g.lineTo(a1.sx + 2, a1.sy - 10);
        g.stroke({ color: 0x90c0ff, width: 1.5, alpha: a * 0.5 });
      } else if (f.kind === "blood") {
        const p = worldToScreen(f.x, f.y);
        g.circle(p.sx, p.sy - 6, f.r * (0.6 + t * 0.4));
        g.fill({ color: 0xa01818, alpha: a * 0.85 });
      } else if (f.kind === "spark") {
        const p = worldToScreen(f.x, f.y);
        g.circle(p.sx, p.sy - 8, 2.5);
        g.fill({ color: 0xffe080, alpha: a });
        g.circle(p.sx + f.vx * 2, p.sy - 8 + f.vy * 2, 1.2);
        g.fill({ color: 0xffffff, alpha: a * 0.7 });
      } else if (f.kind === "flame") {
        const p = worldToScreen(f.x, f.y);
        const col = t > 0.6 ? 0xfff0a0 : t > 0.3 ? 0xff8020 : 0xc02010;
        g.circle(p.sx, p.sy - 8, f.r * (0.7 + t * 0.5));
        g.fill({ color: col, alpha: a * 0.75 });
      } else if (f.kind === "impact") {
        const p = worldToScreen(f.x, f.y);
        const r = (f.crit ? 22 : 12) * (1 - t * 0.3);
        g.circle(p.sx, p.sy - 8, r);
        g.stroke({ color: f.crit ? 0xffe060 : 0xff6060, width: 2, alpha: a * 0.8 });
        g.circle(p.sx, p.sy - 8, r * 0.4);
        g.fill({ color: f.crit ? 0xfff0a0 : 0xff4040, alpha: a * 0.35 });
      } else if (f.kind === "shell") {
        const p = worldToScreen(f.x, f.y);
        g.rect(p.sx - 1.5, p.sy - 9, 3, 2);
        g.fill({ color: 0xc9a227, alpha: a * 0.9 });
      }
    }
    this.fx = next;
  }

  private updateCamera(dt: number): void {
    // Smooth zoom
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, 12 * dt);
    if (Math.abs(this.zoom - this.zoomTarget) < 0.001) this.zoom = this.zoomTarget;

    const { sx, sy } = worldToScreen(this.followX, this.followY);
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    const k = 1 - Math.exp(-18 * dt);
    // Desired top-left of world in screen space such that follow is centered under zoom
    const targetX = sx - w / (2 * this.zoom);
    const targetY = sy - h / (2 * this.zoom);
    this.camX += (targetX - this.camX) * k;
    this.camY += (targetY - this.camY) * k;

    this.root.scale.set(this.zoom);
    this.root.x = -this.camX * this.zoom;
    this.root.y = -this.camY * this.zoom;

    const cellX = Math.floor(this.followX / 4);
    const cellY = Math.floor(this.followY / 4);
    const zCell = Math.round(this.zoom * 10);
    if (cellX !== this.mapCamCellX || cellY !== this.mapCamCellY || zCell !== this.mapZoomCell) {
      this.mapCamCellX = cellX;
      this.mapCamCellY = cellY;
      this.mapZoomCell = zCell;
      this.mapRedrawPending = true;
    }
  }

  /** Canvas client coords → world tiles (respects zoom + camera). */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.app.renderer.width / Math.max(1, rect.width);
    const scaleY = this.app.renderer.height / Math.max(1, rect.height);
    const mx = (clientX - rect.left) * scaleX;
    const my = (clientY - rect.top) * scaleY;
    // Inverse of root transform: worldScreen = (screen - root.pos) / zoom
    const lx = (mx - this.root.x) / this.zoom;
    const ly = (my - this.root.y) / this.zoom;
    return isoScreenToWorld(lx, ly);
  }

  pickUnit(clientX: number, clientY: number, radius = 1.35): string | null {
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

  pickBuilding(clientX: number, clientY: number): BuildingPublic | null {
    const snap = this.lastSnap;
    if (!snap || snap.you.insideBuildingId) return null;
    const w = this.screenToWorld(clientX, clientY);
    let best: BuildingPublic | null = null;
    let bestD = 2.2;
    for (const b of snap.buildings) {
      if (b.ex0 == null) continue;
      // Prefer door hit
      const dd = Math.hypot(b.doorX + 0.5 - w.x, b.doorY + 0.5 - w.y);
      if (dd < bestD) {
        bestD = dd;
        best = b;
      }
      // Footprint soft hit
      if (
        w.x >= b.ex0! - 0.3 &&
        w.x <= b.ex1! + 1.3 &&
        w.y >= b.ey0! - 0.3 &&
        w.y <= b.ey1! + 1.3
      ) {
        const cx = (b.ex0! + b.ex1! + 1) / 2;
        const cy = (b.ey0! + b.ey1! + 1) / 2;
        const d = Math.hypot(cx - w.x, cy - w.y);
        if (d < bestD + 1.5) {
          bestD = Math.min(bestD, d);
          best = b;
        }
      }
    }
    return best;
  }

  pickProp(clientX: number, clientY: number, radius = 1.4): PropPublic | null {
    const snap = this.lastSnap;
    if (!snap) return null;
    const w = this.screenToWorld(clientX, clientY);
    let best: PropPublic | null = null;
    let bestD = radius;
    for (const p of snap.props ?? []) {
      const d = Math.hypot(p.x - w.x, p.y - w.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Update hover target from pointer; returns cursor CSS hint. */
  updateHover(clientX: number, clientY: number): string {
    const snap = this.lastSnap;
    if (!snap) {
      this.hover = null;
      return "default";
    }
    if (snap.you.respawnIn != null && snap.you.respawnIn > 0) {
      this.hover = null;
      return "default";
    }

    const unitId = this.pickUnit(clientX, clientY, 1.5);
    if (unitId) {
      const u = snap.units.find((x) => x.id === unitId);
      if (u) {
        if (u.posseId === snap.you.posseId) {
          this.hover = { kind: "unit", id: u.id, label: u.name, action: "Select" };
          return "pointer";
        }
        if (u.kind === "npc") {
          this.hover = { kind: "unit", id: u.id, label: u.name, action: "Talk / Recruit" };
          return "pointer";
        }
        // Rival / other player
        const inSafe = u.y < SAFE_Y_MAX;
        this.hover = {
          kind: "unit",
          id: u.id,
          label: u.name,
          action: inSafe ? "Rival (safe — no fire)" : "RMB Attack",
        };
        return inSafe ? "help" : "crosshair";
      }
    }

    const b = this.pickBuilding(clientX, clientY);
    if (b) {
      this.hover = { kind: "building", id: b.id, label: b.name, action: "Enter" };
      return "pointer";
    }

    const p = this.pickProp(clientX, clientY);
    if (p) {
      const label = p.label ?? p.kind;
      const action =
        p.kind === "dumpster" || p.kind === "crate"
          ? "Search"
          : p.kind === "protection"
            ? "Collect"
            : "Inspect";
      this.hover = { kind: "prop", id: p.id, label, action };
      return "pointer";
    }

    this.hover = null;
    return "default";
  }

  leaderWorldPos(): { x: number; y: number } | null {
    if (!this.lastSnap || !this.localPosseId) return null;
    const me =
      this.lastSnap.units.find(
        (u) =>
          u.posseId === this.localPosseId && (u.isPlayerLeader || u.kind === "player"),
      ) ?? this.lastSnap.units.find((u) => u.posseId === this.localPosseId);
    if (!me) return null;
    const v = this.visuals.get(me.id);
    return { x: v?.x ?? me.x, y: v?.y ?? me.y };
  }

  distToLeader(x: number, y: number): number {
    const p = this.leaderWorldPos();
    if (!p) return Infinity;
    return Math.hypot(p.x - x, p.y - y);
  }
}

// re-export for callers that need range constant from view usage
export { INTERACT_RANGE };
