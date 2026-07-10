import { TILE_H, TILE_W } from "@loose-cannon/shared";

export function worldToScreen(x: number, y: number): { sx: number; sy: number } {
  return {
    sx: (x - y) * (TILE_W / 2),
    sy: (x + y) * (TILE_H / 2),
  };
}

export function screenToWorld(
  sx: number,
  sy: number,
  camX: number,
  camY: number,
): { x: number; y: number } {
  const lx = sx + camX;
  const ly = sy + camY;
  const x = ly / TILE_H + lx / TILE_W;
  const y = ly / TILE_H - lx / TILE_W;
  return { x, y };
}
