import {
  TILE_H,
  TILE_W,
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

export class WorldView {
  app: Application;
  root = new Container();
  mapLayer = new Container();
  entityLayer = new Container();
  overlayLayer = new Container();
  private tileGfx = new Graphics();
  private propGfx = new Graphics();
  private entityGfx = new Graphics();
  private fxGfx = new Graphics();
  private labels = new Container();
  private camX = 0;
  private camY = 0;
  private followX = 0;
  private followY = 0;
  private mapBuiltFor = "";
  private cachedFloors: WorldSnapshot["floors"] = [];
  private cachedBlocked: WorldSnapshot["blocked"] = [];
  private lastSnap: WorldSnapshot | null = null;
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
      background: 0x0a0c10,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.app.stage.addChild(this.root);
    this.root.addChild(this.mapLayer, this.propGfx, this.entityLayer, this.overlayLayer);
    this.mapLayer.addChild(this.tileGfx);
    this.entityLayer.addChild(this.entityGfx, this.fxGfx, this.labels);
    this.app.ticker.add(() => {
      this.time += 0.016;
      this.tickFx();
    });
  }

  getSnapshot(): WorldSnapshot | null {
    return this.lastSnap;
  }

  /** Call when local player fires / hits for juice */
  burstFx(x: number, y: number, kind: "muzzle" | "blood" | "spark"): void {
    this.fx.push({ x, y, life: kind === "muzzle" ? 0.12 : 0.25, kind });
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

    const key = `${snap.mapRevision}:${snap.you.insideBuildingId ?? "out"}`;
    if (key !== this.mapBuiltFor && this.cachedFloors?.length) {
      this.mapBuiltFor = key;
      this.drawMap(snap);
    }
    this.drawProps(snap.props ?? []);
    this.drawEntities(snap);
    this.updateCamera();
  }

  private drawMap(snap: WorldSnapshot): void {
    const g = this.tileGfx;
    g.clear();

    for (const f of this.cachedFloors ?? []) {
      this.drawTile(g, f.x, f.y, f.type, false);
    }
    for (const b of this.cachedBlocked ?? []) {
      this.drawTile(g, b.x, b.y, b.type, true);
    }

    this.overlayLayer.removeChildren();
    if (!snap.you.insideBuildingId) {
      for (const b of snap.buildings) {
        const { sx, sy } = worldToScreen(b.doorX + 0.5, b.doorY + 0.5);
        const title = new Text({
          text: b.name,
          style: {
            fontSize: 12,
            fill: 0xffcc66,
            fontWeight: "bold",
            dropShadow: { color: 0x000000, blur: 2, distance: 1, alpha: 0.9 },
          },
        });
        title.x = sx - title.width / 2;
        title.y = sy - 34;
        this.overlayLayer.addChild(title);
        if (b.blurb) {
          const sub = new Text({
            text: b.blurb,
            style: { fontSize: 9, fill: 0xaaa090 },
          });
          sub.x = sx - sub.width / 2;
          sub.y = sy - 20;
          this.overlayLayer.addChild(sub);
        }
      }
    }
  }

  private drawTile(g: Graphics, x: number, y: number, type: string, wall: boolean): void {
    const { sx, sy } = worldToScreen(x, y);
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const lift = wall ? 18 : 0;
    const top = sy - lift;

    let color = 0x4a5a32;
    if (type === "road") color = 0x3a3a44;
    else if (type === "sidewalk") color = 0x6a655c;
    else if (type === "parking") color = 0x353540;
    else if (type === "wall") color = 0x2c2622;
    else if (type === "floor") color = 0x4a4038;
    else if (type === "door") color = 0x9a6230;
    else if (type === "bar") color = 0x6a3030;
    else if (type === "shop") color = 0x30506a;
    else if (type === "hospital") color = 0x405868;
    else if (type === "gym") color = 0x4a4030;
    else if (type === "void") color = 0x101010;
    else if (type === "grass") {
      // dithered grass patches
      color = (x + y) % 3 === 0 ? 0x4a5a32 : 0x45562f;
    }

    g.poly([sx, top, sx + hw, top + hh, sx, top + TILE_H, sx - hw, top + hh]);
    g.fill({ color, alpha: wall ? 0.98 : 1 });

    if (wall) {
      g.poly([
        sx - hw,
        top + hh,
        sx,
        top + TILE_H,
        sx,
        top + TILE_H + lift,
        sx - hw,
        top + hh + lift,
      ]);
      g.fill({ color: (color >> 1) & 0x7f7f7f, alpha: 0.95 });
      g.poly([
        sx + hw,
        top + hh,
        sx,
        top + TILE_H,
        sx,
        top + TILE_H + lift,
        sx + hw,
        top + hh + lift,
      ]);
      g.fill({ color: (color * 0.65) | 0, alpha: 0.9 });
    }

    // Road center dashes
    if (type === "road" && (x + y) % 3 === 0) {
      g.rect(sx - 5, sy + 7, 10, 2);
      g.fill({ color: 0xc9a227, alpha: 0.55 });
    }
    // Parking lines
    if (type === "parking" && x % 2 === 0) {
      g.rect(sx - 1, sy + 4, 2, 10);
      g.fill({ color: 0xffffff, alpha: 0.12 });
    }
    // Sidewalk cracks
    if (type === "sidewalk" && (x * 7 + y * 3) % 11 === 0) {
      g.rect(sx - 8, sy + 10, 16, 1);
      g.fill({ color: 0x000000, alpha: 0.15 });
    }
    if (type === "door") {
      g.circle(sx, sy + 8, 5);
      g.fill({ color: 0xffaa44 });
      g.circle(sx, sy + 8, 2);
      g.fill({ color: 0x3a2010 });
    }
    // Neon floor accents
    if (type === "bar" || type === "shop") {
      g.circle(sx, sy + 6, 3);
      g.fill({ color: type === "bar" ? 0xff4060 : 0x40a0ff, alpha: 0.5 });
    }
  }

  private drawProps(props: PropPublic[]): void {
    const g = this.propGfx;
    g.clear();
    for (const p of props) {
      const { sx, sy } = worldToScreen(p.x, p.y);
      if (p.kind === "dumpster") {
        g.roundRect(sx - 14, sy - 10, 28, 16, 2);
        g.fill({ color: 0x2a4a2a });
        g.roundRect(sx - 14, sy - 10, 28, 16, 2);
        g.stroke({ color: 0x1a2a1a, width: 1 });
        g.rect(sx - 10, sy - 14, 20, 5);
        g.fill({ color: 0x3a5a3a });
      } else if (p.kind === "car") {
        g.roundRect(sx - 16, sy - 8, 32, 14, 3);
        g.fill({ color: 0x4a2020 });
        g.rect(sx - 10, sy - 12, 8, 5);
        g.fill({ color: 0x88aacc, alpha: 0.7 });
        g.circle(sx - 10, sy + 6, 3);
        g.fill({ color: 0x222 });
        g.circle(sx + 10, sy + 6, 3);
        g.fill({ color: 0x222 });
      } else if (p.kind === "protection") {
        g.circle(sx, sy, 8);
        g.stroke({ color: 0xf0a030, width: 2, alpha: 0.7 });
        g.circle(sx, sy, 3);
        g.fill({ color: 0xffcc33, alpha: 0.5 + Math.sin(this.time * 3) * 0.2 });
      } else if (p.kind === "crate") {
        g.rect(sx - 8, sy - 8, 16, 14);
        g.fill({ color: 0x6a5030 });
        g.rect(sx - 8, sy - 8, 16, 14);
        g.stroke({ color: 0x3a2810, width: 1 });
      } else if (p.kind === "neon") {
        g.rect(sx - 12, sy - 18, 24, 10);
        g.fill({ color: 0x200820 });
        g.rect(sx - 10, sy - 16, 20, 6);
        g.fill({ color: 0xff40aa, alpha: 0.6 + Math.sin(this.time * 5) * 0.3 });
      } else if (p.kind === "hydrant") {
        g.rect(sx - 3, sy - 10, 6, 12);
        g.fill({ color: 0xc04030 });
        g.circle(sx, sy - 12, 4);
        g.fill({ color: 0xe05040 });
      }
    }
  }

  private drawEntities(snap: WorldSnapshot): void {
    const g = this.entityGfx;
    g.clear();
    this.labels.removeChildren();

    const sorted = [...snap.units].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const u of sorted) {
      this.drawUnit(g, u, snap);
    }

    const sel = snap.units.find((u) => u.id === snap.you.selectedUnitId);
    if (sel?.alive) {
      const { sx, sy } = worldToScreen(sel.x, sel.y);
      g.circle(sx, sy + 12, 12);
      g.stroke({ color: 0xffcc33, width: 1.5, alpha: 0.75 });
    }
  }

  private drawUnit(g: Graphics, u: UnitPublic, snap: WorldSnapshot): void {
    const { sx, sy } = worldToScreen(u.x, u.y);
    const posse = snap.posses.find((p) => p.id === u.posseId);
    const color = posse?.color ?? 0xaaaaaa;
    const mine = u.posseId === snap.you.posseId;
    const bulk = armorBulk(u.armor);
    const threat = threatPips(u);

    // Shadow
    g.ellipse(sx, sy + 11, 11 + bulk, 5);
    g.fill({ color: 0x000000, alpha: 0.35 });

    if (!u.alive) {
      g.ellipse(sx, sy + 4, 12, 6);
      g.fill({ color: 0x4a2020, alpha: 0.8 });
      return;
    }

    // Legs
    g.rect(sx - 5, sy - 2, 3, 8);
    g.fill({ color: 0x2a2a32 });
    g.rect(sx + 2, sy - 2, 3, 8);
    g.fill({ color: 0x2a2a32 });

    // Body — bulk scales with armor
    const bw = 10 + bulk * 2;
    const bh = 14 + bulk;
    const bodyColor =
      u.armor === "plate"
        ? 0x5a6a70
        : u.armor === "kevlar"
          ? 0x3a4a38
          : u.armor === "leather"
            ? 0x5a4030
            : color;
    g.roundRect(sx - bw / 2, sy - bh - 2, bw, bh, 2);
    g.fill({ color: bodyColor });
    if (mine) {
      g.roundRect(sx - bw / 2, sy - bh - 2, bw, bh, 2);
      g.stroke({ color: 0xffee88, width: 1 });
    }
    if (posse?.hostile && !mine) {
      g.circle(sx + bw / 2 + 2, sy - bh - 4, 3);
      g.fill({ color: 0xff3030 });
    }

    // Armor plate lines
    if (bulk >= 2) {
      g.rect(sx - bw / 2 + 2, sy - bh + 2, bw - 4, 2);
      g.fill({ color: 0x8899aa, alpha: 0.5 });
    }

    // Head
    g.circle(sx, sy - bh - 5, 4.5);
    g.fill({ color: u.kind === "npc" ? 0xd0b090 : 0xe8c8a0 });

    // Weapon silhouette by type (pointing facing-ish to the right of sprite for readability)
    this.drawWeapon(g, sx, sy - bh / 2 - 2, u.weapon, mine);

    // Threat pips above enemies (and allies) so you can read gear threat
    if (threat > 0) {
      for (let i = 0; i < threat; i++) {
        g.rect(sx - threat * 3 + i * 6, sy - bh - 18, 4, 3);
        g.fill({ color: i < 3 ? 0x60c080 : 0xffcc33 });
      }
    }

    // HP bar for wounded / hostiles
    if (u.health < u.maxHealth || posse?.hostile) {
      g.rect(sx - 12, sy - bh - 22, 24, 3);
      g.fill({ color: 0x222 });
      g.rect(sx - 12, sy - bh - 22, 24 * (u.health / u.maxHealth), 3);
      g.fill({ color: mine ? 0x60c080 : 0xe04040 });
    }

    const label = new Text({
      text: u.name.split(" ")[0] ?? u.name,
      style: {
        fontSize: 10,
        fill: mine ? 0xffe080 : threat >= 3 ? 0xffa0a0 : 0xdddddd,
        fontWeight: mine || threat >= 3 ? "bold" : "normal",
        dropShadow: { color: 0x000000, blur: 1, distance: 1, alpha: 0.8 },
      },
    });
    label.x = sx - label.width / 2;
    label.y = sy - bh - 34;
    this.labels.addChild(label);

    // Weapon name for high threat
    if (!mine && (threat >= 2 || u.armor !== "none")) {
      const gear = new Text({
        text: `${u.weapon}${u.armor !== "none" ? "+" + u.armor : ""}`,
        style: { fontSize: 8, fill: 0xaab0c0 },
      });
      gear.x = sx - gear.width / 2;
      gear.y = sy - bh - 24;
      this.labels.addChild(gear);
    }

    if (mine && u.id === snap.you.selectedUnitId) {
      const n = new Text({
        text: "▼",
        style: { fontSize: 10, fill: 0xffcc33 },
      });
      n.x = sx - 4;
      n.y = sy - bh - 44;
      this.labels.addChild(n);
    }
  }

  private drawWeapon(g: Graphics, sx: number, sy: number, weapon: string, mine: boolean): void {
    const col = mine ? 0xddd5c5 : 0xbbb;
    const dark = 0x444;
    if (weapon === "pipe" || weapon === "switchblade") {
      g.rect(sx + 5, sy - 2, 10, 2);
      g.fill({ color: col });
    } else if (weapon === "pistol") {
      g.rect(sx + 5, sy - 1, 8, 3);
      g.fill({ color: dark });
      g.rect(sx + 6, sy + 2, 2, 4);
      g.fill({ color: dark });
    } else if (weapon === "uzi" || weapon === "tommy") {
      g.rect(sx + 4, sy - 2, 14, 3);
      g.fill({ color: dark });
      g.rect(sx + 8, sy + 1, 4, 5);
      g.fill({ color: 0x666 });
      if (weapon === "tommy") {
        g.circle(sx + 10, sy + 4, 3);
        g.fill({ color: 0x555 });
      }
    } else if (weapon === "shotgun") {
      g.rect(sx + 4, sy - 1, 16, 2);
      g.fill({ color: col });
      g.rect(sx + 5, sy + 1, 3, 4);
      g.fill({ color: dark });
    } else if (weapon === "flamethrower") {
      g.rect(sx + 4, sy - 2, 12, 3);
      g.fill({ color: dark });
      g.circle(sx + 16, sy - 2, 3);
      g.fill({ color: 0xff6020, alpha: 0.8 });
    }
  }

  private tickFx(): void {
    const g = this.fxGfx;
    g.clear();
    const next: typeof this.fx = [];
    for (const f of this.fx) {
      f.life -= 0.016;
      if (f.life <= 0) continue;
      next.push(f);
      const { sx, sy } = worldToScreen(f.x, f.y);
      const a = Math.max(0, f.life * 4);
      if (f.kind === "muzzle") {
        g.circle(sx + 10, sy - 10, 4 + (0.12 - f.life) * 20);
        g.fill({ color: 0xffcc44, alpha: a });
      } else if (f.kind === "blood") {
        g.circle(sx + (Math.random() - 0.5) * 6, sy, 3);
        g.fill({ color: 0xa02020, alpha: a });
      } else {
        g.circle(sx, sy - 8, 2);
        g.fill({ color: 0xffffff, alpha: a });
      }
    }
    this.fx = next;
  }

  private updateCamera(): void {
    const { sx, sy } = worldToScreen(this.followX, this.followY);
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    const targetX = sx - w / 2;
    const targetY = sy - h / 2;
    this.camX += (targetX - this.camX) * 0.12;
    this.camY += (targetY - this.camY) * 0.12;
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
      const d = Math.hypot(u.x - w.x, u.y - w.y);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best?.id ?? null;
  }
}
