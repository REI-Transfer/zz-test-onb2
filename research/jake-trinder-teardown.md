# The Trinder Teardown

Competitive teardown of **Jake Trinder / Views To Clients** — a YouTube growth agency
for B2B software companies. Compiled 13 September 2026 from public sources only.

Published report: https://claude.ai/code/artifact/ab30cf50-10f9-4813-8f12-95b210bbf9f8

---

## 00. Collection note — read before the numbers

**The video scrape did not happen.** This session's network egress policy blocks
`youtube.com` outright, along with `viewstoclients.com`, `becomeastrategist.com`,
`ytjobs.co` and every other destination attempted. `yt-dlp` was installed and was
refused at CONNECT (403 from the egress gateway).

Consequences:

- No view counts, no per-video data, no transcripts — for his channel or his clients'.
- Everything below comes from web search returning page content: his LinkedIn and X
  posts, recruiting ads, podcast listings, third-party writeups.
- The client roster is the **publicly named subset** of 50+ channels.
- All performance figures are **his own unverified marketing claims**.

**Apify doesn't rescue this either.** Its actors are the right tool, but
`api.apify.com` and `console.apify.com` are blocked by the same policy (403 at
CONNECT), so Apify only helps if run from an unrestricted machine. The one route
that *is* open is the official YouTube Data API on `googleapis.com`, which is
reachable and needs only a free key — see `research/scrape_channels.py`.

A second collection pass recovered more than expected without any of that: a
working corpus of real video titles from client channels, the correct channel
handles, client reviews, and competitor pricing. Section 3A below is built
entirely from that evidence.

Still missing and strictly quantitative: per-video view counts, publish cadence,
retention proxies, and transcripts.

---

## 01. The operator

Views To Clients: YouTube growth for experts, educators and B2B companies —
explicitly *not* entertainment, gaming or lifestyle. Founded by Trinder in his late
teens. He also holds "Head of YouTube" titles at several client SaaS companies,
suggesting an embedded function rather than a vendor relationship.

Second business: `becomeastrategist.com` ("Six-Figure Strategist"), training people to
do the job — an agency-to-education flywheel that doubles as his hiring funnel.

Scale, per his own September 2026 job ad:

| Figure | Value |
|---|---|
| Monthly revenue | $335k |
| Active client channels | 50+ |
| Videos shipped per month | 100+ |
| Business videos made to date | 1,000+ |
| Claimed monthly reinvestment | $200k+ |

### Derived pricing

He doesn't publish rates, but he published both numbers needed to bracket them:
**$335,000 ÷ 50+ channels ≈ $6,700/month average retainer, or less.** Some of that MRR
is likely the training product, pushing the true per-channel average lower.

Against the market that lands him mid-to-upper but not premium. B2B YouTube agencies
run **$2,000–$15,000/month**, boutiques at $2,500–$5,000; ContentBuck starts at $1,599
for production and $3,000 for full growth retainers, Vidico from $5,000. He is neither
the cheap option nor the expensive one — a volume operation priced where the work is
defensible but the margin comes from throughput.

---

## 02. The roster

Nine clients are publicly named or self-identified — roughly a fifth of the book.

| Client | Category | Claimed outcome |
|---|---|---|
| Instantly.ai | GTM SaaS | 0 → 70k subs; $1M+ ARR attributed to YouTube |
| Clay | GTM SaaS | Seven-figure revenue channel; Trinder is Head of YouTube |
| Sam Piliero | Solo expert | 60 subs / 30–60 views per video → $300–400k/mo; claims #1 Facebook Ads channel |
| Glencoco | GTM SaaS | First video 270k views from zero subs; $45k in deals in 30 days; $0 → $1M in 6 months |
| Gary Vaynerchuk | Media personality | 1M long-form views in 90 days (~10× average), assembled from existing keynote footage |
| HeyReach | GTM SaaS | Head of YouTube; no public figures |
| Hypefury | GTM SaaS | Head of YouTube; no public figures |
| Castmagic | GTM SaaS | Head of YouTube; no public figures |
| Unnamed | Testimonial | 700k+ views, 16k+ subs in first 60 days; two videos >200k vs previous best 50k |

