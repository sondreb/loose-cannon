"""Chroma-key Imagine sprites and export PNGs for the client."""
from __future__ import annotations

import os
from PIL import Image

SESSION = r"C:\Users\sondr\.grok\sessions\F%3A%5Csrc%5Cgithub%5Csondreb%5Cloose-cannon\019f4bdf-9eb1-7242-aae3-21ba448835d0\images"
OUT = r"F:\src\github\sondreb\loose-cannon\packages\client\public\art\sprites"


def is_magenta(r: int, g: int, b: int) -> float:
    """Return 0..1 how magenta-like a pixel is (1 = pure chroma bg)."""
    # Pure magenta / hot pink backgrounds from Imagine
    # High red + high blue, relatively low green
    if r < 140 or b < 140:
        return 0.0
    # green much lower than the magenta channels
    rg = r - g
    bg = b - g
    if rg < 40 or bg < 40:
        return 0.0
    # distance from magenta axis
    mag = (r + b) / 2.0
    # strength: how saturated the magenta is
    strength = min(1.0, (rg + bg) / 280.0)
    # near-white pinks still count if green is mid
    if mag > 200 and g < 160 and min(r, b) > 180:
        strength = max(strength, 0.85)
    if mag > 220 and g < 100:
        strength = 1.0
    # classic #FF00FF family
    if r > 230 and b > 230 and g < 80:
        strength = 1.0
    return min(1.0, strength)


def chroma_key(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            m = is_magenta(r, g, b)
            if m >= 0.55:
                pixels[x, y] = (0, 0, 0, 0)
            elif m >= 0.28:
                # soft fringe
                na = int(a * (1.0 - m))
                if na < 20:
                    pixels[x, y] = (0, 0, 0, 0)
                else:
                    pixels[x, y] = (r, g, b, na)
    return img


def trim_alpha(img: Image.Image, pad: int = 4) -> Image.Image:
    # getbbox on alpha
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad)
    y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1))


def export_char(src_name: str, out_name: str, target_h: int = 96) -> None:
    im = Image.open(os.path.join(SESSION, src_name))
    im = chroma_key(im)
    im = trim_alpha(im)
    scale = target_h / max(1, im.height)
    new_w = max(1, int(im.width * scale))
    im = im.resize((new_w, target_h), Image.Resampling.LANCZOS)
    # second pass after resize (bilinear can reintroduce fringe)
    im = chroma_key(im)
    path = os.path.join(OUT, f"{out_name}.png")
    im.save(path, "PNG")
    # count opaque pixels
    opaque = sum(1 for p in im.getdata() if p[3] > 10)
    print(out_name, im.size, f"opaque={opaque}", path)


def flood_bg(img: Image.Image) -> Image.Image:
    """Flood-fill from corners to kill remaining solid background."""
    img = img.convert("RGBA")
    w, h = img.size
    pixels = img.load()
    visited = set()
    stack = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (0, h // 2)]

    def similar(c1, c2, tol=48):
        return abs(c1[0] - c2[0]) + abs(c1[1] - c2[1]) + abs(c1[2] - c2[2]) < tol

    while stack:
        x, y = stack.pop()
        if (x, y) in visited or x < 0 or y < 0 or x >= w or y >= h:
            continue
        visited.add((x, y))
        r, g, b, a = pixels[x, y]
        if a < 10:
            continue
        # only flood near-magenta / near-pink bg, not character skin
        if is_magenta(r, g, b) < 0.2 and not (r > 200 and b > 180 and g < 170):
            continue
        if is_magenta(r, g, b) < 0.15:
            continue
        pixels[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if (nx, ny) not in visited and 0 <= nx < w and 0 <= ny < h:
                nr, ng, nb, na = pixels[nx, ny]
                if na > 10 and (
                    is_magenta(nr, ng, nb) >= 0.15
                    or similar((r, g, b), (nr, ng, nb), 60)
                ):
                    stack.append((nx, ny))
    return img


def export_char_v2(src_name: str, out_name: str, target_h: int = 96) -> None:
    im = Image.open(os.path.join(SESSION, src_name)).convert("RGBA")
    im = chroma_key(im)
    im = flood_bg(im)
    im = trim_alpha(im, pad=2)
    scale = target_h / max(1, im.height)
    new_w = max(1, int(im.width * scale))
    im = im.resize((new_w, target_h), Image.Resampling.LANCZOS)
    im = chroma_key(im)
    path = os.path.join(OUT, f"{out_name}.png")
    im.save(path, "PNG")
    opaque = sum(1 for p in im.getdata() if p[3] > 10)
    print(out_name, im.size, f"opaque={opaque}", path)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)

    export_char_v2("1.jpg", "goon-m-01")
    export_char_v2("3.jpg", "goon-f-01")
    if os.path.exists(os.path.join(SESSION, "5.jpg")):
        export_char_v2("5.jpg", "goon-m-02")
    if os.path.exists(os.path.join(SESSION, "4.jpg")):
        export_char_v2("4.jpg", "npc-bartender")

    props = Image.open(os.path.join(SESSION, "2.jpg")).convert("RGBA")
    props = chroma_key(props)
    props = flood_bg(props)
    props.save(os.path.join(OUT, "props-sheet.png"), "PNG")
    print("props sheet", props.size)

    # Better manual crops for 1280x720 sheet (eyeballed from layout)
    # Taxi left, dumpster mid-left back, cone center, bike, mailbox, phone right
    w, h = props.size
    crops = {
        # (x0,y0,x1,y1) absolute fractions tuned for this sheet
        "taxi": (20, 180, 380, 680),
        "dumpster": (280, 40, 520, 420),
        "cone": (500, 160, 680, 560),
        "motorcycle": (640, 200, 900, 680),
        "mailbox": (860, 140, 1060, 560),
        "phonebooth": (1040, 60, 1260, 640),
    }
    # scale crop coords if not 1280x720
    sx, sy = w / 1280.0, h / 720.0
    for name, (x0, y0, x1, y1) in crops.items():
        box = (int(x0 * sx), int(y0 * sy), int(x1 * sx), int(y1 * sy))
        piece = props.crop(box)
        piece = trim_alpha(piece, pad=2)
        th = 64 if name in ("cone", "mailbox") else 80
        if piece.height > 0:
            sc = th / piece.height
            piece = piece.resize((max(1, int(piece.width * sc)), th), Image.Resampling.LANCZOS)
        piece.save(os.path.join(OUT, f"prop-{name}.png"), "PNG")
        opaque = sum(1 for p in piece.getdata() if p[3] > 10)
        print(name, piece.size, f"opaque={opaque}")

    print("done")


if __name__ == "__main__":
    main()
