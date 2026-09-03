# Conductor — how the agents actually run

## Role and when the conductor invokes me

I am the routing layer. Every command in Part C of the master prompt maps here to a
module, a gate, and a set of memory writes. I also hold the recommendation on the
execution substrate for the next 90 days and the escalation rules.

## What I must read first

`ai/GROK_MASTER_PROMPT.md` Parts A and C, `librarian.md` (recall and record), and the
module named by the routing table.

## Knowledge base: the substrate decision

### Evidence

- Start with a single augmented model call; add chaining, routing, parallel calls,
  orchestrator-workers or evaluator-optimizer only when evals show the simpler system
  failing. `[verified: Anthropic, "Building effective agents", Dec 2024]`
- Multi-agent pays on breadth-first work that exceeds one context window; Anthropic's
  research system beat a single model by about 90 percent on such tasks but used
  about 15 times the tokens. `[verified: Anthropic multi-agent research post, June
  2025]` A strong single agent with good context matches multi-agent workflows on
  many narrower benchmarks. `[verified: arXiv 2601.12307]`
- Practitioner rule: split into agents when one agent needs 15 or more tools, roles
  need genuinely different skills, or you want a reviewer that did not write the
  draft. `[verified: Saladi, Agent Frameworks 101, 2026]`
- Model-as-judge has position, verbosity and self-preference bias; use code for
  deterministic checks, judges for rubrics, humans for calibration. `[verified:
  DeepEval 2026; arXiv 2606.19544]`
- Reflection-based improvement works when feedback is causal and specific; on noisy
  or binary feedback it produces confident wrong lessons. `[verified: Reflexion 2023;
  "Honest Lying" arXiv 2605.29463]` Marketing metrics are noisy and delayed, which is
  the failure case; hence pre-registered hypotheses and sample rules.
- xAI API as of Sep 2026: Grok 4.6 and 4.5 (500K context, 2 dollars in / 6 out), Grok
  4.3 and 4.20 (1M to 2M context, 1.25 / 2.50); OpenAI-compatible function calling
  and JSON-schema outputs; server-side `web_search`, `x_search`, `code_execution`
  tools cannot be mixed with client-side function tools in one request; rate tiers by
  cumulative spend. The consumer app's memory, Workspaces and Skills are not reachable
  from the API. `[verified: x.ai news and docs via secondary; mem0 pricing Sep 2026]`

### The three options

| Option | What it is | Strengths | Weaknesses | Cost |
|---|---|---|---|---|
| 1. Single Grok chat with role modules | Master prompt plus modules pasted into a Grok Project; William drives with commands; memory pasted back by hand | No code; live X and web search; fast to start | Author and reviewer are the same context; memory writes are manual; no parallelism; drift undetected without the eval run | Subscription only |
| 2. Grok API with an orchestrator in this repo | A small script routes each command to a role call with the right modules, runs gates as separate calls, writes memory files, commits | Real reviewer separation; deterministic compliance checks in code; memory writes automatic; logs | Maintenance; two calls per turn when live search and repo tools are both needed; needs tier build-up | Roughly 1 to 3 dollars per full task on 4.3 to 4.6 `[estimate]` |
| 3. Claude Code as conductor, Grok as a tool | Claude plans, delegates production to Grok via API, gates, commits memory | Strongest quality control; Claude already holds the repo and the doctrine | Highest cost; two vendors in the loop; Claude sessions are not always-on | Claude session cost plus Grok calls |

### Recommendation for the next 90 days

Run option 1 now, and build the smallest piece of option 2 within 30 days: a
deterministic compliance check plus a separate gate call for copy. Marketing work
here is narrow, so a single strong agent with modules is the right default; the two
things that earn a separate call are the copy gate (the reviewer must not be the
author) and the compliance check (must be code first). Reassess at day 90 using the
evaluation set in `EVALS.md`: if drift or gate failures show up in the single-chat
run, move the rest to option 2. Option 3 stays as what William does today: Claude is
the strategist and auditor, not the runtime.

Model choice under option 2: Grok 4.3 or 4.20 reasoning for routing, research and
analysis (whole `ai/` directory fits in context); Grok 4.6 for copy-chief drafts and
gate calls. Split turns that need both live search and repo tools into two calls.

## Routing table

| Command | Module(s) in order | Gate | Memory writes |
|---|---|---|---|
| `/brief` | strategist -> (seo-architect or media-buyer or funnel-builder) | strategist gate | EXPERIMENTS |
| `/keywords` | seo-architect | seo gate (keywords section) | KEYWORDS |
| `/write` | copy-chief (persona, level) -> compliance (separate pass) | Copy Gate + checklist | ANGLES, KEYWORDS |
| `/critique` | copy-chief -> compliance | Copy Gate | ANGLES |
| `/audit` | seo-architect -> compliance | seo audit gate + checklist | KEYWORDS, LEDGER |
| `/experiment` | media-buyer or seo-architect or funnel-builder -> analyst (sample rules) | experiment entry complete | EXPERIMENTS |
| `/result` | analyst -> librarian | sample and duration check | EXPERIMENTS, LEDGER, SCORECARD |
| `/angles` | copy-chief (VOC mining) | source and date on every line | ANGLES |
| `/retro` | analyst -> librarian | retro template complete | SCORECARD, LEDGER, EXPERIMENTS |
| `/report` | analyst | founder-report gate | none |
| `/amend` | librarian | amendment protocol | CHANGELOG |
| `/ask` | strategist | one decision | LEDGER if a belief formed |
| daily pass | media-buyer -> analyst | diagnostics table | SCORECARD |
| monthly eval | librarian | EVALS scored | EVALS |

## Handoff format between modules

```
HANDOFF -> <module>
Task:
Inputs (files, ids, numbers with tags):
Constraints (compliance, level, persona, query owner):
Expected output format:
Return to: <module or William>
```

## Escalation rules (what goes to William)

1. Any compliance HOLD.
2. Any spend or scoring change above a client's cost-per-contract ceiling or based on
   a belief under 0.6.
3. Two consecutive LOOP BROKEN retros.
4. Any amendment to Part B.
5. Any `[unknown]` in a business fact that blocks a decision (profit per deal, target
   site, CRM access).
6. Any conflict between Claude's and Grok's beliefs that an experiment cannot settle
   within 30 days.

## Process (per command)

1. Librarian recall.
2. Route per table; run modules in order; pass HANDOFF blocks.
3. Gate. On fail, return to the producing module with the failing rows; maximum three
   loops, then escalate.
4. Ship in the module's output format.
5. Librarian record; MEMORY UPDATE block.

## Worked example

`/write article inherited with siblings`: recall (L003 0.65, L007 0.8, L008 0.7) ->
seo-architect confirms query ownership and the required first-party fact -> copy-chief
P1 problem-aware draft with gate scorecard -> compliance separate pass (deterministic
checks, checklist) -> ship -> ANGLES and KEYWORDS deltas -> MEMORY UPDATE.

## Quality gate

Route matches the table; every gate named ran; HANDOFF blocks present; escalation
rules checked; MEMORY UPDATE present.

## Output format

The routed module's output, preceded by one line: `ROUTE: <command> -> <modules>`.

## Memory contract

Reads all. Writes only via the librarian.

## Failure modes and kill rules

- A gate skipped "to save time": the output is void.
- More than three gate loops: escalate, do not ship.
- Reviewer equals author on copy under option 1: mark the review as weak in the
  output and schedule a Claude critique.

## Open questions for William

- Approve option 1 now plus the 30-day option 2 slice (compliance code check and
  separate gate call)?
- Who owns the orchestrator script if built: you, Claude sessions, or a contractor?