All figures self-reported in marketing and recruiting material. None independently
verified; none carry a stated attribution methodology.

**Confirmed handles** for anyone pulling these directly: `@InstantlyAI`,
`@GrowWithClay`, `@heyreach`, `@goglencoco`, `@SamPiliero`, `@garyvee`,
`@jaketrinder`, plus a separate "Results & Testimonials" channel at
`UCo7W4NdrQHLQVOjoShnaLtA`. Several differ from the obvious guess — Clay is not
`@clay`, Glencoco is not `@glencoco`.

### The pattern worth stealing

Six of nine are **go-to-market software** — cold email, data enrichment, LinkedIn
outreach, social scheduling, content repurposing, sales calling. The other three are
individual operators with something to sell.

This is not a generalist agency that happened to land SaaS clients. It owns one
vertical and sells the same machine into it repeatedly, so every engagement compounds
the next. A generalist never gets that compounding — and neither will you if you
spread across unrelated niches.

---

## 03. His main premise

Consistent across LinkedIn, X and podcasts:

1. **YouTube is an acquisition channel, not a content channel.** Only question that
   matters: did a real client come from it? Subscribers and views "lie to you."
2. **The strategy is won before the camera turns on.** Recording is ~5% of the work;
   most of the week goes to research. Choosing what to make is the whole game.
3. **Mine outliers in adjacent niches, then transplant the format.** An outlier is a
   video that beat its own channel's baseline. Hunt them *outside* your niche and port
   the format before it saturates. Claims authorship of "The New Era of X Has Just
   Begun"; studies patterns like "The New Rules of X" and "X Is About to Change Forever."
4. **Packaging is the highest-leverage craft.** Title, thumbnail, positioning. Employs a
   dedicated thumbnail designer shipping 100+/month with A/B testing. Packaging is the
   filter that decides whether a video gets made, not the final polish.
5. **Answer the questions buyers are embarrassed to ask.** Winners are basic,
   unglamorous explainers — not clever videos that impress peers. Most actionable line
   in his whole body of work.
6. **Educational long-form, 8–20 min, evergreen search.** Search compounds for years; a
   campaign video spikes and dies. The channel is a library, not a feed.
7. **One niche, one channel, one video a week.** "Feed one channel, not five." The
   cadence is the moat — most business owners won't record weekly. Claims $0 → $100k+/mo
   in 10 months on exactly this.
8. **Every video does five jobs.** Record once → long-form, shorts, email, sales asset.
   YouTube is "the seed that feeds every other channel."
9. **Put the videos inside the funnel.** The step almost nobody sets up: every lead from
   ads, email or outreach should land on video. Cheapest part to copy.

Nothing here is secret and none of it is novel in the abstract. What's distinctive is
the refusal to optimise for reach, and the discipline of one narrow machine in one
narrow vertical.

---

## 3A. Packaging, observed — the formula off his clients' real titles

This part doesn't rely on taking his word for anything. Real titles from channels he
runs; the devices repeat across unrelated clients, which is what a house formula looks
like from outside.

**Sam Piliero — Facebook ads (`@SamPiliero`)**

| Title | Device |
|---|---|
| If I Started Facebook Ads in 2026, I'd Do This | Reset premise |
| How to ACTUALLY Scale Facebook Ads for Ecommerce | Corrective |
| The Right Way to Scale Your Facebook Ads in 2025 | Corrective + year |
| 42 Ways To Instantly Make Your Ads More Profitable | Odd specific count |
| 13 Ways to BEAT Your Competitors Facebook Ads | Odd count + caps |
| I Found a BETTER Way to Advertise on Facebook in 2025 | First-person discovery |

**Glencoco — B2B sales platform (`@goglencoco`)**

