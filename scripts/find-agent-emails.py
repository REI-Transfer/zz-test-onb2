#!/usr/bin/env python3
"""Resolve listing-agent emails from the MLS number we already scraped.

The listing agent's email is the one field Zillow never returns (`agent.email` is
null on every record), and it blocks every send. Searching the web for it agent by
agent works but is slow and loses to Cloudflare: across four batches that route hit
87%, and the five it declared "not published anywhere" all turned out to be
published, just behind a block.

The shortcut is that Stellar MLS distributes ListAgentEmail in the IDX feed, and
IDX-powered broker sites republish it verbatim on the listing detail page. So the
email is reachable from the MLS number, which is already in our own scrape output
as attributionInfo.mlsId. No search engine, no browser, no Cloudflare fight.

That took the same five from 0/5 to 5/5, and the whole set to 40/40.

    source ~/.secrets
    python3 scripts/find-agent-emails.py /tmp/band_out.json [--write]

Emits JSON to stdout; --write pushes verified addresses into acq_agents.
"""
import argparse, json, os, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

IDX_HOST = "https://venicegolfcountryclub.com/listing/mid-florida"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
PROJECT = os.environ.get("SUPABASE_PROJECT_REF", "glaxjfmfhlhwsblwprzo")

# The label and the value are separated by markup and whitespace:
#   <span class="labelb">Agent Email: </span>\n\t\t<a href="mailto:x@y.com">
# so the pattern has to hop the tags rather than expect the value to follow the colon.
RE_EMAIL = re.compile(r"Agent\s*Email:.{0,200}?mailto:([\w.+-]+@[\w.-]+\.\w+)", re.I | re.S)
RE_PHONE = re.compile(r"Agent\s*Phone:.{0,200}?tel:\+?1?(\d{10})", re.I | re.S)

# Zillow spells the street type out; the IDX slug may use either form.
ABBREV = {"avenue": "ave", "street": "st", "road": "rd", "drive": "dr", "lane": "ln",
          "court": "ct", "boulevard": "blvd", "terrace": "ter", "place": "pl",
          "circle": "cir", "parkway": "pkwy", "trail": "trl", "highway": "hwy"}


def digits(s):
    return re.sub(r"\D", "", s or "")


def slug(street, city, state, zipcode):
    raw = f"{street} {city} {state} {zipcode}".lower()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", raw)).strip("-")


def list_agent_license(att):
    """The FL licence is not att.agentLicenseNumber -- that field is always null on
    this feed. It lives in attributionInfo.listingAgents[], keyed by role, because a
    record can carry both the list agent and the selling agent."""
    for a in (att.get("listingAgents") or []):
        if a.get("associatedAgentType") == "listAgent" and a.get("memberStateLicense"):
            return str(a["memberStateLicense"])
    return None


def get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def resolve(rec):
    """One listing -> {email, phone, matched} or a reason it failed."""
    att = rec.get("attributionInfo") or {}
    addr = rec.get("address") or {}
    mls = att.get("mlsId")
    street = addr.get("streetAddress") or rec.get("streetAddress")
    out = {"zpid": str(rec.get("zpid")), "mls": mls, "street": street,
           "license": list_agent_license(att),
           "listing_phone": att.get("agentPhoneNumber"), "email": None, "note": ""}
    if not (mls and street):
        out["note"] = "no MLS number or street on the scrape record"
        return out

    # The slug tolerates both the spelled-out and abbreviated street type, so try the
    # record's own wording first and fall back to the common abbreviation.
    base = slug(street, addr.get("city"), addr.get("state") or "FL", addr.get("zipcode"))
    cands = [base]
    swapped = base
    for long, short in ABBREV.items():
        swapped = re.sub(rf"-{long}-", f"-{short}-", swapped)
    if swapped != base:
        cands.append(swapped)

    for s in cands:
        url = f"{IDX_HOST}/{s}/{mls}"
        try:
            html = get(url)
        except Exception as e:
            out["note"] = f"fetch failed: {str(e)[:60]}"
            continue
        m = RE_EMAIL.search(html)
        if not m:
            out["note"] = "page loaded but published no agent email"
            continue
        out["email"] = m.group(1)
        out["source_url"] = url
        p = RE_PHONE.search(html)
        out["page_phone"] = p.group(1) if p else None
        # Same names are common in real estate. The phone on the MLS record is the
        # identity check: no match, no send.
        out["phone_matched"] = bool(p and p.group(1)[-10:] ==
                                    digits(out["listing_phone"])[-10:])
        out["note"] = "IDX republish of ListAgentEmail"
        return out
    return out


