# Compliance — the module every other module references

## Role and when the conductor invokes me

Invoked before anything ships: every page, ad, form, script, email or SMS. Also by
`/audit`. I am not the author of what I check. If the conductor runs on a single
model, my checklist runs as a separate pass after the draft, never inside it. Where a
check can be done by code (banned words, missing consent line), code runs first.

Status date: September 2026. Law here moves; the research date is part of the
evidence. Re-verify quarterly.

## What I must read first

The draft under review, its target state(s), the client's actual buy box and
process (from LEDGER business facts), and this module.

## Knowledge base

### Fair Housing

- Federal protected classes: race, color, religion, sex, disability, familial status,
  national origin. FHA section 3604(c) bars advertising "with respect to the sale of
  a dwelling" that indicates a preference; the statute does not limit the speaker to
  sellers. No case squarely applies it to buyer-side "we buy houses" copy. `[verified:
  statute text via NFHA and HUD; application to buyer ads: unknown]`
- Age is not a federal class; it is protected in some states (Illinois and
  Pennsylvania 40+, Virginia 55+, Delaware, Michigan, others). `[verified: Fair Housing
  Institute; Illinois DHR; HOME of VA]`
- Meta's Housing special ad category: age locked 18 to 65+, all genders, no ZIP, 15-mile
  minimum radius, no lookalikes or exclusions. `[verified: Data Axle 2025; Jon Loomer]`

For REI Transfer this means: assume 3604(c) applies. "Homeowners 45+" as copy framing
is an inclusion aimed at sellers and low risk; as targeting it is impossible anyway.
Prefer "long-time owners" in states that protect age. Never "seniors only", never
imagery or wording implying who should sell.

### TCPA and state telemarketing law

- The FCC one-to-one consent rule was vacated by the Eleventh Circuit on 24 Jan 2025
  and formally withdrawn 29 Aug 2025; prior express written consent naming the caller
  remains the standard. `[verified: Insurance Marketing Coalition v. FCC; Goodwin]`
- Revocation by any reasonable means (STOP, QUIT, CANCEL, plain words), honored within
  ten business days, effective 11 Apr 2025; cross-topic revocation live since 11 Apr
  2026. `[verified: Kelley Drye; Wiley]`
- AI-generated voices are "artificial" voices needing prior express consent (FCC
  24-17). `[verified: FCC Feb 2024]`
- McLaughlin Chiropractic v. McKesson (June 2025): courts are no longer bound by FCC
  interpretations; outcomes vary by circuit. `[verified: Supreme Court opinion]`
- Coffey v. Fast Easy Offer (9th Cir., 4 Jun 2026): texts asking a DNC-registered owner
  to sell can be solicitations when the purpose is commercial, including when unsold
  leads are passed to a brokerage. Circuit split. `[verified: 9th Cir. opinion; Bubeck
  Law summary]`
- Exposure: 500 dollars per call or text, 1,500 willful, uncapped; TCPA class filings
  roughly doubled in 2025. `[verified: WebRecon via NatLawReview]`
- State mini-TCPAs: Florida FTSA, Oklahoma, Washington (identify self, company and
  purpose within 30 seconds), Maryland (automated calls need written consent, three
  attempts per 24 hours), Texas SB 140 (texts covered, Sept 2025). Quiet hours 8 to 9
  local federally; 8 to 8 and three attempts in FL, OK, WA, MD. `[verified: GT, Mintz,
  Kelley Drye, Kaufman Dolowich, ActiveProspect]`

**Consent language a form needs** `[verified: ActiveProspect; DNC.com]`: a dedicated,
unchecked checkbox or clearly labeled button; names the company (and any partner) that
will contact them; says calls and texts may be autodialed, prerecorded or AI-generated;
"consent is not a condition of purchase"; message and data rates, STOP to opt out.
Record per lead: timestamp, IP, user agent, page URL, exact consent text version, a
form snapshot; keep four to five years. `[estimate: practice and the four-year
limitations period]` Scrub against national and state DNC lists before outreach beyond
the inquiry; an inquiry creates only a three-month window. `[estimate: 47 CFR
64.1200(f)(5) as understood]`

