# LEDGER — what the Growth Controller believes

Format: `id | belief | confidence | evidence | date | status`
Rules: read before thinking, write before finishing. Under 0.6 = test before spending.
Never delete; retire. Seed entries below are the strategist's starting priors, tagged
as estimates until Grok verifies them.

## Business facts (fill from William; these are not beliefs, they are inputs)

- Primary SEO target site: [unknown] (reitransfer.com for B2B, or client sites for B2C, or both)
- Client markets currently live: [unknown]
- Average client profit per closed deal: [unknown]
- Current cost per lead / per qualified lead across clients: [unknown]
- Lead to appointment and appointment to contract rates by bucket: [unknown]
- Do we have Google Search Console and GA4 access for the target site(s): [unknown]

## Beliefs

L001 | Qualified leads (HOT+WARM) convert to contracts at a meaningfully higher rate than STANDARD/LOW, so cost per qualified lead is the right optimization target | 0.7 | Scoring model is built on distress signals that match investor deal criteria; no contract data seen yet [estimate] | 2026-09-03 | active
L002 | The nine objection articles are the brand's voice standard and should be extended, not replaced | 0.9 | Read in repo; consistent, honest, mechanism-driven | 2026-09-03 | active
L003 | Situational hubs (inherited, foreclosure, behind on payments, repairs, vacant) will outperform generic "sell my house fast" pages on qualified-lead rate because they match the highest-weighted reasons in the scoring model | 0.65 | REASON_WEIGHTS in lib/lead-scoring.ts; untested in search [estimate] | 2026-09-03 | active
L004 | Location pages without local substance will not rank durably and risk the whole site's quality assessment | 0.85 | Long-standing search quality guidance on doorway pages [verified: Google Search Essentials, spam policies] | 2026-09-03 | active
L005 | A published cross-client benchmark data asset is the highest-leverage link, citation and B2B lead source available to REI Transfer | 0.75 | Unique first-party data; comparable data assets in other verticals earn links and AI citations [estimate] | 2026-09-03 | active
L006 | Paid ad angle winners predict search content winners for the same seller situation | 0.6 | Same reader, same objection; no direct evidence yet [estimate] | 2026-09-03 | active
L007 | Real voice-of-customer language outperforms invented copy in both hooks and headlines | 0.8 | Standard direct-response finding, consistent with the existing library's approach [estimate] | 2026-09-03 | active
L008 | AI answer engines now intercept a large share of informational and objection queries in this niche, so pages must be written to be cited, not just ranked | 0.7 | Observed broadly across informational verticals; niche share [unknown] | 2026-09-03 | active