| Title | Note |
|---|---|
| Make extra income with Glencoco | **21 views — before** |
| Making $2000 in a Week Cold Calling | **15 views — before** |
| Easily making $6,300 a month with this side-hustle | **24 views — before** |
| speedrunning cold calls from $0 to first sale (i show everything) | Documentary |
| speedrunning cold calls till I make $1000 (i show everything) | Same device, reused |
| watch me book 10 sales calls in 10 hours | Constraint challenge |
| How This Beginner Made $10,821 with Cold Calling | Unrounded number |

### What the Glencoco channel shows

The first three sit on the same channel as the rest and did **15, 21 and 24 views**.
They're company-voice and benefit-led — "make extra income", "easily making". What
followed is first-person, documented, specific: *speedrunning*, *watch me*, *$10,821*.

This is the strongest evidence in the teardown because it's a before-and-after inside
one channel, not a comparison across two. The subject didn't change. The packaging did.

### Six devices doing the work

1. **Unrounded numbers.** $10,821, not "over $10k". 42 ways, 13 ways — never 10 or 15.
   Precision reads as a receipt, not a marketing estimate.
2. **Corrective framing.** "ACTUALLY", "The Right Way", "I Found a BETTER Way." Implies
   the viewer's current method is wrong — converts idle interest into an unresolved
   correction.
3. **The reset premise.** "If I Started X in 2026, I'd Do This" lets an expert restate
   fundamentals without condescension. Squarely the "embarrassed to ask" thesis,
   packaged so nobody has to admit they're asking.
4. **Transparency parentheticals.** "(i show everything)" appears twice verbatim on one
   channel. A device reused unchanged is a tested device, not a flourish.
5. **Consumer register in B2B.** *speedrunning*, lowercase, *watch me* — gaming and vlog
   conventions applied to cold calling. His format-transplant thesis executing literally.
6. **Year-stamping.** "in 2025", "for 2026". Cheap recency signal, and it licenses
   re-making the winning video annually — throughput disguised as freshness.

**Caveat:** the titles are real; the view counts are partial. Search surfaced a handful,
not a distribution, so I can't yet say which formats won *most*, or how each channel's
median moved. That's the gap `scrape_channels.py` closes.

---

## 3B. Scripts — there is no word-for-word script to copy

Worth checking properly, and the answer is more useful than a template: across his
public work a large share of the output **isn't scripted at all**. The structure lives
in format choice and edit assembly, not in prose read to camera.

### The Gary Vaynerchuk build settles it

Vaynerchuk recorded **nothing new**. Trinder built the videos from existing keynote
footage and took him from an average of 5–10k views to **1M long-form views in 90 days**.
The first video was *"The New Rules of Social Media (2026)"* — a format he'd seen work in
other markets, applied to a subject Vaynerchuk already had credibility in. It did 300k+.

You cannot copy a script from that engagement because one never existed. What was copied
was a *format*; what was written was an *edit order*.

### Two production modes, not one

| | Assembled — no script | Scripted — talking head |
|---|---|---|
| **Who** | Vaynerchuk (keynote footage), Glencoco's documentary series | Sam Piliero, SaaS explainers |
| **Evidence** | "speedrunning cold calls", "watch me book 10 sales calls in 10 hours", "(i show everything)" — you can't script a live cold call | "42 Ways To Instantly Make Your Ads More Profitable", "How to ACTUALLY Scale Facebook Ads" — enumerated, delivered to camera |
| **Where the craft sits** | Choosing the format, then imposing narrative shape in the edit. Writing is selection and sequencing. | Title sets a countable promise; the script discharges it in order. |

### What his own hiring tells you

He advertises for strategists, researchers, thumbnail designers and lead editors.
**No scriptwriter role appears in any posting found.** Scripting shows up as one step the
strategist owns alongside ideation and research — not a separate craft with its own hire.
Against a dedicated thumbnail designer shipping 100+ a month, that's a clear statement of
where he thinks the leverage is.