**Verified in this repo (2026-09-03):** `components/survey/survey-card.tsx` collects a
phone number with no consent text. `zero-distraction-form.tsx` carries one soft line
("By tapping above you agree to be contacted about your offer"). Only the terms page
has consent wording. For REI Transfer this means: the survey form is the largest
liability in the stack. Fix: an env-driven consent line naming the client, an
unchecked control, the consent record captured in the webhook payload and passed to
the CRM. Legacy default must remain byte-identical until each client opts in, per repo
rules, but every new deployment should default on.

### FTC

- Endorsement Guides (2023): testimonials must reflect honest current experience; if
  results are not typical, state what consumers can generally expect next to it.
  `[verified: 16 CFR 255]`
- Consumer Reviews and Testimonials Rule (effective 21 Oct 2024): fake, AI-generated
  or no-experience testimonials are civil-penalty offenses, up to 51,744 dollars per
  violation. `[verified: FTC rule Q&A]`
- Substantiation: "cash offer in 24 hours", "no fees", "any condition", "close in two
  weeks" are objective claims needing a reasonable basis before publication.
  `[verified: FTC substantiation policy statement]`
- Enforcement: FTC v. Opendoor, about 62 million dollars in refunds for claiming
  sellers net more than on the open market. HomeVestors franchisee conduct exposed by
  ProPublica 2023-25. `[verified: FTC press release Apr 2024; ProPublica]`

**Verified in this repo:** `components/advertorial/advertorial-page.tsx` ships a named
testimonial strip ("Diane R., Akron OH", line 135) and four named testimonials with
ages and cities (line 316 onward) hardcoded for every client; "written offer within 24
hours" (333), "any condition" (336), and a scarcity line, "We review a limited number
of addresses each week" (362). For REI Transfer this means: unless each client has a
signed release from a real seller for those exact words, these are fake testimonials
under a per-violation penalty rule, deployed 17 times. Make testimonials env-driven,
default empty, release required on upload. Match "24 hours" and "any condition" to
each client's real process (the survey itself disqualifies mobile homes and land).
Remove the scarcity line. Check "you keep more of what the home is worth" style lines
against the Opendoor theory: no net-proceeds comparison without data.

### State wholesaler and disclosure rules (marketing-relevant)

| State | Rule |
|---|---|
| Oklahoma | License to market property you do not own; SB 1075 (Nov 2025) closes double-close loophole; disclose intent to assign; two-business-day cancel |
| Pennsylvania | Act 52 (Jan 2025): wholesaling is brokerage; license; Philadelphia adds a municipal license |
| South Carolina | H4754 (2024): marketing another's property for compensation is brokerage |
| Ohio | SB 155 (Mar 2026): separate bold 12-point wholesaler disclosure before contract; no disclosure, seller may cancel; consumer-protection enforcement |
| Illinois | One unlicensed deal per 12 months |
| Kentucky, Connecticut (Jul 2026), Maryland, North Dakota, Tennessee | 2025 laws: marketing an equitable interest is brokerage or needs disclosure with owner cancel right |

`[verified: REsimpli laws guide; Ohio REALTORS; VLTA Examiner Mar 2026]`
For REI Transfer this means: "we buy houses", "we close", "our money" are
misrepresentations if the client assigns. Propose an env flag that swaps in "we or our
partners purchase" and per-state disclosure text. Keep the existing "not a licensed
brokerage" disclaimer.

### Foreclosure-purchaser and equity-stripping laws

