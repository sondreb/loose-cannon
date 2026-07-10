import type { ArmorId, WeaponId } from "@loose-cannon/shared";

const cache = new Map<string, string>();

function canvas(size = 40): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, s = 2): void {
  ctx.fillStyle = color;
  ctx.fillRect(x * s, y * s, s, s);
}

function frame(
  ctx: CanvasRenderingContext2D,
  size: number,
  active: boolean,
  locked: boolean,
): void {
  ctx.fillStyle = locked ? "#151515" : active ? "#2a2410" : "#12121a";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = active ? "#ffcc33" : locked ? "#2a2a2a" : "#4a4a55";
  ctx.lineWidth = active ? 2 : 1;
  ctx.strokeRect(1, 1, size - 2, size - 2);
}

/** Syndicate-style weapon icon (40×40 data URL) */
export function weaponIconDataUrl(
  id: WeaponId,
  opts?: { active?: boolean; locked?: boolean },
): string {
  const active = !!opts?.active;
  const locked = !!opts?.locked;
  const key = `w:${id}:${active}:${locked}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = 40;
  const [c, ctx] = canvas(size);
  frame(ctx, size, active, locked);

  const ink = locked ? "#3a3a3a" : "#e0d8c8";
  const mid = locked ? "#2a2a2a" : "#6a655c";
  const accent = locked ? "#333" : active ? "#ffcc33" : "#c9a227";
  const hot = locked ? "#402020" : "#e05040";
  const p = (x: number, y: number, col = ink) => px(ctx, x, y, col);

  switch (id) {
    case "pipe":
      for (let x = 3; x <= 16; x++) {
        p(x, 10, ink);
        p(x, 11, mid);
      }
      p(15, 9, accent);
      p(16, 9, accent);
      p(15, 12, accent);
      p(16, 12, accent);
      break;
    case "switchblade":
      for (let x = 5; x <= 14; x++) p(x, 10, ink);
      p(14, 9, ink);
      p(15, 10, ink);
      p(4, 9, mid);
      p(4, 10, mid);
      p(4, 11, mid);
      p(3, 10, accent);
      break;
    case "pistol":
      for (let x = 4; x <= 13; x++) {
        p(x, 8, ink);
        p(x, 9, mid);
      }
      p(13, 7, ink);
      p(5, 10, ink);
      p(5, 11, ink);
      p(5, 12, mid);
      p(6, 10, mid);
      p(6, 11, mid);
      p(12, 8, accent);
      break;
    case "uzi":
      for (let x = 3; x <= 15; x++) {
        p(x, 8, ink);
        p(x, 9, mid);
      }
      p(15, 7, ink);
      p(6, 10, ink);
      p(6, 11, ink);
      p(6, 12, mid);
      p(7, 10, mid);
      for (let x = 10; x <= 14; x++) p(x, 10, accent);
      break;
    case "shotgun":
      for (let x = 2; x <= 17; x++) {
        p(x, 9, ink);
        p(x, 10, mid);
      }
      p(4, 11, ink);
      p(4, 12, mid);
      p(5, 11, mid);
      p(16, 8, accent);
      p(17, 9, accent);
      break;
    case "tommy":
      for (let x = 2; x <= 16; x++) {
        p(x, 8, ink);
        p(x, 9, mid);
      }
      p(7, 10, ink);
      p(7, 11, ink);
      p(7, 12, mid);
      p(8, 10, mid);
      for (let x = 10; x <= 14; x++) for (let y = 10; y <= 13; y++) p(x, y, accent);
      p(16, 7, ink);
      break;
    case "minigun":
      // Long multi-barrel rotary gun
      for (let x = 1; x <= 17; x++) {
        p(x, 8, ink);
        p(x, 9, mid);
        p(x, 10, ink);
      }
      for (let y = 7; y <= 11; y++) {
        p(14, y, mid);
        p(15, y, accent);
        p(16, y, mid);
      }
      p(4, 11, ink);
      p(5, 11, mid);
      p(4, 12, mid);
      p(6, 7, accent);
      p(8, 7, accent);
      p(10, 7, accent);
      p(17, 8, hot);
      p(18, 9, hot);
      break;
    case "flamethrower":
      for (let x = 3; x <= 12; x++) {
        p(x, 9, ink);
        p(x, 10, mid);
      }
      p(5, 11, ink);
      p(5, 12, mid);
      for (let x = 7; x <= 11; x++) for (let y = 6; y <= 8; y++) p(x, y, mid);
      p(12, 8, hot);
      p(13, 8, hot);
      p(14, 7, hot);
      p(14, 9, accent);
      p(15, 8, "#ffcc33");
      break;
  }

  if (locked) {
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(11, 11);
    ctx.lineTo(29, 29);
    ctx.moveTo(29, 11);
    ctx.lineTo(11, 29);
    ctx.stroke();
  }

  const url = c.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

export function armorIconDataUrl(
  id: ArmorId,
  opts?: { active?: boolean; locked?: boolean },
): string {
  const active = !!opts?.active;
  const locked = !!opts?.locked;
  const key = `a:${id}:${active}:${locked}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = 40;
  const [c, ctx] = canvas(size);
  frame(ctx, size, active, locked);

  const ink = locked ? "#3a3a3a" : "#e0d8c8";
  const mid = locked ? "#2a2a2a" : "#5a6558";
  const leather = locked ? "#2a2a2a" : "#6a4a30";
  const accent = locked ? "#333" : active ? "#ffcc33" : "#8faf8f";
  const p = (x: number, y: number, col = ink) => px(ctx, x, y, col);

  switch (id) {
    case "none":
      for (let x = 5; x <= 14; x++) for (let y = 7; y <= 14; y++) p(x, y, mid);
      p(4, 7, mid);
      p(3, 8, mid);
      p(15, 7, mid);
      p(16, 8, mid);
      p(9, 6, ink);
      p(10, 6, ink);
      break;
    case "leather":
      for (let x = 4; x <= 15; x++) for (let y = 6; y <= 14; y++) p(x, y, leather);
      p(3, 7, leather);
      p(16, 7, leather);
      p(8, 9, accent);
      p(11, 9, accent);
      p(9, 5, ink);
      p(10, 5, ink);
      break;
    case "kevlar":
      for (let x = 5; x <= 14; x++) for (let y = 6; y <= 14; y++) p(x, y, mid);
      for (let x = 6; x <= 13; x++) {
        p(x, 8, accent);
        p(x, 11, accent);
      }
      p(9, 5, ink);
      p(10, 5, ink);
      break;
    case "plate":
      for (let x = 4; x <= 15; x++) for (let y = 5; y <= 14; y++) p(x, y, mid);
      for (let x = 5; x <= 14; x++) for (let y = 7; y <= 12; y++) p(x, y, accent);
      p(9, 4, ink);
      p(10, 4, ink);
      break;
  }

  if (locked) {
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, 0, size, size);
  }

  const url = c.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

export const WEAPON_BAR_ORDER: WeaponId[] = [
  "pipe",
  "switchblade",
  "pistol",
  "uzi",
  "shotgun",
  "tommy",
  "minigun",
  "flamethrower",
];

export const ARMOR_BAR_ORDER: ArmorId[] = ["none", "leather", "kevlar", "plate"];
