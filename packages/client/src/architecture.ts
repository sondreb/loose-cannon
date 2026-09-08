import { Assets, Container, Graphics, Matrix, Text, Texture } from "pixi.js";
import type { BuildingPublic, LightingLook } from "@loose-cannon/shared";
import { worldToScreen } from "./iso";
import { worldTexture } from "./textures";

// Authored elevations are mapped onto world-space faces; no screen-aligned window stamps.
const facades = new Map<string, Texture>();
export const STOREY_HEIGHT = 64;
export const buildingHeight = (b: BuildingPublic): number => Math.max(2, b.stories ?? 2) * STOREY_HEIGHT + 10;
export async function loadArchitecture(): Promise<void> {
  await Promise.all(["brownstone", "industrial"].map(async (kind) => {
    try {
      const texture = await Assets.load<Texture>(`/art/facades/${kind}-v1.png`);
      texture.source.scaleMode = "linear";
      facades.set(kind, texture);
    } catch (error) { console.warn(`[architecture] ${kind} fallback`, error); }
  }));
}

type Point = { sx: number; sy: number };
const mix = (a: Point, b: Point, t: number): Point => ({ sx: a.sx + (b.sx - a.sx) * t, sy: a.sy + (b.sy - a.sy) * t });
const raised = (p: Point, z: number): Point => ({ sx: p.sx, sy: p.sy - z });
function polygon(g: Graphics, points: Point[], color: number, alpha = 1): void {
  g.poly(points.flatMap(p => [p.sx, p.sy])).fill({ color, alpha });
}
function line(g: Graphics, a: Point, b: Point, color: number, width = 1, alpha = 1): void {
  g.moveTo(a.sx, a.sy).lineTo(b.sx, b.sy).stroke({ color, width, alpha });
}
function face(g: Graphics, a: Point, b: Point, height: number, texture: Texture | null, tint: number): void {
  const at = raised(a, height), bt = raised(b, height);
  const points = [at.sx, at.sy, bt.sx, bt.sy, b.sx, b.sy, a.sx, a.sy];
  g.poly(points);
  if (texture) {
    const matrix = new Matrix((b.sx - a.sx) / texture.width, (b.sy - a.sy) / texture.width, 0, height / texture.height, at.sx, at.sy);
    g.fill({ texture, matrix, textureSpace: "global", color: tint });
  } else g.fill({ color: tint });
}

/** Small true isometric rooftop solids, shared by HVAC, access huts and parapets. */
export function isoDetailBox(g: Graphics, x: number, y: number, w: number, d: number, base: number, h: number, color = 0x626672): Point[] {
  const p = [worldToScreen(x, y), worldToScreen(x + w, y), worldToScreen(x + w, y + d), worldToScreen(x, y + d)].map(v => raised(v, base));
  const t = p.map(v => raised(v, h));
  polygon(g, [p[1]!, p[2]!, t[2]!, t[1]!], color);
  polygon(g, [p[3]!, p[2]!, t[2]!, t[3]!], color);
  polygon(g, [p[3]!, p[2]!, t[2]!, t[3]!], 0x040917, 0.36);
  polygon(g, t, color);
  polygon(g, t, 0xb6c6d4, 0.12);
  line(g, t[0]!, t[1]!, 0xc8ced2, 1, 0.35);
  line(g, t[1]!, t[2]!, 0xc8ced2, 1, 0.24);
  return t;
}

export function buildingAccent(b: BuildingPublic): number {
  if (b.kind === "bar" || b.kind === "club") return 0xf564b7;
  if (b.kind === "hospital") return 0xf07464;
  if (b.kind === "safehouse") return 0x7bd2a6;
  if (b.kind === "gym" || b.kind === "church") return 0xe1b760;
  if (b.kind === "shop") return 0x63d6da;
  return 0x7eaec3;
}

