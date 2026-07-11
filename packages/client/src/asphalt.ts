/**
 * Combat-scene asphalt helpers — continuous wet charcoal surface (not a diamond grid).
 * Colors sampled from packages/client/public/art/combat-scene.jpg.
 */

/** Smooth multi-octave noise in ~0..1 from world tile coords (continuous across tiles). */
export function asphaltNoise(wx: number, wy: number): number {
  const n =
    Math.sin(wx * 1.73 + wy * 0.91) * 0.37 +
    Math.sin(wx * 0.41 - wy * 1.27) * 0.28 +
    Math.sin((wx + wy) * 2.33) * 0.2 +
    Math.sin(wx * 4.17 + wy * 3.61) * 0.15 +
    Math.sin(wx * 0.13 + wy * 0.19) * 0.12;
  return Math.min(1, Math.max(0, n * 0.5 + 0.5));
}

/** Finer grit octave for speckles. */
export function asphaltGrit(wx: number, wy: number): number {
  const n =
    Math.sin(wx * 11.3 + wy * 7.7) * 0.45 +
    Math.sin(wx * 19.1 - wy * 13.4) * 0.35 +
    Math.sin((wx * 3.1 + wy * 5.7) * 2.2) * 0.2;
  return n * 0.5 + 0.5;
}

/**
 * Base asphalt RGB matching combat-scene night streets:
 * dry charcoal with cool bias; wet deep blue-black.
 */
export function asphaltColor(
  wx: number,
  wy: number,
  wet: number,
  war: number,
  bright: number,
): number {
  const t = asphaltNoise(wx, wy);
  const g = asphaltGrit(wx + 0.3, wy - 0.2);

  // Concept art dry: ~#1c1c26 – #2a2a36; wet darker with blue sheen
  const dryLo = 0x16161e;
  const dryHi = 0x262630;
  const wetLo = 0x101018;
  const wetHi = 0x1c2430;

  let c = lerp(dryLo, dryHi, t * 0.65 + g * 0.12);
  if (wet > 0.15) {
    const wC = lerp(wetLo, wetHi, t * 0.55 + 0.2);
    c = lerp(c, wC, Math.min(1, wet * 0.95));
  }
  // War zone: slight warm blood-dirt
  if (war > 0.05) c = lerp(c, 0x1a1214, war * 0.55);
  if (bright !== 1) c = shade(c, bright);
  return c;
}

/** Sidewalk concrete — cooler gray, continuous. */
export function sidewalkColor(wx: number, wy: number, war: number, bright: number): number {
  const t = asphaltNoise(wx * 0.7, wy * 0.7);
  let c = lerp(0x4e4c58, 0x5a5866, t * 0.5);
  if (war > 0.05) c = lerp(c, 0x3e3438, war * 0.4);
  if (bright !== 1) c = shade(c, bright);
  return c;
}

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, ((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.max(0, ((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.max(0, (color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

function lerp(a: number, b: number, t: number): number {
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
