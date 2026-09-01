/**
 * lib/acquisition/outreach/templates.ts — The follow-up sequence copy.
 *
 * WHY THESE ARE FIXED TEMPLATES AND NOT MODEL-GENERATED
 *
 * The LOI itself is rendered per-property because it carries property-specific
 * arithmetic. The follow-ups are not: they are campaign copy, and campaign copy has to
 * be STABLE to be testable. You cannot A/B a subject line that is rewritten every send
 * — there is no variant to measure, only noise. Fixed variants with an id are what let
 * outcomes.ts eventually tell you which one earns replies.
 *
 * SEQUENCE DESIGN
 *
 * One email is not outreach, it is a lottery ticket. Most replies to cold B2B sequences
 * arrive on touches 2-4, and the reason is not persistence — it is that each touch has
 * to answer a DIFFERENT silent objection:
 *
 *   Touch 1  "What's the offer?"          → the LOI. Priced, specific, showing the math.
 *   Touch 2  "Are you actually real?"     → proof of funds, closed deals, entity name.
 *   Touch 3  "The price doesn't work."    → non-price levers. Terms, timing, certainty.
 *   Touch 4  "I've moved on."             → the takeaway. Close the file, leave it open.
 *   Touch 5  (event) "Price just dropped" → re-underwrite and come back with a number.
 *
 * A follow-up that just says "bumping this" answers no objection and trains the reader
 * to ignore the thread. Every touch below adds information the previous one did not
 * contain.
 */

export type TouchId = "T1_LOI" | "T2_CREDIBILITY" | "T3_TERMS" | "T4_TAKEAWAY" | "T5_PRICE_CUT"

export type TouchTemplate = {
  id: TouchId
  /** Stable variant id — this is the unit the A/B test measures. */
  variant: string
  /** Days after the LOI. Null means event-driven, not scheduled. */
  dayOffset: number | null
  /** Empty subject continues the existing thread rather than starting a new one. */
  subject: string
  body: string
  /** The silent objection this touch exists to answer. Documentation, not sent. */
  answers: string
  /**
   * Optional SMS companion, sent shortly after the email in the same step.
   *
   * NOT a shortened email, and NOT a second copy of the offer. Its only job is to get
   * the letter opened by someone who is out on showings. So it names the property and
   * who is writing, points at the inbox, and stops.
   *
   * Deliberately no price. A number in a text invites a yes or no on the number alone,
   * before the agent has seen the arithmetic that makes it defensible, and a lowball
   * read cold on a phone screen gets deleted. The email is where the case lives; the
   * text exists to get it read.
   *
   * Opt-out language appears on the FIRST message only. Carriers honour STOP whether
   * or not it is printed, and repeating it every time is noise, but A2P campaigns get
   * filtered when the opening message carries no disclosure at all.
   *
   * DELIVERY IS GATED. See ACQ_SMS_ENABLED in config: these are written and rendered
   * but not wired to a sender, because Florida's Telephone Solicitation Act requires
   * prior express written consent for commercial texts and carries a private right of
   * action with per-message statutory damages. Every one of these numbers is a Florida
   * mobile. The copy is ready for the day that question is answered.
   */
  smsBody?: string
}

export type MergeFields = {
  agentFirstName: string
  street: string
  city: string
  listingId: string
  offerPrice: string
  listPrice: string
  buyerEntity: string
  signerName: string
  signerTitle: string
  phone: string
  county: string
  closingDays: number
  inspectionDays: number
  /** Deals closed in this county, if you have the number. Empty hides the sentence. */
  closedInCounty: string
  newListPrice: string
}

/**
 * Touch 2 — credibility.
 *
 * The single most common reason a listing agent ignores a cash offer is that they
 * cannot tell you apart from the twenty wholesalers who mailed them the same week and
 * could not close. This touch exists to answer that and nothing else. It deliberately
 * does not restate the price: repeating a number they already declined reads as
 * pressure, and the objection here is not price.
 */
const T2: TouchTemplate = {
  id: "T2_CREDIBILITY",
  variant: "v1-proof",
  dayOffset: 3,
  subject: "",
  body: `Hi {{agentFirstName}},

Before you spend any time on my offer for {{street}}, here's how to check we're a real buyer.

{{buyerEntity}} buys with our own funds. Happy to send proof of funds and a title company reference today, and you're welcome to call any of them. We close on our own timeline and we don't reassign contracts to a third party after you've taken it to your seller.

If your seller isn't entertaining offers below list right now, that's a fair answer and I'll leave it. If they'd look at a clean cash close, I'm ready to move.

{{signerName}}
{{signerTitle}} · {{buyerEntity}}{{phoneLine}}`,
  smsBody: `{{agentFirstName}}, {{signerName}} at {{buyerEntity}} again on {{street}}. Sent proof of funds and a title company reference to your email, both easy to verify. Worth two minutes before you write us off.`,
  answers: "Are you a real buyer, or another wholesaler who will tie up my listing and vanish?",
}

/**
 * Touch 3 — terms.
 *
 * The real sales move in the sequence. An agent who declined on price declined on ONE
 * variable, and price is rarely the only thing a seller is optimising. Certainty of
 * close, a chosen closing date, and staying in the house after closing are all worth
 * real money to the right seller and cost a cash buyer very little.
 *
 * This is also the touch most likely to produce a NEW_INFORMATION reply — which is the
 * highest-value reply type in the whole system, because it is a human correcting your
 * underwriting for free.
 */
