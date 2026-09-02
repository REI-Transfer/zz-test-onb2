# Agent-Outreach Acquisition Pipeline

Finds dated / as-is SFH and 1–4 unit listings at or above 1,200 heated sqft,
prices them, and renders a cash LOI addressed to the **listing agent**.

This is the outbound acquisition engine. It is unrelated to the seller survey funnel in
`app/` — they share a repo and nothing else.

## Flow

```
n8n (scheduled)                          this repo
──────────────                           ─────────
Stellar MLS RESO feed poll
  ↓ normalize to Listing shape
DealMachine enrichment
  (equity / liens, ARV comps)
  ↓
  ├───────── POST /api/acquisition/evaluate ─────────→ prefilter (kind, price, county, ZIP,
  │                                                              days on market)
  │                                                     ↓
  │                                                    condition: remarks NLP  (condition.ts)
  │                                                     + photo vision         (vision.ts)
  │                                                     ↓
  │                                                    repairs by tier × sqft  (repairs.ts)
  │                                                     ↓
  │                                                    offer = ARV×0.75 − repairs
  │                                                     + hard guards + confidence gate
  │                                                     ↓
  ←───── { decision, offer, loi } ──────────────────── LOI render (loi.ts)
  ↓
decision === SEND    → send LOI, log to send ledger
decision === REVIEW  → queue for human, or drop into a GHL pipeline
decision === REJECT  → record and move on
```

The endpoint **decides and renders; it never sends.** Delivery, suppression lists, and
the daily send ledger belong in n8n where a run can be inspected and replayed.

## Decisions

| Decision | Meaning |
|---|---|
| `SEND`   | Cleared every hard guard and the confidence threshold |
| `REVIEW` | Economically plausible but under-evidenced — held for a human |
| `REJECT` | Failed a hard guard; no offer worth making exists |

`REVIEW` is not a soft reject. Held deals are still deals — work that queue.

## Before you enable auto-send

1. **Calibrate the repair rates.** Every dollar figure in `config.ts` is a placeholder.
   They are plausible Tampa numbers, not researched ones. Set them from your own closed
   rehabs or the pipeline will confidently mail wrong offers at volume.
2. **Have an attorney review `loi.ts`.** It is written as an expressly non-binding
   expression of interest, but it is going out under your name at volume.
3. **Set `LOI_FL_LICENSE_NUMBER`.** Florida licensees buying for their own account must
   disclose licensed status in writing (Fla. Stat. ch. 475). Setting it renders the
   disclosure paragraph into every letter.
4. **Warm the sending domain.** Send from a dedicated subdomain with SPF/DKIM/DMARC, and
   leave `MAX_AUTO_SENDS_PER_DAY` low at first. Blasting listing agents from a cold
   domain gets you spam-foldered, and Tampa/St. Pete is a small enough market that
   reputation damage with agents compounds.
5. **Run the smoke test** after changing any weight: `npx tsx scripts/verify-acquisition.ts`

`AUTO_SEND_ENABLED` defaults to `false`, and every offer routes to `REVIEW` until it is
explicitly set to `"true"`.

## Safety properties worth knowing

- **No photos → no auto-send.** A condition read unverified by photos always holds for
  review, so disabling vision disables auto-send entirely.
- **Short-sale detection.** When DealMachine reports encumbrances above the offer, the
  seller cannot accept without lender approval — held, not sent.
- **ARV sanity check.** An offer at or above list price means the ARV is almost certainly
  overstated; held rather than sent.
- **Fail-closed auth.** `/api/acquisition/evaluate` refuses every request when
  `ACQ_API_SECRET` is unset, rather than running open.
- **Fresh listings are rejected, not queued.** `MIN_DAYS_ON_MARKET` (default 21) drops
  anything newer in the prefilter, before the paid vision pass. Day one is the one day
  a below-list cash offer cannot land: the seller is still anchored on list price and
  their agent has just finished telling them they will get it. Missing days on market
  counts as day zero — not knowing how long it sat is not evidence that it sat.
  A qualifying price cut waives the floor (see below).
- **One agent, two threads.** `MAX_ACTIVE_THREADS_PER_AGENT` (default 2) holds a
  listing for review when its agent already has that many live threads. Suppression
  catches agents who have opted out; this is what stops you earning the opt-out. An
  agent with eight dated listings would otherwise collect eight LOIs plus up to
  twenty-four follow-ups inside fourteen days.

