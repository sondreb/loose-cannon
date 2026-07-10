import {
  TILE_H,
  TILE_W,
  tileColor,
  type UnitPublic,
  type WorldSnapshot,
} from "@loose-cannon/shared";
import { Application, Container, Graphics, Text } from "pixi.js";
import { screenToWorld, worldToScreen } from "./iso.js";

export class WorldView {
  app: Application;
  root = new Container();
  mapLayer = new Container();
  entityLayer = new Container();
  overlayLayer = new Container();
  private tileGfx = new Graphics();
  private entityGfx = new Graphics();
  private labels = new Container();
  private camX = 0;
  private camY = 0;
  private followX = 0;
  private followY = 0;
  private mapBuiltFor = "";
  private cachedFloors: WorldSnapshot["floors"] = [];
  private cachedBlocked: WorldSnapshot["blocked"] = [];
  private lastSnap: WorldSnapshot | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.app = new Application();
  }

  async init(): Promise<void> {
    await this.app.init({
      canvas: this.canvas,
      resizeTo: window,
      background: 0x0c0c10,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.app.stage.addChild(this.root);
    this.root.addChild(this.mapLayer, this.entityLayer, this.overlayLayer);
    this.mapLayer.addChild(this.tileGfx);
    this.entityLayer.addChild(this.entityGfx, this.labels);
  }

  getSnapshot(): WorldSnapshot | null {
    return this.lastSnap;
  }

  applySnapshot(snap: WorldSnapshot): void {
    if (snap.floors) this.cachedFloors = snap.floors;
    if (snap.blocked) this.cachedBlocked = snap.blocked;
    this.lastSnap = snap;
    const me = snap.units.find(
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
    this.drawEntities(snap);
    this.updateCamera();
  }

  private drawMap(snap: WorldSnapshot): void {
    const g = this.tileGfx;
    g.clear();
    const inside = snap.you.insideBuildingId;

    for (const f of this.cachedFloors ?? []) {
      if (inside) {
        // dim outdoor when inside? still draw all for context
      }
      this.drawTile(g, f.x, f.y, tileColor(f.type), f.type === "door");
    }
    for (const b of this.cachedBlocked ?? []) {
      this.drawTile(g, b.x, b.y, tileColor(b.type), false, true);
    }

    // Building labels at doors when outside
    this.overlayLayer.removeChildren();
    if (!inside) {
      for (const b of snap.buildings) {
        const { sx, sy } = worldToScreen(b.doorX + 0.5, b.doorY + 0.5);
        const t = new Text({
          text: b.name,
          style: { fontSize: 11, fill: 0xffcc66, fontWeight: "bold" },
        });
        t.x = sx - t.width / 2;
        t.y = sy - 28;
        this.overlayLayer.addChild(t);
      }
    }
  }

  private drawTile(
    g: Graphics,
    x: number,
    y: number,
    color: number,
    door = false,
    wall = false,
  ): void {
    const { sx, sy } = worldToScreen(x, y);
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const lift = wall ? 16 : 0;
    const top = sy - lift;
    g.poly([
      sx,
      top,
      sx + hw,
      top + hh,
      sx,
      top + TILE_H,
      sx - hw,
      top + hh,
    ]);
    g.fill({ color, alpha: wall ? 0.95 : 1 });
    if (wall) {
      // simple wall "height" face
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
      g.fill({ color: (color >> 1) & 0x7f7f7f, alpha: 0.9 });
    }
    if (door) {
      g.circle(sx, sy + 8, 4);
      g.fill({ color: 0xffaa44 });
    }
    if (color === 0x3a3a42 && (x + y) % 4 === 0) {
      g.rect(sx - 6, sy + 6, 12, 2);
      g.fill({ color: 0xc9a227, alpha: 0.5 });
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

    // move target marker for selected
    const sel = snap.units.find((u) => u.id === snap.you.selectedUnitId);
    if (sel) {
      const { sx, sy } = worldToScreen(sel.x, sel.y);
      g.circle(sx, sy + 10, 10);
      g.stroke({ color: 0xffcc33, width: 1, alpha: 0.7 });
    }
  }

  private drawUnit(g: Graphics, u: UnitPublic, snap: WorldSnapshot): void {
    const { sx, sy } = worldToScreen(u.x, u.y);
    const posse = snap.posses.find((p) => p.id === u.posseId);
    const color = posse?.color ?? 0xaaaaaa;
    const mine = u.posseId === snap.you.posseId;
    const body = u.alive ? color : 0x444444;

    // shadow
    g.ellipse(sx, sy + 10, 10, 5);
    g.fill({ color: 0x000000, alpha: 0.35 });

    // body
    const h = u.kind === "npc" ? 16 : 18;
    g.roundRect(sx - 6, sy - h, 12, h, 2);
    g.fill({ color: body });
    if (mine) {
      g.roundRect(sx - 6, sy - h, 12, h, 2);
      g.stroke({ color: 0xffee88, width: 1 });
    }
    if (posse?.hostile && !mine) {
      g.circle(sx, sy - h - 4, 3);
      g.fill({ color: 0xff3030 });
    }

    // head
    g.circle(sx, sy - h - 3, 4);
    g.fill({ color: u.kind === "npc" ? 0xd0b090 : 0xe8c8a0 });

    // hp bar
    if (u.alive && u.health < u.maxHealth) {
      g.rect(sx - 10, sy - h - 14, 20, 3);
      g.fill({ color: 0x222 });
      g.rect(sx - 10, sy - h - 14, 20 * (u.health / u.maxHealth), 3);
      g.fill({ color: 0xe04040 });
    }

    const label = new Text({
      text: u.name.split(" ")[0] ?? u.name,
      style: {
        fontSize: 10,
        fill: mine ? 0xffe080 : 0xdddddd,
        fontWeight: mine ? "bold" : "normal",
      },
    });
    label.x = sx - label.width / 2;
    label.y = sy - h - 26;
    this.labels.addChild(label);

    if (mine && u.id === snap.you.selectedUnitId) {
      const n = new Text({
        text: "▼",
        style: { fontSize: 10, fill: 0xffcc33 },
      });
      n.x = sx - 4;
      n.y = sy - h - 36;
      this.labels.addChild(n);
    }
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
