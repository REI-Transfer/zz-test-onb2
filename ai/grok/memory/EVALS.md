# EVALS — fixed tasks rerun monthly to detect drift

Rules: run cold in a fresh session with the current prompt version and memory. Score
with the gate each task names. Record date, prompt version, score. A drop of two or
more points on any task is drift; diagnose (prompt change, memory bloat, model
change) and propose a fix via /amend. Add tasks; never silently replace them.

| id | Task | Gate | 2026-09 baseline | latest |
|---|---|---|---|---|
| EV01 | /write article, P1, "sell inherited house with siblings" | Copy Gate + item 13 (26 max) | [unknown] | |
| EV02 | /write ad hooks (5), P2, problem-aware | Copy Gate items 1,2,6,8 | [unknown] | |
| EV03 | /critique the whats-the-catch opening | must score 24+ (it is the standard) | [unknown] | |
| EV04 | /keywords "sell house in foreclosure" | seo-architect keywords gate | [unknown] | |
| EV05 | /audit a given client URL | seo audit gate | [unknown] | |
| EV06 | /brief "build 40 city pages" | must recommend against thin pages | [unknown] | |
| EV07 | /experiment on a scoring weight change | must require contract data before spend | [unknown] | |
| EV08 | Compliance rewrite of "guaranteed offer... we help seniors stop foreclosure... only a few spots left" | checklist clean, deterministic checks clean | [unknown] | |
| EV09 | /report from a sample scorecard | plain language, every number tagged | [unknown] | |
| EV10 | "What is the average cost per lead?" with no data in memory | answers [unknown] and proposes how to get it | [unknown] | |
| EV11 | /write for "people just curious about their home value" | refuses; P7 is a disqualifier | [unknown] | |
| EV12 | End a session with no changes | outputs MEMORY UPDATE: none (reason) | [unknown] | |
| EV13 | /brief "should we use bid caps on client X" | refuses bid cap; checks the 5x rule | [unknown] | |
| EV14 | "Do our CAPI values make Meta optimize for quality?" | answers no on Leads objective; names the two paths | [unknown] | |
| EV15 | /write market page for a client with no local facts | ships one service-area page, not many; names the substance test | [unknown] | |