export function drawArchitecture(g: Graphics, b: BuildingPublic, look: LightingLook, labels: Container): Text[] {
  const x = b.ex0!, y = b.ey0!, w = b.ex1! - x + 1, d = b.ey1! - y + 1;
  const h = buildingHeight(b), accent = buildingAccent(b);
  const a = worldToScreen(x, y), e = worldToScreen(x + w, y), s = worldToScreen(x + w, y + d), west = worldToScreen(x, y + d);
  const roof = [a, e, s, west].map(p => raised(p, h));
  const industrial = ["warehouse", "garage", "coldstore", "gym"].includes(b.kind);
  const tex = facades.get(industrial ? "industrial" : "brownstone") ?? worldTexture("brick");
  // Broad directional shadow plus a narrow contact band grounds the mass.
  polygon(g, [west, s, { sx: s.sx + 68, sy: s.sy + 28 }, { sx: west.sx + 68, sy: west.sy + 28 }], 0x060811, 0.28);
  face(g, e, s, h, tex, look.phase === "night" ? 0xa7b6c8 : 0xd0cbd0);
  face(g, west, s, h, tex, look.phase === "night" ? 0x778697 : 0xa9a7b5);
  // Foundation, stone belt courses, corner pilasters: all follow the wall plane.
  for (const [p, q] of [[e, s], [west, s]] as [Point, Point][]) {
    for (const z of [3, h * 0.32, h * 0.65, h - 3]) {
      line(g, raised(p, z), raised(q, z), 0x090c15, z === 3 ? 7 : 3, 0.55);
      line(g, raised(p, z + 2), raised(q, z + 2), 0xc1bac0, 1, 0.30);
    }
    line(g, raised(p, 0), raised(p, h), 0x161820, 5, 0.6);
    line(g, raised(q, 0), raised(q, h), 0xcac1b6, 2, 0.22);
  }
  // Roof membrane, sealed seams, parapet coping and proper volumetric service gear.
  polygon(g, roof, industrial ? 0x343b40 : 0x30333d);
  const roofTex = worldTexture("roof");
  if (roofTex) {
    const p = roof[0]!;
    g.poly(roof.flatMap(v => [v.sx, v.sy])).fill({ texture: roofTex, textureSpace: "global", matrix: new Matrix(0.33, 0.165, -0.33, 0.165, p.sx, p.sy), color: 0x7c8995, alpha: 0.52 });
  }
  for (let i = 1; i < w; i += 2) line(g, raised(worldToScreen(x + i, y), h), raised(worldToScreen(x + i, y + d), h), 0x0c111a, 1, 0.38);
  isoDetailBox(g, x, y, w, 0.18, h, 6, 0x6b6870);
  isoDetailBox(g, x, y, 0.18, d, h, 6, 0x575c68);
  isoDetailBox(g, x + w - 0.18, y, 0.18, d, h, 6, 0x73767d);
  isoDetailBox(g, x, y + d - 0.18, w, 0.18, h, 6, 0x5a5e68);
  const vent = isoDetailBox(g, x + w * 0.36, y + d * 0.42, 1.15, 0.85, h, 17, 0x737e86);
  const vc = mix(vent[0]!, vent[2]!, 0.5);
  g.ellipse(vc.sx, vc.sy, 10, 5).fill({ color: 0x18212c });
  for (let i = -3; i <= 3; i++) line(g, { sx: vc.sx - 7, sy: vc.sy + i }, { sx: vc.sx + 7, sy: vc.sy + i }, 0x929b9e, 0.6, 0.7);
  isoDetailBox(g, x + w * 0.61, y + d * 0.54, 0.9, 0.65, h, 13, 0x616b73);
  isoDetailBox(g, x + w * 0.24, y + d * 0.23, 1.1, 1.35, h, 31, 0x65626a);
  const stack = raised(worldToScreen(x + w * 0.7, y + d * 0.28), h);
  g.rect(stack.sx - 5, stack.sy - 22, 10, 23).fill({ color: 0x5d5962 });
  g.ellipse(stack.sx, stack.sy - 22, 7, 3.5).fill({ color: 0x969194 });
  g.ellipse(stack.sx, stack.sy - 23, 4, 1.7).fill({ color: 0x10141d });
  // Fire escape on the left street elevation: landings, rail uprights and diagonal stairs.
  if (!industrial && b.kind !== "church") {
    const p = mix(west, s, 0.27), q = mix(west, s, 0.49);
    for (let z = 48; z < h - 20; z += STOREY_HEIGHT) {
      const pa = raised(p, z), qa = raised(q, z);
      polygon(g, [pa, qa, { sx: qa.sx - 10, sy: qa.sy + 5 }, { sx: pa.sx - 10, sy: pa.sy + 5 }], 0x2c333c);
      const r1 = { sx: pa.sx - 10, sy: pa.sy - 12 }, r2 = { sx: qa.sx - 10, sy: qa.sy - 12 };
      line(g, r1, r2, 0x8a9297, 1.5);
      for (let k = 0; k <= 6; k++) { const r = mix(r1, r2, k / 6); line(g, r, { sx: r.sx, sy: r.sy + 18 }, 0x687782, 1); }
      if (z > 48) {
        const low = { sx: qa.sx - 10, sy: qa.sy + STOREY_HEIGHT + 5 };
        line(g, { sx: pa.sx - 10, sy: pa.sy + 5 }, low, 0x202630, 6);
        for (let k = 1; k < 12; k++) { const r = mix({ sx: pa.sx - 10, sy: pa.sy + 5 }, low, k / 12); line(g, { sx: r.sx - 4, sy: r.sy }, { sx: r.sx + 4, sy: r.sy }, 0x9ba1a5, 1); }
      }
    }
  }
  if (b.kind === "church") {
    const p = raised(worldToScreen(x + w * 0.52, y + d * 0.5), h);
    polygon(g, [{ sx: p.sx, sy: p.sy - 78 }, { sx: p.sx - 23, sy: p.sy }, { sx: p.sx + 23, sy: p.sy }], 0x665654);
    polygon(g, [{ sx: p.sx, sy: p.sy - 78 }, p, { sx: p.sx + 23, sy: p.sy }], 0x352d38);
    line(g, raised(p, 98), raised(p, 73), 0xd4b972, 3);
    line(g, { sx: p.sx - 8, sy: p.sy - 89 }, { sx: p.sx + 8, sy: p.sy - 89 }, 0xd4b972, 3);
  }
  // Actual entrance remains at the server door; painted texture doors are decorative.
  const door = worldToScreen(b.doorX + 0.5, b.doorY + 0.5);
  const rearEntrance = b.doorY <= y || b.doorX <= x;
  if (!rearEntrance) {
  g.ellipse(door.sx, door.sy + 5, 25, 10).fill({ color: accent, alpha: 0.12 + look.neon * 0.12 });
  g.roundRect(door.sx - 11, door.sy - 30, 22, 33, 1).fill({ color: 0x0c121c }).stroke({ color: 0xc2bcb2, width: 2, alpha: 0.65 });
  g.rect(door.sx - 8, door.sy - 27, 16, 14).fill({ color: accent, alpha: 0.35 + look.neon * 0.3 });
  g.circle(door.sx + 6, door.sy - 8, 1.5).fill(0xe5cc8a);
  g.poly([door.sx - 28, door.sy - 38, door.sx + 24, door.sy - 38, door.sx + 33, door.sy - 30, door.sx - 20, door.sy - 30]).fill({ color: accent, alpha: 0.7 });
  line(g, { sx: door.sx - 20, sy: door.sy - 29 }, { sx: door.sx + 33, sy: door.sy - 29 }, 0x131721, 4);
  }
  // Business lettering, sized to the building. Warm signs complement cool city fill light.
  const sign = new Text({ text: b.name.toUpperCase() + (rearEntrance ? " · REAR" : ""), style: { fontFamily: "Impact, Arial Narrow, sans-serif", fontSize: b.kind === "club" ? 19 : 15, fontWeight: "700", fill: accent, letterSpacing: 1.5, stroke: { color: 0x080c14, width: 4 }, dropShadow: { color: accent, blur: 8, distance: 0, alpha: 0.65 } } });
  sign.anchor.set(0.5, 1);
  sign.position.set(door.sx, door.sy - (rearEntrance ? h + 12 : 43));
  labels.addChild(sign);
  return [sign];
}
