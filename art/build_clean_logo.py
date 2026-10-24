"""Rebuild the small raster wordmark with clean Arial Bold outlines and its custom X."""

from pathlib import Path

import cv2
import numpy as np
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "next-genium-logo-original.png"
FONT = Path(r"C:\Windows\Fonts\arialbd.ttf")
SVG = ROOT / "next-genium-logo-clean.svg"

# Exact horizontal extents measured from the original PNG. The logo glyphs share y=1..31.
LETTERS = [
    ("N", 1, 33), ("E", 40, 68), ("T", 120, 151),
    ("G", 168, 202), ("E", 207, 235), ("N", 240, 271),
    ("I", 279, 286), ("U", 293, 323), ("M", 330, 369),
]


def font_path(character: str, x0: int, x1: int, font: TTFont) -> str:
    glyph_name = font.getBestCmap()[ord(character)]
    glyph_set = font.getGlyphSet()
    glyph = glyph_set[glyph_name]
    bounds = BoundsPen(glyph_set)
    glyph.draw(bounds)
    min_x, min_y, max_x, max_y = bounds.bounds
    sx = (x1 - x0 + 1) / (max_x - min_x)
    sy = 30 / (max_y - min_y)
    pen = SVGPathPen(glyph_set)
    transformed = TransformPen(pen, (sx, 0, 0, -sy, x0 - sx * min_x, 1 + sy * max_y))
    glyph.draw(transformed)
    return pen.getCommands()


def custom_x_paths(alpha: np.ndarray) -> list[str]:
    region = (alpha[:, 71:119] > 128).astype(np.uint8) * 255
    contours, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    result = []
    for contour in contours:
        points = cv2.approxPolyDP(contour, 1.0, True).reshape(-1, 2)
        result.append("M " + " L ".join(f"{x + 71} {y}" for x, y in points) + " Z")
    return result


def main() -> None:
    font = TTFont(FONT)
    alpha = np.asarray(Image.open(SOURCE).convert("RGBA").getchannel("A"))
    paths = [font_path(ch, x0, x1, font) for ch, x0, x1 in LETTERS]
    paths += custom_x_paths(alpha)
    path_tags = "\n".join(f'    <path d="{path}"/>' for path in paths)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 372 32" '
        'width="372" height="32" role="img" aria-label="NEXT GENIUM">\n'
        '  <rect width="372" height="32" fill="#fff"/>\n'
        '  <g fill="#000">\n'
        f"{path_tags}\n"
        "  </g>\n</svg>\n"
    )
    SVG.write_text(svg, encoding="utf-8")
    print(SVG)


if __name__ == "__main__":
    main()