def verify(email):
    key = os.environ.get("MILLIONVERIFIER_API_KEY")
    if not key:
        return None
    try:
        u = (f"https://api.millionverifier.com/api/v3/?api={key}"
             f"&email={urllib.parse.quote(email)}&timeout=15")
        d = json.loads(get(u, timeout=30))
    except Exception:
        return "unverified"
    # "error" is the verifier failing, not a verdict on the mailbox -- most often the
    # credit balance has gone negative. Storing it as a status makes an unchecked
    # address look processed, so it is renamed to what it actually means.
    r = d.get("result")
    if r == "error":
        if (d.get("credits") or 0) <= 0:
            print(f"  MillionVerifier out of credits (balance {d.get('credits')})",
                  file=sys.stderr)
        return "unverified"
    return r


def push(rows):
    def q(v):
        return "null" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"
    vals = ",".join(f"({q(r['license'])},{q(r['email'])},{q(r.get('source_url'))},"
                    f"{q(r.get('mv'))})" for r in rows)
    sql = ("update agent_outreach_elevate.acq_agents a set email=v.e, email_source=v.s, "
           "email_confidence='mls-idx-republish', email_verified_at=now(), "
           "email_status=v.mv from (values " + vals +
           ") as v(lic,e,s,mv) where a.license_number=v.lic;")
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
        data=json.dumps({"query": sql}).encode(),
        # The UA matters: urllib's default identifies itself as Python and the API's
        # edge blocks it outright, which surfaces as a bare 403 that reads like a bad
        # token. Same trap as the DBPR download.
        headers={"Authorization": f"Bearer {os.environ['SUPABASE_PAT']}",
                 "Content-Type": "application/json", "User-Agent": UA}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scrape", help="Apify zillow-detail-scraper output JSON")
    ap.add_argument("--write", action="store_true", help="push results into acq_agents")
    ap.add_argument("--zpids", help="comma-separated zpids to limit to")
    a = ap.parse_args()

    recs = json.load(open(a.scrape))
    if a.zpids:
        want = set(a.zpids.split(","))
        recs = [r for r in recs if str(r.get("zpid")) in want]

    with ThreadPoolExecutor(max_workers=6) as ex:
        res = list(ex.map(resolve, recs))

    hits = [r for r in res if r.get("email") and r.get("phone_matched")]
    for r in hits:
        r["mv"] = verify(r["email"])

    bad = [r for r in res if r.get("email") and not r.get("phone_matched")]
    print(json.dumps(res, indent=1))
    print(f"\n{len(res)} listings | {len(hits)} emails phone-matched | "
          f"{len(bad)} rejected on phone mismatch", file=sys.stderr)
    if bad:
        print("  phone mismatches (different person, NOT sent):", file=sys.stderr)
        for r in bad:
            print(f"    {r['street']}: page={r.get('page_phone')} "
                  f"mls={r.get('listing_phone')}", file=sys.stderr)
    if a.write and hits:
        # Never persist an address the verifier called invalid. It will bounce, and
        # bounces are what get a sending domain blocked -- one bad address costs more
        # than the deal it was carrying. "unknown" and "catch_all" mean unconfirmable,
        # not dead, so those go through flagged by email_status.
        ok = [r for r in hits if r["license"] and r.get("mv") != "invalid"]
        if all(r.get("mv") == "unverified" for r in ok) and ok:
            print("  WARNING: nothing was verified -- top up MillionVerifier or "
                  "approve the Apify actor before sending to these.", file=sys.stderr)
        dropped = len(hits) - len(ok)
        if dropped:
            print(f"  dropped {dropped} (invalid mailbox or no license number)",
                  file=sys.stderr)
        print(f"  supabase: http {push(ok)} ({len(ok)} rows)", file=sys.stderr)


if __name__ == "__main__":
    main()
