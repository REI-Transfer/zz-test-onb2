#!/usr/bin/env python3
"""
Find out which structural choices in your scripts correlate with performance.

The problem this solves: you write the scripts, some land, and the feedback loop
is too slow and too noisy to tell you why. Views confound everything — packaging
drives the click, the script drives the watch — so comparing raw view counts
teaches you very little about your writing. This measures the *script* against
whatever performance number you supply, and reports which features separate your
winners from your losers.

It needs no API and no scraper. You already have your own scripts.

    research/scripts/manifest.csv      what you made and how it did
    research/scripts/<file>.txt        one script per video, plain text

manifest.csv columns:
    file        filename inside research/scripts/  (required)
    title       video title                        (required)
    metric      the performance number             (required)
    label       optional free-text note

Use ONE metric consistently. In order of how much it tells you about the script:
    1. average view duration %   (best — isolates the script from packaging)
    2. average view duration in seconds
    3. views                     (worst — mostly measures the thumbnail)
Both of the first two are in YouTube Studio under Content -> each video ->
Engagement, and in the Analytics API if you want to pull them in bulk.

    python3 research/script_analyzer.py
    python3 research/script_analyzer.py --benchmark research/scripts/competitor

The --benchmark directory takes plain .txt transcripts from anyone else's
channel (an Apify transcript export drops straight in) and prints their
structural fingerprint next to your own, so you can see where you differ. It
needs no manifest — structure only, since you can't get their retention data.
"""

import argparse
import csv
import math
import re
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).parent
SCRIPTS = HERE / "scripts"

# Phrase sets. These are deliberately visible and editable — the whole point is
# that you tune them to how you actually write, not to a generic model of video.
OPEN_LOOPS = [
    "in a second", "in a moment", "later in this", "by the end of this",
    "stick around", "i'll show you", "i'll explain", "more on that",
    "coming up", "first, though", "but before", "keep watching", "at the end",
]
CORRECTIVE = [
    "actually", "the truth is", "wrong", "myth", "mistake", "nobody tells you",
    "everyone thinks", "most people", "the real reason", "here's the thing",
    "contrary to", "you've been", "stop doing",
]
SEGMENTS = [
    "first", "second", "third", "next", "finally", "lastly", "step one",
    "step two", "number one", "number two", "the last thing", "one more",
]
CTA = [
    "subscribe", "comment below", "link in the description", "link below",
    "book a call", "download", "sign up", "check out", "join the",
    "grab the", "dm me", "let me know",
]
NUMBERISH = re.compile(r"[$£€]?\d[\d,.]*\s?%?|\b\d+[kKmM]\b")


def sentences(text):
    parts = re.split(r"(?<=[.!?])\s+|\n{2,}", text)
    return [p.strip() for p in parts if p.strip()]


def words(text):
    return re.findall(r"[A-Za-z']+", text)


def syllables(word):
    w = word.lower()
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    if w.endswith("e") and n > 1:
        n -= 1
    return max(n, 1)


def count_phrases(low, phrases):
    return sum(low.count(p) for p in phrases)


def features(text):
    """Structural fingerprint of one script."""
    low = text.lower()
    ws = words(text)
    n = len(ws) or 1
    sents = sentences(text)
    slens = [len(words(s)) for s in sents] or [0]
    per100 = lambda c: round(c * 100 / n, 2)

    # How far in does the first concrete number land? Vagueness up front is the
    # single most common way a good idea loses people in the first 20 seconds.
    m = NUMBERISH.search(text)
    to_number = len(words(text[:m.start()])) if m else n

    # Where does the first CTA fall, as a % through the script?
    first_cta = n
    for c in CTA:
        i = low.find(c)
        if i != -1:
            first_cta = min(first_cta, len(words(text[:i])))

    hook = " ".join(sents[:3])

    return {
        "total_words": n,
        "hook_words": len(words(hook)),
        "words_to_first_number": to_number,
        "specificity_per_100w": per100(len(NUMBERISH.findall(text))),
        "you_per_100w": per100(len(re.findall(r"\byou\b|\byour\b", low))),
        "i_per_100w": per100(len(re.findall(r"\bi\b|\bmy\b|\bi'm\b|\bi've\b", low))),
        "open_loops": count_phrases(low, OPEN_LOOPS),
        "corrective_markers": count_phrases(low, CORRECTIVE),
        "segment_markers": count_phrases(low, SEGMENTS),
        "questions_per_100w": per100(text.count("?")),
        "avg_sentence_words": round(statistics.mean(slens), 1),
        "short_sentence_pct": round(100 * sum(1 for x in slens if x <= 8) / len(slens), 1),
        "complex_words_per_100w": per100(sum(1 for w in ws if syllables(w) >= 4)),
        "cta_count": count_phrases(low, CTA),
        "first_cta_at_pct": round(100 * first_cta / n, 1),
    }


def pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mx, my = statistics.mean(xs), statistics.mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return None if dx == 0 or dy == 0 else round(num / (dx * dy), 3)


