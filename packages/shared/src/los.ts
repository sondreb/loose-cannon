/**
 * Line-of-sight + soft cover helpers for combat.
 * Walls/void block bullets; standing next to a wall grants soft cover.
 */

export type TileBlockFn = (tileX: number, tileY: number) => boolean;

export interface LosResult {
  clear: boolean;
  /** First blocked point along the ray (or target if clear) */
  hitX: number;
  hitY: number;
}

/**
 * Ray-march tile centers between two world points.
 * Skips the shooter's start tile and the target's end tile so units can
 * stand against a façade and still fire/be hit along open streets.
 */
export function castLineOfSight(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  isBlocking: TileBlockFn,
  step = 0.22,
): LosResult {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.05) {
    return { clear: true, hitX: x1, hitY: y1 };
  }

  const ux = dx / dist;
  const uy = dy / dist;
  const startSkip = Math.min(0.45, dist * 0.2);
  const endSkip = Math.min(0.4, dist * 0.18);
  const endAt = Math.max(startSkip, dist - endSkip);

  let sx = Math.floor(x0);
  let sy = Math.floor(y0);
  let ex = Math.floor(x1);
  let ey = Math.floor(y1);

  for (let t = startSkip; t <= endAt + 1e-6; t += step) {
    const px = x0 + ux * t;
    const py = y0 + uy * t;
    const tx = Math.floor(px);
    const ty = Math.floor(py);
    // Never treat start/end tiles as blockers
    if ((tx === sx && ty === sy) || (tx === ex && ty === ey)) continue;
    if (isBlocking(tx, ty)) {
      // Nudge impact slightly into the wall face for VFX
      return {
        clear: false,
        hitX: px - ux * step * 0.5,
        hitY: py - uy * step * 0.5,
      };
    }
  }

  return { clear: true, hitX: x1, hitY: y1 };
}

export function hasLineOfSight(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  isBlocking: TileBlockFn,
): boolean {
  return castLineOfSight(x0, y0, x1, y1, isBlocking).clear;
}

/** True if any orthogonal neighbor tile is solid (soft cover). */
export function hasAdjacentCover(x: number, y: number, isBlocking: TileBlockFn): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  return (
    isBlocking(tx + 1, ty) ||
    isBlocking(tx - 1, ty) ||
    isBlocking(tx, ty + 1) ||
    isBlocking(tx, ty - 1)
  );
}
