"""
File sentence-improvement items under "Sentence Improvement".

Twenty-nine of them ship under "General" or "Comprehension". The
Comprehension ones are the damaging half: a comprehension question is one you
answer *from a passage*, so ten items with no passage sat in that topic looking
like passage questions whose passage had gone missing. It had not. They were
never comprehension questions.

The classifier is the options, not the stem: an item offering some spelling of
"No improvement" is asking you to improve part of a sentence, whatever it was
catalogued as. That test is exact, which is why it is used here and in
`extract_underlines.py` rather than a keyword match on the question text.

Topic strings are also the mastery keys, so this moves a handful of past
answers between buckets in anyone's local history. That is the correct
direction — those answers were being counted against the wrong skill.

    python scripts/fix_topics.py --check
    python scripts/fix_topics.py
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANK = ROOT / "src" / "data" / "questions.json"

TOPIC = "Sentence Improvement"
NO_IMPROVEMENT = re.compile(r"^\s*no\s*improvement\s*$", re.IGNORECASE)


def is_improvement(q: dict) -> bool:
    return any(NO_IMPROVEMENT.match(o or "") for o in q.get("options", []))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report, write nothing")
    args = ap.parse_args()

    bank = json.loads(BANK.read_text(encoding="utf-8"))
    moved = Counter()
    for q in bank:
        if is_improvement(q) and q.get("topic") != TOPIC:
            moved[q.get("topic") or "(none)"] += 1
            if not args.check:
                q["topic"] = TOPIC

    total = sum(moved.values())
    print(f"sentence-improvement items filed elsewhere: {total}")
    for topic, n in moved.most_common():
        print(f"  {topic}: {n}")

    # The point of the exercise: after the move, does every remaining
    # comprehension question actually have a passage to comprehend?
    comp = [q for q in bank if q.get("topic") == "Comprehension"]
    orphan = [q for q in comp if not q.get("passage")]
    print(f"\nComprehension questions after the move: {len(comp)}")
    print(f"  without a passage: {len(orphan)}")
    for q in orphan:
        print(f"    {q['id']} | {q['question'][:60]}")

    if args.check:
        print("\n--check: nothing written")
        return 0
    if total:
        BANK.write_text(
            json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"\nwrote {BANK.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
