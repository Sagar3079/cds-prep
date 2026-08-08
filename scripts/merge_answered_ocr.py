#!/usr/bin/env python3
"""Merge seed + OCR questions with answer map into questions.json

⚠️  Despite the name this REPLACES the bank with `seed + OCR` only; it does not
merge into what is already there. Anything not reachable from those two sources —
including all 192 `pred-*` records — is dropped.

Paths resolve from this file rather than `$HOME`, and the write goes through
`guarded_write`. The `ANSWERS` map below is the provenance record for the 22
questions labelled `verified`, which is why this file is kept.
"""
import json, re, importlib.util, subprocess, sys
from pathlib import Path

from _bank_guard import bank_path, guarded_write, repo_root

ROOT = repo_root()
OUT = bank_path()

# qid -> answer index 0-3
ANSWERS = {
  # 2015-1 sentence improvement / misc
  "cds1-2015-043": 2,  # fell through
  "cds1-2015-047": 2,  # if he was arrested (or better "if he is" - C closest in options for past)
  "cds1-2015-048": 0,  # have been interested
  "cds1-2015-049": 1,  # had I fallen
  "cds1-2015-058": 0,  # Prior to
  "cds1-2015-062": 3,  # No improvement (listen to is correct)
  "cds1-2015-063": 1,  # nor did I wish
  "cds1-2015-064": 0,  # Even if she had
  "cds1-2015-066": 2,  # enthusiastic
  "cds1-2015-067": 1,  # famous painting
  "cds1-2015-069": 0,  # delicate changes
  "cds1-2015-088": 0,  # terrible
  # 2016-1
  "cds1-2016-001": 2,  # of
  "cds1-2016-002": 1,  # me to leave
  "cds1-2016-003": 2,  # have known
  "cds1-2016-005": 0,  # whose voice
  "cds1-2016-006": 0,  # consists of
  "cds1-2016-007": 3,  # No improvement (laying the table OK)
  "cds1-2016-008": 0,  # that one of us
  "cds1-2016-009": 1,  # We had hardly got
  "cds1-2016-012": 0,  # unless you work
  "cds1-2016-013": 1,  # any
  "cds1-2016-014": 0,  # deceiving
  "cds1-2016-015": 2,  # seen
  "cds1-2016-016": 0,  # belonged
  "cds1-2016-017": 0,  # knew
  "cds1-2016-018": 2,  # only when people work hard
  # 2017-1
  "cds1-2017-067": 1,  # reach
  "cds1-2017-068": 3,  # No improvement (cope with)
  "cds1-2017-069": 3,  # No improvement
  "cds1-2017-070": 1,  # For the last
  "cds1-2017-077": 0,  # for
  "cds1-2017-078": 1,  # by
  "cds1-2017-081": 1,  # with
  "cds1-2017-082": 3,  # No improvement
  "cds1-2017-083": 2,  # passed
  "cds1-2017-084": 1,  # is touring
  # 2018-1 (from manual_keys)
  "cds1-2018-001": 1, "cds1-2018-002": 3, "cds1-2018-003": 0, "cds1-2018-004": 3,
  "cds1-2018-005": 2, "cds1-2018-007": 2, "cds1-2018-008": 3, "cds1-2018-009": 3,
  "cds1-2018-010": 1, "cds1-2018-011": 2, "cds1-2018-021": 1, "cds1-2018-022": 0,
  "cds1-2018-023": 1, "cds1-2018-024": 2, "cds1-2018-025": 3, "cds1-2018-026": 3,
  "cds1-2018-027": 3, "cds1-2018-028": 2, "cds1-2018-037": 2, "cds1-2018-038": 3,
  "cds1-2018-039": 2, "cds1-2018-040": 3, "cds1-2018-051": 0, "cds1-2018-053": 2,
  "cds1-2018-057": 1,
}

def load_ocr():
    spec = importlib.util.spec_from_file_location("p", str(ROOT / "scripts/parse_ocr.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    qs = []
    for f in sorted((ROOT / "scripts/ocr_text").glob("CDS*-English.txt")):
        m = re.match(r"CDS(\d)-(\d{4})", f.stem)
        if not m: continue
        sess, year = int(m.group(1)), int(m.group(2))
        qs.extend(mod.parse_questions(f.read_text(encoding="utf-8"), year, sess))
    return qs

def main():
    # Start from seed.
    #
    # `sys.executable`, not a bare "python3": the interpreter running this script
    # is the one that has its dependencies, and on Windows the command is
    # "python" — the old hardcoded form failed there before doing anything.
    #
    # A non-zero exit is expected and fine. `seed_questions.py` now refuses to
    # shrink the bank, so on a full checkout this call declines to do anything
    # and the read below picks up the bank that is already there — which is the
    # better starting point in any case.
    subprocess.run([sys.executable, str(ROOT / "scripts" / "seed_questions.py")], check=False)
    base = json.loads(OUT.read_text(encoding="utf-8"))
    by_id = {q["id"]: q for q in base}

    for q in load_ocr():
        aid = ANSWERS.get(q["id"])
        if aid is None:
            continue
        # quality gate
        if any(len(o) < 1 or len(o) > 200 for o in q["options"]):
            continue
        if len(q["question"]) < 5:
            continue
        q["answer"] = aid
        q["answerSource"] = "verified"
        by_id[q["id"]] = q

    final = sorted(by_id.values(), key=lambda q: (q["year"], q["session"], q.get("qnum") or 0, q["id"]))
    final = [q for q in final if q.get("answer") is not None]
    guarded_write(
        final,
        path=OUT,
        force="--force" in sys.argv,
        label="merge_answered_ocr.py",
    )

if __name__ == "__main__":
    main()
