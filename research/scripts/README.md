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