const T3: TouchTemplate = {
  id: "T3_TERMS",
  variant: "v1-levers",
  dayOffset: 7,
  subject: "",
  body: `Hi {{agentFirstName}},

No reply on {{street}}, so I'll assume the number was the sticking point. Fair enough. Price is one lever and it's usually not the only one that matters to a seller.

Things we can move that don't cost your seller anything:

  · Closing date: {{closingDays}} days, or 90 if they need time to find their next place
  · Post-closing occupancy: they can stay after we close, rent-free, we've done it before
  · Inspection: we can shorten the {{inspectionDays}}-day period, or waive repair requests entirely
  · Certainty: no financing, no appraisal, no lender to fall through

If any of that changes the picture, tell me which one matters and I'll put it in writing.

And if I've got the condition wrong, if the roof, HVAC or electrical has been done recently and it isn't in the listing, send it over and I'll requote the same day. My number moves with the scope.

{{signerName}}
{{signerTitle}} · {{buyerEntity}}{{phoneLine}}`,
  smsBody: `{{agentFirstName}}, {{signerName}} at {{buyerEntity}}. Followed up by email on {{street}}. If price is the sticking point there is more room on terms than on the number. Details are in there.`,
  answers: "The price doesn't work for my seller.",
}

/**
 * Touch 4 — the takeaway.
 *
 * Closing the file is not a threat and must not read as one. It works because it is
 * true and it removes the obligation to reply, which is exactly what makes people
 * reply. The standing-offer line is the important half: it converts a dead thread into
 * a dormant one that a price cut can wake up.
 */
const T4: TouchTemplate = {
  id: "T4_TAKEAWAY",
  variant: "v1-standing",
  dayOffset: 14,
  subject: "Closing our file on {{street}}",
  body: `Hi {{agentFirstName}},

I'm closing our file on {{street}} so I stop cluttering your inbox.

Our offer at {{offerPrice}} stands if anything changes. If it's still sitting in 30 or 60 days, or your seller's timeline shifts, reply to this email and we can pick it straight back up. No need to start over.

Either way, good luck with it. If you get other dated inventory in {{county}} County that needs a cash buyer, I'd rather hear from you early than see it on the MLS.

{{signerName}}
{{signerTitle}} · {{buyerEntity}}{{phoneLine}}`,
  smsBody: `{{agentFirstName}}, closing our file on {{street}} so I stop bothering you. The last email has what still stands if anything changes. {{signerName}}, {{buyerEntity}}.`,
  answers: "I've moved on / this thread is dead.",
}

/**
 * Touch 5 — price cut re-engagement. EVENT-DRIVEN, not scheduled.
 *
 * The highest-conversion touch in the sequence, and the one most operations never
 * build. A price reduction is a public admission that the market disagreed with the
 * seller, and it arrives with the seller's expectations already lowered by someone
 * other than you. Your unchanged offer is more attractive than it was last week
 * without you having moved at all.
 *
 * Fires on an MLS price-change event for a listing already in a DEAD or dormant
 * thread — the reason the intake workflow watches modified listings, not just new ones.
 */
const T5: TouchTemplate = {
  id: "T5_PRICE_CUT",
  variant: "v1-reduction",
  dayOffset: null,
  subject: "Re: {{street}}, saw the price change",
  body: `Hi {{agentFirstName}},

Saw {{street}} came down to {{newListPrice}}.

Our offer at {{offerPrice}} is still good, and it's cash with no financing or appraisal contingency, so it closes in {{closingDays}} days regardless of what an appraiser thinks. If your seller has adjusted expectations, this might be a better fit than it was when I first wrote.

If we're still apart, tell me where they need to be and I'll tell you straight away whether we can get there. I'd rather give you a fast no than waste your time.

{{signerName}}
{{signerTitle}} · {{buyerEntity}}{{phoneLine}}`,
  smsBody: `{{agentFirstName}}, saw {{street}} came down. Just emailed you, our offer still stands and has not changed. {{signerName}}, {{buyerEntity}}.`,
  answers: "Circumstances changed and your old offer is worth another look.",
}

/**
 * Day 0 SMS companion to the letter of intent.
 *
 * The message William described: tell them the letter exists so it gets opened. It
 * deliberately does NOT negotiate, restate terms or ask a question that needs a
 * considered answer, because the email already does all three and a text that tries to
 * do the same is just a worse email.
 */
export const T1_SMS = `{{agentFirstName}}, {{signerName}} with {{buyerEntity}}, a Tampa Bay homebuying company. Just emailed you a written cash offer on {{street}}. Sending this so it does not sit in spam. Reply STOP to opt out.`

export const SEQUENCE: TouchTemplate[] = [T2, T3, T4]
export const EVENT_TOUCHES: TouchTemplate[] = [T5]

/** Subject-line variants for the LOI itself — the only touch with enough volume to test. */
export const LOI_SUBJECT_VARIANTS: Record<string, string> = {
  "v1-plain":   "Cash offer: {{street}}, {{city}} (MLS# {{listingId}})",
  "v2-terms":   "{{offerPrice}} cash, {{closingDays}}-day close on {{street}}",
  "v3-question": "Is your seller on {{street}} open to a cash offer?",
}

/** Fill merge fields. Unknown placeholders are left intact so they fail loudly in review. */
export function render(template: string, fields: Partial<MergeFields>): string {
  const phoneLine = fields.phone ? `\n${fields.phone}` : ""
  const all: Record<string, string> = {
    ...(fields as Record<string, string>),
    phoneLine,
    closingDays: String(fields.closingDays ?? ""),
    inspectionDays: String(fields.inspectionDays ?? ""),
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    all[key] !== undefined && all[key] !== "" ? all[key] : key === "phoneLine" ? "" : match,
  )
}
