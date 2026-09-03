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

## Added 2026-09-03 from the research run (strategist, five research passes)

L009 | Meta value optimization is not available on the Leads objective; the 150/100/50/10 CAPI values do not steer delivery unless the campaign runs under a value-optimizing objective with ~100 valued events and 5+ distinct values in 14 days | 0.8 | [verified: Jon Loomer glossary and mid-2025 requirements post, via snippet; Meta help pages not readable] | 2026-09-03 | active
L010 | The supported quality lever on Leads is Conversion Leads via CRM stage events (1-40% of leads reach the stage within 28 days; ~250 leads/month working floor) | 0.75 | [verified: LeadsBridge, Salesgem, Zapier 2025 quoting Meta] | 2026-09-03 | active
L011 | Under a cost cap, daily budget must be at least 5x the target cost per result; learning needs ~50 events in 7 days; most single-market clients will not clear this on the lead event | 0.75 | [verified: Meta guidance via Stackmatix 2026; Lebesgue 2025] | 2026-09-03 | active
L012 | The survey form collects phone with no TCPA consent language; this is the largest legal exposure in the stack ($500-$1,500 per message, class filings doubled in 2025) | 0.95 | [verified: grep of components/survey/survey-card.tsx 2026-09-03; WebRecon via NatLawReview] | 2026-09-03 | active
L013 | The advertorial ships hardcoded named testimonials and a scarcity line to every client; without per-client releases these are fake testimonials under the FTC rule effective Oct 2024 | 0.9 | [verified: components/advertorial/advertorial-page.tsx lines 135, 316+, 362; FTC Consumer Reviews and Testimonials Rule] | 2026-09-03 | active
L014 | Informational and objection pages lose 35-60% of historical CTR to AI Overviews; bare "service + city" queries trigger AIO only ~15% of the time | 0.75 | [verified: Ahrefs 2025; Pew Jul 2025; Seer Sep 2025; Whitespark 2026; Google disputes magnitude] | 2026-09-03 | active
L015 | Swapped-city location pages are doorway spam under Google's 2024 policies; pages need local substance or should not exist | 0.9 | [verified: Google spam policies 2024; Mueller via seroundtable] | 2026-09-03 | active
L016 | AI answer engines cite per passage: ~117-word self-contained blocks with the answer in the first sentence; statistics and sources lift visibility ~30-40% | 0.7 | [verified: AWR passage study 2026; GEO paper Princeton/Georgia Tech] | 2026-09-03 | active
L017 | Carrot's structural weakness is shared content across hundreds of investor sites; original per-client substance and first-party data are the differentiator | 0.8 | [verified: Carrot unique-content tool page; RETipster review] | 2026-09-03 | active
L018 | Book-a-call is the right primary B2B funnel (cost per booked call $150-$350, close 15-40%); webinar needs client LTV above ~$15k to pay | 0.65 | [verified: Communipass 2026; Membership.io; 780 Marketing; webinar arithmetic is an estimate] | 2026-09-03 | active
L019 | No public benchmark maps a lead-score bucket to contract rate; REI Transfer must build its own table from client CRM stages within 90 days | 0.9 | [verified by absence across Carrot, REsimpli, InvestorFuse, PropStream] | 2026-09-03 | active
L020 | Unsolicited "we buy your house" texts to DNC numbers can be solicitations (Coffey v. Fast Easy Offer, 9th Cir. June 2026); consent copy must name downstream buyers | 0.8 | [verified: 9th Cir. opinion 25-4066] | 2026-09-03 | active
L021 | Single-agent-with-modules is the right substrate for narrow marketing work; only the copy gate and the compliance check earn a separate call | 0.7 | [verified: Anthropic Building effective agents 2024; arXiv 2601.12307; Saladi 2026] | 2026-09-03 | active
L022 | Reflection-based self-improvement fails on noisy, delayed feedback; pre-registered hypotheses and sample rules are required for marketing metrics | 0.75 | [verified: Reflexion 2023; arXiv 2605.29463] | 2026-09-03 | active
