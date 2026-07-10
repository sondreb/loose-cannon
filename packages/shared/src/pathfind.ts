/**
 * Lightweight grid A* for outdoor/indoor tile walks.
 * Used by the server so click-move routes around building shells
 * instead of straight-lining into façades.
 */

export type WalkableFn = (tileX: number, tileY: number) => boolean;

export interface PathPoint {
  x: number;
  y: number;
}

export interface FindPathOpts {
  /** Cap expanded nodes (default 6000) — map is ~110×90 */
  maxExpand?: number;
  /** 8-way with no corner-cutting (default true) */
  allowDiag?: boolean;
}

const DEFAULT_MAX_EXPAND = 6000;

function key(x: number, y: number): number {
  return (y << 16) ^ (x & 0xffff);
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  // Octile distance
  return Math.max(dx, dy) + Math.min(dx, dy) * 0.414;
}

/**
 * A* on integer tiles. Returns world centers of path **excluding start**,
 * including goal (snapped to tile center). Empty array = already there / no move.
 * `null` = no path within budget.
 */
export function findGridPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  walkable: WalkableFn,
  opts?: FindPathOpts,
): PathPoint[] | null {
  const maxExpand = opts?.maxExpand ?? DEFAULT_MAX_EXPAND;
  const allowDiag = opts?.allowDiag !== false;

  let sx = Math.floor(startX);
  let sy = Math.floor(startY);
  let gx = Math.floor(goalX);
  let gy = Math.floor(goalY);

  // If start tile is blocked (standing on door edge etc.), try current float cell neighbors
  if (!walkable(sx, sy)) {
    const alt = nearestWalkableTile(startX, startY, walkable, 3);
    if (!alt) return null;
    sx = alt.x;
    sy = alt.y;
  }
  if (!walkable(gx, gy)) {
    const alt = nearestWalkableTile(goalX, goalY, walkable, 8);
    if (!alt) return null;
    gx = alt.x;
    gy = alt.y;
  }

  if (sx === gx && sy === gy) {
    const d = Math.hypot(goalX - startX, goalY - startY);
    if (d < 0.12) return [];
    return [{ x: goalX, y: goalY }];
  }

  // Binary-ish open set: array + linear scan is fine for short paths on this map size
  type Node = { x: number; y: number; g: number; f: number; px: number; py: number };
  const open: Node[] = [];
  const openAt = new Map<number, number>(); // key → index in open (stale ok)
  const closed = new Set<number>();
  const came = new Map<number, { x: number; y: number }>();
  const gScore = new Map<number, number>();

  const startNode: Node = {
    x: sx,
    y: sy,
    g: 0,
    f: heuristic(sx, sy, gx, gy),
    px: sx,
    py: sy,
  };
  open.push(startNode);
  openAt.set(key(sx, sy), 0);
  gScore.set(key(sx, sy), 0);

  let expanded = 0;
  let found: { x: number; y: number } | null = null;

  const neighbors: Array<[number, number, number]> = allowDiag
    ? [
        [1, 0, 1],
        [-1, 0, 1],
        [0, 1, 1],
        [0, -1, 1],
        [1, 1, 1.414],
        [1, -1, 1.414],
        [-1, 1, 1.414],
        [-1, -1, 1.414],
      ]
    : [
        [1, 0, 1],
        [-1, 0, 1],
        [0, 1, 1],
        [0, -1, 1],
      ];

  while (open.length > 0 && expanded < maxExpand) {
    // Pick lowest f
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.f < open[bi]!.f) bi = i;
    }
    const cur = open[bi]!;
    open[bi] = open[open.length - 1]!;
    open.pop();
    openAt.delete(key(cur.x, cur.y));

    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);
    expanded++;

    if (cur.x === gx && cur.y === gy) {
      found = { x: cur.x, y: cur.y };
      came.set(ck, { x: cur.px, y: cur.py });
      break;
    }

    came.set(ck, { x: cur.px, y: cur.py });

    for (const [dx, dy, cost] of neighbors) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!walkable(nx, ny)) continue;
      // No corner-cutting through walls
      if (dx !== 0 && dy !== 0) {
        if (!walkable(cur.x + dx, cur.y) || !walkable(cur.x, cur.y + dy)) continue;
      }
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = cur.g + cost;
      const prev = gScore.get(nk);
      if (prev !== undefined && ng >= prev) continue;
      gScore.set(nk, ng);
      const f = ng + heuristic(nx, ny, gx, gy);
      open.push({ x: nx, y: ny, g: ng, f, px: cur.x, py: cur.y });
    }
  }

  if (!found) return null;

  // Reconstruct tile path (goal → start)
  const tiles: Array<{ x: number; y: number }> = [];
  let cx = found.x;
  let cy = found.y;
  const startK = key(sx, sy);
  let guard = 0;
  while (guard++ < 10_000) {
    tiles.push({ x: cx, y: cy });
    if (cx === sx && cy === sy) break;
    const parent = came.get(key(cx, cy));
    if (!parent || (parent.x === cx && parent.y === cy && key(cx, cy) !== startK)) break;
    if (parent.x === cx && parent.y === cy) break;
    cx = parent.x;
    cy = parent.y;
  }
  tiles.reverse();

  // Drop start tile; convert to world centers; last point uses exact goal float
  const world: PathPoint[] = [];
  for (let i = 1; i < tiles.length; i++) {
    const t = tiles[i]!;
    if (i === tiles.length - 1) {
      world.push({ x: goalX, y: goalY });
    } else {
      world.push({ x: t.x + 0.5, y: t.y + 0.5 });
    }
  }

  return simplifyPath(world, walkable);
}

/** Spiral search for nearest walkable tile index. */
export function nearestWalkableTile(
  x: number,
  y: number,
  walkable: WalkableFn,
  maxR = 6,
): { x: number; y: number } | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (walkable(cx, cy)) return { x: cx, y: cy };
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (walkable(tx, ty)) return { x: tx, y: ty };
      }
    }
  }
  return null;
}

/**
 * Drop intermediate points only on axis-aligned straight runs.
 * Avoids diagonal shortcuts that can graze wall corners in continuous space.
 */
function simplifyPath(points: PathPoint[], _walkable: WalkableFn): PathPoint[] {
  if (points.length <= 2) return points;
  const out: PathPoint[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    const axisAligned =
      (Math.abs(abx) < 0.05 || Math.abs(aby) < 0.05) &&
      (Math.abs(bcx) < 0.05 || Math.abs(bcy) < 0.05);
    const sameAxis =
      (Math.abs(abx) < 0.05 && Math.abs(bcx) < 0.05 && aby * bcy > 0) ||
      (Math.abs(aby) < 0.05 && Math.abs(bcy) < 0.05 && abx * bcx > 0);
    if (axisAligned && sameAxis) continue;
    out.push(b);
  }
  out.push(points[points.length - 1]!);
  return out;
}
