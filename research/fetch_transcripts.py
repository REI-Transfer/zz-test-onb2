#!/usr/bin/env python3
"""
Pull YouTube transcripts for videos worth studying, into the format
script_analyzer.py --benchmark reads.

RUN THIS ON YOUR OWN MACHINE, NOT IN A CLOUD SESSION. That is the whole trick.
YouTube serves caption tracks freely to ordinary viewers, so a residential IP
gets them for nothing. Datacenter IPs get blocked, which is why every paid
transcript service exists — they are selling you residential proxies, not access
to anything secret. On a laptop you do not need them.

    pip install youtube-transcript-api
    python3 research/fetch_transcripts.py --ids dQw4w9WgXcQ,anotherId
    python3 research/fetch_transcripts.py --from-json research/data/videos.json

The second form chains onto scrape_channels.py: it reads the catalogue that
produced, and by default fetches transcripts ONLY for the outliers — the videos
that beat their own channel's median. That is the point. You do not want 3,000
transcripts; you want the 30 that outperformed and the handful that didn't, so
you have something to compare them against.

Output:
    research/scripts/benchmark/<channel>/<video_id>.txt
    research/scripts/benchmark/index.csv     what was fetched, and how

Then:
    python3 research/script_analyzer.py --benchmark research/scripts/benchmark

A caveat that matters: auto-generated captions have no punctuation. Sentence
-based features (avg_sentence_words, short_sentence_pct) are meaningless on
them. This script records whether each transcript was human-written or
auto-generated, and warns you if you're about to draw conclusions from the
wrong kind.
"""

import argparse
import csv
import json
import random
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "scripts" / "benchmark"

NOISE = re.compile(r"\[(music|applause|laughter|inaudible|silence)[^\]]*\]", re.I)


def clean(chunks):
    """Join caption chunks, drop the noise markers and the overlap duplicates
    YouTube's rolling captions produce."""
    out = []
    for c in chunks:
        t = NOISE.sub(" ", c).strip()
        t = re.sub(r"\s+", " ", t)
        if not t:
            continue
        # Rolling captions repeat the tail of the previous line verbatim.
        if out and (t == out[-1] or t in out[-1]):
            continue
        out.append(t)
    return " ".join(out).strip()