def load_corpus():
    man = SCRIPTS / "manifest.csv"
    if not man.exists():
        sys.exit(
            f"No manifest at {man}\n\n"
            "Create it with columns: file,title,metric,label\n"
            "and drop one plain-text script per video in that folder.\n"
            "Use average view duration % as the metric if you can — views mostly\n"
            "measure your thumbnail, not your writing."
        )
    rows = []
    with open(man, newline="") as f:
        for r in csv.DictReader(f):
            p = SCRIPTS / r["file"].strip()
            if not p.exists():
                print(f"  ! missing script file: {p.name} — skipped")
                continue
            try:
                metric = float(str(r["metric"]).replace("%", "").replace(",", "").strip())
            except (ValueError, KeyError):
                print(f"  ! unreadable metric for {r['file']} — skipped")
                continue
            rows.append({
                "title": r.get("title", p.stem).strip(),
                "metric": metric,
                "label": (r.get("label") or "").strip(),
                "feats": features(p.read_text(encoding="utf-8", errors="replace")),
            })
    if not rows:
        sys.exit("Manifest found but no usable rows.")
    return rows


def fingerprint(directory):
    files = sorted(Path(directory).glob("*.txt"))
    if not files:
        sys.exit(f"No .txt transcripts in {directory}")
    feats = [features(p.read_text(encoding="utf-8", errors="replace")) for p in files]
    return {k: round(statistics.median(f[k] for f in feats), 2) for k in feats[0]}, len(files)


def report(rows, bench=None):
    rows.sort(key=lambda r: -r["metric"])
    n = len(rows)
    keys = list(rows[0]["feats"])

    out = ["# What's working in your scripts\n"]
    out.append(f"{n} scripts analysed, ranked by the metric you supplied.\n")
    if n < 8:
        out.append(
            "> **Treat this as directional only.** With fewer than 8 scripts the "
            "correlations below will move a lot with each new video. The feature "
            "table is still worth reading; the correlation column isn't yet.\n"
        )

    out.append("\n## Your videos, best to worst\n")
    out.append("| Metric | Title | Words | Hook | To 1st number | You/100w |")
    out.append("|---:|---|---:|---:|---:|---:|")
    for r in rows:
        f = r["feats"]
        out.append(
            f"| {r['metric']:g} | {r['title'][:48]} | {f['total_words']} | "
            f"{f['hook_words']} | {f['words_to_first_number']} | {f['you_per_100w']} |"
        )

    # Split top/bottom half and show which features actually separate them.
    half = max(1, n // 2)
    top, bottom = rows[:half], rows[-half:]
    out.append("\n## What separates your top half from your bottom half\n")
    out.append("Sorted by how strongly each feature tracks performance.\n")
    out.append("| Feature | Top half | Bottom half | Gap | Correlation |")
    out.append("|---|---:|---:|---:|---:|")

    lines = []
    for k in keys:
        t = statistics.median(r["feats"][k] for r in top)
        b = statistics.median(r["feats"][k] for r in bottom)
        c = pearson([r["feats"][k] for r in rows], [r["metric"] for r in rows])
        spread = statistics.pstdev([r["feats"][k] for r in rows]) or 1
        lines.append((abs(c) if c is not None else 0, k, t, b, (t - b) / spread, c))
    for _, k, t, b, gap, c in sorted(lines, reverse=True):
        arrow = "↑" if gap > 0.25 else ("↓" if gap < -0.25 else "·")
        out.append(f"| {k} | {t:g} | {b:g} | {arrow} {gap:+.2f}σ | "
                   f"{'—' if c is None else f'{c:+.3f}'} |")

    out.append(
        "\n*Gap is in standard deviations, so it's comparable across features. "
        "↑ means your better videos do more of it. Correlation near ±1 is a strong "
        "relationship; near 0 means that feature isn't what's driving this metric.*\n"
    )

    strong = [(k, c) for _, k, _, _, _, c in sorted(lines, reverse=True)
              if c is not None and abs(c) >= 0.4][:4]
    if strong and n >= 8:
        out.append("\n## Where to point your next script\n")
        for k, c in strong:
            direction = "more" if c > 0 else "less"
            out.append(f"- **{k}** tracks performance at r={c:+.2f} — your data says *{direction}*.")
        out.append("\nChange one of these at a time. Changing three at once tells you nothing.\n")
    elif n >= 8:
        out.append(
            "\n## Where to point your next script\n\n"
            "No feature clears r=0.4, which is itself a finding: within this set, "
            "script structure isn't what's moving your metric. If the metric was views, "
            "re-run with average view duration % — views mostly measure packaging. If it "
            "already was retention, the variation is likely in delivery, pacing or topic "
            "choice rather than structure.\n"
        )

    if bench:
        b_feats, b_count = bench
        out.append(f"\n## Benchmark — {b_count} outside transcripts\n")
        out.append("Median values, theirs against yours.\n")
        out.append("| Feature | Them | You (all) | You (top half) |")
        out.append("|---|---:|---:|---:|")
        for k in keys:
            you = statistics.median(r["feats"][k] for r in rows)
            yt = statistics.median(r["feats"][k] for r in top)
            out.append(f"| {k} | {b_feats[k]:g} | {you:g} | {yt:g} |")
        out.append(
            "\n*Differences are leads, not instructions — their audience and topic "
            "differ from yours. The useful signal is where THEIR numbers sit close to "
            "YOUR top half and far from your bottom half.*\n"
        )

    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--benchmark", metavar="DIR",
                    help="directory of outside .txt transcripts to fingerprint")
    ap.add_argument("--out", default=str(HERE / "data" / "script_report.md"))
    a = ap.parse_args()

    rows = load_corpus()
    bench = fingerprint(a.benchmark) if a.benchmark else None
    text = report(rows, bench)

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text)
    print(text)
    print(f"\nWritten to {out}")


if __name__ == "__main__":
    main()
