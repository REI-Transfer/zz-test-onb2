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

def text_left(s, x, baseline, cap_px, fill, track=-0.01):
    t, w = text(s, 0, baseline, cap_px, fill, track)
    return f'<g transform="translate({x + w / 2:.2f} 0)">{t}</g>', w

def house_mark(ink, uid):
    """Modern mark: floating gold roof chevron over a solid house with an arched door cut out."""
    chim = f'<rect x="136" y="30" width="18" height="44" rx="4" fill="{ink}"/>'
    roof = (f'<path d="M22 100 L100 32 L178 100" fill="none" stroke="{GOLD}" stroke-width="18" '
            f'stroke-linecap="round" stroke-linejoin="round"/>')
    mask = (f'<mask id="door-{uid}"><rect width="200" height="240" fill="#fff"/>'
            f'<path d="M86 214 V168 a14 14 0 0 1 28 0 V214 Z" fill="#000"/></mask>')
    body = (f'<path d="M44 109 L100 60 L156 109 V204 H44 Z" fill="{ink}" stroke="{ink}" stroke-width="10" '
            f'stroke-linejoin="round" mask="url(#door-{uid})"/>')
    return mask + chim + roof + body

def modern_words(x, top, cap, ink, center=False):
    """"GET IT" with a justified gold "SOLD" tag of the same width underneath."""
    _, gw = text("GET IT", 0, 0, cap, ink, -0.01)
    x0 = x - gw / 2 if center else x
    get, _ = text_left("GET IT", x0, top + cap, cap, ink)
    ph, pt = cap * 1.08, top + cap * 1.28
    sold, _ = text("SOLD", x0 + gw / 2, pt + ph / 2 + cap * 0.78 / 2, cap * 0.78, WHITE, 0.16)
    pill = f'<rect x="{x0:.1f}" y="{pt:.1f}" width="{gw:.1f}" height="{ph:.1f}" rx="{ph * 0.3:.1f}" fill="{GOLD}"/>'
    return get + pill + sold

def modern_horizontal(ink, uid):
    return house_mark(ink, uid) + modern_words(214, 62, 58, ink)

def modern_stacked(ink, uid):
    return (f'<g transform="translate(136 50) scale(1.2)">{house_mark(ink, uid)}</g>'
            + modern_words(256, 336, 46, ink, center=True))

def modern_icon(ink, uid):
    return f'<g transform="translate(28 10)">{house_mark(ink, uid)}</g>'

os.makedirs(OUT, exist_ok=True)
variants = {
    "stacked": (512, 512, stacked),
    "horizontal": (640, 300, horizontal),
}
for name, (w, h, fn) in variants.items():
    for tone, ink, bg in (("light", NAVY, OFFWHITE), ("dark", WHITE, NAVY)):
        open(os.path.join(OUT, f"get-it-sold-{name}-{tone}.svg"), "w").write(svg(w, h, fn(ink), bg))
        open(os.path.join(OUT, f"get-it-sold-{name}-{tone}-transparent.svg"), "w").write(svg(w, h, fn(ink), None))
modern = {
    "stacked": (512, 512, modern_stacked),
    "horizontal": (500, 240, modern_horizontal),
    "icon": (256, 256, modern_icon),
}
for name, (w, h, fn) in modern.items():
    for tone, ink, bg in (("light", NAVY, OFFWHITE), ("dark", WHITE, NAVY)):
        uid = f"{name}-{tone}"
        open(os.path.join(OUT, f"get-it-sold-modern-{name}-{tone}.svg"), "w").write(svg(w, h, fn(ink, uid), bg))
        open(os.path.join(OUT, f"get-it-sold-modern-{name}-{tone}-transparent.svg"), "w").write(svg(w, h, fn(ink, uid), None))
print("wrote", sorted(os.listdir(OUT)))