## Cost

The vision pass is the only paid step. It runs on Claude Opus 5 at roughly 8 photos per
listing, and only on listings that cleared the free prefilter (including the
`MIN_DAYS_ON_MARKET` floor) and whose text score is already within 20 points of the
qualifying threshold — cheap filters run first precisely to keep this bill down. Lower
`ACQ_VISION_MAX_PHOTOS` or point `ACQ_VISION_MODEL` at a smaller model if volume makes
it material.

## Email negotiation (`negotiation/`)

Once an LOI goes out, inbound replies flow through `POST /api/acquisition/reply`:

```
classify (LLM, data-only) → decide (code) → draft (LLM, prose only) → validate (code)
```

**The model never chooses a number.** `policy.ts` computes every price from the
concession ladder; the model classifies what came back and writes prose around a
number already decided. That makes a successful prompt injection in an agent's email
a wording nuisance rather than a financial event.

Two rules are not configurable, on purpose:

- **The bot never accepts.** A counter inside your authority escalates to you, and you
  write the contract. Automated systems should not create binding obligations to buy
  real property.
- **The bot never bids against itself.** A rejection with no counter triggers no
  concession — only a live counter above your standing number does.

Authority: offers open at `ARV × 0.75 − repairs` and can reach
`ARV × NEGOTIATION_MAX_ARV_MULTIPLIER − repairs` across three shrinking concessions.
`validateOutboundOffer()` re-checks every number immediately before send, independent
of the model, and fails closed to a human.

Escalates to you: counter within authority, acceptance, new facts that change the
underwriting, ladder exhausted, unclassifiable reply, or any message containing text
addressed at an automated system.

## Feedback loop (`outcomes.ts`)

A **calibration** loop, not a learning system. It logs predictions, joins them to
outcomes, measures error, and *proposes* bounded config changes for you to approve.
It never applies them.

That restraint is statistical, not timid. At ~500 sends and 1–3 contracts a month, with
repair ground truth arriving months later, fitting anything to that volume chases noise.
Signal quality, best first:

1. **Repair estimates vs. real invoices** — exact ground truth; 8–10 rehabs reveal bias.
2. **Condition tier vs. walked properties** — cheap, fast, learned every site visit.
3. **Agent replies as free labels** — "roof was done in 2023" is a human correcting your
   condition read at no cost. Highest-volume ground truth you have.
4. **Email A/B on reply rate** — run *quarterly*. `requiredSampleForLift(0.05, 0.07)`
   returns ~2,200 per arm; a month of sending cannot settle it.

Proposals are clamped to ±20% per cycle and flagged non-actionable below minimum
sample size. **`OFFER_ARV_MULTIPLIER` has no proposal path at all** — acceptance rate
rises monotonically as you pay more, so an optimizer pointed at it converges on paying
full price, having correctly maximized the metric it was given.

## Statewide scope

`ACQ_ALLOWED_COUNTIES` is empty by default — all 67 counties. Two things change with
scope, and both are handled in code rather than by narrowing the filter:

**Regional cost bands** (`regions.ts`). A flat repair rate is not defensible statewide:
Miami-Dade and Monroe run materially hotter than the Panhandle on labour, permitting and
insurance. Counties map to four bands (PREMIUM 1.35x / METRO 1.10x / STANDARD 1.00x /
RURAL 0.85x) multiplying the base per-sqft rate. The ranking is stable; the magnitudes
are placeholders to calibrate.

Note the interaction: a listing that pencils in Tampa can correctly REJECT in Miami-Dade,
because higher rehab costs push the offer under `MIN_OFFER_RATIO_OF_LIST`. That is the
bands working.

**Send priority** (`priority.ts`). Statewide, far more listings qualify than the daily
cap allows, so the cap becomes binding and order becomes strategy. Every evaluation
carries a 0-100 `priority` blending confidence (0.40), offer-to-list proximity (0.30),
days on market (0.25, saturating at 90 days) and deal size (0.05). Work the queue
best-first — `acq_send_queue` in migrations 0002 and 0004 does this, and it also
excludes suppressed agents and agents already at their thread cap, both of which matter
more statewide since a feed will surface listings from agents you are already working
in another county.

