#!/usr/bin/env python3
"""
Pull full video catalogues for Views To Clients' publicly named client channels
and score each video the way Trinder says he does it: against its own channel's
baseline, not against the platform.

Needs a YouTube Data API v3 key (free, 10,000 quota units/day):
    Google Cloud Console -> APIs & Services -> Enable "YouTube Data API v3"
    -> Credentials -> Create API key

    export YOUTUBE_API_KEY=...
    python3 research/scrape_channels.py

Quota cost is trivial. We deliberately avoid search.list (100 units/call) and
walk the uploads playlist instead (1 unit per 50 videos), so a full pull of
every channel below costs well under 200 of the daily 10,000 units.

Writes:
    research/data/videos.json    every video, full metadata
    research/data/videos.csv     flat table for a spreadsheet
    research/data/outliers.md    per-channel baseline + the breakout videos

What this CANNOT get: transcripts. The Data API only serves captions for
channels you own. Transcripts need an Apify actor (see teardown, section on
tooling) or yt-dlp from an unrestricted network.
"""

import csv
import json
import os
import sys
import statistics
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

API = "https://www.googleapis.com/youtube/v3"
KEY = os.environ.get("YOUTUBE_API_KEY", "").strip()

OUT = Path(__file__).parent / "data"

# Publicly named Views To Clients channels, plus Trinder's own.
# Handles are best-effort; any that 404 are reported, not silently skipped.
TARGETS = [
    ("Jake Trinder",      "@jaketrinder",   "agency principal"),
    ("Instantly",         "@instantly-ai",  "GTM SaaS"),
    ("Clay",              "@clay-gtm",      "GTM SaaS"),
    ("HeyReach",          "@heyreach",      "GTM SaaS"),
    ("Hypefury",          "@hypefury",      "GTM SaaS"),
    ("Castmagic",         "@castmagic",     "GTM SaaS"),
    ("Glencoco",          "@glencoco",      "GTM SaaS"),
    ("Sam Piliero",       "@sampiliero",    "solo expert"),
    ("GaryVee",           "@garyvee",       "media personality"),
]

# Videos younger than this haven't finished accruing views, so they'd drag the
# channel baseline down and produce false negatives.
MATURITY_DAYS = 30
OUTLIER_THRESHOLD = 3.0  # x the channel median


def get(endpoint, **params):
    params["key"] = KEY
    url = f"{API}/{endpoint}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise SystemExit(f"\nAPI error {e.code} on {endpoint}:\n{detail}\n")


def resolve_channel(handle):
    """Handle -> (channel id, uploads playlist id, title, subs). None if absent."""
    r = get("channels", part="snippet,statistics,contentDetails", forHandle=handle)
    items = r.get("items") or []
    if not items:
        return None
    c = items[0]
    return {
        "channel_id": c["id"],
        "uploads": c["contentDetails"]["relatedPlaylists"]["uploads"],
        "title": c["snippet"]["title"],
        "subscribers": int(c["statistics"].get("subscriberCount", 0)),
        "total_views": int(c["statistics"].get("viewCount", 0)),
        "video_count": int(c["statistics"].get("videoCount", 0)),
    }


def video_ids(uploads_playlist):
    ids, token = [], None
    while True:
        r = get("playlistItems", part="contentDetails", playlistId=uploads_playlist,
                maxResults=50, **({"pageToken": token} if token else {}))
        ids += [i["contentDetails"]["videoId"] for i in r.get("items", [])]
        token = r.get("nextPageToken")
        if not token:
            return ids


def hydrate(ids):
    """videos.list in batches of 50 — snippet + stats + duration."""
    out = []
    for i in range(0, len(ids), 50):
        r = get("videos", part="snippet,statistics,contentDetails",
                id=",".join(ids[i:i + 50]), maxResults=50)
        for v in r.get("items", []):
            st, sn = v.get("statistics", {}), v["snippet"]
            out.append({
                "video_id": v["id"],
                "title": sn["title"],
                "published_at": sn["publishedAt"],
                "duration": v["contentDetails"]["duration"],
                "views": int(st.get("viewCount", 0)),
                "likes": int(st.get("likeCount", 0)),
                "comments": int(st.get("commentCount", 0)),
                "description": sn.get("description", "")[:2000],
                "tags": sn.get("tags", []),
                "url": f"https://www.youtube.com/watch?v={v['id']}",
            })
    return out


