#!/usr/bin/env python3
"""
Shared safety rail for anything that rewrites `src/data/questions.json`.

Two separate bugs made this necessary, and they hid each other.

**The paths were wrong.** Every script in the generate-from-scratch lineage
resolved its files from `Path.home() / "cds-prep"` rather than from its own
location. Unless the repo happened to sit at exactly `~/cds-prep`, they read
nothing, wrote to a directory that did not exist, and printed a cheerful summary
— so an operator following the documented commands would believe the bank had
been rebuilt while nothing at all had changed. `repo_root()` below fixes that by
walking up from `__file__`.

**The overwrite was unconditional.** Fixing the paths alone would have been the
more dangerous change of the two: it points scripts that truncate the bank at the
real file for the first time. `seed_questions.py` emits roughly 150-200 records
from a hardcoded literal; the shipped bank is 803, of which 464 carry an official
UPSC answer key that took a separate mining pass to establish. Running it would
have collapsed the bank with no backup and no diff.

So `guarded_write` refuses to shrink the bank by more than `MAX_SHRINK` unless it
is told to, and takes a timestamped backup whatever it decides. It is the only
sanctioned way for these scripts to write the bank.

`--force` exists because "never" is the wrong rule for a repair tool — but it has
to be typed, on purpose, by somebody who has read what the refusal said.
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

#: A write keeping less than this share of the existing records is refused.
MAX_SHRINK = 0.9


def repo_root() -> Path:
    """
    The repo, found from this file rather than from `$HOME`.

    `scripts/_bank_guard.py` -> parents[1] is the checkout, wherever it lives.
    """
    return Path(__file__).resolve().parents[1]


def bank_path() -> Path:
    return repo_root() / "src" / "data" / "questions.json"


def load_bank(path: Path | None = None) -> list:
    """The current bank, or an empty list if there isn't one yet."""
    p = path or bank_path()
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    return data if isinstance(data, list) else []


def backup(path: Path) -> Path | None:
    """Copy the bank aside before it is touched. Returns the copy's path."""
    if not path.exists():
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    dest = path.with_name(f"{path.stem}.backup-{stamp}{path.suffix}")
    shutil.copy2(path, dest)
    return dest


def guarded_write(
    records: list,
    *,
    path: Path | None = None,
    force: bool = False,
    label: str = "this script",
) -> None:
    """
    Write the bank, refusing a destructive shrink unless `force` is set.

    Raises SystemExit with an explanation rather than returning a status, because
    every caller's correct response to a refusal is to stop.
    """
    out = path or bank_path()
    existing = load_bank(out)
    floor = int(len(existing) * MAX_SHRINK)

    if existing and len(records) < floor and not force:
        raise SystemExit(
            f"\nRefusing to write {out}.\n\n"
            f"  It currently holds {len(existing)} questions.\n"
            f"  {label} produced {len(records)}, which would discard "
            f"{len(existing) - len(records)} of them.\n\n"
            "  The shipped bank is not reproducible from these scripts: 464 of its\n"
            "  answers were joined against the official UPSC keys in a pass that no\n"
            "  script here currently performs, and 317 questions are hand-written\n"
            "  literals that have been edited in place since. Overwriting it loses\n"
            "  all of that, and there is no backup older than this refusal.\n\n"
            "  Treat src/data/questions.json as the source of truth and edit it\n"
            "  directly, or re-run with --force if you have genuinely decided to\n"
            "  replace the bank wholesale.\n"
        )

    saved = backup(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    # write_bytes, not write_text: text mode rewrites every "\n" as "\r\n" on
    # Windows, which makes a no-op run look like it changed all 803 records.
    out.write_bytes(
        (json.dumps(records, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    )
    print(f"Wrote {len(records)} questions to {out}")
    if saved:
        print(f"Previous bank ({len(existing)}) saved to {saved}")
