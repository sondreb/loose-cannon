import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { LightingLook, WorldSnapshot } from "@loose-cannon/shared";
import { worldToScreen } from "./iso";
import { buildingAccent, buildingHeight } from "./architecture";

/** Sparse deterministic placement, shared between visible lamp geometry and light pools. */
export function isStreetLamp(x: number, y: number, type: string): boolean {
  return type === "sidewalk" && ((x * 73 + y * 149) >>> 0) % 61 === 7;
}

export function drawStreetLamp(g: Graphics, x: number, y: number): void {
  const { sx, sy } = worldToScreen(x + 0.5, y + 0.5);
  g.ellipse(sx + 3, sy + 3, 7, 3).fill({ color: 0x050b14, alpha: .55 });
  g.roundRect(sx - 3, sy - 7, 6, 10, 2).fill(0x333d46);
  g.moveTo(sx, sy).lineTo(sx, sy - 65).quadraticCurveTo(sx, sy - 77, sx + 14, sy - 77).stroke({ color: 0x222c37, width: 4 });
  g.moveTo(sx + 1, sy - 8).lineTo(sx + 1, sy - 64).stroke({ color: 0x869097, width: 1, alpha: .7 });
  g.roundRect(sx + 8, sy - 81, 15, 6, 2).fill(0x3f4b56);
  g.ellipse(sx + 16, sy - 75, 6, 2).fill(0xffdf9b);
}

/** One generated radial texture, reused by a capped pool. These are code-native lights, not artwork. */
export class StreetLighting {
  readonly ground = new Container();
  readonly air = new Container();
  private texture: Texture;
  private pools: Sprite[] = [];
  private haze: Sprite[] = [];
  private used = 0;
  private airUsed = 0;
  private floorSource: WorldSnapshot["floors"];
  private lamps: { x: number; y: number }[] = [];
  private flashes: { x: number; y: number; until: number; heavy: boolean }[] = [];
  flash(x: number, y: number, time: number, heavy: boolean): void {
    if (this.flashes.length >= 20) this.flashes.shift();
    this.flashes.push({ x, y, until: time + .12, heavy });
  }
  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(.15, "rgba(255,255,255,0.58)");
    gradient.addColorStop(.45, "rgba(255,255,255,0.20)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    this.texture = Texture.from(canvas);
    this.ground.eventMode = this.air.eventMode = "none";
  }
  private glow(x: number, y: number, w: number, h: number, color: number, alpha: number, air = false): void {
    const pool = air ? this.haze : this.pools;
    const idx = air ? this.airUsed++ : this.used++;
    if (idx >= 96) return;
    let sprite = pool[idx];
    if (!sprite) {
      sprite = new Sprite(this.texture);
      sprite.anchor.set(.5);
      sprite.blendMode = "add";
      (air ? this.air : this.ground).addChild(sprite);
      pool.push(sprite);
    }
    sprite.visible = true;
    sprite.position.set(x, y);
    sprite.width = w;
    sprite.height = h;
    sprite.tint = color;
    sprite.alpha = alpha;
  }
  update(snap: WorldSnapshot, look: LightingLook, time: number, center: { x: number; y: number }, floors: WorldSnapshot["floors"]): void {
    this.used = this.airUsed = 0;
    if (floors !== this.floorSource) {
      this.floorSource = floors;
      this.lamps = (floors ?? []).filter(f => isStreetLamp(f.x, f.y, f.type));
    }
    const near = (x: number, y: number) => Math.abs(x - center.x) < 26 && Math.abs(y - center.y) < 26;
    const intensity = .35 + look.neon * .65;
    if (!snap.you.insideBuildingId) {
      for (const b of snap.buildings) {
        if (b.ex0 == null || !near(b.doorX, b.doorY)) continue;
        const p = worldToScreen(b.doorX + .5, b.doorY + .5), color = buildingAccent(b);
        this.glow(p.sx, p.sy + 9, 170, 80, color, .35 * intensity);
        this.glow(p.sx, p.sy - 45, 130, 100, color, .12 * intensity, true);
        if (look.wet > .2) {
          this.glow(p.sx + 20, p.sy + 54, 64, 170, color, .26 * look.wet * intensity);
        }
        // Steam rising from rooftop vents, slow drifting translucent plumes.
        const vent = worldToScreen(b.ex0 + (b.ex1! - b.ex0 + 1) * .7, b.ey0! + (b.ey1! - b.ey0! + 1) * .28);
        for (let k = 0; k < 3; k++) {
          const phase = ((time * .18 + k / 3 + b.doorX * .07) % 1);
          this.glow(vent.sx + phase * 26, vent.sy - buildingHeight(b) - 25 - phase * 38, 20 + phase * 35, 20 + phase * 28, 0xabbfc9, Math.sin(phase * Math.PI) * .10, true);
        }
      }
      // Cached floor data may be omitted from delta snapshots; lamps use the visible tile coordinates supplied by caller.
      for (const f of this.lamps) {
        if (!near(f.x, f.y)) continue;
        const p = worldToScreen(f.x + .5, f.y + .5);
        this.glow(p.sx + 15, p.sy + 6, 205, 105, 0xffcf87, .3 * intensity);
        this.glow(p.sx + 16, p.sy - 74, 54, 48, 0xffd493, .65 * intensity, true);
        this.glow(p.sx + 15, p.sy - 29, 58, 115, 0xffd493, .055 * intensity, true);
      }
    }
    this.flashes = this.flashes.filter(f => f.until > time);
    for (const f of this.flashes) {
      const p = worldToScreen(f.x, f.y);
      const alpha = Math.max(0, (f.until - time) / .12);
      this.glow(p.sx, p.sy, f.heavy ? 180 : 110, f.heavy ? 90 : 55, 0xffbd65, alpha * .6);
      this.glow(p.sx, p.sy - 20, 60, 50, 0xffdc96, alpha * .45, true);
    }
    for (let i = this.used; i < this.pools.length; i++) this.pools[i]!.visible = false;
    for (let i = this.airUsed; i < this.haze.length; i++) this.haze[i]!.visible = false;
  }
}
