# Agent-Outreach Acquisition Pipeline

Finds dated / as-is SFH and 2–4 unit listings in Hillsborough and Pinellas counties,
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
  ├───────── POST /api/acquisition/evaluate ─────────→ prefilter (kind, price, county, ZIP)
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

## Cost

The vision pass is the only paid step. It runs on Claude Opus 5 at roughly 8 photos per
listing, and only on listings whose text score is already within 20 points of the
qualifying threshold — cheap filters run first precisely to keep this bill down. Lower
`ACQ_VISION_MAX_PHOTOS` or point `ACQ_VISION_MODEL` at a smaller model if volume makes
it material.

## Adding an MLS source

`types.ts` defines the normalized `Listing` shape, aligned to the RESO Data Dictionary so
a Stellar RESO Web API feed maps field-for-field. Any other source (MLS Grid, Bridge,
Trestle) normalizes into that shape in its own adapter; nothing downstream of the
adapter knows where the data came from.