**A price cut before first contact scores 100 and goes to the front.** `T5_PRICE_CUT`
was re-engagement only, which left the strongest signal in the system doing nothing for
the listings it says the most about — a house that cut its price before anyone wrote to
it got no boost at all, and under `MIN_DAYS_ON_MARKET` could not be mailed at all. A
reduction is a public admission that the market disagreed with the seller, it arrives
with expectations already lowered by someone other than you, and it is perishable:
every other cash buyer watching the feed sees it the same day. Pass
`previousListPrice` to `/evaluate` and `priceCutEntry()` (in `outreach/sequence.ts`)
does the rest — it waives the days-on-market floor and jumps the queue. Ties break on
`decided_at` ascending, so the earliest-detected cut still goes first. The endpoint has
no memory: a reduction it is not told about did not happen.

**Flood exposure is a crude proxy right now.** `hasCoastalExposure()` holds ten counties
(the Keys, the Ian corridor, the Big Bend) for review. Flood risk is a *property-level*
attribute, so the correct implementation is a per-parcel FEMA National Flood Hazard Layer
lookup — a free API. The county list is deliberately narrow until that exists, because
flagging every coastal Florida county would hold half the state.

## Orchestration and persistence

n8n runs the pipeline; see `n8n/README.md` for the two importable workflows and the
what-lives-where split. The short version: n8n owns scheduling, delivery, retries and
persistence; this module owns every decision that costs money if it is wrong.

**State lives in Supabase** — `supabase/migrations/0001_acquisition_pipeline.sql`,
with `0002` (send queue), `0003` (sequence state, call alerts) and `0004` (per-agent
cap) on top. `0004` adds `acq_predictions.agent_email`, which intake must now write:
the queue could not previously see who was being mailed, so it could not cap anyone.
Its cap literal is `2` and has to be kept in step with `MAX_ACTIVE_THREADS_PER_AGENT`
by hand — SQL cannot read the app's env. The
endpoints are stateless by design, so without those tables n8n has no memory between
runs and every reply reads as the first message in its thread. The schema also carries
the suppression list (checked before any send), the send ledger (backs the daily cap),
and the prediction/outcome ledger the calibration loop reads.

## Adding an MLS source

`types.ts` defines the normalized `Listing` shape, aligned to the RESO Data Dictionary so
a Stellar RESO Web API feed maps field-for-field. Any other source (MLS Grid, Bridge,
Trestle) normalizes into that shape in its own adapter; nothing downstream of the
adapter knows where the data came from.

## Before wiring this to Elevate's GoHighLevel

This module does not touch GHL. There is no client, no credential read, and no
call that creates a contact or an opportunity; the single mention of one is a
comment in `offer.ts` describing where a price would agree with a CRM record if
one existed. That absence is the reason the following risk is currently
theoretical, and it stops being theoretical the moment somebody adds the
integration.

Elevate's location carries **54 published workflows**. Several fire on a new
opportunity or a new contact and send SMS on their own:

- `New Opportunity Intro SMS` (`9dad9b25-e5be-426e-b563-4953a7ba8d11`)
- `WF-01 Speed to Lead` (`4a56ee70-ae15-4f3a-add0-981d440d2ad7`)
- `Email Campaigns for New Inbound lead` (`4f68d1a6-28ca-4bef-895b-18e815fcb093`)
- `Call in Create + Update Opportunity` (`995cb94e-4453-49d7-857f-e38bfa576239`)

Every one of those was written for **motivated sellers**: people in distress who
asked for a call. The outreach targets here are **licensed listing agents** doing
their job. Dropping an agent into that location as an opportunity would text a
distressed-seller script to a fiduciary, from the client's own number, in a state
where that is one complaint away from their broker and their board.

So, before any GHL write:

1. Read the trigger config of all 54. It is not exposed by the API and lives in a
   Firebase blob, so this is a UI job, and the browser session for
   `ghl-workflow-editor` has to be re-established first.
2. Give agent opportunities their own pipeline, and confirm every seller workflow
   is scoped to the seller pipeline or gated on a tag agents never carry.
3. Test with one contact you control before the second one exists.

An opportunity is created once and read by everything in the account. There is no
version of this where you find out gently.