### The honest limit

No transcripts were obtainable, so this is inference from titles, formats, hiring and one
documented build — not from reading his scripts. Confirming a house style needs
transcripts, which need an Apify actor or an unrestricted machine. The structural
fingerprint those would produce is what `script_analyzer.py --benchmark` computes.

### The more useful reframe

A copied script inherits someone else's voice, audience and offer, and you still can't
tell which parts are load-bearing. The transferable unit isn't prose — it's the **promise
structure**: the title makes a specific, countable, correctable claim, and the script
exists to discharge it in order. "42 Ways" is a contract for 42 items. "The Right Way to
Scale" is a contract to correct a belief. Both are structures you can write into today in
your own voice, without a line of his copy.

---

## 04. What's actually in the service

His recruiting ads are the most honest spec he's published. Delivery unit:
**Trinder → senior strategist → junior strategists + researchers**, with a thumbnail
designer and lead editor serving all channels. The strategist directs research, gives
clients feedback on content, and adjusts from performance data.

Pipeline per video: idea research → packaging (title + thumbnail) → scripting and
positioning → client records → edit → upload with SEO → performance read → iterate.

### Hard to copy — the moat

- **Idea selection**, calibrated on 1,000+ videos across 50+ channels in one vertical.
  A private dataset of what converts for B2B SaaS.
- **Packaging judgment** — knowing which title/thumbnail wins before spending budget.
- **Throughput.** 100+ videos/month means format tests resolve in weeks; yours take quarters.
- **Cross-client pattern transfer** within the vertical.

### Commodity — hire or buy

