# EXPERIMENTS — hypothesis to result

Format per entry:

```
E### | date | track (B2B/B2C) | status (planned/running/done/killed)
Hypothesis: If we do X, metric Y moves by Z within T, because M.
Variable:            Control:
Metric:              Sample / duration:
Kill rule:
Result:              [verified/estimate/unknown]
Lesson:
Ledger ids affected:
```

## Suggested first three (planned, not yet approved)

E001 | 2026-09-03 | B2C | planned
Hypothesis: If we publish a "sell an inherited house" hub with four spokes (with siblings, with a mortgage, out of state, probate timeline), it produces first-page rankings for long-tail inherited queries within 90 days and a higher HOT+WARM share than the home page, because inheritance is a 13-point reason and a high-anxiety, high-search situation.
Variable: new hub + spokes.  Control: existing article traffic.
Metric: impressions, clicks, survey starts, HOT+WARM share.  Sample / duration: 90 days.
Kill rule: zero impressions for target queries after 45 days indicates an indexing or entity problem, not a content problem; audit before writing more.
Result: [unknown]
Lesson:
Ledger ids affected: L003, L008

E002 | 2026-09-03 | B2B | planned
Hypothesis: If we publish a benchmark page from aggregated client lead data (cost per qualified lead by seller reason and by state, anonymized), it earns at least 10 referring domains and 5 inbound investor inquiries within 120 days, because no competitor publishes first-party data.
Variable: data asset + light outreach.  Control: none (new asset).
Metric: referring domains, AI-answer citations, B2B form fills.
Kill rule: if legal or client agreements block aggregate publication, stop and redesign as a gated report.
Result: [unknown]
Lesson:
Ledger ids affected: L005

E003 | 2026-09-03 | B2C | planned
Hypothesis: If the top three paid ad hooks by cost per qualified lead are rewritten as article headlines and H2s, those articles outperform the library average on survey-start rate within 60 days, because the hook has already proven it selects the right reader.
Variable: headline/H2 rewrite.  Control: current headlines.
Metric: survey starts per 100 article readers.
Kill rule: fewer than 200 readers per variant after 60 days is not enough sample; extend.
Result: [unknown]
Lesson:
Ledger ids affected: L006, L007

E004 | 2026-09-03 | B2C | planned (build, not test)
Hypothesis: If the webhook payload carries lead_id, gclid, fbclid, fbp, fbc, UTMs and landing path, and client CRMs echo lead_id on Contacted / Appointment / Contract, then within 90 days we can publish contract rate by bucket, reason and timeline per client, because the join exists end to end.
Variable: payload fields + CRM echo.  Control: none (instrumentation).
Metric: percent of leads with a CRM stage returned.  Sample / duration: 90 days.
Kill rule: if fewer than 3 clients can return stages, pool signal at agency level instead.
Result: [unknown]
Lesson:
Ledger ids affected: L001, L019

E005 | 2026-09-03 | B2C | planned
Hypothesis: If eligible accounts run a custom QualifiedLead event with the raw 0-125 score as value under a value-optimizing objective (or Conversion Leads with CRM stages where volume clears ~50/week), cost per qualified lead falls 10-20% within 4 weeks after learning, because Meta currently receives the values as labels, not as an optimization signal.
Variable: objective and event.  Control: current Leads objective campaign, same creatives.
Metric: CPQL, percent HOT+WARM.  Sample / duration: 50+ leads per arm, 4 weeks after learning.
Kill rule: account cannot reach ~100 valued events with 5 distinct values in 14 days; stay on Leads and revisit when volume allows.
Result: [unknown]
Lesson:
Ledger ids affected: L009, L010

E006 | 2026-09-03 | B2C | planned (compliance build)
Hypothesis: Adding an env-driven TCPA consent line and consent record to the survey does not reduce survey completion by more than 5% relative, because the line appears at the final step after commitment.
Variable: consent line.  Control: legacy form on clients not yet opted in.
Metric: step-final completion rate.  Sample / duration: 200 completions per arm.
Kill rule: none; the line ships regardless (legal), the test only sizes the cost.
Result: [unknown]
Lesson:
Ledger ids affected: L012