def score(videos):
    """Trinder's definition: an outlier is a video that beat its OWN channel's
    normal views. Baseline is the median of matured videos, which resists the
    single 270k-view breakout skewing everything after it."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=MATURITY_DAYS)
    matured = [v for v in videos
               if datetime.fromisoformat(v["published_at"].replace("Z", "+00:00")) < cutoff]
    pool = matured or videos
    baseline = statistics.median([v["views"] for v in pool]) or 1
    for v in videos:
        v["baseline"] = baseline
        v["multiple"] = round(v["views"] / baseline, 2)
        v["outlier"] = v["multiple"] >= OUTLIER_THRESHOLD
    return baseline


def main():
    if not KEY:
        sys.exit("Set YOUTUBE_API_KEY first. See the docstring for how to get one.")

    OUT.mkdir(parents=True, exist_ok=True)
    everything, report, missing = [], [], []

    for name, handle, category in TARGETS:
        print(f"  {name:16s} {handle:18s} ", end="", flush=True)
        ch = resolve_channel(handle)
        if not ch:
            print("handle not found - check it manually")
            missing.append((name, handle))
            continue

        vids = hydrate(video_ids(ch["uploads"]))
        if not vids:
            print("no videos")
            continue

        baseline = score(vids)
        for v in vids:
            v.update(channel=name, handle=handle, category=category,
                     subscribers=ch["subscribers"])
        everything += vids

        outliers = sorted([v for v in vids if v["outlier"]],
                          key=lambda v: -v["multiple"])
        report.append((name, handle, category, ch, baseline, vids, outliers))
        print(f"{len(vids):4d} videos | baseline {int(baseline):>8,} | "
              f"{len(outliers)} outliers")

    if not everything:
        sys.exit("Nothing collected.")

    (OUT / "videos.json").write_text(json.dumps(everything, indent=2))

    cols = ["channel", "handle", "category", "subscribers", "title", "published_at",
            "duration", "views", "likes", "comments", "baseline", "multiple",
            "outlier", "url"]
    with open(OUT / "videos.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(everything)

    with open(OUT / "outliers.md", "w") as f:
        f.write("# Outlier analysis — Views To Clients client channels\n\n")
        f.write(f"Pulled {datetime.now(timezone.utc):%Y-%m-%d}. "
                f"{len(everything):,} videos across {len(report)} channels. "
                f"An outlier is a video at >={OUTLIER_THRESHOLD}x its own channel's "
                f"median views, counting only videos older than {MATURITY_DAYS} days "
                "when setting that median.\n\n")
        for name, handle, category, ch, baseline, vids, outliers in report:
            f.write(f"## {name} (`{handle}`) — {category}\n\n")
            f.write(f"- {ch['subscribers']:,} subscribers, {len(vids):,} videos pulled\n")
            f.write(f"- Median views (matured): **{int(baseline):,}**\n")
            f.write(f"- Outliers: **{len(outliers)}**\n\n")
            if outliers:
                f.write("| x median | Views | Published | Title |\n")
                f.write("|---:|---:|---|---|\n")
                for v in outliers[:15]:
                    f.write(f"| {v['multiple']}x | {v['views']:,} | "
                            f"{v['published_at'][:10]} | [{v['title']}]({v['url']}) |\n")
                f.write("\n")
        if missing:
            f.write("## Handles that didn't resolve\n\n")
            for name, handle in missing:
                f.write(f"- {name} (`{handle}`) — find the real handle and re-run\n")

    print(f"\nWrote {len(everything):,} videos to {OUT}/")
    print("Read outliers.md first — the title patterns in it are the thing worth copying.")


if __name__ == "__main__":
    main()
