#!/usr/bin/env python3
"""Generate "Get It Sold" logo concepts via Kie.ai (gpt-image-2-text-to-image).
Two layouts from the mockups: stacked (house over sign) and horizontal (house left of text),
each on a light and a navy background. Brand colors: navy #1E2A4A, gold #D4923A.
Run from repo root: python3 .imggen/logo_gen.py  (skips files that already exist)
"""
import os, sys, json, time, requests

API_KEY = os.environ.get("KIE_API_KEY")
if not API_KEY:
    sys.exit("ERROR: KIE_API_KEY not set")
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "images", "logo")
os.makedirs(OUT, exist_ok=True)

STYLE = ("Professional vector logo for a real estate home-buying company, flat design, crisp clean "
         "geometric lines, no gradients, no shadows, no mockup, no extra text, perfectly centered, "
         "generous padding. Colors: deep navy blue #1E2A4A and warm gold #D4923A only. Bold modern "
         "geometric sans-serif typography. The words must be spelled exactly \"GET IT\" and \"SOLD\".")

PROMPTS = {
 "get-it-sold-stacked-light": ("1:1", "A simple house outline: a gold pitched roof line with a small navy chimney, "
     "sitting over a navy rectangular yard-sign frame. Inside the frame, bold navy text \"GET IT\" above a gold "
     "rounded pill badge containing white bold text \"SOLD\". Solid off-white background."),
 "get-it-sold-stacked-dark": ("1:1", "A simple house outline: a gold pitched roof line with a small white chimney, "
     "sitting over a white rectangular yard-sign frame. Inside the frame, bold white text \"GET IT\" above a gold "
     "rounded pill badge containing white bold text \"SOLD\". Solid deep navy #1E2A4A background."),
 "get-it-sold-horizontal-light": ("3:2", "Horizontal logo lockup. On the left, a minimal house icon: gold pitched "
     "roof line, small navy chimney, navy house walls with a doorway. On the right, bold navy text \"GET IT\" "
     "stacked above a gold rounded pill badge with white bold text \"SOLD\". Solid off-white background."),
 "get-it-sold-horizontal-dark": ("3:2", "Horizontal logo lockup. On the left, a minimal house icon: gold pitched "
     "roof line, small white chimney, white house walls with a doorway. On the right, bold white text \"GET IT\" "
     "stacked above a gold rounded pill badge with white bold text \"SOLD\". Solid deep navy #1E2A4A background."),
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
