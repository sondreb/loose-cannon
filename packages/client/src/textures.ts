/**
 * Painted seamless textures (Grok Imagine) for ground, façades, and interiors.
 *
 * Critical: texture matrices must be **shared** (same for every poly of a type).
 * Per-tile translate() causes diamond-edge stitching that worsens under zoom.
 * UV follows geometry coordinates (worldToScreen space, pre-camera zoom) so
 * adjacent tiles share continuous samples on shared edges.
 */
import { Assets, Matrix, Texture } from "pixi.js";

export type GroundTexId = "asphalt" | "sidewalk" | "grass" | "debris";
export type BuildTexId = "brick" | "roof";
export type InteriorTexId = "wood_floor" | "plaster_wall" | "club_carpet" | "club_wall";

const URLS: Record<string, string> = {
  asphalt: "/art/textures/asphalt.jpg",
  sidewalk: "/art/textures/sidewalk.jpg",
  grass: "/art/textures/grass.jpg",
  debris: "/art/textures/debris.jpg",
  brick: "/art/textures/brick.jpg",
  roof: "/art/textures/roof.jpg",
  wood_floor: "/art/textures/wood-floor.jpg",
  plaster_wall: "/art/textures/plaster-wall.jpg",
  club_carpet: "/art/textures/club-carpet.jpg",
  club_wall: "/art/textures/club-wall.jpg",
};

let ready = false;
const cache = new Map<string, Texture>();

/** Shared matrices — never per-tile. ~1 texture repeat per N geometry px. */
const MAT = {
  /** Ground: finer grain, continuous across iso diamonds */
  ground: (() => {
    const m = new Matrix();
    // denser: smaller number → more repeats
    m.scale(1 / 110, 1 / 110);
    return m;
  })(),
  /** Walls / roofs on building faces */
  wall: (() => {
    const m = new Matrix();
    m.scale(1 / 90, 1 / 90);
    return m;
  })(),
  /** Interior floors */
  floor: (() => {
    const m = new Matrix();
    m.scale(1 / 100, 1 / 100);
    return m;
  })(),
  /** Sparse debris stamps — still global so no seam fight */
  debris: (() => {
    const m = new Matrix();
    m.scale(1 / 70, 1 / 70);
    return m;
  })(),
} as const;

export async function loadWorldTextures(): Promise<void> {
  if (ready) return;
  const urls = Object.values(URLS);
  try {
    await Assets.load(urls);
    for (const [id, url] of Object.entries(URLS)) {
      const t = Texture.from(url);
      try {
        // Repeat wrap for continuous fills
        t.source.addressMode = "repeat";
      } catch {
        /* ignore */
      }
      try {
        t.source.scaleMode = "linear";
        t.source.autoGenerateMipmaps = false;
      } catch {
        /* ignore */
      }
      cache.set(id, t);
    }
    ready = true;
  } catch (e) {
    console.warn("[textures] load failed — solid fills only", e);
    ready = false;
  }
}

export function texturesReady(): boolean {
  return ready;
}

export function worldTexture(id: string): Texture | null {
  if (!ready) return null;
  return cache.get(id) ?? null;
}

/** Shared continuous matrix for outdoor ground (road / sidewalk / grass). */
export function isoTileMatrix(_sx?: number, _sy?: number, _scale?: number): Matrix {
  return MAT.ground;
}

/** Shared matrix for building wall / roof faces. */
export function wallFaceMatrix(_sx?: number, _sy?: number, _scale?: number): Matrix {
  return MAT.wall;
}

/** Shared matrix for interior floors. */
export function floorTextureMatrix(): Matrix {
  return MAT.floor;
}

export function debrisTextureMatrix(): Matrix {
  return MAT.debris;
}

export function groundTexForType(type: string): GroundTexId | null {
  if (type === "road" || type === "parking") return "asphalt";
  if (type === "sidewalk") return "sidewalk";
  if (type === "grass") return "grass";
  return null;
}
