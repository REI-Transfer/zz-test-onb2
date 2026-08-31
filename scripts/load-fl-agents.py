#!/usr/bin/env python3
"""Refresh the Florida real estate licensee roster from DBPR public records.

DBPR republishes the extract weekly, so this is a cron job, not a one-off. It is
idempotent: existing rows are updated in place and the email columns are never
touched, because those are ours and cost money to fill.

    export SUPABASE_PAT=...   # from ~/.secrets
    python3 scripts/load-fl-agents.py

Source file is ~116MB / ~456k rows and takes about three minutes end to end.
"""
import csv, datetime, json, os, sys, urllib.request

URL = ("https://www2.myfloridalicense.com/sto/file_download/extracts/"
       "REALESTATE2501LICENSE_1.csv")
PROJECT = os.environ.get("SUPABASE_PROJECT_REF", "glaxjfmfhlhwsblwprzo")
SCHEMA = "agent_outreach_elevate"
CHUNK = 2500
CACHE = "/tmp/fl_re.csv"

# DBPR serves a browser-signature check; urllib's default User-Agent is rejected.
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

COLS = ("license_number,license_prefixed,profession,full_name,last_name,first_name,"
        "license_type,status_primary,status_secondary,address1,address2,address3,"
        "city,state,zip,county,original_license_date,status_date,expiration_date,"
        "employer_name,employer_license")

# Everything except the email columns. A weekly reload must not clobber addresses we
# discovered and verified — that is the whole reason they live in separate columns.
UPDATE_SET = ",".join(f"{c}=excluded.{c}" for c in COLS.split(",")[1:]) + \
             ",dbpr_loaded_at=now()"


def sql_date(s):
    s = (s or "").strip()
    if not s:
        return None
    try:
        return datetime.datetime.strptime(s, "%d-%b-%y").date().isoformat()
    except ValueError:
        return None


def lit(v):
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def post(query):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
        data=json.dumps({"query": query}).encode(),
        headers={"Authorization": f"Bearer {os.environ['SUPABASE_PAT']}",
                 "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.status


def download():
    if os.path.exists(CACHE) and os.path.getsize(CACHE) > 50_000_000:
        print(f"using cached {CACHE}")
        return
    print(f"downloading {URL}")
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=600) as r, open(CACHE, "wb") as f:
        f.write(r.read())
    print(f"  {os.path.getsize(CACHE):,} bytes")


def main():
    if "SUPABASE_PAT" not in os.environ:
        sys.exit("SUPABASE_PAT not set (source ~/.secrets)")
    download()

    buf, sent, skipped = [], 0, 0
    with open(CACHE, encoding="latin-1") as fh:
        for r in csv.reader(fh):
            if len(r) != 21:
                skipped += 1
                continue
            name = r[1].strip()
            last, first = ((name.split(",", 1) + [""])[:2] if "," in name
                           else (name, ""))
            buf.append("(" + ",".join(map(lit, [
                r[11], r[17], r[0], name, last.strip(), first.strip(), r[3],
                r[12], r[13], r[4], r[5], r[6], r[7], r[8], r[9], r[10],
                sql_date(r[14]), sql_date(r[15]), sql_date(r[16]), r[19], r[20],
            ])) + ")")
            if len(buf) == CHUNK:
                post(f"insert into {SCHEMA}.acq_agents ({COLS}) values\n"
                     + ",\n".join(buf)
                     + f"\non conflict (license_number) do update set {UPDATE_SET};")
                sent += len(buf)
                buf = []
                print(f"  {sent:,}", end="\r", flush=True)
    if buf:
        post(f"insert into {SCHEMA}.acq_agents ({COLS}) values\n"
             + ",\n".join(buf)
             + f"\non conflict (license_number) do update set {UPDATE_SET};")
        sent += len(buf)
    print(f"\nloaded {sent:,} licensees ({skipped} malformed rows skipped)")


if __name__ == "__main__":
    main()