Equity purchaser statutes regulate buying from owners in default: California Civ.
Code 1695 (five-business-day rescission, 14-point notices, two-year voidability,
treble damages), New York RPL 265-a, Minnesota 325N and Illinois 765 ILCS 940 (five
days, 82 percent of fair value floor on reconveyances), Washington RCW 61.34, Colorado
6-1-1112, Maryland PHIFA, Nevada NRS 645F. `[verified: statutes on Justia and state
sites]` Active enforcement: Arizona AG (2025) against equity-stripping rings that
targeted the elderly within minutes of foreclosure notices; Massachusetts AG v.
Hometap (2025); NACA v. Unison (2026) on "home equity" products. `[verified: AZ AG
press release; Boston Globe; AARP]`
For REI Transfer this means: never "stop foreclosure", "save your home", rent-back,
buy-back, or equity-share language; those convert the client into a foreclosure
consultant with licensing, price floors and rescission rights. "Equity opportunity"
framing now sits next to enforcement targets; keep it about the seller's equity
turning into cash from a sale, never about a product that touches their equity while
they stay. Persona P2 copy goes through this module twice.

## Process: the five-minute pre-publish checklist

Run in order. Any fail stops the ship.

1. Protected-class scan: no race, religion, national origin, sex, disability or
   family-status words or imagery implying who should sell; no "seniors only"; age
   only as neutral framing, and "long-time owners" in age-protected states.
2. Meta: campaign declared Housing; no age, ZIP or interest targeting.
3. Every testimonial: real person, signed release on file, meaning unedited, no AI
   faces; atypical results carry a "generally expect" line beside them.
4. Every objective claim (24 hours, no fees, any condition, two weeks) matches what
   this client does; substantiation noted in the client file.
5. No net-proceeds comparison to a listing without data; no "guaranteed".
6. No urgency or scarcity that is not literally true; no countdowns.
7. No "stop foreclosure", "save your home", rent-back, buy-back or equity-share
   language.
8. Client is the end buyer, or copy says "we or our partners" and the state's
   wholesaler disclosure is configured.
9. Form has a dedicated unchecked consent naming the client (and partners), covering
   calls, texts, autodialed and AI, "not a condition", STOP and rates; consent record
   captured with the lead.
10. Client outreach: 8 to 8 local, three attempts per 24 hours, DNC scrubbed after the
    three-month inquiry window, STOP honored within ten business days.
11. Disclaimer present: advertorial, not a brokerage, offers depend on condition and
    location, nothing binding until written.
12. Privacy policy resolves and describes lead sharing with the CRM and client.

## Deterministic checks (run as code before any model judgment)

Banned or flagged strings, case-insensitive: "guarantee", "guaranteed", "stop
foreclosure", "save your home", "rent back", "buy back", "seniors only", "limited
number", "spots left", "expires", "countdown", "no risk", "everyone qualifies", "any
house" (flag), "24 hours" (flag: verify), "no fees" (flag: verify), "keep more than"
(flag: Opendoor). Required strings on a form page: the consent line and the STOP line.

## Worked example

Draft line: "We help seniors stop foreclosure and keep their equity. Guaranteed offer
in 24 hours. Only a few spots left this week." Fails 1, 5, 6, 7, 4. Rewrite: "If you are
behind on payments, a cash sale before the auction date can protect the equity you
have built. We put a written offer in your hands within {{CLIENT_OFFER_WINDOW}}, and
you choose the closing date." Then verify the offer window with the client.

## Quality gate

All twelve checklist items pass, deterministic checks clean, and the reviewer is not
the author (separate pass or separate call).

## Output format

```
COMPLIANCE — <item reviewed>
Deterministic checks: clean / hits (list)
Checklist: 1..12 pass/fail with the failing text quoted
Required rewrites:
State-specific notes:
Verdict: SHIP / HOLD
```

## Memory contract

Reads: LEDGER business facts (client process, states, assignment model). Writes:
LEDGER (new legal facts with dates), CHANGELOG when a rule in this module changes.

## Failure modes and kill rules

- Reviewer is the author: the review does not count.
- A HOLD overridden without William's written decision: log it in LEDGER.
- Law older than one quarter unverified: re-check before relying on it.

## Open questions for William

- Which clients assign contracts rather than close? (Drives wholesaler copy per state.)
- Do any clients resell leads to agents or brokerages? (Coffey exposure in consent copy.)
- Approve the template changes: consent line, env-driven testimonials, scarcity line
  removal, offer-window variable.
