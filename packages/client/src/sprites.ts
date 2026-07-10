/**
 * Combat-scene style pixel sprites (Grok Imagine) for units & street props.
 * Magenta-keyed PNGs under /art/sprites/.
 */
import { Assets, Texture } from "pixi.js";

const GOON_M = [
  "/art/sprites/goon-m-01.png",
  "/art/sprites/goon-m-02.png",
] as const;

const GOON_F = ["/art/sprites/goon-f-01.png"] as const;

const NPC_TEX = {
  bartender: "/art/sprites/npc-bartender.png",
  default: "/art/sprites/goon-m-01.png",
} as const;

const PROP_TEX: Record<string, string> = {
  car: "/art/sprites/prop-taxi.png",
  dumpster: "/art/sprites/prop-dumpster.png",
  cone: "/art/sprites/prop-cone.png",
  motorcycle: "/art/sprites/prop-motorcycle.png",
  mailbox: "/art/sprites/prop-mailbox.png",
  phonebooth: "/art/sprites/prop-phonebooth.png",
  hydrant: "/art/sprites/prop-cone.png",
};

/** Titty Twister dancer outfits: key a|b|c × stage 0..2 */
const DANCER_KEYS = ["a", "b", "c"] as const;
const DANCER_STAGES = [0, 1, 2] as const;

const CLUB_PROP_TEX = {
  stage: "/art/sprites/club/stage-pole.png",
  booth: "/art/sprites/club/vip-booth.png",
} as const;

function dancerUrl(key: string, stage: number): string {
  const k = DANCER_KEYS.includes(key as (typeof DANCER_KEYS)[number]) ? key : "a";
  const s = Math.max(0, Math.min(2, Math.floor(stage)));
  return `/art/sprites/club/dancer-${k}-${s}.png`;
}

let ready = false;
const cache = new Map<string, Texture>();

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function loadGameSprites(): Promise<void> {
  if (ready) return;
  const dancerUrls: string[] = [];
  for (const k of DANCER_KEYS) {
    for (const s of DANCER_STAGES) dancerUrls.push(dancerUrl(k, s));
  }
  const urls = [
    ...GOON_M,
    ...GOON_F,
    NPC_TEX.bartender,
    ...Object.values(PROP_TEX),
    ...Object.values(CLUB_PROP_TEX),
    ...dancerUrls,
  ];
  const unique = [...new Set(urls)];
  try {
    await Assets.load(unique);
    for (const u of unique) {
      const t = Texture.from(u);
      cache.set(u, t);
    }
    ready = true;
  } catch (e) {
    console.warn("[sprites] load failed, procedural fallback", e);
    ready = false;
  }
}

export function spritesReady(): boolean {
  return ready;
}

export function unitTexture(opts: {
  id: string;
  name: string;
  female?: boolean;
  isNpc?: boolean;
  npcRole?: string;
  dancerKey?: string;
  revealStage?: number;
}): Texture | null {
  if (!ready) return null;
  if (opts.isNpc) {
    const role = (opts.npcRole ?? "").toLowerCase();
    if (role === "dancer" || opts.dancerKey) {
      const key = opts.dancerKey ?? "a";
      const stage = opts.revealStage ?? 0;
      return cache.get(dancerUrl(key, stage)) ?? null;
    }
    if (
      role.includes("bartender") ||
      role.includes("bar") ||
      /vince|bob|venus/i.test(opts.name)
    ) {
      return cache.get(NPC_TEX.bartender) ?? null;
    }
  }
  const pool = opts.female ? GOON_F : GOON_M;
  const idx = hashStr(opts.id + "|" + opts.name) % pool.length;
  const url = pool[idx]!;
  return cache.get(url) ?? null;
}

export function propTexture(kind: string): Texture | null {
  if (!ready) return null;
  const url = PROP_TEX[kind];
  if (!url) return null;
  return cache.get(url) ?? null;
}

export function clubPropTexture(kind: "stage" | "booth"): Texture | null {
  if (!ready) return null;
  return cache.get(CLUB_PROP_TEX[kind]) ?? null;
}

/** Portrait path for dialogue UI (dancers use stage art) */
export function dancerPortraitUrl(key: string | undefined, stage: number): string | null {
  if (!key) return null;
  return dancerUrl(key, stage);
}

/** Display height in screen pixels for unit chips */
export const UNIT_SPRITE_H = 52;
/** Taller chips for club dancers */
export const DANCER_SPRITE_H = 64;
/** Display height for large props (cars, dumpsters) */
export const PROP_SPRITE_H = 48;
