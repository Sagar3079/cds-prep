"""
Normalise the "No improvement" option, which OCR mangled eleven different ways.

`Noimprovement` is what the app currently renders — a missing space the
recogniser dropped between two words in a justified column. It is visible to
every candidate who reaches a sentence-improvement item, and it makes the
product look like it was assembled carelessly, which is the last impression a
paid exam app can afford.

Only the casing and the spacing change. The option's position in the list is
untouched, so no `answer` index moves — this cannot alter which answer is
correct, which is the one thing that must never happen to this file.

    python scripts/fix_option_spacing.py --check
    python scripts/fix_option_spacing.py
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANKS = [
    ROOT / "src" / "data" / "questions.json",
    ROOT / "src" / "data" / "questions-gk.json",
]

CANON = "No improvement"
# Any spelling of the phrase: no space, odd casing, trailing punctuation.
VARIANT = re.compile(r"^\s*no\s*improvement\s*[.;:]?\s*$", re.IGNORECASE)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report, write nothing")
    args = ap.parse_args()

    total = 0
    for bank_path in BANKS:
        if not bank_path.exists():
            continue
        bank = json.loads(bank_path.read_text(encoding="utf-8"))
        seen: Counter[str] = Counter()
        for q in bank:
            options = q.get("options") or []
            for i, opt in enumerate(options):
                if isinstance(opt, str) and VARIANT.match(opt) and opt != CANON:
                    seen[opt] += 1
                    if not args.check:
                        options[i] = CANON
        if seen:
            print(f"{bank_path.name}: {sum(seen.values())} option(s)")
            for variant, n in seen.most_common():
                print(f"   {variant!r} -> {CANON!r}  ({n})")
            total += sum(seen.values())
            if not args.check:
                bank_path.write_text(
                    json.dumps(bank, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )

    if not total:
        print("nothing to fix")
    elif args.check:
        print("\n--check: nothing written")
    else:
        print(f"\nnormalised {total} option(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
