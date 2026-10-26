"""Render a handwritten-style test solution for the Meta API proof.

Equation: 3(x-2) = 2x + 5, with a deliberate knot at step 2 (3(x-2) -> 3x-2).
Font: Caveat (OFL, Google Fonts). Pass the font path as argv[1]; output path argv[2].
Usage: python3 scripts/render_test_image.py /path/to/Caveat.ttf docs/proof/test-knot-step2.jpg
"""
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

LINES = [
    "3(x - 2) = 2x + 5",
    "3x - 2 = 2x + 5",      # knot: distribution error (should be 3x - 6)
    "3x - 2x = 5 + 2",
    "x = 7",
]


def main(font_path: str, out_path: str) -> None:
    random.seed(7)
    W, H = 1200, 900
    img = Image.new("RGB", (W, H), (250, 248, 240))
    d = ImageDraw.Draw(img)
    for y in range(90, H, 64):  # ruled notebook lines
        d.line([(0, y), (W, y)], fill=(200, 215, 235), width=2)
    d.line([(110, 0), (110, H)], fill=(235, 170, 170), width=2)

    font = ImageFont.truetype(font_path, 84)
    try:
        font.set_variation_by_name("Bold")
    except Exception:
        pass
    ink = (28, 45, 120)
    y = 150
    for text in LINES:
        layer = Image.new("RGBA", (W, 160), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((150 + random.randint(-12, 12), 20), text, font=font, fill=ink + (255,))
        layer = layer.rotate(random.uniform(-1.6, 1.6), resample=Image.BICUBIC)
        img.paste(layer, (0, y - 40), layer)
        y += 170
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(out_path, "JPEG", quality=88)
    print(f"wrote {out_path} {W}x{H}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
