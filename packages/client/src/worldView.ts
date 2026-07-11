import {
  aiRoleLabel,
  dayPhaseFromTick,
  INTERACT_RANGE,
  isSafeWorldPos,
  lightingLook,
  moveSpeedTilesPerSec,
  SAFE_Y_MAX,
  TILE_H,
  TILE_W,
  weatherFromTick,
  WEAPONS,
  type BuildingPublic,
  type CombatFxEvent,
  type DayPhase,
  type LightingLook,
  type WeatherKind,
  propHustleAction,
  type PropPublic,
  type UnitPublic,
  type WeaponId,
  type WorldSnapshot,
} from "@loose-cannon/shared";
import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import { asphaltColor, asphaltGrit, asphaltNoise, sidewalkColor } from "./asphalt.js";
import { screenToWorld as isoScreenToWorld, worldToScreen } from "./iso.js";
import {
  clubPropTexture,
  DANCER_SPRITE_H,
  loadGameSprites,
  propTexture,
  PROP_SPRITE_H,
  spritesReady,
  unitTexture,
  UNIT_SPRITE_H,
} from "./sprites.js";
import {
  floorTextureMatrix,
  groundTexForType,
  isoTileMatrix,
  loadWorldTextures,
  texturesReady,
  wallFaceMatrix,
  worldTexture,
} from "./textures.js";
import {
  facingFlip,
  facingFromDelta,
  facingLean,
  facingToDir,
  walkCycle,
  walkPhaseRate,
} from "./unitAnim.js";

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
  | { kind: "shell"; x: number; y: number; life: number; max: number; vx: number; vy: number }
  | {
      kind: "hydrantSpray";
      x: number;
      y: number;
      life: number;
      max: number;
      vx: number;
      vy: number;
      r: number;
    }
  | {
      kind: "dmgText";
      x: number;
      y: number;
      life: number;
      max: number;
      text: string;
      crit: boolean;
    };

function armorBulk(armor: string): number {
  if (armor === "plate") return 3;
  if (armor === "kevlar") return 2;
  if (armor === "leather") return 1;
  return 0;
}