- Editing (freelance market, well-priced)
- Thumbnail *production* (the concept is the skill; the execution isn't)
- Upload, SEO, channel admin — genuinely low-skill, don't pay agency rates
- Outlier research tooling: ViewStats, vidIQ, 1of10, OutlierKit
- Funnel wiring — one-time build, highest-ROI free thing here

---

## 4A. Reception — what clients say when he isn't the one saying it

Views To Clients holds **4 stars on Trustpilot across 10 reviews**. Independent client
accounts include a channel taken from 100 to 12,000+ subscribers over ~8 months, and
another that more than doubled subscribers on five released videos while contracting
over $40k at a claimed 70% close rate on channel-sourced calls.

One review is pointed in a useful way: the team are *"experts at titles, thumbnails, and
video positioning"* but *"communication with clients is a little lackluster"*, with *"a
couple of minor operational things they can fix."* Another calls the difference against
a previous agency "night and day."

**The number worth noticing:** ten reviews is a thin public footprint for an agency
claiming 50+ active channels and $335k/month. Not evidence of anything wrong — B2B
retainer clients rarely post to Trustpilot — but the outside verification available on
this business is much smaller than its stated scale. A 4-star average on ten entries is
not due diligence.

Read against the roster, the signal is consistent: **the part clients praise is the part
you can't easily hire, and the part they criticise is the part you'd do better
yourself.**

---

## 05. The DIY operating system

Order matters. Steps 3 and 4 are where in-house attempts break down.

1. **Pick one niche and one channel.** Narrow enough that a single library serves all of
   them. Resist the second channel permanently.
2. **Build an outlier database before anything else.** Log videos beating their own
   channel baseline, weighted toward adjacent niches. Record the *format*, not the topic.
   Start this week — before the setup is perfect, before hiring an editor.
3. **Filter ideas against the embarrassment test.** Would a buyer be slightly embarrassed
   to ask this out loud? Does it map to a query they'd type? If it mainly impresses
   peers, kill it.
4. **Write the title and build the thumbnail *before* the script.** Packaging is the
   go/no-go gate. If you can't make it compelling, the idea dies here — before it costs a
   production day. Most valuable free thing in his method.
5. **Script to the promise the packaging made.** 8–20 min, educational, one clear answer.
   Pay off the title; don't cover the topic exhaustively.
6. **Ship one a week for twelve months.** The part that actually fails. Expect first
   traction at 30–60 days, momentum at 3–6 months (his own stated timelines).
7. **Wire every video into the funnel.** Each video gets a specific next step. Put the
   library where inbound leads land; cut shorts; send it as the email.
8. **Measure pipeline, not views.** Sourced opportunities and closed revenue. Use
   YouTube's native thumbnail A/B test. If views rise and pipeline doesn't, the idea
   filter is wrong — not the production.

---

## 06. Verdict — can we reverse-engineer it without paying?

**The methodology, yes.** It's fully disclosed, and disclosed on purpose — publishing the
method *is* his lead generation. You can reconstruct the entire system from his X
threads, LinkedIn posts and job ads for nothing. This document is most of that
reconstruction.

**The outcome, not entirely.** What you can't download is the calibration: packaging
taste and idea-selection instinct built from 1,000+ videos of feedback in one vertical.
That gap is real, and it's what he's actually charging for.

**But the formula is more copyable than the pitch implies.** Section 3A reconstructs six
repeatable packaging devices off his own clients' titles, and the Glencoco
before-and-after shows what they're worth on an unchanged subject. Not the whole
calibration, but a working starting grammar you now have for nothing — and it's the part
he sells.

**The honest economics.** In-house means a strategist doing idea selection and packaging,
plus an editor and a thumbnail designer — realistically $8–15k/month all-in, against his
derived ~$6.7k and a market running $2–15k. DIY is *not* automatically cheaper. The
genuinely free path is slower: you personally run the research-and-packaging loop for
three to six months, trading time for calibration.

**Recommendation.** Steal the method now — it costs nothing, and the funnel-wiring step
alone is worth doing this month. Run the loop yourself for one quarter at one video a
week. That quarter prices the agency for you: if your packaging instincts sharpen and
pipeline moves, keep it in-house; if you're twelve weeks in and still guessing at
titles, you've learned exactly what you'd be buying, and ~$6.7k/month is a fair price
for it.

**One asymmetry worth exploiting either way.** Clients praise the craft and flag the
account management. If you hire him, set expectations on the operational side hard up
front. If you don't, note that the weak half of his service is the half you'd naturally
cover yourself.

---

## 07. Free sources, ranked by unpaid signal

| Source | Why |
|---|---|
| [Job postings on YT Jobs](https://ytjobs.co/channel/6368) | Best spec of his internal process anywhere — roles, workflow, org chart, and the revenue figures absent from the sales site. Nobody thinks to read these. |
| [@JAKETRINDER_ on X](https://x.com/JAKETRINDER_) | Step-by-step threads: the $0→$100k/mo breakdown, the outlier-research method |
| [LinkedIn](https://www.linkedin.com/in/jaketrinder/) | Near-daily posts; "I made 1000+ YouTube videos for businesses" and "Failed YouTube agencies: what they get wrong" are the substantive ones |
| [youtube.com/@jaketrinder](https://www.youtube.com/@jaketrinder) | His channel — itself a demonstration of the method. Blocked from this session. |
| 50-page client writeup | $1M/year-from-YouTube case study; released for a comment ("YT") + follow on the relevant LinkedIn post |
| [1of10 Podcast interview](https://open.spotify.com/episode/3aTpaqQXREgIxFtqiVftrc) | Long-form origin story and operating philosophy |
| Skool | Communities he participates in, incl. "1of10: The YouTube Blueprint" |
| **Paid (what you'd be avoiding)** | [becomeastrategist.com](https://becomeastrategist.com/) — Six-Figure Strategist, first cohort capped at 10; and the [Views To Clients](https://viewstoclients.com/) retainer |

---

*No paywalled, gated or private content was accessed. All performance figures are the
subject's own unverified marketing claims, reported as claims rather than findings. The
per-channel retainer figure is derived from two published numbers and is an estimate,
not a quoted rate.*
