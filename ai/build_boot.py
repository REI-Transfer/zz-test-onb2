#!/usr/bin/env python3
"""Rebuild ai/GROK_BOOT.md from the master prompt, memory files, conductor and kickoff.
Run from the repo root or from ai/. Keeps the paste-ready boot pack in sync."""
import pathlib, re, sys
here = pathlib.Path(__file__).resolve().parent
boot_path = here / "GROK_BOOT.md"
old = boot_path.read_text()
head = old.split("<<<<< PART 1", 1)[0]
kick = "<<<<< PART 4" + old.split("<<<<< PART 4", 1)[1]
def part(title, rel):
    return f"\n\n<<<<< {title} — {rel} >>>>>\n\n" + (here / rel).read_text().rstrip() + "\n"
out = head.rstrip() + "\n"
out += part("PART 1 — MASTER PROMPT", "GROK_MASTER_PROMPT.md")
for f in ["LEDGER","EXPERIMENTS","ANGLES","KEYWORDS","SCORECARD","EVALS","CHANGELOG"]:
    out += part(f"PART 2 — MEMORY {f}", f"grok/memory/{f}.md")
out += part("PART 3 — CONDUCTOR MODULE", "grok/skills/conductor.md")
out += "\n\n" + kick
boot_path.write_text(out)
print(f"wrote {boot_path} ({out.count(chr(10))} lines)")
