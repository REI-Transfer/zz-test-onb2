# Context: Views To Clients teardown

Competitive research on **Jake Trinder / Views To Clients**, a YouTube growth agency
for B2B SaaS. Goal: understand his method well enough to decide whether to run it
in-house or hire him, and fix a real problem — scripts get written, some land, and
there's no feedback loop showing which structural choices are responsible.

Started in a remote Claude Code session. **Read this before re-doing any research.**

## The constraint that shaped everything — and no longer applies

The remote session's egress policy blocked `youtube.com`, `api.apify.com`,
`viewstoclients.com` and essentially every external host. Only `googleapis.com` and
web search were reachable. That is why the findings are qualitative and why no
transcripts exist yet.

**Running locally removes this.** The blocked steps work now. Specifically:
YouTube caption tracks are served freely to ordinary viewers, and the free
`youtube-transcript-api` library works from a residential IP — it only fails on
cloud/datacenter IPs. Paid transcript services exist to sell residential proxies,
not access. On a laptop you do not need them.

## What's already established — don't re-derive

- `jake-trinder-teardown.md` is the full report. Published version:
  https://claude.ai/code/artifact/ab30cf50-10f9-4813-8f12-95b210bbf9f8
- Nine publicly named clients; six of nine are go-to-market SaaS. He owns one
  vertical rather than being a generalist.
- Scale, from his own job ads: $335k/month, 50+ channels, 100+ videos/month.
  Derived retainer: **≤ ~$6,700/channel/month**. Market is $2–15k.
- **No word-for-word script exists to copy.** Vaynerchuk recorded nothing new —
  1M views in 90 days assembled from existing keynote footage. Two production
  modes: assembled/unscripted and scripted talking-head. No scriptwriter role
  appears in any of his job postings; a dedicated thumbnail designer does.
- Six packaging devices reconstructed from real client titles, evidenced by a
  before/after inside the Glencoco channel (three company-voice titles at 15/21/24
  views alongside the first-person documentary format that followed).
- Confirmed handles: `@InstantlyAI`, `@GrowWithClay`, `@heyreach`, `@goglencoco`,
  `@SamPiliero`, `@garyvee`, `@jaketrinder`, plus `UCo7W4NdrQHLQVOjoShnaLtA`.
- All performance figures are his own unverified marketing claims. Trustpilot is
  4 stars across only 10 reviews — thin for the claimed scale. One review praises
  the craft and criticises client communication.

## The tools and how they chain

| Script | Does | Needs |
|---|---|---|
| `scrape_channels.py` | Channel catalogues + outlier scoring | YouTube Data API key — **but vidIQ Outliers already does this**, see its docstring |
| `fetch_transcripts.py` | Transcripts → `scripts/benchmark/` | `pip install youtube-transcript-api`; residential IP |
| `script_analyzer.py` | 15 structural features vs performance | Nothing — works on scripts you already have |

The user pays for **vidIQ**, which covers outlier discovery and keyword research.
It does *not* extract other channels' transcripts, and its AI Script Generator
writes new scripts rather than surfacing existing ones.

## Open work

1. Run `script_analyzer.py` on the user's own scripts first — needs no fetching,
   and may answer the question for free.
2. Use **average view duration %**, not views. Views mostly measure the thumbnail.
   If nothing correlates on views, that is expected, not a finding.
3. Then `fetch_transcripts.py` on vidIQ-surfaced outliers, and `--benchmark`.
4. Still unmeasured: view distributions, publish cadence, retention proxies.

## Gotchas worth not rediscovering

- **Auto-captions have no punctuation.** `avg_sentence_words` and
  `short_sentence_pct` are meaningless on them. The fetcher records `caption_type`
  and warns. Density and vocabulary features stay reliable.
- `script_analyzer.py` suppresses its own recommendations under n=8. Small-sample
  correlations swing wildly; that guard is deliberate.
- `fetch_transcripts.py` deliberately fetches outliers **plus each channel's two
  weakest videos**. A corpus of only winners teaches nothing — you need contrast.
- `fetch_transcripts.py`'s fetch path was never executed successfully; YouTube was
  blocked. Selection logic and failure handling are tested. Treat the first real
  local run as the true test.
- `scripts/benchmark/` is gitignored. Fetched transcripts are other people's
  content — analyse structure, don't commit or republish the prose.

## Note on scope

This directory is research and is unrelated to the Next.js survey template that is
this repo's actual purpose. Nothing here imports from or affects `app/`,
`components/` or `lib/`. If you need project-wide conventions for the app itself,
run `/init` — no root `CLAUDE.md` exists yet.
