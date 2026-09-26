#!/usr/bin/env python3
"""Generate "Get It Sold" logo concepts via Kie.ai (gpt-image-2-text-to-image).
Modern take on the mockups: floating gold roof over a solid house mark, "GET IT" over a
justified gold "SOLD" tag; stacked + horizontal (light/dark) and an app icon. Brand colors: navy #1E2A4A, gold #D4923A.
Run from repo root: python3 .imggen/logo_gen.py  (skips files that already exist)
"""
import os, sys, json, time, requests

API_KEY = os.environ.get("KIE_API_KEY")
if not API_KEY:
    sys.exit("ERROR: KIE_API_KEY not set")
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "images", "logo", "gpt-image-2")
os.makedirs(OUT, exist_ok=True)

STYLE = ("Modern minimalist brand logo for a real estate home-buying company, in the style of a 2025 "
         "tech/fintech startup identity. Flat vector, bold simple geometry, solid filled shapes, "
         "consistent rounded corners, generous negative space, no gradients, no shadows, no 3D, no mockup, "
         "no taglines or extra text, perfectly centered with generous padding. Colors: deep navy #1E2A4A, "
         "warm gold #D4923A and white only. Bold geometric sans-serif (like Montserrat ExtraBold), tight "
         "letter spacing. The words must be spelled exactly \"GET IT\" and \"SOLD\".")

HOUSE = ("a solid filled navy house silhouette with softly rounded corners and an arched doorway cut out as "
         "negative space, a small navy chimney, and a thick gold roof chevron floating just above the house "
         "with a clean gap")
WORDS = ("bold text \"GET IT\" with, directly underneath and exactly the same width, a gold rounded-rectangle "
         "tag containing widely spaced white bold text \"SOLD\"")

PROMPTS = {
 "get-it-sold-modern-stacked-light": ("1:1", f"Vertical lockup: {HOUSE}, centered above navy {WORDS}. Solid off-white #F2F3F7 background."),
 "get-it-sold-modern-stacked-dark": ("1:1", f"Vertical lockup: {HOUSE.replace('navy', 'white')}, centered above white {WORDS}. Solid deep navy #1E2A4A background."),
 "get-it-sold-modern-horizontal-light": ("3:2", f"Horizontal lockup: on the left, {HOUSE}; on the right, navy {WORDS}. Solid off-white #F2F3F7 background."),
 "get-it-sold-modern-horizontal-dark": ("3:2", f"Horizontal lockup: on the left, {HOUSE.replace('navy', 'white')}; on the right, white {WORDS}. Solid deep navy #1E2A4A background."),
 "get-it-sold-modern-icon": ("1:1", f"App icon: only {HOUSE.replace('navy', 'white')}, no text, on a deep navy #1E2A4A rounded square."),
}

def gen(name, aspect, subject):
    out_path = os.path.join(OUT, name + ".png")
    if os.path.exists(out_path) and os.path.getsize(out_path) > 5000:
        print(f"SKIP {name}"); return True
    payload = {"model": "gpt-image-2-text-to-image", "input": {
        "prompt": subject + " " + STYLE, "aspect_ratio": aspect}}
    h = {"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"}
    try:
        r = requests.post("https://api.kie.ai/api/v1/jobs/createTask", headers=h, json=payload, timeout=30)
        body = r.json()
        tid = (body.get("data") or {}).get("taskId")
    except Exception as e:
        print(f"FAIL {name}: {e}"); return False
    if not tid:
        print(f"FAIL {name}: no taskId ({body.get('msg')})"); return False
    for _ in range(90):
        time.sleep(4)
        try:
            d = requests.get("https://api.kie.ai/api/v1/jobs/recordInfo", headers=h, params={"taskId": tid}, timeout=15).json().get("data", {})
        except Exception:
            continue
        st = d.get("state")
        if st in ("success", "completed"):
            urls = json.loads(d.get("resultJson", "{}")).get("resultUrls", [])
            if not urls:
                print(f"FAIL {name}: no url"); return False
            img = requests.get(urls[0], timeout=60)
            open(out_path, "wb").write(img.content)
            print(f"OK   {name} ({len(img.content)//1024}kb)"); return True
        if st in ("failed", "fail", "error"):
            print(f"FAIL {name}: {d.get('failMsg') or 'server'}"); return False
    print(f"FAIL {name}: timeout"); return False

if __name__ == "__main__":
    ok = sum(1 for n, (a, s) in PROMPTS.items() if gen(n, a, s))
    print(f"\nDONE {ok}/{len(PROMPTS)} images")
