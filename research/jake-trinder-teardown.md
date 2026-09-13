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

To get real video data you need a session without the egress restriction, or the
YouTube Data API with a key.

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
is likely the training product, pushing the true per-channel average lower. That sits
well below the €10–30k/month band typical of full-service YouTube agencies — a volume
operation with systematised delivery, not a boutique.

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

**The honest economics.** Running this in-house means a strategist who can do idea
selection and packaging, plus an editor and a thumbnail designer — realistically
$8–15k/month all-in. That is *not* obviously cheaper than his derived ~$6.7k/month
average retainer. The genuinely free path is slower: you personally run the
research-and-packaging loop for three to six months, trading time for calibration.

**Recommendation.** Steal the method now — it costs nothing, and the funnel-wiring step
alone is worth doing this month. Run the loop yourself for one quarter at one video a
week. That quarter prices the agency for you: if your packaging instincts sharpen and
pipeline moves, keep it in-house; if you're twelve weeks in and still guessing at
titles, you've learned exactly what you'd be buying, and ~$6.7k/month is a fair price
for it.

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
