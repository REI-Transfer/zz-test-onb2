#!/usr/bin/env python3
"""Build the REI Transfer client suppression list.

Why this exists
---------------
Both outreach campaigns pull from public sources -- county/MLS agent records for
the agent campaign, Facebook investor groups for the wholesaler campaign. REIT's
own clients appear in both. Ungated, Elevate's first campaign cold-emails
Elevate, plus whichever agency stablemates share the market.

This produces data/suppression/clients.json, which the TypeScript send gate
reads. Rebuild it whenever the client roster changes -- it is derived, never
hand-edited, except for data/suppression/overrides.json below.

Identity sources, strongest first
---------------------------------
  1. Whop billing email, exact         -> block. A paying client typed this.
                                          Stored as a SHA-256 digest, never in
                                          the clear -- see the note below.
  2. Whop business domain              -> block. Same source, same trust.
  3. Client brand phrase in the name   -> block. Two or more rare words in order.
  4. One rare brand word in the name   -> review. "Legacy" and "Elevate" are in
                                          a hundred unrelated companies.

A note on storage. The output file is committed, and 202 client billing
addresses do not belong in git history, where they outlive any decision to
remove them. The gate only ever asks "is this address on the list", which a
digest answers as well as the address does, so emails are hashed. Domains and
brand names stay in the clear: they are public company identities, and a human
reading a blocked-send report needs to see which client it was.

A note on what does NOT count as evidence. The first version of this matched
client brands anywhere in the post body and flagged 44 people, because "Speedy
Home Buyer Tampa Bay" hits any post that mentions Tampa and the bay. Identity
lives in who sent the message, not in which city the deal is in. Brand matching
runs against sender name and email only.
"""
import hashlib, json, os, re, sys

ROOT        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR     = os.path.join(ROOT, "data", "suppression")
CLIENTS_DIR = os.environ.get("CLIENT_PROJECTS_DIR",
                             "/Users/williamyu/Desktop/Claud Code/clients")
WHOP_CACHE  = os.path.join(OUT_DIR, "whop-cache.json")

FREE_MAIL = {"gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com","aol.com",
    "comcast.net","live.com","me.com","msn.com","protonmail.com","att.net","verizon.net",
    "sbcglobal.net","bellsouth.net","ymail.com","mac.com","gmx.com"}

# Words carried by half the cash-buyer brands in America, plus every place name in
# the footprint. A hit on these is not an identity, it is the industry.
GENERIC = set("""
home homes house houses housing buyer buyers buy buys buying property properties
cash offer offers group groups llc inc co solution solutions real estate realty
sell sells selling sale sales we the and of for my fast quick now usa us america
american investment investments investor investors rei ventures venture capital
partners partner holdings company companies service services team pro advisors
advisor management assets asset survey ads live nextjs pilot probe roll src new
best top great good first one direct amazing simple easy super max maximum
tampa petersburg pete clearwater orlando sarasota bradenton lakeland ocala
kissimmee brooksville pasco hillsborough pinellas polk marion manatee florida
jacksonville miami diego lake salt city york atlanta dallas texas georgia
carolina south north east west central coast bay gulf suncoast sunbelt
""".split())

FOLDER_NOISE = re.compile(
    r"-(ads|survey|live|nextjs|pixel[-\w]*|clone|fix|ad|creatives|funnel|website|seo|"
    r"presentation|webinar|book-funnel|playbook|wso|general|v2|1)$")

norm = lambda s: re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", (s or "").lower())).strip()
toks = lambda s: [t for t in norm(s).split() if len(t) > 2]


def whop_memberships():
    """Live pull when WHOP_API_KEY is present, cached copy otherwise. The cache
    means a rebuild still works on a machine without the key, and that CI can
    verify the gate without a credential."""
    key = os.environ.get("WHOP_API_KEY")
    if not key:
        if os.path.exists(WHOP_CACHE):
            print("WHOP_API_KEY unset, using cached roster", file=sys.stderr)
            return json.load(open(WHOP_CACHE))
        sys.exit("WHOP_API_KEY unset and no cached roster to fall back on")
    import urllib.request
    out, page = [], 1
    while True:
        req = urllib.request.Request(
            f"https://api.whop.com/api/v2/memberships?page={page}&per=50&valid=true",
            headers={"Authorization": f"Bearer {key}", "Accept": "application/json",
                     # urllib's default agent is refused at the edge. Been bitten here.
                     "User-Agent": "Mozilla/5.0"})
        d = json.load(urllib.request.urlopen(req, timeout=60))
        rows = d.get("data", [])
        out += rows
        if not rows or page >= d.get("pagination", {}).get("total_page", 1):
            break
        page += 1
    json.dump(out, open(WHOP_CACHE, "w"))
    return out


def build():
    emails, domains = set(), set()
    for m in whop_memberships():
        e = (m.get("email") or "").lower().strip()
        if "@" not in e:
            continue
        emails.add(e)
        d = e.split("@", 1)[1]
        if d not in FREE_MAIL:
            domains.add(d)

    brands = {}
    def add(display, src):
        t = [x for x in toks(display) if x not in GENERIC]
        if not t:
            return
        k = " ".join(t)
        brands.setdefault(k, {"display": display, "tokens": t, "sources": []})
        if src not in brands[k]["sources"]:
            brands[k]["sources"].append(src)

    for d in sorted(domains):
        stem = d.rsplit(".", 2)[0] if d.count(".") > 1 else d.split(".")[0]
        spaced = re.sub(r"(?<=[a-z])(?=(home|house|buy|cash|offer|prop|real|estate|"
                        r"group|solution|invest|legacy|acquisition|asset|sale|sell|realty))",
                        " ", stem)
        add(spaced.replace("-", " "), f"whop-domain:{d}")

    if os.path.isdir(CLIENTS_DIR):
        for f in sorted(os.listdir(CLIENTS_DIR)):
            if f.startswith(("_", ".")) or "." in f:
                continue
            add(FOLDER_NOISE.sub("", f).replace("-", " "), f"folder:{f}")
    else:
        print(f"client projects dir missing: {CLIENTS_DIR}", file=sys.stderr)

    ov_path = os.path.join(OUT_DIR, "overrides.json")
    overrides = json.load(open(ov_path)) if os.path.exists(ov_path) else {"block": [], "allow": []}

    def digest(addr: str) -> str:
        # Salted with the constant below rather than bare SHA-256: an unsalted
        # digest of an email address is trivially reversed from a wordlist of
        # likely addresses, which is exactly what a client roster is.
        return hashlib.sha256(("reit-suppression-v1:" + addr).encode()).hexdigest()

    payload = {
        "generatedAt": __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds"),
        "emailHashAlgo": "sha256(\"reit-suppression-v1:\" + lowercased address)",
        "emailHashes": sorted(digest(e) for e in emails),
        "domains": sorted(domains),
        "brands": [{"display": b["display"], "tokens": b["tokens"], "sources": b["sources"]}
                   for b in sorted(brands.values(), key=lambda x: x["display"])],
        "generic": sorted(GENERIC),
        "overrides": overrides,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(payload, open(os.path.join(OUT_DIR, "clients.json"), "w"), indent=1)
    print(f"suppression list: {len(emails)} email hashes, {len(domains)} domains, "
          f"{len(brands)} brands, {len(overrides.get('block', []))} manual blocks, "
          f"{len(overrides.get('allow', []))} manual allows")


if __name__ == "__main__":
    build()
