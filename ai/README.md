# ai/ — the REI Transfer AI operating system

Two agents, one memory, one doctrine.

| Layer | File | Who reads it |
|---|---|---|
| Strategist (Claude) | `../CLAUDE.md` (auto-loads), `STRATEGIST_MASTER_PROMPT.md` (long form), `STRATEGIST_RESEARCH_DIRECTIVE.md` (research-and-build brief) | Claude sessions doing strategy, systems, code, reference copy |
| Executor (Grok) | `GROK_MASTER_PROMPT.md` | Grok, as its system prompt |
| Skill modules | `grok/skills/*.md` | Grok, one per command; Claude when auditing |
| Memory | `grok/memory/*.md` | Both. Grok writes; Claude reads and audits |

## Why it is built this way

An LLM does not learn between sessions. "Self-improving" has to be engineered:

1. **Constitution** (Part A of the Grok prompt): the laws that never change. Metric,
   compliance, no invented numbers, no first-draft shipping.
2. **Operating manual** (Part B): the knowledge and processes. Grok may propose changes
   with `/amend`; William approves; the change is versioned in `CHANGELOG.md`.
3. **Memory** (`grok/memory/`): beliefs with confidence scores, an experiment log, an
   angle library, a keyword map. Grok reads them first and writes them last, every session.
4. **Gates**: the Copy Gate and the SEO audit gate force a rewrite loop instead of a
   one-shot answer. This is the direct fix for weak copy.
5. **Commands** (Part C): William drives the agent with a small vocabulary instead of
   re-explaining the business every time.

The strategist prompt exists so Claude holds the whole machine in view, designs the
systems, audits Grok's memory, and writes the reference examples Grok imitates.

## The modules (`grok/skills/`)

| Module | Owns | Invoked by |
|---|---|---|
| conductor | routing table, substrate decision, escalation | every command |
| strategist | the marketing brain, ten questions, council | /brief, /ask |
| copy-chief | personas, awareness levels, writing process, voice | /write, /critique, /angles |
| seo-architect | intent map, architecture, local, data asset, audits | /keywords, /audit |
| media-buyer | bid strategy, CAPI reality, testing, diagnostics, PPL lessons | /experiment, daily pass |
| funnel-builder | formats, fit matrix, economics | /brief on new paths |
| analyst | scorecard, joins, sample rules, scoring check, founder report | /result, /retro, /report |
| compliance | Fair Housing, TCPA, FTC, state rules, checklist, code checks | every ship |
| librarian | recall, record, retro, evals, amendments, Claude bridge | session start and end |

## Install into Grok (10 minutes)

1. Create a Grok Project (or a persistent chat). Set the system prompt / first message to
   the full text of `GROK_MASTER_PROMPT.md`.
2. Second message: paste `grok/memory/LEDGER.md`, `EXPERIMENTS.md`, `ANGLES.md`,
   `KEYWORDS.md`, `SCORECARD.md`, in that order. Third message: the skill module for
   the command you will run (or all nine). Fill in the "Business facts" section of the ledger
   first; every `[unknown]` there is a lever Grok cannot pull until it is filled.
3. Grok must acknowledge with: the track, the three most relevant beliefs, and the
   command it is about to run. If it does not, it did not read the prompt. Re-paste.
4. At the end of every session, copy each file from Grok's `MEMORY UPDATE` block back
   into `grok/memory/` and commit. That commit is the learning.
5. Weekly, run `/retro` in Grok and then have Claude read the memory directory and
   challenge it. Disagreements between the two agents are the most valuable output of
   the system; record the resolution in the ledger.

## First 30 days

| Week | Grok runs | Claude does |
|---|---|---|
| 1 | `/audit` on the target site, `/keywords` for the top two seller situations, fill business facts | Verify audit findings against the repo; decide target site and track |
| 2 | `/write` the first situational hub and two spokes (E001), `/angles` from X and forums | Critique the drafts against the library; ship them as `app/articles/*` pages |
| 3 | `/experiment` E003 (paid hooks to headlines), `/keywords` for B2B cluster | Scope the benchmark data asset (E002): what data exists, what can be published |
| 4 | `/retro`, `/report`, first `/amend` proposals | Review amendments, approve or reject, bump version |

## Rules for editing this directory

- Part A of the Grok prompt changes only by William's direct decision.
- Part B changes only through a logged amendment.
- Memory files are append-mostly. Retire, do not delete. Compress at ~400 lines.
- Never commit client-identifying lead data here. Aggregates only, anonymized.
