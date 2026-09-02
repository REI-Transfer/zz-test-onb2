-- 0009_keep_the_remarks.sql
--
-- Keep the text a condition score was derived from, and the blend it fed.
--
-- Two related holes, both found the first time predictions were computed from the
-- database instead of from /tmp.
--
-- 1. acq_listings stored condition_score and vision_score and threw the listing
--    description away. condition_score is the TEXT half, vision_score is the
--    PHOTO half, and neither is the number the offer engine gates on -- that is
--    applyVisionResult's blend of the two, which was never persisted. Scoring
--    from the database therefore read the text score as if it were the verdict
--    and rejected 278 of 281 listings for "condition below threshold", including
--    every house the photos had confirmed as gutted.
--
-- 2. Without the remarks there is no way to answer why a house scored 12, and no
--    way to recompute when the weighting changes. It has already changed once:
--    the text/photo split moved from a flat average to evidence-weighted, and
--    redoing that against stored scores alone is impossible, because the text
--    weight depends on signalConfidence, which is derived from the remarks.
--
-- Storing the input rather than only the output is the difference between a score
-- that can be argued with and a number that has to be taken on faith. The offer
-- built on it goes to a licensed fiduciary who will argue with it.

set search_path = agent_outreach_elevate, public;

alter table acq_listings
  add column if not exists public_remarks text,
  add column if not exists blended_condition_score integer;

comment on column acq_listings.public_remarks is
  'Listing description as fetched. The input to the text half of the condition score, kept so the score can be explained and recomputed.';

comment on column acq_listings.blended_condition_score is
  'Text and photo scores combined by applyVisionResult. condition_score is TEXT ONLY and vision_score is PHOTO ONLY; neither alone is what the offer engine gates on.';

comment on column acq_listings.condition_score is
  'TEXT-derived score only, from public_remarks. Median is 0 in this market because agents write ordinary marketing copy. Not a verdict on the house.';

comment on column acq_listings.vision_score is
  'PHOTO-derived score only, from the vision pass. The senior witness of the two.';