def via_library(video_id):
    """youtube-transcript-api. Its API changed at 1.0, so try both shapes."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        return None

    # 1.x instance API
    try:
        api = YouTubeTranscriptApi()
        listing = api.list(video_id)
        try:
            tr = listing.find_manually_created_transcript(["en", "en-US", "en-GB"])
            kind = "manual"
        except Exception:
            tr = listing.find_generated_transcript(["en", "en-US", "en-GB"])
            kind = "auto"
        fetched = tr.fetch()
        chunks = [getattr(s, "text", None) or s["text"] for s in fetched]
        return clean(chunks), kind
    except ImportError:
        raise
    except AttributeError:
        pass  # older library, fall through
    except Exception as e:
        raise RuntimeError(str(e)[:160])

    # pre-1.0 static API
    try:
        listing = YouTubeTranscriptApi.list_transcripts(video_id)
        try:
            tr = listing.find_manually_created_transcript(["en", "en-US", "en-GB"])
            kind = "manual"
        except Exception:
            tr = listing.find_generated_transcript(["en", "en-US", "en-GB"])
            kind = "auto"
        return clean([s["text"] for s in tr.fetch()]), kind
    except Exception as e:
        raise RuntimeError(str(e)[:160])


def via_ytdlp(video_id, tmp):
    """Fallback. yt-dlp handles more edge cases and breaks less often when
    YouTube changes its backend, which it does."""
    tmp.mkdir(parents=True, exist_ok=True)
    stem = tmp / video_id
    cmd = [
        "yt-dlp", "--skip-download", "--write-subs", "--write-auto-subs",
        "--sub-langs", "en.*", "--sub-format", "vtt", "--no-warnings",
        "-o", str(stem), f"https://www.youtube.com/watch?v={video_id}",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    vtts = sorted(tmp.glob(f"{video_id}*.vtt"))
    if not vtts:
        raise RuntimeError((r.stderr or "yt-dlp produced no subtitle file").strip()[:160])
    raw = vtts[0].read_text(encoding="utf-8", errors="replace")
    lines = []
    for line in raw.splitlines():
        line = line.strip()
        if (not line or "-->" in line or line.startswith(("WEBVTT", "Kind:", "Language:"))
                or line.isdigit()):
            continue
        lines.append(re.sub(r"<[^>]+>", "", line))
    kind = "auto" if "auto" in vtts[0].name or "Kind: captions" in raw else "manual"
    return clean(lines), kind


def pick(videos, outliers_only, top_n):
    """Choose which videos are worth a transcript."""
    by_channel = {}
    for v in videos:
        by_channel.setdefault(v.get("channel", "unknown"), []).append(v)

    chosen = []
    for ch, vids in by_channel.items():
        vids.sort(key=lambda v: -v.get("multiple", 0))
        picks = [v for v in vids if v.get("outlier")] if outliers_only else vids
        if top_n:
            picks = picks[:top_n]
        # Always include two of the channel's weakest, so the benchmark has a
        # floor to compare against. A corpus of only winners teaches nothing.
        if outliers_only and len(vids) > 4:
            picks += vids[-2:]
        chosen += picks
    return chosen


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--ids", help="comma-separated video IDs or watch URLs")
    src.add_argument("--from-json", help="videos.json from scrape_channels.py")
    ap.add_argument("--all", action="store_true",
                    help="every video, not just outliers (slow, rarely useful)")
    ap.add_argument("--top", type=int, default=15,
                    help="max videos per channel (default 15)")
    ap.add_argument("--delay", type=float, default=1.5,
                    help="seconds between requests (default 1.5; be polite)")
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()

    if a.ids:
        ids = [re.sub(r".*[/=]", "", s.strip()) for s in a.ids.split(",") if s.strip()]
        targets = [{"video_id": i, "channel": "manual", "title": i} for i in ids]
    else:
        p = Path(a.from_json)
        if not p.exists():
            sys.exit(f"{p} not found — run scrape_channels.py first.")
        targets = pick(json.load(open(p)), not a.all, a.top)

    if not targets:
        sys.exit("Nothing selected. If the catalogue has no outliers yet, pass --all.")

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    tmp = out / ".ytdlp"

    print(f"Fetching {len(targets)} transcripts into {out}/\n")
    rows, ok, auto_n = [], 0, 0

    for i, v in enumerate(targets, 1):
        vid = v["video_id"]
        ch = re.sub(r"[^A-Za-z0-9_-]+", "-", v.get("channel", "unknown")).strip("-")
        print(f"  [{i}/{len(targets)}] {ch}/{vid} ", end="", flush=True)

        text = kind = None
        try:
            got = via_library(vid)
            if got:
                text, kind = got
        except RuntimeError as e:
            print(f"(library: {e}) ", end="")
        except ImportError:
            pass

        if not text:
            try:
                text, kind = via_ytdlp(vid, tmp)
            except FileNotFoundError:
                print("FAILED - install youtube-transcript-api or yt-dlp")
                continue
            except Exception as e:
                print(f"FAILED - {e}")
                rows.append({"video_id": vid, "channel": v.get("channel"),
                             "title": v.get("title", ""), "caption_type": "none",
                             "words": 0, "file": ""})
                continue

        d = out / ch
        d.mkdir(parents=True, exist_ok=True)
        f = d / f"{vid}.txt"
        f.write_text(text, encoding="utf-8")
        n = len(text.split())
        ok += 1
        auto_n += (kind == "auto")
        print(f"{kind}, {n} words")
        rows.append({"video_id": vid, "channel": v.get("channel"),
                     "title": v.get("title", ""), "caption_type": kind,
                     "words": n, "file": str(f.relative_to(out))})
        time.sleep(a.delay + random.uniform(0, 0.6))

    if tmp.exists():
        for junk in tmp.glob("*"):
            junk.unlink()
        tmp.rmdir()

    with open(out / "index.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["video_id", "channel", "title",
                                           "caption_type", "words", "file"])
        w.writeheader()
        w.writerows(rows)

    print(f"\n{ok}/{len(targets)} fetched.")
    if auto_n:
        print(
            f"\n{auto_n} are auto-generated and therefore unpunctuated. Sentence-level\n"
            "features (avg_sentence_words, short_sentence_pct) will be meaningless for\n"
            "those — read the vocabulary and density features instead, which hold up fine."
        )
    if ok == 0:
        print(
            "\nNothing came back. Almost always one of:\n"
            "  - you are on a cloud/datacenter IP (run this on your laptop)\n"
            "  - neither youtube-transcript-api nor yt-dlp is installed\n"
            "  - the videos genuinely have captions disabled"
        )
    else:
        print(f"\nNext: python3 research/script_analyzer.py --benchmark {out}")


if __name__ == "__main__":
    main()
