/**
 * Procedural Syndicate-ish pixel portraits (data URLs).
 * Stable per unit id/name so the same goon always looks the same.
 */

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIN = [0xe8c8a0, 0xd4a574, 0xc68642, 0x8d5524, 0xf1c27d, 0xb08968];
const HAIR = [0x1a1a1a, 0x3b2f2f, 0x6b4423, 0xc4a35a, 0x8b0000, 0x2f4f4f, 0x4a3728];
const SHIRT = [0x2a2a35, 0x3a2020, 0x1a3a2a, 0x2a2a50, 0x4a3a20, 0x333333, 0x5a2030];
const ACCENT = [0xf0a030, 0xc44, 0x48c, 0x8a4, 0xa6a, 0xc84, 0xffcc33];

const cache = new Map<string, string>();

export function portraitDataUrl(
  key: string,
  opts?: { leader?: boolean; dead?: boolean; upgradeTier?: number; female?: boolean },
): string {
  const cacheKey = `${key}|${opts?.leader ? 1 : 0}|${opts?.dead ? 1 : 0}|${opts?.upgradeTier ?? 0}|${opts?.female ? 1 : 0}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const rng = mulberry32(hashStr(key));
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const px = (x: number, y: number, color: number, s = 3) => {
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.fillRect(x * s, y * s, s, s);
  };

  const female = !!opts?.female;
  const skin = SKIN[Math.floor(rng() * SKIN.length)]!;
  const hair = HAIR[Math.floor(rng() * HAIR.length)]!;
  const shirt = (female ? [0x5a2030, 0x3a2040, 0x2a3050, 0x4a2030, 0x333333] : SHIRT)[
    Math.floor(rng() * (female ? 5 : SHIRT.length))
  ]!;
  const accent = ACCENT[Math.floor(rng() * ACCENT.length)]!;
  const beard = !female && rng() > 0.55;
  const shades = rng() > (female ? 0.55 : 0.7);
  const scar = !female && rng() > 0.75;
  const lipstick = female && rng() > 0.25;
  const longHair = female && rng() > 0.35;

  // Background
  const bg = opts?.dead ? 0x2a1515 : opts?.leader ? 0x2a2418 : 0x1a1a22;
  ctx.fillStyle = `#${bg.toString(16).padStart(6, "0")}`;
  ctx.fillRect(0, 0, size, size);

  // Border frame
  ctx.strokeStyle = opts?.leader ? "#f0a030" : "#555";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  // Shoulders / shirt
  for (let x = 2; x <= 13; x++) {
    for (let y = 11; y <= 15; y++) px(x, y, shirt);
  }
  // Collar accent
  px(5, 11, accent);
  px(10, 11, accent);

  // Neck
  px(7, 10, skin);
  px(8, 10, skin);

  // Head
  for (let x = 4; x <= 11; x++) {
    for (let y = 3; y <= 9; y++) px(x, y, skin);
  }

  // Hair
  const hairStyle = Math.floor(rng() * 3);
  for (let x = 4; x <= 11; x++) px(x, 2, hair);
  if (longHair) {
    for (let x = 3; x <= 12; x++) px(x, 2, hair);
    for (let x = 3; x <= 12; x++) px(x, 3, hair);
    px(3, 4, hair);
    px(3, 5, hair);
    px(3, 6, hair);
    px(12, 4, hair);
    px(12, 5, hair);
    px(12, 6, hair);
    px(4, 4, hair);
    px(11, 4, hair);
  } else if (hairStyle === 0) {
    for (let x = 4; x <= 11; x++) px(x, 3, hair);
    px(4, 4, hair);
    px(11, 4, hair);
  } else if (hairStyle === 1) {
    px(4, 3, hair);
    px(5, 3, hair);
    px(10, 3, hair);
    px(11, 3, hair);
  } else {
    for (let x = 5; x <= 10; x++) px(x, 1, hair);
    for (let x = 4; x <= 11; x++) px(x, 3, hair);
  }

  // Eyes
  if (shades) {
    for (let x = 5; x <= 10; x++) px(x, 5, 0x111111);
    px(4, 5, accent);
    px(11, 5, accent);
  } else {
    px(5, 5, 0xf0f0f0);
    px(6, 5, 0x1a1a1a);
    px(9, 5, 0xf0f0f0);
    px(10, 5, 0x1a1a1a);
  }

  // Nose / mouth
  px(7, 6, skin - 0x101010 > 0 ? skin - 0x101010 : skin);
  px(8, 6, skin);
  px(7, 8, lipstick ? 0xc03050 : 0x5a3030);
  px(8, 8, lipstick ? 0xc03050 : 0x5a3030);
  if (beard) {
    for (let x = 5; x <= 10; x++) px(x, 9, hair);
    px(6, 8, hair);
    px(9, 8, hair);
  }
  if (scar) {
    px(10, 6, 0xa04040);
    px(10, 7, 0xa04040);
  }

  // Leader star
  if (opts?.leader) {
    ctx.fillStyle = "#ffcc33";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText("★", 34, 12);
  }

  // Upgrade tier pips (bottom)
  const tier = Math.min(5, opts?.upgradeTier ?? 0);
  for (let i = 0; i < tier; i++) {
    ctx.fillStyle = i < 3 ? "#60c080" : "#ffcc33";
    ctx.fillRect(4 + i * 8, 42, 6, 3);
  }

  if (opts?.dead) {
    ctx.fillStyle = "rgba(80,0,0,0.45)";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#e05040";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("X", 18, 28);
  }

  const url = canvas.toDataURL("image/png");
  cache.set(cacheKey, url);
  return url;
}

/** 0 = street meat, higher = more training/gear investment */
export function upgradeTier(stats: {
  aim: number;
  guts: number;
  muscle: number;
  brains: number;
  speed: number;
  maxHealth: number;
}): number {
  const base = 5;
  const points =
    Math.max(0, stats.aim - base) +
    Math.max(0, stats.guts - base) +
    Math.max(0, stats.muscle - base) +
    Math.max(0, stats.brains - base) +
    Math.max(0, stats.speed - base) +
    Math.max(0, Math.floor((stats.maxHealth - 100) / 10));
  if (points <= 0) return 0;
  if (points <= 2) return 1;
  if (points <= 5) return 2;
  if (points <= 9) return 3;
  if (points <= 14) return 4;
  return 5;
}

export function statBonus(value: number, baseline = 5): number {
  return value - baseline;
}