function weaponTier(weapon: string): number {
  const order = [
    "pipe",
    "switchblade",
    "pistol",
    "uzi",
    "shotgun",
    "tommy",
    "minigun",
    "flamethrower",
  ];
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

/** Multiply two RGB colors (0xffffff = identity). */
function mulTint(a: number, b: number): number {
  if (b === 0xffffff) return a;
  if (a === 0xffffff) return b;
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  const r = Math.round((ar * br) / 255);
  const g = Math.round((ag * bg) / 255);
  const bl = Math.round((ab * bb) / 255);
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

/** Exterior floor height in px — tall enough façades read as buildings, not flat roofs */
const FLOOR_PX = 40;
/** Fallback when unit stats missing — matches baseline speed 5 */
const PRED_SPEED_DEFAULT = moveSpeedTilesPerSec(5);
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.4;
/** Interiors can zoom in tighter so the whole room fills the view */
const MAX_INTERIOR_ZOOM = 2.15;
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
  private rainGfx = new Graphics();
  private labels = new Container();
  private overlayLayer = new Container();
  /** Screen-space day/night + district wash (not under camera zoom) */
  private atmosphereGfx = new Graphics();
  /** Pixel-art unit chips (combat-scene style) */
  private unitSpriteLayer = new Container();
  private unitSprites = new Map<string, Sprite>();
  /** Pixel-art props (taxi, dumpster, …) */
  private propSpriteLayer = new Container();
  private propSprites = new Map<string, Sprite>();
  /** Quick tile type lookup for roads/crosswalks */
  private tileTypeAt = new Map<string, string>();
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
  private dmgLabels: Text[] = [];
  private moveMarker: { x: number; y: number; life: number } | null = null;
  private hover: HoverTarget = null;
  private time = 0;
  private localPosseId: string | null = null;
  private frame = 0;
  /** Brief camera shake from nearby combat */
  private shake = 0;
  private mapCamCellX = Number.NaN;
  private mapCamCellY = Number.NaN;
  private mapZoomCell = -1;
  private mapRedrawPending = false;
  private buildingLabelPool: Text[] = [];
  /** Remember outdoor zoom when entering a building */
  private outdoorZoomTarget = 1;
  private wasInside = false;
  private interiorZoomLocked = false;
  /** Cached lighting for this frame / map redraw */
  private look: LightingLook = lightingLook("night", "downtown", false, "clear");
  private lastDayPhase: DayPhase | null = null;
  private lastWeather: WeatherKind | null = null;
  private lastLightKey = "";

  constructor(private canvas: HTMLCanvasElement) {
    this.app = new Application();
  }

  async init(): Promise<void> {
    await this.app.init({
      canvas: this.canvas,
      resizeTo: window,
      // Combat-scene night purple (modulated by day/night each frame)
      background: 0x0e0c18,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio || 1, 1),
      autoDensity: true,
      powerPreference: "high-performance",
      // roundPixels causes shimmer/glitches on textured walls under continuous zoom
      roundPixels: false,
    });
    // Load painted goons / props / world textures (non-blocking if fail → procedural fallback)
    await Promise.all([
      loadGameSprites().catch(() => undefined),
      loadWorldTextures().catch(() => undefined),
    ]);
    // Rain + atmosphere are screen-space siblings of root (never under camera zoom)
    this.rainGfx.eventMode = "none";
    this.atmosphereGfx.eventMode = "none";
    this.app.stage.addChild(this.root, this.rainGfx, this.atmosphereGfx);
    this.root.addChild(
      this.mapLayer,
      this.buildingLayer,
      this.propGfx,
      this.propSpriteLayer,
      this.entityLayer,
      this.overlayLayer,
    );
    this.mapLayer.addChild(this.tileGfx);
    this.buildingLayer.addChild(this.buildingGfx);
    this.entityLayer.addChild(
      this.unitSpriteLayer,
      this.entityGfx,
      this.hoverGfx,
      this.fxGfx,
      this.labels,
    );
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
      if (this.lastSnap) this.refreshLighting(this.lastSnap);
      if (this.mapRedrawPending && this.lastSnap) {
        this.drawMapViewport(this.lastSnap);
        this.mapRedrawPending = false;
      }
      if (this.lastSnap) {
        this.drawEntities(this.lastSnap);
        this.drawHoverOverlay(this.lastSnap);
        this.drawWeather(this.lastSnap);
        this.drawAtmosphere();
      }
    });
  }

  /** Current day/night + district look (for HUD). */
  getLighting(): LightingLook {
    return this.look;
  }

  private refreshLighting(snap: WorldSnapshot): void {
    const phase = snap.dayPhase ?? dayPhaseFromTick(snap.tick);
    const weather: WeatherKind = snap.weather ?? weatherFromTick(snap.tick);
    const indoor = !!snap.you.insideBuildingId;
    let place = indoor
      ? (snap.you.insideBuildingId ?? snap.you.districtId)
      : snap.you.districtId;
    // Mission layers are mi_*; use cloned template kind for palette (e.g. coldstore frost tint)
    if (indoor && place?.startsWith("mi_")) {
      const tmpl = snap.buildings.find((b) => b.id === place);
      if (tmpl?.kind) place = tmpl.kind;
    }
    const key = `${phase}|${weather}|${place}|${indoor ? 1 : 0}`;
    if (key !== this.lastLightKey) {
      this.lastLightKey = key;
      this.look = lightingLook(phase, place, indoor, weather);
      if (this.lastDayPhase !== phase || this.lastWeather !== weather) {
        this.lastDayPhase = phase;
        this.lastWeather = weather;
        // Phase / weather change ground wetness — rebuild outdoor tiles
        if (!indoor) this.mapRedrawPending = true;
      }
      // District / indoor changes also need horizon/neon refresh
      this.mapRedrawPending = true;
    }
    // Sky follows phase even between full rebuilds
    try {
      this.app.renderer.background.color = this.look.sky;
    } catch {
      /* older pixi path */
    }
  }

  /** Full-screen color wash (screen space, above world). */
  private drawAtmosphere(): void {
    const g = this.atmosphereGfx;
    g.clear();
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    const { overlay, overlayAlpha } = this.look;
    if (overlayAlpha <= 0.01) return;
    // Soft multiply-style wash: two passes (tint + slight vignette)
    g.rect(0, 0, w, h);
    g.fill({ color: overlay, alpha: overlayAlpha * 0.55 });
    // Corner vignette reads as city night depth without killing readability
    const vig = Math.min(0.22, overlayAlpha * 0.9);
    g.rect(0, 0, w, h * 0.12);
    g.fill({ color: 0x000010, alpha: vig * 0.45 });
    g.rect(0, h * 0.88, w, h * 0.12);
    g.fill({ color: 0x000010, alpha: vig * 0.55 });
  }

  getSnapshot(): WorldSnapshot | null {
    return this.lastSnap;
  }

  getZoom(): number {
    return this.zoom;
  }

  private maxZoomNow(): number {
    const indoors = !!this.lastSnap?.you.insideBuildingId;
    return indoors ? MAX_INTERIOR_ZOOM : MAX_ZOOM;
  }

  /** Smooth zoom toward target (clamped). Positive = zoom in. Works outdoors and indoors. */
  adjustZoom(delta: number): void {
    // User override — stop auto-fit lock so wheel/buttons stick inside buildings
    this.interiorZoomLocked = false;
    const maxZ = this.maxZoomNow();
    this.zoomTarget = Math.min(maxZ, Math.max(MIN_ZOOM, this.zoomTarget + delta));
  }

  setZoom(z: number): void {
    this.interiorZoomLocked = false;
    const maxZ = this.maxZoomNow();
    this.zoomTarget = Math.min(maxZ, Math.max(MIN_ZOOM, z));
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
    // Boss to center; bodyguards predict circle around him (matches server formation)
    const mine = this.lastSnap.units.filter(
      (u) => u.posseId === this.localPosseId && u.alive,
    );
    const boss =
      mine.find((u) => u.isPlayerLeader || u.kind === "player") ?? mine[0];
    const goons = mine.filter((u) => u !== boss);
    const rad =
      goons.length <= 1 ? 0.95 : goons.length === 2 ? 1.05 : goons.length === 3 ? 1.15 : 1.28;

    if (boss) {
      const v = this.visuals.get(boss.id);
      if (v) {
        v.tx = wx;
        v.ty = wy;
        v.predicted = true;
        v.predMode = "click";
        v.predDirX = 0;
        v.predDirY = 0;
        v.moving = true;
      }
    }
    goons.forEach((u, i) => {
      const v = this.visuals.get(u.id);
      if (!v) return;
      const ang = -Math.PI / 2 + (i / Math.max(1, goons.length)) * Math.PI * 2;
      v.tx = wx + Math.cos(ang) * rad;
      v.ty = wy + Math.sin(ang) * rad;
      v.predicted = true;
      v.predMode = "click";
      v.predDirX = 0;
      v.predDirY = 0;
      v.moving = true;
    });
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

  /** Fire hydrant gush — ~3s of water particles in world space. */
  spawnHydrantSpray(x: number, y: number): void {
    const max = 3.2;
    for (let i = 0; i < 48; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const spd = 1.2 + Math.random() * 2.8;
      this.fx.push({
        kind: "hydrantSpray",
        x: x + (Math.random() - 0.5) * 0.15,
        y: y + (Math.random() - 0.5) * 0.15,
        life: max * (0.55 + Math.random() * 0.45),
        max,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.35 + (Math.random() - 0.2) * 0.8,
        r: 1.5 + Math.random() * 2.5,
      });
    }
    // Continuous gush from nozzle for a few bursts
    for (let wave = 0; wave < 6; wave++) {
      window.setTimeout(() => {
        for (let i = 0; i < 10; i++) {
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
          const spd = 1.5 + Math.random() * 2.5;
          this.fx.push({
            kind: "hydrantSpray",
            x,
            y,
            life: 1.8 + Math.random(),
            max: 2.5,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd * 0.3,
            r: 1.8 + Math.random() * 2,
          });
        }
      }, wave * 400);
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
    if (e.kind === "hydrant_spray") {
      this.spawnHydrantSpray(e.x0, e.y0);
      return;
    }

    const dx = e.x1 - e.x0;
    const dy = e.y1 - e.y0;
    const ang = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy) || 0.01;

    // Local shake if combat is near the camera follow point
    const near = Math.hypot((e.x0 + e.x1) / 2 - this.followX, (e.y0 + e.y1) / 2 - this.followY);
    if (near < 10) {
      const kick =
        e.kind === "death" ? 0.55 : e.kind === "hit" && e.crit ? 0.4 : e.kind === "shot" ? 0.18 : 0.12;
      this.shake = Math.min(1.2, this.shake + kick);
    }

    if (e.kind === "shot" || e.kind === "flame" || e.kind === "melee") {
      const big = e.weapon === "shotgun" || e.weapon === "tommy" || e.weapon === "minigun";
      // Muzzle flash at shooter
      if (e.kind !== "melee") {
        this.fx.push({
          kind: "muzzle",
          x: e.x0 + Math.cos(ang) * 0.35,
          y: e.y0 + Math.sin(ang) * 0.35,
          life: big ? 0.22 : 0.16,
          max: big ? 0.22 : 0.16,
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
            life: 0.55,
            max: 0.55,
            vx: Math.cos(side) * (1.5 + Math.random()) + Math.cos(ang) * -0.3,
            vy: Math.sin(side) * (1.5 + Math.random()) + Math.sin(ang) * -0.3,
          });
        }
      }

      if (e.kind === "melee") {
        this.fx.push({
          kind: "slash",
          x0: e.x0 + Math.cos(ang) * 0.15,
          y0: e.y0 + Math.sin(ang) * 0.15,
          x1: e.x0 + Math.cos(ang) * Math.min(1.6, dist),
          y1: e.y0 + Math.sin(ang) * Math.min(1.6, dist),
          life: 0.22,
          max: 0.22,
        });
      } else if (e.kind === "flame") {
        const n = 10 + Math.floor(dist * 3);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const jx = (Math.random() - 0.5) * 0.3;
          const jy = (Math.random() - 0.5) * 0.3;
          this.fx.push({
            kind: "flame",
            x: e.x0 + dx * t + jx,
            y: e.y0 + dy * t + jy,
            life: 0.28 + Math.random() * 0.18,
            max: 0.45,
            vx: Math.cos(ang) * 1.8 + (Math.random() - 0.5),
            vy: Math.sin(ang) * 1.8 + (Math.random() - 0.5),
            r: 4 + Math.random() * 6,
          });
        }
      } else {
        // Bright full-path tracer + traveling bolt (readable at a glance)
        const pellets =
          e.weapon === "shotgun"
            ? 6
            : e.weapon === "minigun"
              ? 3
              : e.weapon === "uzi" || e.weapon === "tommy"
                ? 2
                : 1;
        const color =
          e.weapon === "shotgun"
            ? 0xffe080
            : e.weapon === "minigun"
              ? 0xffb040
              : e.weapon === "tommy" || e.weapon === "uzi"
                ? 0xffcc40
                : 0xfff2a8;
        for (let i = 0; i < pellets; i++) {
          const spread = pellets > 1 ? (i - (pellets - 1) / 2) * 0.1 : 0;
          const px = -Math.sin(ang) * spread;
          const py = Math.cos(ang) * spread;
          this.fx.push({
            kind: "tracer",
            x0: e.x0 + Math.cos(ang) * 0.35 + px,
            y0: e.y0 + Math.sin(ang) * 0.35 + py,
            x1: e.x1 + px * 2.5 + (Math.random() - 0.5) * 0.12,
            y1: e.y1 + py * 2.5 + (Math.random() - 0.5) * 0.12,
            life: e.weapon === "shotgun" ? 0.2 : e.weapon === "minigun" ? 0.14 : 0.18,
            max: 0.2,
            color,
            wide: e.weapon === "shotgun" || e.weapon === "tommy" || e.weapon === "minigun",
          });
        }
      }
    }

    if (e.kind === "hit") {
      const heavy =
        e.weapon === "shotgun" || e.weapon === "minigun" || e.weapon === "tommy";
      const n = e.crit ? 14 : heavy ? 10 : 7;
      for (let i = 0; i < n; i++) {
        this.fx.push({
          kind: "blood",
          x: e.x1,
          y: e.y1,
          life: 0.4 + Math.random() * 0.3,
          max: 0.7,
          vx: (Math.random() - 0.5) * (e.crit ? 5.5 : heavy ? 4 : 3),
          vy: (Math.random() - 0.5) * (e.crit ? 5.5 : heavy ? 4 : 3) - 0.6,
          r: 2.5 + Math.random() * (e.crit ? 6.5 : heavy ? 4.5 : 3.5),
        });
      }
      this.fx.push({
        kind: "impact",
        x: e.x1,
        y: e.y1,
        life: e.crit ? 0.36 : heavy ? 0.26 : 0.2,
        max: e.crit ? 0.36 : heavy ? 0.26 : 0.2,
        crit: !!e.crit,
      });
      if (e.dmg != null && e.dmg > 0) {
        this.fx.push({
          kind: "dmgText",
          x: e.x1,
          y: e.y1,
          life: e.crit ? 1.05 : 0.9,
          max: e.crit ? 1.05 : 0.9,
          text: e.crit ? `CRIT ${e.dmg}` : `-${e.dmg}`,
          crit: !!e.crit,
        });
      }
      if (e.weapon === "pipe" || e.weapon === "switchblade") {
        for (let i = 0; i < 8; i++) {
          this.fx.push({
            kind: "spark",
            x: e.x1,
            y: e.y1,
            life: 0.24,
            max: 0.24,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
          });
        }
      }
      // Extra kick on big guns
      if (near < 10 && (e.crit || heavy)) {
        this.shake = Math.min(1.4, this.shake + (e.crit ? 0.15 : 0.08));
      }
    }

    if (e.kind === "miss") {
      // Whiz line past the target so misses read as near-misses, not silence
      this.fx.push({
        kind: "tracer",
        x0: e.x0 + Math.cos(ang) * 0.4,
        y0: e.y0 + Math.sin(ang) * 0.4,
        x1: e.x1,
        y1: e.y1,
        life: 0.14,
        max: 0.14,
        color: 0xa8b0c0,
        wide: false,
      });
      for (let i = 0; i < 6; i++) {
        this.fx.push({
          kind: "spark",
          x: e.x1,
          y: e.y1,
          life: 0.22 + Math.random() * 0.12,
          max: 0.34,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5,
        });
      }
      this.fx.push({
        kind: "dmgText",
        x: e.x1,
        y: e.y1,
        life: 0.55,
        max: 0.55,
        text: "miss",
        crit: false,
      });
    }

    if (e.kind === "blocked") {
      // Bullet dies on brick — orange sparks + BLOCKED float
      this.fx.push({
        kind: "tracer",
        x0: e.x0 + Math.cos(ang) * 0.35,
        y0: e.y0 + Math.sin(ang) * 0.35,
        x1: e.x1,
        y1: e.y1,
        life: 0.12,
        max: 0.12,
        color: 0xc8a060,
        wide: false,
      });
      for (let i = 0; i < 10; i++) {
        this.fx.push({
          kind: "spark",
          x: e.x1,
          y: e.y1,
          life: 0.28 + Math.random() * 0.15,
          max: 0.42,
          vx: (Math.random() - 0.5) * 6.5,
          vy: (Math.random() - 0.5) * 6.5,
        });
      }
      this.fx.push({
        kind: "impact",
        x: e.x1,
        y: e.y1,
        life: 0.22,
        max: 0.22,
        crit: false,
      });
      this.fx.push({
        kind: "dmgText",
        x: e.x1,
        y: e.y1,
        life: 0.65,
        max: 0.65,
        text: "BLOCKED",
        crit: false,
      });
    }

    if (e.kind === "death") {
      for (let i = 0; i < 18; i++) {
        this.fx.push({
          kind: "blood",
          x: e.x0,
          y: e.y0,
          life: 0.5 + Math.random() * 0.4,
          max: 0.9,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6 - 1,
          r: 3 + Math.random() * 6,
        });
      }
      this.fx.push({
        kind: "impact",
        x: e.x0,
        y: e.y0,
        life: 0.35,
        max: 0.35,
        crit: true,
      });
      this.fx.push({
        kind: "dmgText",
        x: e.x0,
        y: e.y0,
        life: 1.0,
        max: 1.0,
        text: "DOWN",
        crit: true,
      });
    }

    if (this.fx.length > 280) this.fx.splice(0, this.fx.length - 280);
  }

  applySnapshot(snap: WorldSnapshot): void {
    if (snap.floors) {
      this.cachedFloors = snap.floors;
      this.rebuildTileLookup();
    }
    if (snap.blocked) {
      this.cachedBlocked = snap.blocked;
      this.rebuildTileLookup();
    }

    // Layer change (enter/exit building) — teleport visuals, never walk across the map
    const prevInside = this.lastSnap?.you.insideBuildingId ?? null;
    const nextInside = snap.you.insideBuildingId ?? null;
    const layerChanged = prevInside !== nextInside;

    this.lastSnap = snap;
    this.localPosseId = snap.you.posseId;

    if (snap.fx?.length) this.applyCombatFx(snap.fx);

    if (layerChanged) {
      // Drop all local prediction so we don't keep sliding
      this.moveMarker = null;
      for (const v of this.visuals.values()) {
        v.predicted = false;
        v.predMode = "none";
        v.predDirX = 0;
        v.predDirY = 0;
        v.moving = false;
      }
    }

    const me =
      snap.units.find(
        (u) => u.posseId === snap.you.posseId && (u.isPlayerLeader || u.kind === "player"),
      ) ?? snap.units.find((u) => u.posseId === snap.you.posseId);
    if (me) {
      if (layerChanged) {
        this.followX = me.x;
        this.followY = me.y;
        // Hard-snap camera too so the room appears immediately
        const { sx, sy } = worldToScreen(me.x, me.y);
        const w = this.app.renderer.width;
        const h = this.app.renderer.height;
        this.camX = sx - w / (2 * this.zoom);
        this.camY = sy - h / (2 * this.zoom);
      } else {
        const v = this.visuals.get(me.id);
        this.followX = v?.predicted ? v.x : me.x;
        this.followY = v?.predicted ? v.y : me.y;
      }
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
      } else if (layerChanged) {
        // Instant spawn at interior / exterior — no interpolate path
        v.x = u.x;
        v.y = u.y;
        v.tx = u.x;
        v.ty = u.y;
        v.lastServerX = u.x;
        v.lastServerY = u.y;
        v.predicted = false;
        v.predMode = "none";
        v.predDirX = 0;
        v.predDirY = 0;
        v.moving = false;
        v.facing = u.facing;
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
        const spr = this.unitSprites.get(id);
        if (spr) {
          spr.destroy();
          this.unitSprites.delete(id);
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
    for (const u of this.lastSnap.units) {
      if (u.posseId !== this.localPosseId || !u.alive) continue;
      const v = this.visuals.get(u.id);
      if (!v || !v.predicted) continue;
      // Match server: Speed stat drives tiles/sec (runners feel snappier)
      const speed = moveSpeedTilesPerSec(u.stats?.speed ?? 5);

      const spdStat = u.stats?.speed ?? 5;
      if (v.predMode === "dir" && (v.predDirX !== 0 || v.predDirY !== 0)) {
        v.x += v.predDirX * speed * dt;
        v.y += v.predDirY * speed * dt;
        v.facing = facingFromDelta(v.predDirX, v.predDirY);
        v.moving = true;
        v.phase += dt * walkPhaseRate(spdStat, true);
      } else if (v.predMode === "click") {
        const dx = v.tx - v.x;
        const dy = v.ty - v.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.05) {
          const step = Math.min(d, speed * dt);
          v.x += (dx / d) * step;
          v.y += (dy / d) * step;
          v.facing = facingFromDelta(dx, dy);
          v.moving = true;
          v.phase += dt * walkPhaseRate(spdStat, true);
        } else {
          v.x = v.tx;
          v.y = v.ty;
          v.moving = false;
          v.phase += dt * walkPhaseRate(spdStat, false);
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
      const spdStat = u.stats?.speed ?? 5;
      if (dist > 0.001) {
        // Cap step so we never jump a huge gap in one frame
        const maxStep = PRED_SPEED_DEFAULT * dt * 1.4;
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
          v.facing = facingFromDelta(dx, dy);
        } else {
          // Idle: trust server (combat aim / last order facing)
          v.facing = u.facing;
        }
        v.phase += dt * walkPhaseRate(spdStat, v.moving);
      } else {
        v.moving = false;
        v.facing = u.facing;
        v.phase += dt * walkPhaseRate(spdStat, false);
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
      const spdStat = u.stats?.speed ?? 5;
      if (dist > 0.001) {
        v.x += dx * k;
        v.y += dy * k;
        v.moving = dist > 0.05;
        if (dist > 0.03) {
          v.facing = facingFromDelta(dx, dy);
        } else {
          v.facing = u.facing;
        }
        v.phase += dt * walkPhaseRate(spdStat, v.moving);
      } else {
        v.moving = false;
        v.facing = u.facing;
        v.phase += dt * walkPhaseRate(spdStat, false);
      }
    }
  }

  private rebuildTileLookup(): void {
    this.tileTypeAt.clear();
    for (const f of this.cachedFloors ?? []) {
      this.tileTypeAt.set(`${f.x},${f.y}`, f.type);
    }
    for (const b of this.cachedBlocked ?? []) {
      this.tileTypeAt.set(`${b.x},${b.y}`, b.type);
    }
  }

  private tileType(x: number, y: number): string | undefined {
    return this.tileTypeAt.get(`${x},${y}`);
  }

  private getInteriorBuilding(snap: WorldSnapshot): BuildingPublic | null {
    const id = snap.you.insideBuildingId;
    if (!id) return null;
    return snap.buildings.find((b) => b.id === id) ?? null;
  }

  private interiorBounds(
    b: BuildingPublic,
  ): { x0: number; y0: number; x1: number; y1: number } | null {
    if (b.ix0 == null || b.iy0 == null || b.ix1 == null || b.iy1 == null) return null;
    return { x0: b.ix0, y0: b.iy0, x1: b.ix1, y1: b.iy1 };
  }

  private drawMapViewport(snap: WorldSnapshot): void {
    const g = this.tileGfx;
    g.clear();
    const insideB = this.getInteriorBuilding(snap);
    const bounds = insideB ? this.interiorBounds(insideB) : null;
    const { sx: camSx, sy: camSy } = worldToScreen(this.followX, this.followY);
    const halfW = (this.app.renderer.width / this.zoom) * 0.7 + TILE_W * 12;
    const halfH = (this.app.renderer.height / this.zoom) * 0.7 + TILE_H * 14;

    // ——— Indoor: full-room view, outdoors completely hidden ———
    if (insideB && bounds) {
      // Opaque night backdrop
      g.rect(camSx - halfW * 1.2, camSy - halfH * 1.2, halfW * 2.4, halfH * 2.4);
      g.fill({ color: 0x12101c });

      const pad = 1;
      const x0 = bounds.x0 - pad;
      const y0 = bounds.y0 - pad;
      const x1 = bounds.x1 + pad;
      const y1 = bounds.y1 + pad;

      const inRoom = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

      // Soft carpet under the whole room footprint
      for (let y = bounds.y0; y <= bounds.y1; y++) {
        for (let x = bounds.x0; x <= bounds.x1; x++) {
          this.drawGroundTile(g, x, y, "floor", true);
        }
      }

      for (const f of this.cachedFloors ?? []) {
        if (!inRoom(f.x, f.y)) continue;
        if (f.type === "grass" || f.type === "road" || f.type === "sidewalk" || f.type === "parking")
          continue;
        this.drawGroundTile(g, f.x, f.y, f.type, true);
      }
      for (const b of this.cachedBlocked ?? []) {
        if (!inRoom(b.x, b.y)) continue;
        this.drawGroundTile(g, b.x, b.y, b.type, true);
      }

      // Exit door glow
      if (insideB.exitX != null && insideB.exitY != null) {
        const door = worldToScreen(insideB.exitX + 0.5, insideB.exitY + 0.5);
        g.circle(door.sx, door.sy + 2, 14);
        g.stroke({ color: 0xff60c0, width: 2, alpha: 0.5 });
        g.circle(door.sx, door.sy + 2, 5);
        g.fill({ color: 0xff40aa, alpha: 0.3 });
      }
      return;
    }

    // ——— Outdoor city: combat-scene ground + day/night horizon ———
    const wf = warFactor(this.followY);
    // Phase horizon → bloodier purple-black in war zone
    const base = lerpColor(this.look.horizon, 0x160a12, wf * 0.85);
    g.rect(camSx - halfW, camSy - halfH, halfW * 2, halfH * 2);
    g.fill({ color: base });

    // Spatial cull in WORLD space (never scan the full 110×90 map every redraw —
    // that tanked FPS / made movement stutter in the deep south).
    // Iso: screen distance ≈ (Δx+Δy)*TILE_H/2; use a generous tile radius from camera.
    const tileR = Math.ceil(
      Math.max(halfW / (TILE_W * 0.45), halfH / (TILE_H * 0.45)) + 4,
    );
    const x0 = Math.floor(this.followX - tileR);
    const x1 = Math.ceil(this.followX + tileR);
    const y0 = Math.floor(this.followY - tileR);
    const y1 = Math.ceil(this.followY + tileR);

    const inViewScreen = (x: number, y: number): boolean => {
      const p = worldToScreen(x + 0.5, y + 0.5);
      return Math.abs(p.sx - camSx) < halfW && Math.abs(p.sy - camSy) < halfH;
    };

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const type = this.tileType(x, y);
        if (!type || type === "void" || type === "floor") continue;
        // Interiors live off-map on rim tiles — skip outdoor draws of indoor shells
        if (type === "bar" || type === "shop" || type === "hospital" || type === "gym") {
          // only draw if they're part of outdoor (they shouldn't be) — skip
          // Actually bar tiles only exist indoors; still skip non-walk outdoor types that are interior-only
        }
        // Skip pure interior functional tiles if any leaked
        if (
          type === "bar" ||
          type === "shop" ||
          type === "hospital" ||
          type === "gym" ||
          type === "door"
        ) {
          // doors on exterior shells should still draw
          if (type !== "door") continue;
        }
        if (!inViewScreen(x, y)) continue;
        if (type === "wall") {
          this.drawGroundTile(g, x, y, "sidewalk");
        } else {
          this.drawGroundTile(g, x, y, type);
        }
        if (type === "road" || type === "sidewalk" || type === "parking" || type === "grass") {
          this.drawStreetDressing(g, x, y, type);
        }
      }
    }
  }

  /**
   * Textured or solid fill for an iso diamond.
   * No pad with textures (pad + double-draw = zoom-dependent stitching).
   * Texture matrix is shared globally so shared edges sample continuously.
   */
  private fillIsoDiamond(
    g: Graphics,
    sx: number,
    sy: number,
    hw: number,
    hh: number,
    pad: number,
    color: number,
    texId: string | null,
    alpha = 1,
  ): void {
    const tex = texId && texturesReady() ? worldTexture(texId) : null;
    // Solid fills may use slight pad to kill 1px gaps; textured fills use exact diamonds
    const p = tex ? 0 : pad;
    g.poly([
      sx,
      sy - p * 0.5,
      sx + hw + p,
      sy + hh,
      sx,
      sy + TILE_H + p * 0.5,
      sx - hw - p,
      sy + hh,
    ]);
    if (tex) {
      // Shared matrix — continuous UV across the whole map layer
      g.fill({
        texture: tex,
        matrix: isoTileMatrix(),
        color: 0xffffff,
        alpha,
      });
      // Soft lighting wash (low alpha so seams don't darken)
      g.poly([sx, sy, sx + hw, sy + hh, sx, sy + TILE_H, sx - hw, sy + hh]);
      g.fill({ color, alpha: 0.14 });
    } else {
      g.fill({ color, alpha });
    }
  }

  private drawGroundTile(g: Graphics, x: number, y: number, type: string, indoor = false): void {
    const { sx, sy } = worldToScreen(x, y);
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const war = indoor ? 0 : warFactor(y + 0.5);
    const seed = (x * 17 + y * 31) >>> 0;
    const bright = indoor ? 1 : this.look.groundBright;
    const wet = indoor ? 0 : this.look.wet;
    const neonBoost = indoor ? 0 : Math.max(0.2, this.look.neon);
    // Tile center in world space for continuous noise (not discrete per-tile tones)
    const wx = x + 0.5;
    const wy = y + 0.5;
    const cx = sx;
    const cy = sy + hh;
    // Outdoor ground textures disabled for iso diamonds — per-tile UV stamps stitch at
    // every zoom. Continuous solid + noise looks seamless; textures stay on walls / interiors.
    const texKey: string | null = null;
    void groundTexForType; // available if we re-enable continuous ground mesh later

    let color = 0x2a2840;
    if (type === "road") {
      color = asphaltColor(wx, wy, wet, war, bright);
    } else if (type === "sidewalk") {
      color = sidewalkColor(wx, wy, war, bright);
    } else if (type === "parking") {
      color = shade(lerpColor(0x222028, 0x1a181e, asphaltNoise(wx, wy) * 0.4), bright);
      if (war > 0) color = lerpColor(color, 0x1a1416, war * 0.4);
    } else if (type === "wall") color = indoor ? 0x2a221c : 0x2c2638;
    else if (type === "floor")
      color = indoor ? ((x + y) % 2 === 0 ? 0x3a2e38 : 0x322830) : 0x342c38;
    else if (type === "door") color = indoor ? 0xb07030 : 0x9a6230;
    else if (type === "bar") color = 0x5a2848;
    else if (type === "shop") color = 0x283858;
    else if (type === "hospital") color = 0x304858;
    else if (type === "gym") color = 0x3a3430;
    else if (type === "void") color = 0x0a0812;
    else if (type === "grass") {
      // Vacant lot dirt with olive scrub — not flat purple void
      const t = asphaltNoise(wx * 0.8, wy * 0.8);
      color = shade(lerpColor(0x1a1e18, 0x24281e, t * 0.55), bright);
      if (war > 0) color = lerpColor(color, 0x1a1410, war * 0.4);
    }

    // ——— ROAD: oversized diamond kills iso seams (continuous asphalt sheet) ———
    if (type === "road") {
      // Expand ~2px past tile edge so neighbors blend; no stroke ever
      const pad = 2.2;
      this.fillIsoDiamond(g, sx, sy, hw, hh, pad, color, texKey);

      // Continuous grit: world-noise speckles (same field across tile boundaries)
      const grit = asphaltGrit(wx, wy);
      if (grit > 0.62) {
        const gx = cx + (asphaltNoise(wx + 2, wy) - 0.5) * 18;
        const gy = cy + (asphaltNoise(wx, wy + 2) - 0.5) * 8;
        g.ellipse(gx, gy, 2.2 + grit * 2, 1 + grit);
        g.fill({ color: 0x0c0c12, alpha: 0.12 + grit * 0.1 });
      }
      if (grit < 0.28) {
        g.ellipse(cx + (grit - 0.14) * 40, cy + 1, 3, 1.3);
        g.fill({ color: 0x323240, alpha: 0.08 });
      }

      // Wet sheet + neon puddles (concept-art reflections) — only when raining
      if (wet > 0.2) {
        // Broad cool sheen across the continuous surface
        const sheenA = 0.035 + wet * 0.04;
        g.ellipse(cx, cy - 1, 16, 6);
        g.fill({ color: 0x4a6a98, alpha: sheenA });
        // Sparse neon puddles from world noise (not seed % N checker)
        if (asphaltNoise(wx * 0.55, wy * 0.55) > 0.72) {
          const neon = asphaltGrit(wx, wy) > 0.5 ? 0xe050c0 : 0x40d8f0;
          const pr = 6 + asphaltNoise(wx + 1, wy) * 8;
          g.ellipse(cx + (asphaltNoise(wx, wy + 3) - 0.5) * 10, cy + 1, pr, pr * 0.34);
          g.fill({ color: neon, alpha: 0.1 * wet * neonBoost });
          g.ellipse(cx, cy, pr * 0.4, pr * 0.12);
          g.fill({ color: 0xffffff, alpha: 0.05 * wet });
        }
      }

      // Cracks — sparse, world-noise driven (branching hairlines)
      if (asphaltNoise(wx * 0.9, wy * 1.1) > 0.78) {
        const ox = (asphaltGrit(wx, wy) - 0.5) * 12;
        g.moveTo(cx - 11 + ox, cy - 4);
        g.lineTo(cx - 2 + ox, cy + 1);
        g.lineTo(cx + 9 + ox, cy - 0.5);
        g.stroke({ color: 0x06060a, width: 1.05, alpha: 0.42 });
        if (asphaltGrit(wx + 1, wy) > 0.55) {
          g.moveTo(cx - 2 + ox, cy + 1);
          g.lineTo(cx + 2 + ox, cy + 5);
          g.stroke({ color: 0x06060a, width: 0.8, alpha: 0.28 });
        }
      }

      const roadN = this.tileType(x, y - 1) === "road";
      const roadS = this.tileType(x, y + 1) === "road";
      const roadE = this.tileType(x + 1, y) === "road";
      const roadW = this.tileType(x - 1, y) === "road";

      // Yellow dashed center lines — combat-scene style (ONE strip per avenue, not a grid)
      // True H-avenue center: both N+S road, and row above is NOT the deep middle
      // (for 4-wide 18–21, only y where y-2 is not road → northern middle row)
      const yellow = war > 0.4 ? 0xb87820 : 0xe0b820;
      const hCenter =
        roadN && roadS && this.tileType(x, y - 2) !== "road" && (roadE || roadW);
      const vCenter =
        roadE && roadW && this.tileType(x - 2, y) !== "road" && (roadN || roadS);

      // Dashed: every other tile along the center line
      if (hCenter && x % 2 === 0) {
        // Along +X world → screen diagonal down-right
        g.moveTo(cx - 11, cy - 5.5);
        g.lineTo(cx + 11, cy + 5.5);
        g.stroke({ color: yellow, width: 2.2, alpha: 0.78 });
        g.moveTo(cx - 10, cy - 6.2);
        g.lineTo(cx + 10, cy + 4.8);
        g.stroke({ color: 0xfff0a8, width: 0.7, alpha: 0.22 });
      }
      if (vCenter && y % 2 === 0) {
        // Along +Y world → screen diagonal down-left
        g.moveTo(cx + 11, cy - 5.5);
        g.lineTo(cx - 11, cy + 5.5);
        g.stroke({ color: yellow, width: 2.2, alpha: 0.78 });
        g.moveTo(cx + 10, cy - 6.2);
        g.lineTo(cx - 10, cy + 4.8);
        g.stroke({ color: 0xfff0a8, width: 0.7, alpha: 0.22 });
      }
      // At true intersection hub, both lines can meet → concept-art yellow X (no white stripes)

      // Oil stain — rare
      if (asphaltNoise(wx * 1.4, wy * 1.4) > 0.88) {
        g.ellipse(cx - 2, cy + 2, 9, 3.5);
        g.fill({ color: 0x080a10, alpha: 0.42 });
        if (wet > 0.2) {
          g.ellipse(cx - 3, cy + 1.5, 5, 1.8);
          g.fill({ color: 0x304860, alpha: 0.12 * wet });
        }
      }
      // Blood — war zone only, rare
      if (war > 0.35 && asphaltGrit(wx + 5, wy) > 0.82) {
        g.ellipse(cx + 3, cy, 5.5, 2.4);
        g.fill({ color: 0x6a1820, alpha: 0.45 });
      }
      // Soft curb shade into sidewalk (no hard tile edge)
      if (this.tileType(x, y - 1) === "sidewalk") {
        g.moveTo(sx, sy + 1);
        g.lineTo(sx + hw - 2, sy + hh);
        g.lineTo(sx - hw + 2, sy + hh);
        g.closePath();
        g.fill({ color: 0x000000, alpha: 0.16 });
      }
      if (this.tileType(x, y + 1) === "sidewalk") {
        g.moveTo(sx, sy + TILE_H - 1);
        g.lineTo(sx + hw - 2, sy + hh);
        g.lineTo(sx - hw + 2, sy + hh);
        g.closePath();
        g.fill({ color: 0x000000, alpha: 0.12 });
      }
      return;
    }

    // Non-road: textured diamond (sidewalk / grass / parking / interior floors)
    const pad = type === "sidewalk" || type === "grass" ? 1.4 : type === "parking" ? 1.2 : 0;
    const floorTex =
      indoor && type === "floor"
        ? null // set by interior chrome
        : texKey;
    this.fillIsoDiamond(g, sx, sy, hw, hh, pad, color, floorTex);

    if (type === "sidewalk") {
      // Very soft slab joints (not a hard grid)
      if ((x + y) % 2 === 0) {
        g.poly([
          sx,
          sy + 3,
          sx + hw - 3,
          sy + hh,
          sx,
          sy + TILE_H - 3,
          sx - hw + 3,
          sy + hh,
        ]);
        g.stroke({ color: 0x2a2834, width: 0.7, alpha: 0.1 });
      }
      const nearRoad =
        this.tileType(x + 1, y) === "road" ||
        this.tileType(x - 1, y) === "road" ||
        this.tileType(x, y + 1) === "road" ||
        this.tileType(x, y - 1) === "road";
      if (nearRoad) {
        g.moveTo(sx - hw + 6, sy + hh);
        g.lineTo(sx, sy + TILE_H - 3);
        g.lineTo(sx + hw - 6, sy + hh);
        g.stroke({ color: 0x1a1824, width: 2.2, alpha: 0.5 });
        g.moveTo(sx - hw + 8, sy + hh - 1);
        g.lineTo(sx, sy + 5);
        g.lineTo(sx + hw - 8, sy + hh - 1);
        g.stroke({ color: 0x7a7890, width: 1.2, alpha: 0.35 });
      }
      if (asphaltNoise(wx, wy) > 0.8) {
        const graf = [0xff40aa, 0x40e0ff, 0xa0ff40, 0xffc040, 0xc060ff][seed % 5]!;
        g.ellipse(cx - 1, cy - 1, 6, 2.8);
        g.fill({ color: graf, alpha: 0.16 * neonBoost });
      }
      if (wet > 0.3 && asphaltGrit(wx, wy) > 0.65) {
        g.ellipse(cx + 2, cy, 7, 2.6);
        g.fill({ color: 0x80a0d0, alpha: 0.06 * wet });
      }
    } else if (type === "parking") {
      if ((x + y) % 3 === 0) {
        g.moveTo(cx - 10, cy - 3);
        g.lineTo(cx + 10, cy + 5);
        g.stroke({ color: 0xc0a840, width: 1.5, alpha: 0.28 });
      }
    } else if (type === "grass") {
      // Vacant lot: dirt + sparse dead grass tufts (combat-scene empty blocks)
      const t = asphaltNoise(wx, wy);
      if (t > 0.55) {
        g.ellipse(cx + (t - 0.7) * 14, cy + 1, 5 + t * 3, 2.2);
        g.fill({ color: 0x1a2218, alpha: 0.35 });
      }
      // Weed clumps
      if (asphaltGrit(wx, wy) > 0.55) {
        const gx = cx + (asphaltNoise(wx + 1, wy) - 0.5) * 12;
        const gy = cy + (asphaltGrit(wx, wy + 1) - 0.5) * 6;
        g.moveTo(gx, gy + 2);
        g.lineTo(gx - 2, gy - 4);
        g.lineTo(gx + 1, gy - 2);
        g.lineTo(gx + 3, gy - 5);
        g.lineTo(gx + 1, gy + 2);
        g.fill({ color: 0x2a4030, alpha: 0.55 });
      }
      if (seed % 5 === 0) {
        g.circle(cx - 3, cy, 1.4);
        g.fill({ color: 0x3a5038, alpha: 0.4 });
        g.circle(cx + 2, cy + 1, 1.1);
        g.fill({ color: 0x2a3828, alpha: 0.35 });
      }
      // Dirt patch / bare earth
      if (asphaltNoise(wx * 0.6, wy * 0.6) > 0.7) {
        g.ellipse(cx, cy + 1, 8, 3.5);
        g.fill({ color: 0x2a2418, alpha: 0.28 });
      }
    } else if (type === "door") {
      g.roundRect(sx - 5, sy + 2, 10, 12, 1);
      g.fill({ color: 0x5a3018 });
    }
  }

  /** Decorative street clutter — manholes, drains, cones, trash (no collision). */
  private drawStreetDressing(g: Graphics, x: number, y: number, type: string): void {
    const seed = (x * 73 + y * 149) >>> 0;
    const { sx, sy } = worldToScreen(x + 0.5, y + 0.5);
    const war = warFactor(y);
    const neonBoost = Math.max(0.35, this.look.neon);

    // Manhole covers on roads (combat-scene circular lids) — sparse
    if (type === "road" && seed % 41 === 0) {
      g.ellipse(sx, sy + 2, 8, 4);
      g.fill({ color: 0x000000, alpha: 0.35 });
      g.ellipse(sx, sy + 1, 7.5, 3.6);
      g.fill({ color: 0x1a1c24, alpha: 0.92 });
      g.ellipse(sx, sy + 1, 6, 2.8);
      g.stroke({ color: 0x4a4c58, width: 1.1, alpha: 0.75 });
      // Cross bars
      g.moveTo(sx - 5, sy + 1);
      g.lineTo(sx + 5, sy + 1);
      g.stroke({ color: 0x2a2c34, width: 1, alpha: 0.7 });
      g.moveTo(sx, sy - 1.5);
      g.lineTo(sx, sy + 3.5);
      g.stroke({ color: 0x2a2c34, width: 1, alpha: 0.55 });
      // Bolt dots
      for (const [bx, by] of [
        [-3.5, 0],
        [3.5, 0],
        [0, -1.2],
        [0, 2.2],
      ] as const) {
        g.circle(sx + bx, sy + 1 + by, 0.7);
        g.fill({ color: 0x3a3c48, alpha: 0.7 });
      }
    }

    // Storm drain grates — rare
    if (type === "road" && seed % 47 === 4) {
      g.rect(sx - 7, sy, 14, 5);
      g.fill({ color: 0x0c0c12, alpha: 0.75 });
      for (let i = -2; i <= 2; i++) {
        g.rect(sx + i * 2.6 - 0.6, sy + 0.5, 1.2, 4);
        g.fill({ color: 0x2a2c34, alpha: 0.55 });
      }
    }

    // Traffic cone
    if ((type === "road" || type === "sidewalk") && seed % 23 === 3) {
      g.ellipse(sx, sy + 4, 5, 2);
      g.fill({ color: 0x000000, alpha: 0.3 });
      g.moveTo(sx, sy - 10);
      g.lineTo(sx + 5, sy + 3);
      g.lineTo(sx - 5, sy + 3);
      g.closePath();
      g.fill({ color: 0xff6020 });
      g.rect(sx - 3, sy - 4, 6, 2.5);
      g.fill({ color: 0xf0f0f0, alpha: 0.9 });
    }

    // Trash bag / pile
    if (type === "sidewalk" && seed % 17 === 5) {
      g.ellipse(sx, sy + 3, 6, 2.5);
      g.fill({ color: 0x000000, alpha: 0.3 });
      g.ellipse(sx, sy - 1, 5, 5);
      g.fill({ color: 0x1a1a1a });
      g.ellipse(sx - 1, sy - 3, 2, 1.5);
      g.fill({ color: 0x3a3a3a, alpha: 0.5 });
      if (seed % 2 === 0) {
        g.ellipse(sx + 4, sy + 1, 3.5, 3);
        g.fill({ color: 0x222018 });
      }
    }

    // Cardboard box / crate (sidewalk clutter)
    if (type === "sidewalk" && seed % 31 === 11) {
      g.ellipse(sx, sy + 3, 5, 2);
      g.fill({ color: 0x000000, alpha: 0.25 });
      g.rect(sx - 5, sy - 4, 10, 7);
      g.fill({ color: 0x6a5030 });
      g.rect(sx - 5, sy - 4, 10, 2);
      g.fill({ color: 0x8a6840, alpha: 0.7 });
    }

    // Fire hydrants: map props only (1–2 per block) — no sidewalk seed spam
    // (seed % N hydrants stacked into vertical columns along iso sidewalks)

    // Traffic light post (sidewalk corners near roads)
    if (type === "sidewalk" && seed % 29 === 7) {
      const nearRoad =
        this.tileType(x + 1, y) === "road" ||
        this.tileType(x - 1, y) === "road" ||
        this.tileType(x, y + 1) === "road" ||
        this.tileType(x, y - 1) === "road";
      if (nearRoad) {
        g.rect(sx - 1.5, sy - 28, 3, 30);
        g.fill({ color: 0x1a1a22 });
        g.roundRect(sx - 5, sy - 36, 10, 14, 1);
        g.fill({ color: 0x121018 });
        const lit = seed % 3;
        g.circle(sx, sy - 32, 2.5);
        g.fill({ color: lit === 0 ? 0xff3030 : 0x4a1010, alpha: lit === 0 ? 0.95 : 0.5 });
        g.circle(sx, sy - 27, 2.5);
        g.fill({ color: lit === 1 ? 0xffc030 : 0x4a3810, alpha: lit === 1 ? 0.95 : 0.5 });
        g.circle(sx, sy - 22, 2.5);
        g.fill({ color: lit === 2 ? 0x40e060 : 0x104a18, alpha: lit === 2 ? 0.95 : 0.5 });
        if (lit === 0) {
          g.circle(sx, sy - 32, 7);
          g.fill({ color: 0xff3030, alpha: 0.14 });
          // Red light bounce on wet ground
          g.ellipse(sx, sy + 2, 10, 3);
          g.fill({ color: 0xff3030, alpha: 0.08 * neonBoost });
        } else if (lit === 2) {
          g.ellipse(sx, sy + 2, 10, 3);
          g.fill({ color: 0x40e060, alpha: 0.06 * neonBoost });
        }
      }
    }

    // War-zone debris / shell casings pile
    if (war > 0.3 && type === "road" && seed % 11 === 2) {
      g.rect(sx - 4, sy, 8, 3);
      g.fill({ color: 0x4a4038, alpha: 0.55 });
      g.rect(sx + 2, sy - 2, 4, 4);
      g.fill({ color: 0x3a3028, alpha: 0.45 });
      g.circle(sx - 3, sy + 1, 1);
      g.fill({ color: 0xc0a040, alpha: 0.4 });
    }

    // ——— Vacant lots (grass tiles): garbage, rubble, weeds, junk ———
    if (type === "grass") {
      // Scattered trash bags
      if (seed % 13 === 2) {
        g.ellipse(sx, sy + 3, 6, 2.5);
        g.fill({ color: 0x000000, alpha: 0.28 });
        g.ellipse(sx - 1, sy - 1, 5, 5);
        g.fill({ color: 0x1a1a1a });
        g.ellipse(sx + 3, sy + 1, 3.5, 3);
        g.fill({ color: 0x222018 });
      }
      // Cardboard / crate junk
      if (seed % 17 === 5) {
        g.ellipse(sx, sy + 3, 5, 2);
        g.fill({ color: 0x000000, alpha: 0.22 });
        g.rect(sx - 6, sy - 3, 11, 7);
        g.fill({ color: 0x5a4030, alpha: 0.85 });
        g.rect(sx - 5, sy - 4, 9, 2);
        g.fill({ color: 0x7a5840, alpha: 0.6 });
      }
      // Broken pallet / wood scraps
      if (seed % 19 === 7) {
        g.rect(sx - 8, sy, 16, 3);
        g.fill({ color: 0x4a3828, alpha: 0.55 });
        g.rect(sx - 6, sy - 2, 3, 7);
        g.fill({ color: 0x3a2a1c, alpha: 0.5 });
        g.rect(sx + 2, sy - 1, 3, 6);
        g.fill({ color: 0x3a2a1c, alpha: 0.45 });
      }
      // Rubble pile / bricks
      if (seed % 11 === 3) {
        g.ellipse(sx, sy + 2, 8, 3.5);
        g.fill({ color: 0x000000, alpha: 0.2 });
        g.rect(sx - 5, sy - 2, 4, 3);
        g.fill({ color: 0x5a4840, alpha: 0.7 });
        g.rect(sx - 1, sy - 3, 5, 4);
        g.fill({ color: 0x4a3a34, alpha: 0.65 });
        g.rect(sx + 3, sy - 1, 3, 3);
        g.fill({ color: 0x6a5850, alpha: 0.55 });
      }
      // Shopping cart corpse / metal junk
      if (seed % 29 === 11) {
        g.ellipse(sx, sy + 3, 7, 2.5);
        g.fill({ color: 0x000000, alpha: 0.25 });
        g.rect(sx - 6, sy - 6, 12, 8);
        g.stroke({ color: 0x6a7080, width: 1.2, alpha: 0.55 });
        g.circle(sx - 4, sy + 2, 2.5);
        g.stroke({ color: 0x5a6070, width: 1, alpha: 0.5 });
        g.circle(sx + 4, sy + 2, 2.5);
        g.stroke({ color: 0x5a6070, width: 1, alpha: 0.5 });
      }
      // Tire
      if (seed % 23 === 9) {
        g.ellipse(sx, sy + 1, 7, 3.5);
        g.fill({ color: 0x0a0a10, alpha: 0.75 });
        g.ellipse(sx, sy + 1, 4, 2);
        g.fill({ color: 0x1a1a22, alpha: 0.6 });
      }
      // Bottle / can glints
      if (seed % 7 === 1) {
        g.rect(sx + 2, sy - 2, 2, 5);
        g.fill({ color: 0x40a060, alpha: 0.45 });
        g.circle(sx - 3, sy + 1, 1.5);
        g.fill({ color: 0xc0c8d0, alpha: 0.4 });
      }
      // Chain-link fence hint on lot edges (sparse posts)
      if (seed % 31 === 0) {
        g.rect(sx - 1, sy - 14, 2, 16);
        g.fill({ color: 0x4a5060, alpha: 0.45 });
        g.moveTo(sx - 6, sy - 12);
        g.lineTo(sx + 6, sy - 8);
        g.stroke({ color: 0x5a6070, width: 0.8, alpha: 0.3 });
      }
      // Dead bush / scrub
      if (seed % 15 === 4) {
        g.ellipse(sx, sy + 2, 6, 2.5);
        g.fill({ color: 0x000000, alpha: 0.2 });
        for (let i = 0; i < 5; i++) {
          const a = -0.8 + i * 0.4;
          g.moveTo(sx, sy);
          g.lineTo(sx + Math.sin(a) * 8, sy - 6 - (i % 2) * 3);
          g.stroke({ color: 0x3a3428, width: 1.2, alpha: 0.5 });
        }
      }
    }
  }

  /**
   * Full-viewport dual-layer rain (screen space).
   * Layer A: short soft drizzle, slow fall, light wind left.
   * Layer B: long bright streaks, faster fall, stronger wind right — different flow.
   */
  private drawWeather(snap: WorldSnapshot): void {
    const g = this.rainGfx;
    g.clear();
    g.position.set(0, 0);
    g.scale.set(1);
    g.rotation = 0;
    if (snap.you.insideBuildingId) return;

    const rainScale = this.look.rain;
    if (rainScale < 0.05) return;

    const canvas = this.app.canvas as HTMLCanvasElement;
    const w = Math.max(
      64,
      canvas.clientWidth || this.app.screen.width || this.app.renderer.width,
    );
    const h = Math.max(
      64,
      canvas.clientHeight || this.app.screen.height || this.app.renderer.height,
    );
    const t = this.time;
    const storm = rainScale > 1;
    const neonScale = Math.max(0.2, this.look.neon) * (0.5 + rainScale * 0.5);
    const alphaMul = Math.min(1.15, rainScale);

    type LayerOpts = {
      colStep: number;
      rows: number;
      /** Vertical fall speed (px/s) */
      fallSpeed: number;
      /** Horizontal wind drift (px/s) — sign = direction */
      wind: number;
      /** Base diagonal slant (px of X per streak) */
      slant: number;
      /** Extra slant jitter from wind sway */
      sway: number;
      swayHz: number;
      lenMin: number;
      lenMax: number;
      width: number;
      alpha: number;
      color: number;
      seed: number;
      /** Phase offset so layers don't sync vertically */
      phaseOff: number;
    };

    const drawLayer = (opts: LayerOpts) => {
      const cols = Math.ceil(w / opts.colStep) + 3;
      const span = h + opts.lenMax + 80;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < opts.rows; r++) {
          const i = c * 31 + r * 17 + opts.seed;
          const h1 = ((i * 1103515245 + 12345) >>> 0) / 0xffffffff;
          const h2 = ((i * 1664525 + 1013904223) >>> 0) / 0xffffffff;
          // Independent vertical phase per streak
          const fall = ((t * opts.fallSpeed + h1 * span + opts.phaseOff + r * (span / opts.rows)) %
            span) -
            40;
          // Wind + slow lateral sway (layers differ in sign/hz so they don't lock step)
          const windX = t * opts.wind + Math.sin(t * opts.swayHz + h2 * 6.28) * opts.sway;
          const baseX = ((c * opts.colStep + h2 * opts.colStep + windX) % (w + 40)) - 20;
          const len = opts.lenMin + h1 * (opts.lenMax - opts.lenMin);
          // Slant follows wind direction slightly
          const slant = opts.slant + (opts.wind > 0 ? 2 : -2) * h2;
          const a = opts.alpha * alphaMul * (0.75 + h2 * 0.35);
          g.moveTo(baseX, fall);
          g.lineTo(baseX + slant, fall + len);
          g.stroke({
            color: opts.color,
            width: opts.width,
            alpha: a,
          });
        }
      }
    };

    // ——— Layer A: distant sheet — short, soft, slow, drift LEFT ———
    drawLayer({
      colStep: storm ? 8 : 10,
      rows: storm ? 5 : 4,
      fallSpeed: storm ? 180 : 120,
      wind: storm ? -28 : -18,
      slant: storm ? 4 : 2.5,
      sway: 6,
      swayHz: 0.7,
      lenMin: storm ? 10 : 8,
      lenMax: storm ? 18 : 14,
      width: 0.95,
      alpha: 0.09,
      color: 0xa8b8d0,
      seed: 17,
      phaseOff: 55,
    });

    // ——— Layer B: near streaks — LONG, faster, steeper, drift RIGHT ———
    drawLayer({
      colStep: storm ? 14 : 18,
      rows: storm ? 4 : 3,
      fallSpeed: storm ? 520 : 360,
      wind: storm ? 55 : 38,
      slant: storm ? 14 : 11,
      sway: 14,
      swayHz: 1.35,
      lenMin: storm ? 36 : 28,
      lenMax: storm ? 72 : 56,
      width: storm ? 1.55 : 1.35,
      alpha: 0.16,
      color: 0xe0f0ff,
      seed: 91,
      phaseOff: 0,
    });

    // Occasional very long “sheet” streaks on layer B only (storm / heavy rain)
    if (rainScale > 0.7) {
      const n = storm ? 14 : 8;
      for (let i = 0; i < n; i++) {
        const h1 = ((i * 2654435761 + 99) >>> 0) / 0xffffffff;
        const h2 = ((i * 2246822519) >>> 0) / 0xffffffff;
        const span = h + 120;
        const fall = ((t * (storm ? 480 : 340) + h1 * span + 20) % span) - 30;
        const windX = t * (storm ? 48 : 32) + Math.sin(t * 0.9 + i) * 10;
        const px = ((h2 * w + windX) % (w + 60)) - 30;
        const len = 48 + h1 * 40;
        g.moveTo(px, fall);
        g.lineTo(px + 16 + h2 * 6, fall + len);
        g.stroke({
          color: 0xf0f8ff,
          width: 1.1,
          alpha: (0.07 + h2 * 0.05) * alphaMul,
        });
      }
    }

    // Wet neon glints across full screen
    const glints = Math.round(28 * neonScale);
    for (let i = 0; i < glints; i++) {
      const h1 = ((i * 2654435761) >>> 0) / 0xffffffff;
      const h2 = ((i * 2246822519) >>> 0) / 0xffffffff;
      const gx = h1 * w;
      const gy = h2 * h;
      const pulse = (0.03 + Math.sin(t * 2.6 + i) * 0.018) * neonScale;
      const rw = 12 + (i % 8) * 2;
      g.ellipse(gx, gy, rw, rw * 0.28);
      g.fill({
        color: i % 3 === 0 ? 0xff50c8 : i % 3 === 1 ? 0x50e8ff : 0xa070ff,
        alpha: pulse,
      });
    }
  }

  private drawBuildings(snap: WorldSnapshot): void {
    const g = this.buildingGfx;
    g.clear();
    for (const t of this.buildingLabelPool) t.destroy();
    this.buildingLabelPool = [];
    this.overlayLayer.removeChildren();

    // Full indoor room presentation — no exterior skyline
    if (snap.you.insideBuildingId) {
      // Hide outdoor prop sprites indoors
      for (const spr of this.propSprites.values()) spr.visible = false;
      this.propGfx.clear();
      this.drawInteriorChrome(snap);
      return;
    }

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

  /**
   * Interior floor chrome only. Building *title* is a fixed HTML HUD (#interiorPlace)
   * — world-space titles cluttered the room and drifted with the camera.
   */
  private drawInteriorChrome(snap: WorldSnapshot): void {
    const b = this.getInteriorBuilding(snap);
    if (!b) return;
    const bounds = this.interiorBounds(b);
    if (!bounds) return;

    const kind = b.kind ?? "";
    const isTwister = b.id === "club_neon" || kind === "club" || /titty|twister/i.test(b.name);
    if (isTwister) this.drawClubInteriorDecor(bounds);
    else if (kind === "bar" || /nail|bar/i.test(b.name)) this.drawBarInteriorDecor(bounds);
    else if (kind === "gym" || /temple|gym/i.test(b.name)) this.drawGymInteriorDecor(bounds);
    else if (kind === "hospital" || /doc|stitch/i.test(b.name)) this.drawHospitalInteriorDecor(bounds);
    else if (kind === "shop" || /pawn|ammo|liquor/i.test(b.name)) this.drawShopInteriorDecor(bounds);
    else if (kind === "safehouse" || /crash|pad/i.test(b.name)) this.drawSafehouseInteriorDecor(bounds);
    else if (kind === "warehouse" || kind === "garage" || kind === "coldstore")
      this.drawWarehouseInteriorDecor(bounds, kind);
    else if (kind === "church") this.drawChurchInteriorDecor(bounds);
    else this.drawGenericInteriorDecor(bounds);

    // Small EXIT marker on the door tile only (not the room title)
    if (b.exitX != null && b.exitY != null) {
      const door = worldToScreen(b.exitX + 0.5, b.exitY + 0.5);
      const exit = new Text({
        text: "EXIT",
        style: {
          fontSize: 12,
          fill: 0x70d090,
          fontWeight: "800",
          fontFamily: "system-ui, sans-serif",
          dropShadow: {
            color: 0x000000,
            blur: 2,
            distance: 1,
            alpha: 0.8,
          },
        },
      });
      exit.x = door.sx - exit.width / 2;
      exit.y = door.sy - 36;
      this.overlayLayer.addChild(exit);
      this.buildingLabelPool.push(exit);
    }
  }

  /**
   * Room floor as **one** iso quad (not per-tile diamonds) so textures don't stitch.
   */
  private drawIsoFloorWash(
    g: Graphics,
    bounds: { x0: number; y0: number; x1: number; y1: number },
    c0: number,
    c1: number,
    alpha = 0.55,
    texId: string | null = null,
  ): void {
    const c00 = worldToScreen(bounds.x0, bounds.y0);
    const c10 = worldToScreen(bounds.x1 + 1, bounds.y0);
    const c01 = worldToScreen(bounds.x0, bounds.y1 + 1);
    const c11 = worldToScreen(bounds.x1 + 1, bounds.y1 + 1);
    const pts = [c00.sx, c00.sy, c10.sx, c10.sy, c11.sx, c11.sy, c01.sx, c01.sy];
    const tex = texId && texturesReady() ? worldTexture(texId) : null;
    g.poly(pts);
    if (tex) {
      // Map texture across the whole room using geometry extents
      const minX = Math.min(c00.sx, c10.sx, c01.sx, c11.sx);
      const minY = Math.min(c00.sy, c10.sy, c01.sy, c11.sy);
      const maxX = Math.max(c00.sx, c10.sx, c01.sx, c11.sx);
      const maxY = Math.max(c00.sy, c10.sy, c01.sy, c11.sy);
      const period = 140;
      const mat = floorTextureMatrix().clone();
      // Prefer continuous world UV: scale + translate by room origin
      mat.set(
        (maxX - minX) / period,
        0,
        0,
        (maxY - minY) / period,
        minX / period,
        minY / period,
      );
      g.fill({
        texture: tex,
        matrix: mat,
        color: 0xffffff,
        alpha: Math.min(1, alpha + 0.25),
      });
      g.poly(pts);
      g.fill({ color: c0, alpha: 0.18 });
    } else {
      g.fill({ color: c0, alpha });
    }
    // Subtle checker wash without hard tile edges (large soft blotches)
    void c1;
    const hw = TILE_W / 2;
    for (let y = bounds.y0; y <= bounds.y1; y += 2) {
      for (let x = bounds.x0 + (y % 4 === 0 ? 0 : 1); x <= bounds.x1; x += 2) {
        const { sx, sy } = worldToScreen(x, y);
        g.poly([
          sx,
          sy + 2,
          sx + hw * 0.7,
          sy + TILE_H / 2,
          sx,
          sy + TILE_H - 2,
          sx - hw * 0.7,
          sy + TILE_H / 2,
        ]);
        g.fill({ color: c1, alpha: 0.06 });
      }
    }
  }

  /** Soft wall strip along north edge of an interior room (shared UV matrix). */
  private drawInteriorWallStrip(
    g: Graphics,
    bounds: { x0: number; y0: number; x1: number; y1: number },
    texId: string | null,
    wash: number,
  ): void {
    const tex = texId && texturesReady() ? worldTexture(texId) : null;
    const mat = wallFaceMatrix();
    // One continuous strip instead of per-tile rects (kills wall stitching)
    const left = worldToScreen(bounds.x0, bounds.y0);
    const right = worldToScreen(bounds.x1 + 1, bounds.y0);
    const midY = (left.sy + right.sy) / 2;
    const minX = Math.min(left.sx, right.sx) - 8;
    const maxX = Math.max(left.sx, right.sx) + 8;
    const w = maxX - minX;
    g.rect(minX, midY - 44, w, 28);
    if (tex) {
      g.fill({ texture: tex, matrix: mat, alpha: 0.88 });
      g.rect(minX, midY - 44, w, 28);
      g.fill({ color: wash, alpha: 0.28 });
    } else {
      g.fill({ color: wash, alpha: 0.55 });
    }
    // Baseboard
    g.rect(minX, midY - 18, w, 3);
    g.fill({ color: 0x1a1010, alpha: 0.45 });
  }

  private drawBarInteriorDecor(bounds: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }): void {
    const g = this.buildingGfx;
    const pulse = 0.5 + Math.sin(this.time * 2.2) * 0.12;
    // Sticky wood floor + stained walls
    this.drawIsoFloorWash(g, bounds, 0x2a1c18, 0x241814, 0.6, "wood_floor");
    this.drawInteriorWallStrip(g, bounds, "plaster_wall", 0x3a2a24);

    // Continuous bar counter (one piece, not per-tile boxes)
    const barL = worldToScreen(bounds.x0 + 1.2, bounds.y0 + 1.3);
    const barR = worldToScreen(bounds.x1 - 0.8, bounds.y0 + 1.3);
    const barMidX = (barL.sx + barR.sx) / 2;
    const barMidY = (barL.sy + barR.sy) / 2;
    const barW = Math.hypot(barR.sx - barL.sx, barR.sy - barL.sy) + 20;
    g.ellipse(barMidX, barMidY + 8, barW * 0.48, 10);
    g.fill({ color: 0x000000, alpha: 0.35 });
    g.roundRect(barMidX - barW * 0.45, barMidY - 6, barW * 0.9, 16, 3);
    g.fill({ color: 0x3a2418, alpha: 0.95 });
    g.roundRect(barMidX - barW * 0.45, barMidY - 8, barW * 0.9, 5, 2);
    g.fill({ color: 0x5a3a28, alpha: 0.9 }); // countertop
    g.roundRect(barMidX - barW * 0.45, barMidY - 6, barW * 0.9, 16, 3);
    g.stroke({ color: 0x1a1008, width: 1.2, alpha: 0.5 });

    // Bottle shelf + bottles along counter
    g.rect(barMidX - barW * 0.4, barMidY - 28, barW * 0.8, 4);
    g.fill({ color: 0x2a1a12, alpha: 0.9 });
    for (let i = 0; i < 9; i++) {
      const bx = barMidX - barW * 0.35 + i * (barW * 0.08);
      const cols = [0x60a0ff, 0xff8060, 0xffe080, 0x80ff80, 0xff60c0, 0xc0a0ff];
      g.rect(bx - 1.5, barMidY - 26, 3, 14);
      g.fill({ color: cols[i % cols.length]!, alpha: 0.55 });
      g.rect(bx - 1, barMidY - 28, 2, 3);
      g.fill({ color: 0xd0d0d0, alpha: 0.4 });
    }

    // Back-bar mirror glow
    g.rect(barMidX - barW * 0.38, barMidY - 40, barW * 0.76, 10);
    g.fill({ color: 0x4a6078, alpha: 0.2 });
    g.ellipse(barMidX, barMidY - 20, barW * 0.3, 8);
    g.fill({ color: 0xffa060, alpha: 0.06 * pulse });

    // Bar stools (fewer, better)
    for (let i = 0; i < 4; i++) {
      const t = 0.2 + i * 0.2;
      const p = worldToScreen(
        bounds.x0 + 1.5 + t * (bounds.x1 - bounds.x0 - 2),
        bounds.y0 + 2.5,
      );
      g.ellipse(p.sx, p.sy + 3, 7, 3);
      g.fill({ color: 0x000000, alpha: 0.35 });
      g.rect(p.sx - 1.5, p.sy - 4, 3, 8);
      g.fill({ color: 0x2a2018 });
      g.ellipse(p.sx, p.sy - 5, 7, 3.5);
      g.fill({ color: 0x4a3020 });
      g.ellipse(p.sx, p.sy - 5, 7, 3.5);
      g.stroke({ color: 0x1a1008, width: 1, alpha: 0.5 });
    }

    // Booth along side wall
    const booth = worldToScreen(bounds.x0 + 2, bounds.y1 - 1.2);
    g.ellipse(booth.sx, booth.sy + 3, 16, 7);
    g.fill({ color: 0x000000, alpha: 0.3 });
    g.roundRect(booth.sx - 18, booth.sy - 8, 36, 14, 4);
    g.fill({ color: 0x3a2018, alpha: 0.9 });
    g.roundRect(booth.sx - 16, booth.sy - 4, 32, 6, 2);
    g.fill({ color: 0x4a2820, alpha: 0.75 });

    // Neon beer signs
    const mid = worldToScreen((bounds.x0 + bounds.x1) / 2, bounds.y0 + 0.35);
    g.roundRect(mid.sx - 22, mid.sy - 48, 44, 14, 2);
    g.fill({ color: 0x0a0810, alpha: 0.9 });
    g.roundRect(mid.sx - 20, mid.sy - 46, 40, 10, 1);
    g.fill({ color: 0xff40aa, alpha: 0.4 + pulse * 0.2 });
    g.circle(mid.sx, mid.sy - 40, 16);
    g.fill({ color: 0xff40aa, alpha: 0.08 * pulse });

    // Second smaller sign
    const s2 = worldToScreen(bounds.x1 - 1.5, bounds.y0 + 0.4);
    g.roundRect(s2.sx - 10, s2.sy - 40, 20, 10, 1);
    g.fill({ color: 0x0a0810, alpha: 0.85 });
    g.roundRect(s2.sx - 8, s2.sy - 38, 16, 6, 1);
    g.fill({ color: 0x40e0ff, alpha: 0.45 + pulse * 0.15 });

    // Floor sticky stains / peanut shells vibe
    for (const spot of [
      { x: bounds.x0 + 3, y: bounds.y0 + 3 },
      { x: bounds.x1 - 2, y: bounds.y0 + 4 },
      { x: bounds.x0 + 5, y: bounds.y1 - 1.5 },
    ]) {
      const p = worldToScreen(spot.x, spot.y);
      g.ellipse(p.sx, p.sy + 4, 8, 3);
      g.fill({ color: 0x1a1008, alpha: 0.25 });
    }

    // Jukebox corner
    const juke = worldToScreen(bounds.x1 - 1.5, bounds.y0 + 2.5);
    g.ellipse(juke.sx, juke.sy + 3, 8, 3.5);
    g.fill({ color: 0x000000, alpha: 0.3 });
    g.roundRect(juke.sx - 8, juke.sy - 18, 16, 20, 2);
    g.fill({ color: 0x2a1830, alpha: 0.95 });
    g.rect(juke.sx - 6, juke.sy - 14, 12, 8);
    g.fill({ color: 0xff40c8, alpha: 0.25 + pulse * 0.15 });
    g.circle(juke.sx, juke.sy - 20, 6);
    g.fill({ color: 0x40e0ff, alpha: 0.15 * pulse });
  }

  private drawGymInteriorDecor(bounds: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }): void {
    const g = this.buildingGfx;
    // Rubber mat floor
    this.drawIsoFloorWash(g, bounds, 0x1a1814, 0x161410, 0.6);
    // Center mat square
    const mx0 = bounds.x0 + 2;
    const mx1 = bounds.x1 - 2;
    const my0 = bounds.y0 + 1;
    const my1 = bounds.y1 - 1;
    for (let y = my0; y <= my1; y++) {
      for (let x = mx0; x <= mx1; x++) {
        const { sx, sy } = worldToScreen(x, y);
        const hw = TILE_W / 2;
        g.poly([sx, sy, sx + hw, sy + TILE_H / 2, sx, sy + TILE_H, sx - hw, sy + TILE_H / 2]);
        g.fill({ color: (x + y) % 2 === 0 ? 0x2a2018 : 0x241c14, alpha: 0.45 });
      }
    }
    // Weight racks along walls
    for (let x = bounds.x0 + 1; x <= bounds.x1 - 1; x += 2) {
      const p = worldToScreen(x + 0.5, bounds.y0 + 0.8);
      g.rect(p.sx - 8, p.sy - 18, 16, 4);
      g.fill({ color: 0x3a3a40 });
      g.rect(p.sx - 6, p.sy - 14, 3, 12);
      g.fill({ color: 0x2a2a30 });
      g.rect(p.sx + 3, p.sy - 14, 3, 12);
      g.fill({ color: 0x2a2a30 });
      g.ellipse(p.sx - 4.5, p.sy - 4, 5, 3);
      g.fill({ color: 0x1a1a20 });
      g.ellipse(p.sx + 4.5, p.sy - 4, 5, 3);
      g.fill({ color: 0x1a1a20 });
    }
    // Punching bag
    const bag = worldToScreen(bounds.x1 - 1.5, bounds.y0 + 2.5);
    g.rect(bag.sx - 1, bag.sy - 36, 2, 12);
    g.fill({ color: 0x4a4030 });
    g.ellipse(bag.sx, bag.sy - 12, 8, 14);
    g.fill({ color: 0x3a2018 });
    g.ellipse(bag.sx, bag.sy - 18, 6, 4);
    g.fill({ color: 0x5a3020, alpha: 0.6 });
    // Mirror strip
    for (let x = bounds.x0 + 1; x <= bounds.x1 - 1; x++) {
      const p = worldToScreen(x + 0.5, bounds.y0 + 0.3);
      g.rect(p.sx - 8, p.sy - 28, 16, 10);
      g.fill({ color: 0x4a6078, alpha: 0.25 });
    }
    // IRON TEMPLE floor decal
    const center = worldToScreen((bounds.x0 + bounds.x1) / 2, (bounds.y0 + bounds.y1) / 2);
    g.ellipse(center.sx, center.sy + 4, 22, 10);
    g.stroke({ color: 0xffc040, width: 2, alpha: 0.35 });
    g.ellipse(center.sx, center.sy + 4, 14, 6);
    g.stroke({ color: 0xffc040, width: 1.2, alpha: 0.25 });
  }

  private drawHospitalInteriorDecor(bounds: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }): void {
    const g = this.buildingGfx;
    this.drawIsoFloorWash(g, bounds, 0x2a3038, 0x242c34, 0.55);
    // Exam beds
    for (const spot of [
      { x: bounds.x0 + 2, y: bounds.y0 + 2 },
      { x: bounds.x1 - 2, y: bounds.y0 + 2 },
    ]) {
      const p = worldToScreen(spot.x, spot.y);
      g.ellipse(p.sx, p.sy + 4, 14, 6);
      g.fill({ color: 0x000000, alpha: 0.25 });
      g.roundRect(p.sx - 14, p.sy - 6, 28, 12, 2);
      g.fill({ color: 0xd8dce8, alpha: 0.85 });
      g.rect(p.sx - 14, p.sy - 8, 8, 6);
      g.fill({ color: 0xffffff, alpha: 0.7 });
    }
    // Cabinet
    const cab = worldToScreen(bounds.x0 + 1.5, bounds.y0 + 1);
    g.roundRect(cab.sx - 10, cab.sy - 20, 20, 18, 2);
    g.fill({ color: 0x3a4850 });
    g.rect(cab.sx - 8, cab.sy - 16, 6, 8);
    g.fill({ color: 0x60c8ff, alpha: 0.25 });
    // Red cross
    const mid = worldToScreen((bounds.x0 + bounds.x1) / 2, bounds.y0 + 0.5);
    g.rect(mid.sx - 2, mid.sy - 36, 4, 14);
    g.fill({ color: 0xff4040, alpha: 0.7 });
    g.rect(mid.sx - 6, mid.sy - 32, 12, 4);
    g.fill({ color: 0xff4040, alpha: 0.7 });
  }

  private drawShopInteriorDecor(bounds: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }): void {
    const g = this.buildingGfx;
    this.drawIsoFloorWash(g, bounds, 0x282430, 0x221e2a, 0.5);
    // Shelves back wall
    for (let x = bounds.x0 + 1; x <= bounds.x1 - 1; x++) {
      const p = worldToScreen(x + 0.5, bounds.y0 + 0.9);
      g.rect(p.sx - 10, p.sy - 22, 20, 16);
      g.fill({ color: 0x3a3430, alpha: 0.85 });
      for (let r = 0; r < 3; r++) {
        g.rect(p.sx - 8, p.sy - 20 + r * 5, 16, 1);
        g.fill({ color: 0x1a1814, alpha: 0.5 });
        g.rect(p.sx - 7 + (r % 2) * 4, p.sy - 18 + r * 5, 4, 3);
        g.fill({ color: [0x40e0ff, 0xffc040, 0x60ff90][r]!, alpha: 0.35 });
      }
    }
    // Counter
    const c = worldToScreen((bounds.x0 + bounds.x1) / 2, bounds.y0 + 2.5);
    g.roundRect(c.sx - 22, c.sy - 6, 44, 14, 2);
    g.fill({ color: 0x4a3a28, alpha: 0.9 });
    g.ellipse(c.sx, c.sy - 8, 6, 3);
    g.fill({ color: 0x2a2018 });
  }

  /** Crash Pad — lived-in one-room apartment, not a void box. */
  private drawSafehouseInteriorDecor(bounds: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }): void {
    const g = this.buildingGfx;
    const pulse = 0.5 + Math.sin(this.time * 1.8) * 0.1;

    // Wood floor + plaster walls
    this.drawIsoFloorWash(g, bounds, 0x3a3028, 0x322820, 0.6, "wood_floor");
    this.drawInteriorWallStrip(g, bounds, "plaster_wall", 0x4a4840);

    // Window with blinds (back wall)
    const win = worldToScreen((bounds.x0 + bounds.x1) / 2, bounds.y0 + 0.3);
    g.roundRect(win.sx - 16, win.sy - 40, 32, 18, 1);
    g.fill({ color: 0x1a2838, alpha: 0.9 });
    g.roundRect(win.sx - 14, win.sy - 38, 28, 14, 1);
    g.fill({ color: 0x3a5068, alpha: 0.55 });
    for (let i = 0; i < 5; i++) {
      g.rect(win.sx - 14, win.sy - 37 + i * 3, 28, 1.2);
      g.fill({ color: 0x2a2a28, alpha: 0.45 });
    }
    // Soft daylight leak
    g.ellipse(win.sx, win.sy - 20, 20, 8);
    g.fill({ color: 0xffe8c0, alpha: 0.06 });

    // Bed with frame, pillow, blanket
    const bed = worldToScreen(bounds.x0 + 2.2, bounds.y0 + 2.2);
    g.ellipse(bed.sx, bed.sy + 6, 18, 8);
    g.fill({ color: 0x000000, alpha: 0.3 });
    g.roundRect(bed.sx - 18, bed.sy - 6, 36, 16, 2);
    g.fill({ color: 0x3a2a22, alpha: 0.95 }); // frame
    g.roundRect(bed.sx - 16, bed.sy - 4, 32, 12, 2);
    g.fill({ color: 0x4a5a68, alpha: 0.9 }); // sheet
    g.roundRect(bed.sx - 16, bed.sy - 2, 14, 8, 2);
    g.fill({ color: 0x5a3848, alpha: 0.75 }); // blanket
    g.roundRect(bed.sx - 15, bed.sy - 8, 10, 5, 2);
    g.fill({ color: 0xd8d0c8, alpha: 0.85 }); // pillow

    // Couch / futon
    const couch = worldToScreen(bounds.x1 - 2.2, bounds.y0 + 2.0);
    g.ellipse(couch.sx, couch.sy + 4, 14, 6);
    g.fill({ color: 0x000000, alpha: 0.25 });
    g.roundRect(couch.sx - 16, couch.sy - 6, 32, 12, 3);
    g.fill({ color: 0x3a4048, alpha: 0.9 });
    g.roundRect(couch.sx - 16, couch.sy - 10, 6, 10, 2);
    g.fill({ color: 0x2a3038, alpha: 0.85 });
    g.roundRect(couch.sx + 10, couch.sy - 10, 6, 10, 2);
    g.fill({ color: 0x2a3038, alpha: 0.85 });

    // Coffee table + pizza box + ashtray
    const tab = worldToScreen(bounds.x1 - 2.0, bounds.y0 + 3.2);
    g.ellipse(tab.sx, tab.sy + 2, 11, 4.5);
    g.fill({ color: 0x3a2a20 });
    g.roundRect(tab.sx - 5, tab.sy - 4, 8, 5, 1);
    g.fill({ color: 0xc0a060, alpha: 0.7 }); // pizza box
    g.circle(tab.sx + 5, tab.sy - 2, 2.5);
    g.fill({ color: 0x2a2a28, alpha: 0.8 });

    // Floor lamp
    const lamp = worldToScreen(bounds.x0 + 1.3, bounds.y0 + 3.5);
    g.rect(lamp.sx - 1, lamp.sy - 22, 2, 22);
    g.fill({ color: 0x3a3a40 });
    g.ellipse(lamp.sx, lamp.sy - 24, 8, 4);
    g.fill({ color: 0xffe0a0, alpha: 0.55 * pulse });
    g.circle(lamp.sx, lamp.sy - 24, 14);
    g.fill({ color: 0xffc060, alpha: 0.07 * pulse });

    // Mini fridge
    const frig = worldToScreen(bounds.x0 + 1.5, bounds.y0 + 1.2);
    g.roundRect(frig.sx - 7, frig.sy - 16, 14, 18, 1);
    g.fill({ color: 0x3a4850, alpha: 0.9 });
    g.rect(frig.sx + 3, frig.sy - 10, 2, 5);
    g.fill({ color: 0x1a1a20 });
    g.rect(frig.sx - 5, frig.sy - 14, 10, 2);
    g.fill({ color: 0x60a0c0, alpha: 0.25 });

    // TV on milk crate
    const tv = worldToScreen(bounds.x1 - 1.5, bounds.y0 + 1.3);
    g.rect(tv.sx - 6, tv.sy - 4, 12, 6);
    g.fill({ color: 0x4a3828 });
    g.roundRect(tv.sx - 10, tv.sy - 16, 20, 12, 1);
    g.fill({ color: 0x1a1a22 });
    g.rect(tv.sx - 8, tv.sy - 14, 16, 8);
    g.fill({ color: 0x204060, alpha: 0.5 });

    // Stash crate with green safe glow
    const st = worldToScreen((bounds.x0 + bounds.x1) / 2, bounds.y1 - 0.8);
    g.ellipse(st.sx, st.sy + 3, 12, 5);
    g.fill({ color: 0x000000, alpha: 0.3 });
    g.roundRect(st.sx - 12, st.sy - 8, 24, 14, 2);
    g.fill({ color: 0x3a3428, alpha: 0.95 });
    g.roundRect(st.sx - 12, st.sy - 8, 24, 14, 2);
    g.stroke({ color: 0x40ff80, width: 1.5, alpha: 0.35 + pulse * 0.2 });
    g.ellipse(st.sx, st.sy + 2, 14, 6);
    g.fill({ color: 0x40ff80, alpha: 0.08 + pulse * 0.04 });

    // Poster on wall
    const post = worldToScreen(bounds.x0 + 0.8, bounds.y0 + 0.5);
    g.rect(post.sx - 6, post.sy - 36, 12, 16);
    g.fill({ color: 0x6a2030, alpha: 0.7 });
    g.rect(post.sx - 5, post.sy - 35, 10, 4);
    g.fill({ color: 0xff4060, alpha: 0.4 });
  }

  private drawWarehouseInteriorDecor(
    bounds: { x0: number; y0: number; x1: number; y1: number },
    kind: string,
  ): void {
    const g = this.buildingGfx;
    const cold = kind === "coldstore";
    this.drawIsoFloorWash(
      g,
      bounds,
      cold ? 0x1a2830 : 0x2a2a24,
      cold ? 0x162028 : 0x24241e,
      0.5,
    );
    // Pillars
    for (const px of [bounds.x0 + 2, bounds.x1 - 2]) {
      for (const py of [bounds.y0 + 1, bounds.y1 - 1]) {
        const p = worldToScreen(px, py);
        g.rect(p.sx - 4, p.sy - 28, 8, 28);
        g.fill({ color: cold ? 0x3a5060 : 0x4a4838, alpha: 0.85 });
      }
    }
    // Crates
    for (let i = 0; i < 4; i++) {
      const p = worldToScreen(bounds.x0 + 1.5 + (i % 2) * 2, bounds.y0 + 1.5 + Math.floor(i / 2) * 1.5);
      g.roundRect(p.sx - 8, p.sy - 8, 16, 12, 1);
      g.fill({ color: cold ? 0x3a6070 : 0x6a5030, alpha: 0.85 });
      g.rect(p.sx - 6, p.sy - 4, 12, 2);
      g.fill({ color: 0x000000, alpha: 0.25 });
    }
  }

  private drawChurchInteriorDecor(bounds: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }): void {
    const g = this.buildingGfx;
    this.drawIsoFloorWash(g, bounds, 0x2a2420, 0x241e1a, 0.5);
    // Aisle runner
    for (let y = bounds.y0 + 1; y <= bounds.y1 - 1; y++) {
      const p = worldToScreen((bounds.x0 + bounds.x1) / 2, y);
      const hw = TILE_W / 3;
      g.poly([
        p.sx,
        p.sy,
        p.sx + hw,
        p.sy + TILE_H / 2,
        p.sx,
        p.sy + TILE_H,
        p.sx - hw,
        p.sy + TILE_H / 2,
      ]);
      g.fill({ color: 0x5a1820, alpha: 0.4 });
    }
    // Altar
    const a = worldToScreen((bounds.x0 + bounds.x1) / 2, bounds.y0 + 1);
    g.roundRect(a.sx - 14, a.sy - 8, 28, 12, 2);
    g.fill({ color: 0x3a3020 });
    g.rect(a.sx - 2, a.sy - 22, 4, 14);
    g.fill({ color: 0xc9a227, alpha: 0.7 });
    g.rect(a.sx - 6, a.sy - 18, 12, 3);
    g.fill({ color: 0xc9a227, alpha: 0.7 });
  }

  private drawGenericInteriorDecor(bounds: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }): void {
    const g = this.buildingGfx;
    this.drawIsoFloorWash(g, bounds, 0x2a2830, 0x242028, 0.4);
    // Soft wall wash
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      const p = worldToScreen(x + 0.5, bounds.y0);
      g.rect(p.sx - 10, p.sy - 30, 20, 8);
      g.fill({ color: 0xffc080, alpha: 0.04 });
    }
  }

  /** Exclusive velvet VIP lounge for The Titty Twister. */
  private drawClubInteriorDecor(bounds: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }): void {
    const g = this.buildingGfx;
    const pulse = 0.55 + Math.sin(this.time * 2.5) * 0.15;

    // Plush carpet + leather wall strip
    this.drawIsoFloorWash(g, bounds, 0x2a1020, 0x220c18, 0.65, "club_carpet");
    this.drawInteriorWallStrip(g, bounds, "club_wall", 0x1a0814);

    // Gold runner down the center aisle
    for (let y = bounds.y0 + 1; y <= bounds.y1 - 1; y++) {
      const p = worldToScreen((bounds.x0 + bounds.x1) / 2, y);
      g.ellipse(p.sx, p.sy + 8, 10, 4);
      g.fill({ color: 0xc9a227, alpha: 0.12 + pulse * 0.05 });
    }

    // Neon cove lighting along back wall
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      const a = worldToScreen(x, bounds.y0);
      g.rect(a.sx - 10, a.sy - 44, 20, 3);
      g.fill({ color: 0xff40c8, alpha: 0.25 + pulse * 0.2 });
      g.circle(a.sx, a.sy - 42, 8);
      g.fill({ color: 0xff40c8, alpha: 0.06 * pulse });
    }
    // Magenta side coves
    for (let y = bounds.y0; y <= bounds.y1; y += 2) {
      const L = worldToScreen(bounds.x0, y);
      const R = worldToScreen(bounds.x1, y);
      g.rect(L.sx - 8, L.sy - 30, 4, 18);
      g.fill({ color: 0xff2080, alpha: 0.2 * pulse });
      g.rect(R.sx + 4, R.sy - 30, 4, 18);
      g.fill({ color: 0x40e0ff, alpha: 0.15 * pulse });
    }

    // Raised stages + chrome poles
    const stageSpots = [
      { x: 40, y: 4.2 },
      { x: 43.5, y: 4.0 },
      { x: 46, y: 5.2 },
    ];
    for (const s of stageSpots) {
      const { sx, sy } = worldToScreen(s.x, s.y);
      void clubPropTexture("stage");
      g.ellipse(sx, sy + 6, 24, 11);
      g.fill({ color: 0x000000, alpha: 0.45 });
      g.ellipse(sx, sy + 4, 20, 9);
      g.fill({ color: 0x1a0814, alpha: 0.95 });
      g.ellipse(sx, sy + 4, 20, 9);
      g.stroke({ color: 0xffd070, width: 1.8, alpha: 0.45 + pulse * 0.25 });
      g.ellipse(sx, sy + 2, 14, 6);
      g.fill({ color: 0x3a1830, alpha: 0.7 });
      // Chrome pole
      g.rect(sx - 1.5, sy - 48, 3, 52);
      g.fill({ color: 0xc0c8d8, alpha: 0.9 });
      g.rect(sx - 0.5, sy - 48, 1, 52);
      g.fill({ color: 0xffffff, alpha: 0.4 });
      g.circle(sx, sy - 50, 4);
      g.fill({ color: 0xff60c0, alpha: 0.55 * pulse });
      g.circle(sx, sy - 50, 10);
      g.fill({ color: 0xff40aa, alpha: 0.08 * pulse });
    }

    // VIP booths — leather + gold
    for (const spot of [
      { x: 36.5, y: 6.5 },
      { x: 38.5, y: 7.2 },
      { x: 45.5, y: 7.0 },
    ]) {
      const { sx, sy } = worldToScreen(spot.x, spot.y);
      g.ellipse(sx, sy + 4, 18, 8);
      g.fill({ color: 0x000000, alpha: 0.4 });
      g.roundRect(sx - 20, sy - 12, 40, 18, 8);
      g.fill({ color: 0x2a0c18, alpha: 0.95 });
      g.roundRect(sx - 20, sy - 12, 40, 18, 8);
      g.stroke({ color: 0xc9a227, width: 1.5, alpha: 0.55 + pulse * 0.15 });
      // Cushion
      g.roundRect(sx - 16, sy - 8, 32, 8, 4);
      g.fill({ color: 0x5a1830, alpha: 0.8 });
      // Bottle service table
      g.ellipse(sx, sy - 2, 8, 4);
      g.fill({ color: 0x1a1018 });
      g.rect(sx - 1, sy - 10, 2, 6);
      g.fill({ color: 0x80e0ff, alpha: 0.5 });
      g.circle(sx, sy - 12, 3);
      g.fill({ color: 0xffd070, alpha: 0.45 * pulse });
    }

    // Exclusive bar — marble top + bottles
    const bar = worldToScreen(36.5, 3.2);
    g.ellipse(bar.sx, bar.sy + 6, 28, 10);
    g.fill({ color: 0x000000, alpha: 0.35 });
    g.roundRect(bar.sx - 30, bar.sy - 8, 60, 16, 3);
    g.fill({ color: 0x1a1018, alpha: 0.95 });
    g.roundRect(bar.sx - 28, bar.sy - 10, 56, 5, 2);
    g.fill({ color: 0xd0c8c0, alpha: 0.7 }); // marble
    g.roundRect(bar.sx - 30, bar.sy - 8, 60, 16, 3);
    g.stroke({ color: 0xc9a227, width: 1.2, alpha: 0.5 });
    for (let i = -3; i <= 3; i++) {
      g.rect(bar.sx + i * 7 - 1, bar.sy - 22, 2.5, 12);
      g.fill({
        color: [0xff60c0, 0x40e0ff, 0xffd070, 0x80ff80][(i + 3) % 4]!,
        alpha: 0.45,
      });
    }
    g.ellipse(bar.sx, bar.sy + 4, 24, 8);
    g.fill({ color: 0xff40aa, alpha: 0.1 * pulse });

    // "MEMBERS" neon plaque
    const plaque = worldToScreen((bounds.x0 + bounds.x1) / 2, bounds.y0 + 0.4);
    g.roundRect(plaque.sx - 28, plaque.sy - 52, 56, 14, 2);
    g.fill({ color: 0x0a0810, alpha: 0.9 });
    g.roundRect(plaque.sx - 26, plaque.sy - 50, 52, 10, 1);
    g.fill({ color: 0xff40c8, alpha: 0.4 + pulse * 0.2 });
  }

  private drawZoneDivider(g: Graphics): void {
    const y = SAFE_Y_MAX;
    // Iso diagonal: constant world-y → screen runs down-right (not screen-vertical)
    for (let x = 0; x < 110; x += 2) {
      const a = worldToScreen(x, y);
      const b = worldToScreen(x + 2, y);
      g.moveTo(a.sx, a.sy);
      g.lineTo(b.sx, b.sy);
    }
    g.stroke({ color: 0xff3030, width: 3, alpha: 0.55 });
    // Second dashed rail slightly south (war side)
    for (let x = 1; x < 110; x += 2) {
      const a = worldToScreen(x, y + 0.35);
      const b = worldToScreen(x + 2, y + 0.35);
      g.moveTo(a.sx, a.sy);
      g.lineTo(b.sx, b.sy);
    }
    g.stroke({ color: 0xff6060, width: 1.5, alpha: 0.35 });

    // Jersey barriers along the iso line (oriented with the diagonal, not upright poles)
    for (let x = 3; x < 108; x += 5) {
      const p0 = worldToScreen(x, y);
      const p1 = worldToScreen(x + 1.2, y);
      const mx = (p0.sx + p1.sx) / 2;
      const my = (p0.sy + p1.sy) / 2;
      // Iso diamond barrier sitting ON the line
      g.poly([
        mx,
        my - 5,
        mx + 10,
        my,
        mx,
        my + 5,
        mx - 10,
        my,
      ]);
      g.fill({ color: 0x5a4030, alpha: 0.85 });
      g.poly([
        mx,
        my - 5,
        mx + 10,
        my,
        mx,
        my + 5,
        mx - 10,
        my,
      ]);
      g.stroke({ color: 0xff4040, width: 1.2, alpha: 0.55 });
      // Stripe
      g.moveTo(mx - 5, my - 1);
      g.lineTo(mx + 5, my + 1);
      g.stroke({ color: 0xffc040, width: 1.5, alpha: 0.7 });
    }

    for (const midX of [28, 55, 82]) {
      // Labels sit just north (safe) / south (war) of the iso line
      const safePos = worldToScreen(midX, SAFE_Y_MAX - 1.2);
      const warPos = worldToScreen(midX, SAFE_Y_MAX + 1.4);
      const safe = new Text({
        text: "▲ SAFE DOWNTOWN",
        style: { fontSize: 11, fill: 0x60c080, fontWeight: "700" },
      });
      safe.x = safePos.sx - safe.width / 2;
      safe.y = safePos.sy - 8;
      this.overlayLayer.addChild(safe);
      this.buildingLabelPool.push(safe);
      const war = new Text({
        text: "▼ WARZONE",
        style: { fontSize: 11, fill: 0xff6060, fontWeight: "700" },
      });
      war.x = warPos.sx - war.width / 2;
      war.y = warPos.sy - 4;
      this.overlayLayer.addChild(war);
      this.buildingLabelPool.push(war);
    }
  }

  private drawIsoBuilding(g: Graphics, b: BuildingPublic, war: number): void {
    const x0 = b.ex0!;
    const y0 = b.ey0!;
    const x1 = b.ex1!;
    const y1 = b.ey1!;
    const stories = Math.max(2, b.stories ?? 2);
    // Extra height so large footprints still read as vertical buildings
    const h = stories * FLOOR_PX + 10;
    let wall = b.wallColor ?? 0x3a3648;
    wall = lerpColor(wall, 0x342e42, 0.35);
    let roof = b.roofColor ?? 0x18141e;
    let accent = b.accentColor ?? 0xff40aa;
    if (b.kind === "bar" || b.kind === "club") accent = 0xff40c8;
    else if (b.kind === "shop") accent = 0x40e0ff;
    else if (b.kind === "hospital") accent = 0xff5050;
    else if (b.kind === "gym") accent = 0xffc040;
    else if (b.kind === "safehouse") accent = 0x60c080;
    else if (b.kind === "church") accent = 0xc9a227;
    else if (b.kind === "coldstore" || b.kind === "warehouse") accent = 0x60d0ff;
    else if (b.kind === "garage") accent = 0x60a0e0;
    if (war > 0.15) {
      wall = lerpColor(wall, 0x221018, war * 0.7);
      roof = lerpColor(roof, 0x10080c, war * 0.7);
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

    // Ground shadow
    g.poly([c00.sx, c00.sy + 6, c10.sx, c10.sy + 6, c11.sx, c11.sy + 6, c01.sx, c01.sy + 6]);
    g.fill({ color: 0x000000, alpha: 0.32 });

    const brick = texturesReady() ? worldTexture("brick") : null;
    const roofTex = texturesReady() ? worldTexture("roof") : null;
    const wallMat = wallFaceMatrix();
    const fillWall = (pts: number[], shadeMul: number) => {
      g.poly(pts);
      if (brick) {
        g.fill({
          texture: brick,
          matrix: wallMat,
          color: 0xffffff,
          alpha: 0.95,
        });
        g.poly(pts);
        g.fill({ color: shade(wall, shadeMul), alpha: 0.32 });
      } else {
        g.fill({ color: shade(wall, shadeMul) });
      }
    };

    // Four wall faces with strong value separation (reads as 3D, not flat diamond)
    fillWall([c00.sx, c00.sy, c01.sx, c01.sy, t01.sx, t01.sy, t00.sx, t00.sy], 0.62);
    fillWall([c00.sx, c00.sy, c10.sx, c10.sy, t10.sx, t10.sy, t00.sx, t00.sy], 1.05);
    fillWall([c01.sx, c01.sy, c11.sx, c11.sy, t11.sx, t11.sy, t01.sx, t01.sy], 0.48);
    fillWall([c10.sx, c10.sy, c11.sx, c11.sy, t11.sx, t11.sy, t10.sx, t10.sy], 0.72);

    // Brick / panel courses on the front face
    const courseN = stories * 4;
    for (let row = 1; row < courseN; row++) {
      const t = row / courseN;
      const ax = c00.sx + (t00.sx - c00.sx) * t;
      const ay = c00.sy + (t00.sy - c00.sy) * t;
      const bx = c10.sx + (t10.sx - c10.sx) * t;
      const by = c10.sy + (t10.sy - c10.sy) * t;
      g.moveTo(ax + (bx - ax) * 0.05, ay + (by - ay) * 0.05);
      g.lineTo(ax + (bx - ax) * 0.95, ay + (by - ay) * 0.95);
      g.stroke({ color: 0x0a0812, width: 1, alpha: 0.14 });
    }

    // Ground-floor storefront strip (front face)
    {
      const storeH = h * 0.28;
      const s00 = { sx: c00.sx, sy: c00.sy };
      const s10 = { sx: c10.sx, sy: c10.sy };
      const s00t = { sx: c00.sx, sy: c00.sy - storeH };
      const s10t = { sx: c10.sx, sy: c10.sy - storeH };
      g.poly([s00.sx, s00.sy, s10.sx, s10.sy, s10t.sx, s10t.sy, s00t.sx, s00t.sy]);
      g.fill({ color: shade(wall, 0.35), alpha: 0.92 });
      // Glass panes
      const paneN = Math.min(5, Math.max(2, Math.floor((x1 - x0 + 1) / 2)));
      for (let i = 1; i <= paneN; i++) {
        const t = i / (paneN + 1);
        const bx = c00.sx + (c10.sx - c00.sx) * t;
        const by = c00.sy + (c10.sy - c00.sy) * t;
        g.rect(bx - 7, by - storeH * 0.75, 14, storeH * 0.55);
        g.fill({ color: 0x0a1020, alpha: 0.85 });
        g.rect(bx - 6, by - storeH * 0.72, 12, storeH * 0.48);
        g.fill({
          color: accent,
          alpha: 0.12 + 0.2 * Math.max(0.15, this.look.neon),
        });
      }
    }

    // Outlines
    g.poly([c00.sx, c00.sy, c10.sx, c10.sy, t10.sx, t10.sy, t00.sx, t00.sy]);
    g.stroke({ color: 0x0a0812, width: 1.8, alpha: 0.7 });
    g.poly([c00.sx, c00.sy, c01.sx, c01.sy, t01.sx, t01.sy, t00.sx, t00.sy]);
    g.stroke({ color: 0x0a0812, width: 1.4, alpha: 0.5 });

    // Upper-floor windows on front + left faces
    const neonPalette = [0xff40aa, 0x40e0ff, 0x60ff90, 0xffc040, 0xc060ff];
    const neonMul = Math.max(0.12, this.look.neon);
    const winCols = Math.min(6, Math.max(3, Math.floor((x1 - x0 + 1) / 1.5)));
    for (let f = 1; f < stories; f++) {
      const fy = 1 - (f + 0.45) / stories;
      for (let i = 1; i <= winCols; i++) {
        const t = i / (winCols + 1);
        // Front face
        const bx = c00.sx + (c10.sx - c00.sx) * t;
        const by = c00.sy + (c10.sy - c00.sy) * t;
        const broken = war > 0.25 && (b.id.charCodeAt(0) + f + i) % 4 === 0;
        const litChance = neonMul > 0.7 ? 2 : neonMul > 0.4 ? 3 : 4;
        const lit = !broken && (b.id.charCodeAt(0) + f + i) % litChance !== 0;
        const winNeon = neonPalette[(b.id.charCodeAt(0) + f + i) % neonPalette.length]!;
        g.rect(bx - 5, by - h * fy - 6, 10, 9);
        g.fill({ color: 0x0a0810, alpha: 0.92 });
        g.rect(bx - 4, by - h * fy - 5, 8, 7);
        if (broken) {
          g.fill({ color: 0x0a0808, alpha: 0.85 });
        } else if (lit) {
          g.fill({ color: winNeon, alpha: 0.5 + 0.45 * neonMul });
          g.circle(bx, by - h * fy - 1, 8);
          g.fill({ color: winNeon, alpha: 0.07 + 0.1 * neonMul });
        } else {
          g.fill({ color: 0x12101c, alpha: 0.8 });
        }
      }
    }

    // Roof slab + parapet
    g.poly([t00.sx, t00.sy, t10.sx, t10.sy, t11.sx, t11.sy, t01.sx, t01.sy]);
    if (roofTex) {
      g.fill({
        texture: roofTex,
        matrix: wallFaceMatrix(),
        color: 0xffffff,
        alpha: 0.95,
      });
      g.poly([t00.sx, t00.sy, t10.sx, t10.sy, t11.sx, t11.sy, t01.sx, t01.sy]);
      g.fill({ color: roof, alpha: 0.28 });
    } else {
      g.fill({ color: roof });
    }
    g.poly([t00.sx, t00.sy, t10.sx, t10.sy, t11.sx, t11.sy, t01.sx, t01.sy]);
    g.stroke({ color: shade(accent, 0.75), width: 1.6, alpha: 0.55 });
    // Parapet lip
    const ph = 5;
    g.poly([
      t00.sx,
      t00.sy,
      t10.sx,
      t10.sy,
      t10.sx,
      t10.sy - ph,
      t00.sx,
      t00.sy - ph,
    ]);
    g.fill({ color: shade(roof, 1.15), alpha: 0.9 });

    // Roof gear: AC units / vents
    {
      const rcx = (t00.sx + t11.sx) / 2;
      const rcy = (t00.sy + t11.sy) / 2;
      g.roundRect(rcx - 10, rcy - 6, 14, 10, 1);
      g.fill({ color: 0x2a2c34, alpha: 0.9 });
      g.rect(rcx - 8, rcy - 4, 4, 3);
      g.fill({ color: 0x1a1c22 });
      g.roundRect(rcx + 6, rcy - 2, 10, 8, 1);
      g.fill({ color: 0x32343c, alpha: 0.85 });
      // Antenna / water tower hint for taller buildings
      if (stories >= 3) {
        g.rect(rcx + 2, rcy - 22, 2, 16);
        g.fill({ color: 0x4a4a55 });
        g.circle(rcx + 3, rcy - 24, 3);
        g.fill({ color: accent, alpha: 0.4 * neonMul });
      }
    }

    // Kind-specific roof flair
    if (b.kind === "church") {
      const sp = { sx: (t00.sx + t11.sx) / 2, sy: (t00.sy + t11.sy) / 2 - 8 };
      g.moveTo(sp.sx, sp.sy - 28);
      g.lineTo(sp.sx + 10, sp.sy);
      g.lineTo(sp.sx - 10, sp.sy);
      g.closePath();
      g.fill({ color: 0x3a3028 });
      g.rect(sp.sx - 1.5, sp.sy - 36, 3, 12);
      g.fill({ color: 0xc9a227, alpha: 0.8 });
    }
    if (b.kind === "gym") {
      const sp = { sx: (t00.sx + t10.sx) / 2, sy: (t00.sy + t10.sy) / 2 };
      g.roundRect(sp.sx - 22, sp.sy - h * 0.55, 44, 12, 2);
      g.fill({ color: 0x0a0810, alpha: 0.9 });
      g.roundRect(sp.sx - 20, sp.sy - h * 0.55 + 1, 40, 10, 1);
      g.fill({ color: 0xffc040, alpha: 0.5 + 0.35 * neonMul });
    }

    // Vertical neon sign (street face)
    {
      const midX = (c00.sx + c10.sx) / 2;
      const midY = (c00.sy + c10.sy) / 2;
      const signH = Math.min(h * 0.55, 42);
      g.circle(midX - 16, midY - h * 0.5, 16);
      g.fill({
        color: accent,
        alpha: (0.1 + Math.sin(this.time * 3 + b.id.charCodeAt(0)) * 0.04) * neonMul,
      });
      g.roundRect(midX - 22, midY - h * 0.72, 11, signH, 2);
      g.fill({ color: 0x0a0810, alpha: 0.92 });
      g.roundRect(midX - 21, midY - h * 0.72 + 1, 9, signH - 2, 1);
      g.fill({ color: accent, alpha: 0.5 + 0.4 * neonMul });
      for (let i = 0; i < 5; i++) {
        g.rect(midX - 19, midY - h * 0.7 + 4 + i * (signH / 6), 5, 2.2);
        g.fill({ color: 0xffffff, alpha: 0.22 + 0.2 * neonMul });
      }
    }

    // Awning / canopy for public fronts
    if (
      b.kind === "bar" ||
      b.kind === "shop" ||
      b.kind === "club" ||
      b.kind === "hospital" ||
      b.kind === "gym"
    ) {
      const door = worldToScreen(b.doorX + 0.5, b.doorY + 0.5);
      g.poly([
        door.sx - 18,
        door.sy - 20,
        door.sx + 18,
        door.sy - 20,
        door.sx + 15,
        door.sy - 12,
        door.sx - 15,
        door.sy - 12,
      ]);
      g.fill({ color: shade(accent, 0.5), alpha: 0.88 });
      g.poly([
        door.sx - 18,
        door.sy - 20,
        door.sx + 18,
        door.sy - 20,
        door.sx + 15,
        door.sy - 12,
        door.sx - 15,
        door.sy - 12,
      ]);
      g.stroke({ color: 0x0a0810, width: 1.2, alpha: 0.55 });
      // Stripe on awning
      for (let i = -2; i <= 2; i++) {
        g.rect(door.sx + i * 6 - 2, door.sy - 19, 3, 6);
        g.fill({ color: 0x0a0810, alpha: 0.15 });
      }
    }

    // Door with steps
    const door = worldToScreen(b.doorX + 0.5, b.doorY + 0.5);
    g.ellipse(door.sx, door.sy + 4, 10, 4);
    g.fill({ color: 0x000000, alpha: 0.3 });
    g.rect(door.sx - 9, door.sy - 2, 18, 4);
    g.fill({ color: 0x3a3a48, alpha: 0.7 });
    g.roundRect(door.sx - 8, door.sy - 20, 16, 20, 1);
    g.fill({ color: 0x0a0810 });
    g.roundRect(door.sx - 7, door.sy - 19, 14, 18, 1);
    g.fill({ color: shade(wall, 0.28) });
    // Door window
    g.rect(door.sx - 4, door.sy - 16, 8, 6);
    g.fill({ color: accent, alpha: 0.25 + 0.3 * neonMul });
    g.circle(door.sx + 4, door.sy - 8, 1.6);
    g.fill({ color: 0xc0a060, alpha: 0.85 });
    g.circle(door.sx, door.sy - 6, 12);
    g.stroke({ color: accent, width: 2, alpha: 0.3 + 0.4 * neonMul });
    g.circle(door.sx, door.sy - 6, 18);
    g.stroke({ color: accent, width: 1, alpha: 0.08 + 0.12 * neonMul });
  }

  private drawProps(props: PropPublic[]): void {
    const g = this.propGfx;
    g.clear();
    const used = new Set<string>();

    // Sort for painter's algorithm
    const sorted = [...props].sort((a, b) => a.x + a.y - (b.x + b.y));

    for (const p of sorted) {
      const { sx, sy } = worldToScreen(p.x, p.y);
      const war = warFactor(p.y);
      used.add(p.id);

      // Shadow under everything
      g.ellipse(sx, sy + 6, 12, 4);
      g.fill({ color: 0x000000, alpha: 0.4 });

      // Prefer painted prop sprites when available
      const tex = propTexture(p.kind === "car" ? "car" : p.kind);
      if (tex && spritesReady()) {
        let spr = this.propSprites.get(p.id);
        if (!spr) {
          spr = new Sprite(tex);
          spr.anchor.set(0.5, 0.9);
          this.propSprites.set(p.id, spr);
          this.propSpriteLayer.addChild(spr);
        }
        if (spr.texture !== tex) spr.texture = tex;
        const scale = PROP_SPRITE_H / Math.max(1, tex.height);
        spr.scale.set(scale);
        spr.x = sx;
        spr.y = sy + 4;
        spr.visible = true;
        spr.alpha = 1;
        // War-zone cars get a slight red tint; all props pick up day/district wash
        const baseTint = p.kind === "car" && war > 0.35 ? 0xffc0c0 : 0xffffff;
        spr.tint = mulTint(baseTint, this.look.entityTint);
        continue;
      }

      // Procedural fallback / kinds without sprites
      if (p.kind === "dumpster") {
        g.roundRect(sx - 16, sy - 14, 32, 20, 2);
        g.fill({ color: lerpColor(0x2a6a3a, 0x2a3020, war) });
        g.roundRect(sx - 16, sy - 14, 32, 20, 2);
        g.stroke({ color: 0x0a0a10, width: 1.5, alpha: 0.7 });
        g.rect(sx - 14, sy - 16, 28, 5);
        g.fill({ color: 0x1a3a22, alpha: 0.9 });
        g.rect(sx - 12, sy - 10, 10, 3);
        g.fill({ color: 0x40a060, alpha: 0.35 });
        // Trash peaking out
        g.ellipse(sx + 4, sy - 12, 4, 3);
        g.fill({ color: 0x3a3a30, alpha: 0.7 });
      } else if (p.kind === "car") {
        const body = war > 0.3 ? 0x4a5568 : 0xf0c820;
        g.roundRect(sx - 18, sy - 12, 36, 18, 4);
        g.fill({ color: body });
        g.roundRect(sx - 18, sy - 12, 36, 18, 4);
        g.stroke({ color: 0x0a0810, width: 1.5, alpha: 0.75 });
        g.rect(sx - 8, sy - 14, 16, 7);
        g.fill({ color: war > 0.3 ? 0x1a1010 : 0x305878, alpha: 0.9 });
        if (war > 0.3) {
          g.circle(sx + 6, sy - 10, 4);
          g.fill({ color: 0xff6020, alpha: 0.55 });
        }
        g.circle(sx - 11, sy + 6, 4);
        g.fill({ color: 0x1a1a1a });
        g.circle(sx + 11, sy + 6, 4);
        g.fill({ color: 0x1a1a1a });
        // Headlights
        g.circle(sx + 16, sy - 2, 2);
        g.fill({ color: 0xfff0c0, alpha: 0.7 });
      } else if (p.kind === "motorcycle") {
        g.ellipse(sx, sy + 2, 14, 5);
        g.fill({ color: 0x1a1a22 });
        g.circle(sx - 8, sy + 2, 5);
        g.fill({ color: 0x2a2a30 });
        g.circle(sx + 8, sy + 2, 5);
        g.fill({ color: 0x2a2a30 });
        g.roundRect(sx - 10, sy - 8, 20, 8, 2);
        g.fill({ color: 0x3a3a48 });
        if (war > 0.25) {
          g.circle(sx + 6, sy - 10, 5);
          g.fill({ color: 0xff6020, alpha: 0.6 });
          g.circle(sx + 4, sy - 14, 3);
          g.fill({ color: 0xfff060, alpha: 0.4 });
        }
      } else if (p.kind === "phonebooth") {
        g.roundRect(sx - 8, sy - 28, 16, 30, 2);
        g.fill({ color: 0x1a2838 });
        g.roundRect(sx - 8, sy - 28, 16, 30, 2);
        g.stroke({ color: 0x40a0e0, width: 1.5, alpha: 0.7 });
        g.rect(sx - 5, sy - 24, 10, 14);
        g.fill({ color: 0x80c0e0, alpha: 0.25 });
        g.circle(sx, sy - 8, 8);
        g.fill({ color: 0x40c0ff, alpha: 0.1 });
      } else if (p.kind === "cone") {
        g.moveTo(sx, sy - 12);
        g.lineTo(sx + 6, sy + 2);
        g.lineTo(sx - 6, sy + 2);
        g.closePath();
        g.fill({ color: 0xff6020 });
        g.rect(sx - 4, sy - 5, 8, 2.5);
        g.fill({ color: 0xf0f0f0 });
      } else if (p.kind === "mailbox") {
        g.roundRect(sx - 7, sy - 16, 14, 16, 2);
        g.fill({ color: 0x2040a0 });
        g.rect(sx - 4, sy - 12, 8, 5);
        g.fill({ color: 0x0a1020, alpha: 0.6 });
      } else if (p.kind === "protection") {
        g.circle(sx, sy, 10);
        g.stroke({ color: 0xff40aa, width: 2.2, alpha: 0.6 });
        g.circle(sx, sy, 4);
        g.fill({ color: 0xff80cc, alpha: 0.55 });
        g.circle(sx, sy, 16);
        g.stroke({ color: 0xff40aa, width: 1, alpha: 0.15 });
      } else if (p.kind === "crate") {
        g.rect(sx - 10, sy - 12, 20, 18);
        g.fill({ color: 0x6a5030 });
        g.rect(sx - 10, sy - 12, 20, 18);
        g.stroke({ color: 0x0a0810, width: 1.2, alpha: 0.55 });
        g.moveTo(sx - 10, sy - 3);
        g.lineTo(sx + 10, sy - 3);
        g.stroke({ color: 0x3a2810, width: 1, alpha: 0.5 });
      } else if (p.kind === "neon") {
        const neon = war > 0.4 ? 0x804060 : 0xff40aa;
        const pulse = 0.75 + Math.sin(this.time * 4 + p.x) * 0.15;
        g.roundRect(sx - 16, sy - 24, 32, 14, 2);
        g.fill({ color: 0x0a0810, alpha: 0.9 });
        g.roundRect(sx - 14, sy - 22, 28, 10, 2);
        g.fill({ color: neon, alpha: pulse });
        g.circle(sx, sy - 17, 16);
        g.fill({ color: neon, alpha: 0.14 });
        // letter bars
        for (let i = 0; i < 3; i++) {
          g.rect(sx - 8 + i * 6, sy - 20, 3, 6);
          g.fill({ color: 0xffffff, alpha: 0.4 });
        }
      } else if (p.kind === "hydrant") {
        g.ellipse(sx, sy + 4, 6, 2.5);
        g.fill({ color: 0x000000, alpha: 0.3 });
        g.roundRect(sx - 5, sy - 14, 10, 16, 2);
        g.fill({ color: 0xe04030 });
        g.roundRect(sx - 5, sy - 14, 10, 16, 2);
        g.stroke({ color: 0x0a0810, width: 1.2, alpha: 0.6 });
        g.rect(sx - 8, sy - 8, 16, 4);
        g.fill({ color: 0xc03028 });
        g.circle(sx, sy - 16, 3);
        g.fill({ color: 0xff6050 });
        // Hint: shootable
        g.circle(sx, sy - 8, 14);
        g.stroke({ color: 0x60c0ff, width: 1, alpha: 0.12 + Math.sin(this.time * 3) * 0.06 });
      }
    }

    // Hide unused prop sprites
    for (const [id, spr] of this.propSprites) {
      if (!used.has(id)) spr.visible = false;
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
    // Hide unit sprites that weren't drawn this frame
    for (const [id, spr] of this.unitSprites) {
      if (!used.has(id)) spr.visible = false;
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
      const b =
        snap.buildings.find((x) => x.id === this.hover!.id) ??
        (snap.you.insideBuildingId === this.hover!.id ? this.getInteriorBuilding(snap) : null);
      if (!b) return;
      const indoors = !!snap.you.insideBuildingId;
      const ringCol = indoors ? 0x70d090 : 0xffcc66;
      // Ground marker: approach tile in front of door (sidewalk), not mid-façade
      const ap = indoors
        ? { x: (b.exitX ?? b.doorX) + 0.5, y: (b.exitY ?? b.doorY) + 0.5 }
        : this.doorApproachWorld(b);
      const ground = worldToScreen(ap.x, ap.y);
      // Door visual anchor (matches drawIsoBuilding door)
      const door = worldToScreen(b.doorX + 0.5, b.doorY + 0.5);
      const r = 12 + Math.sin(this.time * 5) * 2;
      // Iso diamond on the walkable tile (same language as move marker)
      g.moveTo(ground.sx, ground.sy - r * 0.55);
      g.lineTo(ground.sx + r, ground.sy);
      g.lineTo(ground.sx, ground.sy + r * 0.55);
      g.lineTo(ground.sx - r, ground.sy);
      g.closePath();
      g.stroke({ color: ringCol, width: 2.2, alpha: pulse });
      g.moveTo(ground.sx, ground.sy - r * 0.28);
      g.lineTo(ground.sx + r * 0.5, ground.sy);
      g.lineTo(ground.sx, ground.sy + r * 0.28);
      g.lineTo(ground.sx - r * 0.5, ground.sy);
      g.closePath();
      g.fill({ color: ringCol, alpha: 0.18 * pulse });
      // Stem up to the door on the façade so the ring and door read as one target
      if (!indoors) {
        g.moveTo(ground.sx, ground.sy);
        g.lineTo(door.sx, door.sy - 8);
        g.stroke({ color: ringCol, width: 1.4, alpha: 0.35 * pulse });
        g.circle(door.sx, door.sy - 8, 5);
        g.stroke({ color: ringCol, width: 1.5, alpha: 0.55 * pulse });
      }
      this.showHoverTip(
        ground.sx,
        ground.sy - 36,
        `${this.hover.label} — ${this.hover.action}`,
        ringCol,
      );
    } else if (this.hover.kind === "prop") {
      const p = snap.props.find((x) => x.id === this.hover!.id);
      if (!p) return;
      const { sx, sy } = worldToScreen(p.x, p.y);
      g.circle(sx, sy, 14 + Math.sin(this.time * 5) * 2);
      g.stroke({ color: 0xa0e080, width: 2, alpha: pulse });
      this.showHoverTip(sx, sy - 28, `${this.hover.label} — ${this.hover.action}`, 0xa0e080);
    }
  }

  /**
   * Walkable tile in front of an exterior door (where the enter ring should sit).
   * Door tiles sit on the shell edge; ring on the wall looks mid-façade.
   */
  private doorApproachWorld(b: BuildingPublic): { x: number; y: number } {
    const dx = b.doorX + 0.5;
    const dy = b.doorY + 0.5;
    const ex0 = b.ex0;
    const ey0 = b.ey0;
    const ex1 = b.ex1;
    const ey1 = b.ey1;
    if (ey1 != null && b.doorY >= ey1) return { x: dx, y: dy + 0.75 }; // south face → street south
    if (ey0 != null && b.doorY <= ey0) return { x: dx, y: dy - 0.75 }; // north
    if (ex1 != null && b.doorX >= ex1) return { x: dx + 0.75, y: dy }; // east
    if (ex0 != null && b.doorX <= ex0) return { x: dx - 0.75, y: dy }; // west
    return { x: dx, y: dy + 0.6 };
  }

  /**
   * True when a unit is visually behind an outdoor building mass (iso occlusion).
   * Used to switch full sprite → silhouette outline.
   */
  private unitOccludedByBuilding(ux: number, uy: number, snap: WorldSnapshot): boolean {
    if (snap.you.insideBuildingId) return false;
    const unitDepth = ux + uy;
    const up = worldToScreen(ux, uy);
    for (const b of snap.buildings) {
      if (b.ex0 == null || b.ey0 == null || b.ex1 == null || b.ey1 == null) continue;
      // Skip tiny / mission-only without exterior
      const x0 = b.ex0;
      const y0 = b.ey0;
      const x1 = b.ex1 + 1;
      const y1 = b.ey1 + 1;
      // Must be near the footprint (including north/west “behind” band)
      if (ux < x0 - 2.5 || ux > x1 + 1.5 || uy < y0 - 2.5 || uy > y1 + 1.5) continue;
      // In front of SE corner → not occluded
      const frontDepth = x1 + y1;
      const backDepth = x0 + y0;
      if (unitDepth >= frontDepth - 1.2) continue;
      // Only occlude when unit is more “behind” than the building mid-depth
      if (unitDepth > (backDepth + frontDepth) * 0.52) continue;

      const h = Math.max(2, b.stories ?? 2) * FLOOR_PX + 10;
      const c00 = worldToScreen(x0, y0);
      const c10 = worldToScreen(x1, y0);
      const c01 = worldToScreen(x0, y1);
      const c11 = worldToScreen(x1, y1);
      const minSx = Math.min(c00.sx, c10.sx, c01.sx, c11.sx) - 8;
      const maxSx = Math.max(c00.sx, c10.sx, c01.sx, c11.sx) + 8;
      const minSy = Math.min(c00.sy, c10.sy, c01.sy, c11.sy) - h - 12;
      const maxSy = Math.max(c00.sy, c10.sy, c01.sy, c11.sy) + 16;
      // Body from feet up ~40px
      if (up.sx >= minSx && up.sx <= maxSx && up.sy >= minSy && up.sy - 36 <= maxSy) {
        return true;
      }
    }
    return false;
  }

  /** Flat silhouette when unit is behind a building (readable through façades). */
  private drawUnitSilhouette(
    g: Graphics,
    sx: number,
    baseSy: number,
    color: number,
    bulk: number,
    female: boolean,
  ): void {
    const bw = 12 + bulk * 1.5;
    const bh = 18 + bulk;
    const col = color;
    // Soft ground contact
    g.ellipse(sx, baseSy + 5, 9, 3.5);
    g.fill({ color: col, alpha: 0.2 });
    // Legs
    g.rect(sx - 5, baseSy - 2, 3.5, 8);
    g.fill({ color: col, alpha: 0.85 });
    g.rect(sx + 1.5, baseSy - 2, 3.5, 8);
    g.fill({ color: col, alpha: 0.85 });
    // Torso
    g.roundRect(sx - bw / 2, baseSy - bh - 2, bw, bh, 3);
    g.fill({ color: col, alpha: 0.9 });
    // Head
    const hr = female ? 4.2 : 4.6;
    g.circle(sx, baseSy - bh - 6, hr);
    g.fill({ color: col, alpha: 0.92 });
    // Bright outline so it pops through dark façades
    g.roundRect(sx - bw / 2 - 1, baseSy - bh - 3, bw + 2, bh + 2, 3.5);
    g.stroke({ color: 0xffffff, width: 1.4, alpha: 0.55 });
    g.circle(sx, baseSy - bh - 6, hr + 1.2);
    g.stroke({ color: 0xffffff, width: 1.3, alpha: 0.5 });
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
    const posse = snap.posses.find((p) => p.id === u.posseId);
    const color = posse?.color ?? 0xaaaaaa;
    const mine = u.posseId === snap.you.posseId;
    const bulk = armorBulk(u.armor);
    const threat = threatPips(u);
    const isNpc = u.kind === "npc";
    const female = u.gender === "female";
    const isDancer = u.npcRole === "dancer" || !!u.dancerKey;

    // Directional walk cycle (screen flip + two-beat bob; keep feet planted)
    const speedNorm = moveSpeedTilesPerSec(u.stats?.speed ?? 5) / moveSpeedTilesPerSec(5);
    const walk = walkCycle(vis.phase, vis.moving && !isDancer, speedNorm);
    const bob = walk.bobY;
    const sway = walk.swayX;
    const flip = facingFlip(vis.facing);
    const lean = facingLean(vis.facing, vis.moving && !isDancer) + (isDancer ? 0 : walk.rock);
    const { sx, sy: baseSy } = worldToScreen(vis.x, vis.y);
    const sy = baseSy + bob;

    // Soft contact shadow (wet ground) — squash on foot plant
    g.ellipse(
      sx + sway * 0.15,
      baseSy + 6,
      (11 + bulk) * walk.shadowW,
      4.2 * walk.shadowH,
    );
    g.fill({ color: 0x000000, alpha: 0.48 + (1 - walk.shadowH) * 0.12 });

    if (!u.alive) {
      // Hide sprite if any
      const deadSpr = this.unitSprites.get(u.id);
      if (deadSpr) deadSpr.visible = false;
      g.ellipse(sx, baseSy + 4, 14, 7);
      g.fill({ color: 0x4a2020, alpha: 0.88 });
      g.ellipse(sx - 4, baseSy + 2, 3.5, 1.8);
      g.fill({ color: 0x6a1820, alpha: 0.65 });
      g.rect(sx - 8, baseSy - 2, 16, 4);
      g.fill({ color: shade(color, 0.5), alpha: 0.5 });
      return;
    }

    // Behind a building: silhouette outline only (full art would draw through façades)
    const occluded = this.unitOccludedByBuilding(vis.x, vis.y, snap);
    if (occluded) {
      const hideSpr = this.unitSprites.get(u.id);
      if (hideSpr) hideSpr.visible = false;
      const silCol = mine
        ? 0xffe080
        : isNpc
          ? 0x60d0ff
          : posse?.hostile
            ? 0xff6060
            : 0xc0c0d0;
      this.drawUnitSilhouette(g, sx, baseSy, silCol, bulk, female);
      // Name only — keep readable through walls
      let lab = this.labelPool.get(u.id);
      if (!lab) {
        lab = new Text({
          text: u.name,
          style: {
            fontSize: 11,
            fill: silCol,
            fontWeight: "700",
            fontFamily: "system-ui,sans-serif",
          },
        });
        this.labelPool.set(u.id, lab);
        this.labels.addChild(lab);
      }
      lab.visible = true;
      lab.text = u.name;
      lab.style.fill = silCol;
      lab.x = sx - lab.width / 2;
      lab.y = baseSy - 36;
      used.add(u.id);
      return;
    }

    // Team / threat rings under feet (aligned with contact shadow)
    if (isNpc && !mine && !isDancer) {
      g.circle(sx, baseSy + 5, 13);
      g.stroke({ color: 0x60e0ff, width: 1.2, alpha: 0.35 + Math.sin(this.time * 3 + u.x) * 0.1 });
    }
    if (isDancer) {
      // Pink stage glow under dancers
      const glow = 0.25 + Math.sin(this.time * 3 + u.x * 2) * 0.1;
      g.ellipse(sx, baseSy + 6, 15, 5);
      g.fill({ color: 0xff40aa, alpha: glow });
      g.circle(sx, baseSy + 5, 14);
      g.stroke({ color: 0xff60c0, width: 1.2, alpha: 0.45 + glow });
    }
    if (!mine && !isNpc && (posse?.hostile || threat >= 2)) {
      g.circle(sx, baseSy + 5, 14);
      g.stroke({ color: 0xff4060, width: 1.4, alpha: 0.4 });
    }
    if (mine) {
      g.ellipse(sx, baseSy + 6, 12, 4.5);
      g.stroke({ color: 0xffe080, width: 1.2, alpha: 0.35 });
    }

    // Weapon range ring — selected unit when fighting or outdoors in war zone
    if (
      mine &&
      u.id === snap.you.selectedUnitId &&
      u.alive &&
      !isNpc
    ) {
      const inCombat =
        !!posse?.hostile ||
        snap.you.action === "ENGAGING" ||
        snap.you.action === "ASSASSINATE" ||
        (snap.mission?.instanced ?? false);
      const warOutdoor =
        !snap.you.insideBuildingId &&
        !isSafeWorldPos(u.x, u.y, snap.you.insideBuildingId);
      if (inCombat || warOutdoor) {
        this.drawWeaponRangeRing(g, vis.x, vis.y, u.weapon, inCombat);
      }
    }

    // ——— Painted combat-scene sprite when available ———
    const tex = unitTexture({
      id: u.id,
      name: u.name,
      female,
      isNpc,
      npcRole: u.npcRole,
      dancerKey: u.dancerKey,
      revealStage: u.revealStage,
    });
    let bh = 28 + bulk; // label offset height (sprite or procedural)

    if (tex && spritesReady()) {
      let spr = this.unitSprites.get(u.id);
      if (!spr) {
        spr = new Sprite(tex);
        // Anchor near bottom of art so feet meet the tile (was 0.92 → floated)
        spr.anchor.set(0.5, 0.98);
        this.unitSprites.set(u.id, spr);
        this.unitSpriteLayer.addChild(spr);
      }
      if (spr.texture !== tex) spr.texture = tex;
      spr.anchor.set(0.5, 0.98);
      const targetH = isDancer ? DANCER_SPRITE_H : UNIT_SPRITE_H;
      const scale = targetH / Math.max(1, tex.height);
      // Dancers: slight idle sway / hip roll (keep feet planted — no walk bob)
      const danceSway = isDancer ? Math.sin(this.time * 2.8 + u.x) * 2.2 : 0;
      const sxMul = isDancer ? 1 : walk.scaleX;
      const syMul = isDancer ? 1 : walk.scaleY;
      spr.scale.set(flip * scale * sxMul, scale * syMul);
      spr.rotation = isDancer ? Math.sin(this.time * 2.8 + u.x) * 0.04 : lean * flip;
      spr.x = sx + (isDancer ? danceSway : sway);
      // Plant feet on the iso ground point (shadow sits just under)
      // Mild bob on body only — full bob floats sprites off the street
      spr.y = baseSy + 7 + (isDancer ? 0 : bob * 0.45);
      spr.visible = true;
      // Team tint: posse color wash (keep readable) × day/district atmosphere
      const lightTint = this.look.entityTint;
      if (mine) spr.tint = mulTint(0xffffff, lightTint);
      else if (isDancer) spr.tint = mulTint(0xffffff, lightTint);
      else if (isNpc) spr.tint = mulTint(0xe8f4ff, lightTint);
      else if (posse?.hostile) spr.tint = mulTint(0xffd0d0, lightTint);
      else spr.tint = mulTint(0xffffff, lightTint);
      bh = targetH * 0.85;
      used.add(u.id);
    } else {
      // Hide any stale sprite
      const old = this.unitSprites.get(u.id);
      if (old) old.visible = false;

      // ——— Procedural detailed goon (fallback) — 8-dir lean + leg stride ———
      const bodyLean = lean * 10 * flip; // screen-px torso shift
      const headOff = flip * 1.8 + bodyLean * 0.3;
      const legL = walk.legL;
      const legR = walk.legR;
      // Boots (facing: lead foot slightly forward in screen X)
      g.roundRect(sx - 6.5 + sway * 0.2 + flip * 0.5, baseSy + 4 + legL, 5, 4, 1);
      g.fill({ color: 0x1a1a22 });
      g.roundRect(sx + 1.5 + sway * 0.2 + flip * 0.5, baseSy + 4 + legR, 5, 4, 1);
      g.fill({ color: 0x1a1a22 });
      // Legs
      g.rect(sx - 5.5 + sway * 0.2 + flip * 0.4, baseSy - 2 + legL, 4.5, 9);
      g.fill({ color: 0x0a0810 });
      g.rect(sx - 5 + sway * 0.2 + flip * 0.4, baseSy - 2 + legL, 3.5, 8);
      g.fill({ color: 0x2a2a38 });
      g.rect(sx + 1.5 + sway * 0.2 + flip * 0.4, baseSy - 2 + legR, 4.5, 9);
      g.fill({ color: 0x0a0810 });
      g.rect(sx + 2 + sway * 0.2 + flip * 0.4, baseSy - 2 + legR, 3.5, 8);
      g.fill({ color: 0x2a2a38 });

      const bw = 14 + bulk * 2;
      bh = 20 + bulk;
      const bodyColor =
        u.armor === "plate"
          ? 0x5a6a78
          : u.armor === "kevlar"
            ? 0x3a4a42
            : u.armor === "leather"
              ? 0x4a3038
              : female
                ? lerpColor(shade(color, 0.9), 0xc04080, 0.25)
                : shade(color, 0.9);

      const bx = sway + bodyLean;
      // Torso outline + fill
      g.roundRect(sx - bw / 2 - 1.5 + bx, sy - bh - 4, bw + 3, bh + 3, 3);
      g.fill({ color: 0x0a0810 });
      g.roundRect(sx - bw / 2 + bx, sy - bh - 3, bw, bh, 3);
      g.fill({ color: bodyColor });
      // Jacket open / shirt
      g.rect(sx - 2 + bx, sy - bh + 2, 4, bh - 6);
      g.fill({ color: female ? 0xc03040 : 0xe8e8e8, alpha: 0.35 });
      g.rect(sx - bw / 2 + 2 + bx, sy - bh + 1, bw - 4, 3);
      g.fill({ color: 0xffffff, alpha: 0.1 });

      if (mine) {
        g.roundRect(sx - bw / 2 + bx, sy - bh - 3, bw, bh, 3);
        g.stroke({ color: 0xffe080, width: 1.4, alpha: 0.9 });
      }
      if (isNpc) {
        g.roundRect(sx - bw / 2 + bx, sy - bh - 3, bw, bh, 3);
        g.stroke({ color: 0x70e0ff, width: 1.1, alpha: 0.65 });
      }
      // Bandana
      if (!mine && !isNpc) {
        g.rect(sx - 6 + bx * 0.5 + headOff * 0.3, sy - bh - 10, 12, 3.5);
        g.fill({ color: shade(color, 1.15) });
      }
      if (posse?.hostile && !mine) {
        g.circle(sx + bw / 2 + 3 + bx, sy - bh - 6, 4);
        g.fill({ color: 0xff3040 });
      }
      if (bulk >= 2) {
        g.rect(sx - bw / 2 + 2 + bx, sy - bh + 4, bw - 4, 2.5);
        g.fill({ color: 0x9aafc0, alpha: 0.5 });
      }

      // Arms — weapon-side arm slightly forward along facing
      g.roundRect(sx - bw / 2 - 3 + bx, sy - bh + 4, 4, 10, 1);
      g.fill({ color: bodyColor });
      g.roundRect(sx + bw / 2 - 1 + bx, sy - bh + 4, 4, 10, 1);
      g.fill({ color: bodyColor });

      // Head (offset toward face direction)
      const hx = sx + bx * 0.5 + headOff;
      g.circle(hx, sy - bh - 6, 6.2);
      g.fill({ color: 0x0a0810 });
      g.circle(hx, sy - bh - 6, 5.4);
      g.fill({ color: isNpc ? 0xd0b090 : female ? 0xf0c8a8 : 0xe8c8a0 });
      // Eyes biased toward facing
      g.circle(hx - 1.5 + flip * 0.6, sy - bh - 7, 1.1);
      g.fill({ color: 0x1a1a1a });
      g.circle(hx + 2 + flip * 0.6, sy - bh - 7, 1.1);
      g.fill({ color: 0x1a1a1a });
      // Hair
      g.ellipse(hx, sy - bh - 10, 5, 2.5);
      g.fill({ color: female ? 0x1a1018 : 0x2a2018 });

      this.drawWeapon(g, sx + bx + flip * 2, sy - bh / 2 - 2, u.weapon, mine, vis.facing);
      used.add(u.id);
    }

    // Threat pips / HP / labels (shared)
    if (threat > 0 && !isNpc) {
      for (let i = 0; i < threat; i++) {
        g.rect(sx - threat * 3 + i * 6, sy - bh - 14, 4, 3);
        g.fill({ color: i < 3 ? 0x60c080 : 0xffcc33 });
      }
    }

    if (u.health < u.maxHealth || posse?.hostile) {
      g.rect(sx - 14, sy - bh - 18, 28, 3.5);
      g.fill({ color: 0x1a1a1a });
      g.rect(sx - 14, sy - bh - 18, 28 * Math.max(0, u.health / u.maxHealth), 3.5);
      g.fill({ color: mine ? 0x60c080 : 0xe04040 });
    }

    // Indoors: hide own-posse name tags — small rooms get unreadable with 4 labels
    const hideOwnNameIndoors = mine && !!snap.you.insideBuildingId;
    const name = u.name.split(" ")[0] ?? u.name;
    let lab = this.labelPool.get(u.id);
    if (!lab) {
      lab = new Text({
        text: name,
        style: {
          fontSize: 11,
          fill: 0xffffff,
          fontWeight: "700",
          fontFamily: "system-ui,sans-serif",
          stroke: { color: 0x000000, width: 3 },
        },
      });
      this.labelPool.set(u.id, lab);
      this.labels.addChild(lab);
    }
    if (hideOwnNameIndoors) {
      lab.visible = false;
    } else {
      lab.visible = true;
      if (lab.text !== name) lab.text = name;
      lab.style.fill = mine ? 0xffe080 : isNpc ? 0x90d8ff : threat >= 3 ? 0xffa0a0 : 0xe8e8e8;
      lab.x = sx - lab.width / 2;
      lab.y = sy - bh - 32;
      used.add(u.id);
    }

    // AI combat role badge (RUSH / HOLD / FLEE) when hostile
    if (!mine && !isNpc && u.aiRole && (posse?.hostile || threat >= 1)) {
      const rid = u.id + ":role";
      const rtxt = aiRoleLabel(u.aiRole);
      let rl = this.labelPool.get(rid);
      if (!rl) {
        rl = new Text({
          text: rtxt,
          style: {
            fontSize: 9,
            fill: 0xff8060,
            fontWeight: "800",
            fontFamily: "system-ui,sans-serif",
            stroke: { color: 0x1a0808, width: 3 },
          },
        });
        this.labelPool.set(rid, rl);
        this.labels.addChild(rl);
      }
      rl.visible = true;
      if (rl.text !== rtxt) rl.text = rtxt;
      rl.style.fill =
        u.aiRole === "rusher" ? 0xff6040 : u.aiRole === "coward" ? 0xffcc66 : 0xffa090;
      rl.x = sx - rl.width / 2;
      rl.y = sy - bh - 44;
      used.add(rid);
    }

    if (!mine && !isNpc && (threat >= 2 || u.armor !== "none" || u.aiRole)) {
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
      gl.y = sy - bh - 20;
      used.add(gid);
    }

    if (mine && u.id === snap.you.selectedUnitId) {
      g.moveTo(sx, sy - bh - 38);
      g.lineTo(sx - 5, sy - bh - 31);
      g.lineTo(sx + 5, sy - bh - 31);
      g.closePath();
      g.fill({ color: 0xffcc33 });
    }
  }

  /** Iso-approx range circle so players can read engage distance. */
  private drawWeaponRangeRing(
    g: Graphics,
    wx: number,
    wy: number,
    weapon: WeaponId,
    hot: boolean,
  ): void {
    const range = WEAPONS[weapon]?.range ?? 4;
    // Approximate isometric ellipse from world-radius samples
    const steps = 28;
    const pts: Array<{ sx: number; sy: number }> = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const p = worldToScreen(wx + Math.cos(a) * range, wy + Math.sin(a) * range);
      pts.push(p);
    }
    if (pts.length < 2) return;
    g.moveTo(pts[0]!.sx, pts[0]!.sy);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i]!.sx, pts[i]!.sy);
    }
    g.closePath();
    const col =
      weapon === "shotgun" || weapon === "pipe" || weapon === "switchblade"
        ? 0xff8060
        : weapon === "minigun" || weapon === "tommy"
          ? 0xffc040
          : 0x80d0ff;
    g.stroke({
      color: col,
      width: hot ? 1.6 : 1.1,
      alpha: hot ? 0.42 + Math.sin(this.time * 5) * 0.08 : 0.22,
    });
  }

  private drawWeapon(
    g: Graphics,
    sx: number,
    sy: number,
    weapon: string,
    mine: boolean,
    facing: number,
  ): void {
    // Aim along iso screen direction of facing (not just L/R)
    const flip = facingFlip(facing);
    const { dx, dy } = facingToDir(facing);
    const scrX = (dx - dy) * 0.55;
    const scrY = (dx + dy) * 0.28;
    const len =
      weapon === "minigun"
        ? 18
        : weapon === "shotgun" || weapon === "tommy"
          ? 15
          : weapon === "flamethrower" || weapon === "uzi"
            ? 13
            : weapon === "pipe" || weapon === "switchblade"
              ? 11
              : 9;
    const col = mine ? 0xe8e0d0 : 0xb0b0b0;
    const dark = 0x3a3a42;
    const ox = sx + flip * 5;
    const oy = sy;
    const x1 = ox + scrX * len;
    const y1 = oy + scrY * len;
    const thick =
      weapon === "minigun" ? 4 : weapon === "shotgun" || weapon === "tommy" ? 2.5 : 2;

    if (weapon === "pipe" || weapon === "switchblade") {
      g.moveTo(ox, oy);
      g.lineTo(x1, y1);
      g.stroke({ color: col, width: 2.2 });
    } else if (weapon === "pistol") {
      g.moveTo(ox, oy);
      g.lineTo(x1, y1);
      g.stroke({ color: dark, width: 3 });
    } else if (weapon === "uzi" || weapon === "tommy") {
      g.moveTo(ox, oy);
      g.lineTo(x1, y1);
      g.stroke({ color: dark, width: thick });
      if (weapon === "tommy") {
        g.circle(ox + scrX * 6, oy + scrY * 6 + 3, 2.5);
        g.fill({ color: 0x4a4a4a });
      }
    } else if (weapon === "minigun") {
      g.moveTo(ox, oy);
      g.lineTo(x1, y1);
      g.stroke({ color: dark, width: 5 });
      g.circle(x1, y1, 3.5);
      g.fill({ color: 0x5a5a62 });
      g.circle(ox + scrX * 4, oy + scrY * 4 + 3, 2);
      g.fill({ color: 0x3a3a42 });
    } else if (weapon === "shotgun") {
      g.moveTo(ox, oy);
      g.lineTo(x1, y1);
      g.stroke({ color: col, width: 2.4 });
    } else if (weapon === "flamethrower") {
      g.moveTo(ox, oy);
      g.lineTo(x1, y1);
      g.stroke({ color: dark, width: 3 });
      g.circle(x1, y1 - 1, 3);
      g.fill({ color: 0xff6020, alpha: 0.8 });
    } else {
      g.moveTo(ox, oy);
      g.lineTo(x1, y1);
      g.stroke({ color: dark, width: 2.5 });
    }
  }

  private tickFx(dt: number): void {
    const g = this.fxGfx;
    g.clear();
    // Hide unused floating damage labels
    for (const lab of this.dmgLabels) lab.visible = false;
    let dmgIdx = 0;

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3.5);

    if (this.fx.length === 0) return;

    const next: FxParticle[] = [];
    for (const f of this.fx) {
      f.life -= dt;
      if (f.life <= 0) continue;

      // Motion
      if (
        f.kind === "blood" ||
        f.kind === "spark" ||
        f.kind === "shell" ||
        f.kind === "flame" ||
        f.kind === "hydrantSpray"
      ) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.kind === "blood" || f.kind === "shell") f.vy += 3.5 * dt;
        if (f.kind === "hydrantSpray") {
          f.vy += 2.2 * dt; // arc down
          f.vx *= 0.98;
        }
        if (f.kind === "flame") {
          f.vx *= 0.9;
          f.vy *= 0.9;
          f.r *= 0.97;
        }
      }
      if (f.kind === "dmgText") {
        f.y -= 0.9 * dt; // float up in world space
      }

      next.push(f);
      const t = Math.max(0, f.life / f.max);
      const a = Math.min(1, t * 1.6);

      if (f.kind === "muzzle") {
        const p = worldToScreen(f.x, f.y);
        const r = (f.big ? 18 : 12) * (0.55 + t * 0.6);
        g.circle(p.sx, p.sy - 12, r);
        g.fill({ color: 0xfff0a0, alpha: a * 0.95 });
        g.circle(p.sx, p.sy - 12, r * 0.4);
        g.fill({ color: 0xffffff, alpha: a });
        const cos = Math.cos(f.ang);
        const sin = Math.sin(f.ang);
        const tip = worldToScreen(f.x + cos * 0.7, f.y + sin * 0.7);
        g.moveTo(p.sx, p.sy - 12);
        g.lineTo(tip.sx + sin * 10, tip.sy - 12 - cos * 4);
        g.lineTo(tip.sx - sin * 10, tip.sy - 12 + cos * 4);
        g.closePath();
        g.fill({ color: 0xff9020, alpha: a * 0.75 });
      } else if (f.kind === "tracer") {
        const a0 = worldToScreen(f.x0, f.y0);
        const a1 = worldToScreen(f.x1, f.y1);
        const yOff = -14;
        // Full path glow (very readable)
        g.moveTo(a0.sx, a0.sy + yOff);
        g.lineTo(a1.sx, a1.sy + yOff);
        g.stroke({ color: f.color, width: f.wide ? 4 : 2.5, alpha: a * 0.85 });
        g.moveTo(a0.sx, a0.sy + yOff);
        g.lineTo(a1.sx, a1.sy + yOff);
        g.stroke({ color: 0xffffff, width: f.wide ? 1.5 : 1, alpha: a * 0.7 });
        // Traveling bolt head
        const head = 1 - t;
        const hx = a0.sx + (a1.sx - a0.sx) * head;
        const hy = a0.sy + yOff + (a1.sy - a0.sy) * head;
        g.circle(hx, hy, f.wide ? 5 : 3.5);
        g.fill({ color: 0xffffff, alpha: a });
        g.circle(hx, hy, f.wide ? 8 : 6);
        g.fill({ color: f.color, alpha: a * 0.45 });
      } else if (f.kind === "slash") {
        const a0 = worldToScreen(f.x0, f.y0);
        const a1 = worldToScreen(f.x1, f.y1);
        g.moveTo(a0.sx, a0.sy - 10);
        g.lineTo(a1.sx, a1.sy - 16);
        g.stroke({ color: 0xffffff, width: 4, alpha: a });
        g.moveTo(a0.sx + 3, a0.sy - 6);
        g.lineTo(a1.sx + 3, a1.sy - 12);
        g.stroke({ color: 0x80c0ff, width: 2, alpha: a * 0.7 });
      } else if (f.kind === "blood") {
        const p = worldToScreen(f.x, f.y);
        g.circle(p.sx, p.sy - 6, f.r * (0.7 + t * 0.5));
        g.fill({ color: 0xb01818, alpha: a * 0.9 });
      } else if (f.kind === "spark") {
        const p = worldToScreen(f.x, f.y);
        g.circle(p.sx, p.sy - 8, 3.2);
        g.fill({ color: 0xffe080, alpha: a });
        g.circle(p.sx + f.vx * 2, p.sy - 8 + f.vy * 2, 1.6);
        g.fill({ color: 0xffffff, alpha: a * 0.8 });
      } else if (f.kind === "hydrantSpray") {
        const p = worldToScreen(f.x, f.y);
        g.circle(p.sx, p.sy - 4, f.r * (0.6 + t * 0.6));
        g.fill({ color: 0x60c0ff, alpha: a * 0.75 });
        g.circle(p.sx + 1, p.sy - 5, f.r * 0.35);
        g.fill({ color: 0xd0f0ff, alpha: a * 0.55 });
      } else if (f.kind === "flame") {
        const p = worldToScreen(f.x, f.y);
        const col = t > 0.6 ? 0xfff0a0 : t > 0.3 ? 0xff8020 : 0xc02010;
        g.circle(p.sx, p.sy - 8, f.r * (0.75 + t * 0.55));
        g.fill({ color: col, alpha: a * 0.8 });
      } else if (f.kind === "impact") {
        const p = worldToScreen(f.x, f.y);
        const r = (f.crit ? 28 : 16) * (1.05 - t * 0.35);
        g.circle(p.sx, p.sy - 10, r);
        g.stroke({ color: f.crit ? 0xffe060 : 0xff5050, width: 2.5, alpha: a * 0.9 });
        g.circle(p.sx, p.sy - 10, r * 0.45);
        g.fill({ color: f.crit ? 0xfff0a0 : 0xff3030, alpha: a * 0.4 });
      } else if (f.kind === "shell") {
        const p = worldToScreen(f.x, f.y);
        g.rect(p.sx - 2, p.sy - 10, 4, 2.5);
        g.fill({ color: 0xe0b040, alpha: a });
      } else if (f.kind === "dmgText") {
        const p = worldToScreen(f.x, f.y);
        let lab = this.dmgLabels[dmgIdx];
        if (!lab) {
          lab = new Text({
            text: f.text,
            style: {
              fontSize: f.crit ? 16 : 13,
              fill: f.crit ? 0xffe060 : f.text === "miss" ? 0xa0a8b8 : 0xff6060,
              fontWeight: "800",
              fontFamily: "system-ui,sans-serif",
              stroke: { color: 0x000000, width: 3 },
            },
          });
          this.dmgLabels.push(lab);
          this.labels.addChild(lab);
        }
        lab.visible = true;
        lab.text = f.text;
        lab.style.fontSize = f.crit || f.text === "DOWN" ? 16 : 13;
        lab.style.fill =
          f.crit || f.text === "DOWN" ? 0xffe060 : f.text === "miss" ? 0xa0a8b8 : 0xff7070;
        lab.alpha = a;
        lab.x = p.sx - lab.width / 2;
        lab.y = p.sy - 40 - (1 - t) * 18;
        dmgIdx++;
      }
    }
    this.fx = next;
  }

  private updateCamera(dt: number): void {
    const snap = this.lastSnap;
    const insideB = snap ? this.getInteriorBuilding(snap) : null;
    const bounds = insideB ? this.interiorBounds(insideB) : null;
    const indoors = !!(insideB && bounds);

    // Enter / leave interior: suggest a room fit once, restore outdoor zoom on exit.
    // Do NOT re-lock every frame — player can scroll-zoom indoors like outdoors.
    if (indoors && !this.wasInside) {
      this.outdoorZoomTarget = this.zoomTarget;
      this.interiorZoomLocked = true;
      const bw = bounds!.x1 - bounds!.x0 + 3;
      const bh = bounds!.y1 - bounds!.y0 + 3;
      // Iso footprint roughly scales with (w+h)
      const span = Math.max(bw, bh) + Math.min(bw, bh) * 0.5;
      const fit = Math.min(MAX_INTERIOR_ZOOM, Math.max(1.1, 14 / Math.max(6, span)));
      this.zoomTarget = Math.min(MAX_INTERIOR_ZOOM, Math.max(MIN_ZOOM, fit));
      this.mapRedrawPending = true;
    } else if (!indoors && this.wasInside) {
      this.interiorZoomLocked = false;
      this.zoomTarget = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.outdoorZoomTarget));
      this.mapRedrawPending = true;
    }
    this.wasInside = indoors;

    // Indoors: soft-frame room center (player can still pan via follow blend)
    if (indoors && bounds) {
      const rcx = (bounds.x0 + bounds.x1 + 1) / 2;
      const rcy = (bounds.y0 + bounds.y1 + 1) / 2;
      this.followX = rcx * 0.72 + this.followX * 0.28;
      this.followY = rcy * 0.72 + this.followY * 0.28;
      // One-shot auto-fit only until the player zooms themselves
      if (this.interiorZoomLocked) {
        const bw = bounds.x1 - bounds.x0 + 3;
        const bh = bounds.y1 - bounds.y0 + 3;
        const span = Math.max(bw, bh) + Math.min(bw, bh) * 0.5;
        const fit = Math.min(MAX_INTERIOR_ZOOM, Math.max(1.1, 14 / Math.max(6, span)));
        this.zoomTarget = Math.min(MAX_INTERIOR_ZOOM, Math.max(MIN_ZOOM, fit));
        // Release after first settle so further frames don't fight the user
        if (Math.abs(this.zoom - this.zoomTarget) < 0.02) {
          this.interiorZoomLocked = false;
        }
      }
    }

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

    // Screen shake from nearby gunfire / hits
    const sh = this.shake;
    const ox = sh > 0 ? (Math.random() - 0.5) * sh * 10 : 0;
    const oy = sh > 0 ? (Math.random() - 0.5) * sh * 10 : 0;
    this.root.scale.set(this.zoom);
    this.root.x = -this.camX * this.zoom + ox;
    this.root.y = -this.camY * this.zoom + oy;

    // Larger cells = fewer full map rebuilds while moving (was /4 and stuttered south)
    const cellX = Math.floor(this.followX / 8);
    const cellY = Math.floor(this.followY / 8);
    // Coarser zoom buckets — avoid rebuild thrash mid-pinch that flashes seams
    const zCell = Math.round(this.zoom * 4);
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
      // Prefer taller dancer sprites (easier to click on stage)
      const r = u.npcRole === "dancer" || u.dancerKey ? Math.max(radius, 2.1) : radius;
      const d = Math.hypot(v.x - w.x, v.y - w.y);
      if (d < r && d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best?.id ?? null;
  }

  pickBuilding(clientX: number, clientY: number): BuildingPublic | null {
    const snap = this.lastSnap;
    if (!snap) return null;
    const w = this.screenToWorld(clientX, clientY);

    // Indoors: click near EXIT door (generous — own-crew picks used to steal the click)
    if (snap.you.insideBuildingId) {
      const b = this.getInteriorBuilding(snap);
      if (b?.exitX != null && b.exitY != null) {
        const d = Math.hypot(b.exitX + 0.5 - w.x, b.exitY + 0.5 - w.y);
        if (d < 2.15) return b;
      }
      return null;
    }

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
      const indoors = !!snap.you.insideBuildingId;
      this.hover = {
        kind: "building",
        id: b.id,
        label: indoors ? "Exit" : b.name,
        action: indoors ? "Leave" : "Enter",
      };
      return "pointer";
    }

    const p = this.pickProp(clientX, clientY);
    if (p) {
      const label = p.label ?? p.kind;
      const base = propHustleAction(p.kind);
      const action =
        p.readyIn != null && p.readyIn > 0 ? `Wait ~${p.readyIn}s` : base;
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
