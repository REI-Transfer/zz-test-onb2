# Your scripts go here

One plain-text file per video, plus a row in `manifest.csv`.

```
file,title,metric,label
cold-email-112-meetings.txt,How we booked 112 meetings,58,
outbound-overview.txt,Outbound considerations,21,flopped
```

## Pick the right metric

Use one consistently. In order of how much it tells you about your *writing*:

| Metric | Why |
|---|---|
| **Average view duration %** | Best. Isolates the script — packaging already did its job by the time someone is watching. |
| Average view duration (seconds) | Good, but longer videos flatter themselves. |
| Views | Worst. Mostly measures your thumbnail and title, not your script. |

Both duration metrics are in YouTube Studio under **Content → [video] → Engagement**.

If you run the analyzer on views and nothing correlates, that's expected — re-run
on retention before concluding your structure doesn't matter.

## Then

```bash
python3 research/script_analyzer.py
```

Add `--benchmark <dir>` with a folder of outside `.txt` transcripts to compare
your structure against someone else's. An Apify transcript export drops straight in.

## A caution about n

Under 8 scripts, read the feature table and ignore the correlation column. Correlations
on small samples move wildly. The tool says so in its own output.

---

## Benchmarking against other people's videos

`research/fetch_transcripts.py` pulls transcripts into `benchmark/`, ready for
`script_analyzer.py --benchmark`.

**Run it on your own machine, not in a cloud session.** That's the whole trick.
YouTube serves caption tracks freely to ordinary viewers, so a residential IP gets
them for nothing. Datacenter IPs get blocked — which is what every paid transcript
service is actually selling you. Residential proxies, not secret access.

```bash
pip install youtube-transcript-api          # free, no key
python3 research/fetch_transcripts.py --ids VIDEO_ID,VIDEO_ID
python3 research/fetch_transcripts.py --from-json research/data/videos.json
```

The second form chains onto `scrape_channels.py` and fetches **only the outliers**,
plus each channel's two weakest videos as a floor. A corpus of nothing but winners
teaches you nothing — you need the contrast.

### Auto-captions have no punctuation

This matters more than it sounds. Auto-generated captions arrive as one unpunctuated
run, so `avg_sentence_words` and `short_sentence_pct` are meaningless on them. The
fetcher records `caption_type` per video in `benchmark/index.csv` and warns you at the
end of a run.

Features that stay reliable on auto-captions: specificity density, you/I address,
open loops, corrective markers, segment markers, complex-word rate, words to first
number. Read those.

Use the fetched transcripts for structural analysis — the point is the fingerprint,
not the prose. Don't republish someone else's transcript text.
