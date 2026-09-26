#!/usr/bin/env python3
"""Build the "Get It Sold" vector logos (SVG, text converted to outlines).
Needs fonttools + Montserrat ExtraBold (.woff/.ttf): python3 .imggen/logo_svg.py path/to/font
Writes public/images/logo/*.svg — stacked + horizontal, light/dark, with and without background.
"""
import os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

NAVY, GOLD, WHITE, OFFWHITE = "#1E2A4A", "#D4923A", "#FFFFFF", "#F2F3F7"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "images", "logo")
font = TTFont(sys.argv[1])
gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
UPM = font["head"].unitsPerEm
CAP = font["OS/2"].sCapHeight

def text(s, cx, baseline, cap_px, fill, track=0.02):
    """Outlined text centered on cx; cap_px = rendered cap height in px."""
    k = cap_px / CAP
    names = [cmap[ord(c)] for c in s]
    adv = [hmtx[n][0] + track * UPM for n in names]
    width = (sum(adv) - track * UPM) * k
    x, parts = 0, []
    for n, a in zip(names, adv):
        pen = SVGPathPen(gs)
        gs[n].draw(pen)
        if pen.getCommands():
            parts.append(f'<path transform="translate({x:.1f} 0)" d="{pen.getCommands()}"/>')
        x += a
    return (f'<g fill="{fill}" transform="translate({cx - width / 2:.2f} {baseline}) scale({k:.5f} {-k:.5f})">'
            + "".join(parts) + "</g>"), width

def wordmark(cx, top, cap, ink):
    """"GET IT" over a gold "SOLD" pill; returns svg and bottom y."""
    get, _ = text("GET IT", cx, top + cap, cap, ink)
    pill_h, pill_top = cap * 1.1, top + cap * 1.32
    sold, sw = text("SOLD", cx, pill_top + pill_h / 2 + cap * 0.82 / 2, cap * 0.82, WHITE)
    pw = sw + pill_h * 1.1
    pill = (f'<rect x="{cx - pw / 2:.1f}" y="{pill_top:.1f}" width="{pw:.1f}" height="{pill_h:.1f}" '
            f'rx="{pill_h / 2:.1f}" fill="{GOLD}"/>')
    return get + pill + sold, pill_top + pill_h

def svg(w, h, body, bg):
    back = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
            f'<title>Get It Sold</title>{back}{body}</svg>\n')

def stacked(ink):
    s = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'
    roof = f'<path d="M58 214 L256 82 L454 214" {s} stroke="{GOLD}" stroke-width="16"/>'
    # chimney legs end on the right roof slope (slope = 132/198); drawn first so the roof covers them
    chim = f'<path d="M344 141 V96 H374 V161" {s} stroke="{ink}" stroke-width="11"/>'
    frame = f'<rect x="100" y="236" width="312" height="190" rx="8" {s} stroke="{ink}" stroke-width="12"/>'
    words, _ = wordmark(256, 276, 46, ink)
    return chim + roof + frame + words

def horizontal(ink):
    s = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'
    roof = f'<path d="M40 138 L160 58 L280 138" {s} stroke="{GOLD}" stroke-width="13"/>'
    chim = f'<path d="M218 97 V56 H240 V111" {s} stroke="{ink}" stroke-width="9"/>'
    walls = f'<path d="M82 250 V142 H238 V250" {s} stroke="{ink}" stroke-width="11"/>'
    door = f'<path d="M140 250 V196 H180 V250" {s} stroke="{GOLD}" stroke-width="9"/>'
    words, _ = wordmark(470, 88, 62, ink)
    return chim + roof + walls + door + words

os.makedirs(OUT, exist_ok=True)
variants = {
    "stacked": (512, 512, stacked),
    "horizontal": (640, 300, horizontal),
}
for name, (w, h, fn) in variants.items():
    for tone, ink, bg in (("light", NAVY, OFFWHITE), ("dark", WHITE, NAVY)):
        open(os.path.join(OUT, f"get-it-sold-{name}-{tone}.svg"), "w").write(svg(w, h, fn(ink), bg))
        open(os.path.join(OUT, f"get-it-sold-{name}-{tone}-transparent.svg"), "w").write(svg(w, h, fn(ink), None))
print("wrote", sorted(os.listdir(OUT)))
