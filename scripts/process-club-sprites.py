"""Chroma-key Titty Twister dancer + club prop sprites."""
from __future__ import annotations

import os
from PIL import Image

SESSION = r"C:\Users\sondr\.grok\sessions\F%3A%5Csrc%5Cgithub%5Csondreb%5Cloose-cannon\019f4bdf-9eb1-7242-aae3-21ba448835d0\images"
OUT = r"F:\src\github\sondreb\loose-cannon\packages\client\public\art\sprites\club"


def is_magenta(r: int, g: int, b: int) -> float:
    if r < 130 or b < 100:
        return 0.0
    rg = r - g
    bg = b - g
    # hot pink / magenta backgrounds (JPEG)
    if r > 200 and g < 120 and b > 140:
        return 1.0
    if r > 180 and b > 150 and g < 140 and rg > 30 and (r + b) / 2 > 180:
        return 0.9
    if rg > 50 and bg > 20 and r > 170:
        return min(1.0, (rg + bg) / 250.0)
    return 0.0


def chroma_key(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            m = is_magenta(r, g, b)
            if m >= 0.5:
                px[x, y] = (0, 0, 0, 0)
            elif m >= 0.25:
                na = int(a * (1.0 - m))
                px[x, y] = (0, 0, 0, 0) if na < 30 else (r, g, b, na)
    return img


def flood_bg(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    visited = set()
    stack = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    while stack:
        x, y = stack.pop()
        if (x, y) in visited or not (0 <= x < w and 0 <= y < h):
            continue
        visited.add((x, y))
        r, g, b, a = px[x, y]
        if a < 10:
            continue
        if is_magenta(r, g, b) < 0.18:
            continue
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            stack.append((x + dx, y + dy))
    return img


def trim(img: Image.Image, pad: int = 2) -> Image.Image:
    a = img.split()[-1]
    bb = a.getbbox()
    if not bb:
        return img
    x0, y0, x1, y1 = bb
    return img.crop(
        (max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad))
    )


def export(src: str, name: str, h: int = 110) -> None:
    path = os.path.join(SESSION, src)
    if not os.path.exists(path):
        print("MISSING", src)
        return
    im = Image.open(path).convert("RGBA")
    im = chroma_key(im)
    im = flood_bg(im)
    im = trim(im)
    sc = h / max(1, im.height)
    im = im.resize((max(1, int(im.width * sc)), h), Image.Resampling.LANCZOS)
    im = chroma_key(im)
    out = os.path.join(OUT, f"{name}.png")
    im.save(out, "PNG")
    print(name, im.size)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    # Dancer A dark hair: stage 0=8, 1=11, 2=14
    # Dancer B blonde: stage 0=6, 1=12, 2=15
    # Dancer C auburn: stage 0=7, 1=13, 2=16
    mapping = {
        "dancer-a-0": "8.jpg",
        "dancer-a-1": "11.jpg",
        "dancer-a-2": "14.jpg",
        "dancer-b-0": "6.jpg",
        "dancer-b-1": "12.jpg",
        "dancer-b-2": "15.jpg",
        "dancer-c-0": "7.jpg",
        "dancer-c-1": "13.jpg",
        "dancer-c-2": "16.jpg",
        "stage-pole": "9.jpg",
        "vip-booth": "10.jpg",
    }
    for name, src in mapping.items():
        export(src, name, 100 if name.startswith("dancer") else 80)
    print("done")


if __name__ == "__main__":
    main()
