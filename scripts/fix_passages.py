"""
Attach the RIGHT reading passage to each comprehension question.

The bug this repairs: `ocr_and_parse.py` captured the comprehension section's
*directions* block plus the first passage and stamped that one string onto every
comprehension question in the paper. In CDS1-2018 that meant seventeen questions
carrying a single passage when the paper has four — thirteen of them shown a
passage that has nothing to do with the question, which makes them unanswerable
rather than merely untidy.

What this does instead: read the paper's text layer, split the comprehension
section on its `Passage` headings, and give each question the passage that
actually precedes it. Item numbers are the join — a passage owns every numbered
item between its own heading and the next one.

Only papers with a real text layer can be repaired here. A scanned paper has no
text to split, and guessing is exactly what caused the bug; those are reported
and left alone. Run with --check to see the state without writing.

    python scripts/fix_passages.py --check
    python scripts/fix_passages.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    sys.exit("PyMuPDF is required: pip install pymupdf")

ROOT = Path(__file__).resolve().parent.parent
BANK = ROOT / "src" / "data" / "questions.json"
PDFS = ROOT / "pdfs"

# A `Passage` heading on a line of its own. The papers print it as a centred
# label above the text, never inline, so anchoring to the line start keeps the
# word "passage" inside a question stem from splitting anything. Numbering is
# inconsistent across years — `Passage`, `Passage-I`, `Passage - 1.` all occur.
PASSAGE_HEADING = re.compile(
    r"^\s*Passage\s*(?:[-–—]?\s*[\dIVX]+)?\s*\.?\s*$", re.MULTILINE
)

# The first numbered item after a passage. `51.` at a line start, not `1.5`.
ITEM_NUMBER = re.compile(r"^\s*(\d{1,3})\s*\.\s", re.MULTILINE)

# The comprehension directions, which are not part of any passage. Matched from
# whatever fragment survived the page break ("s. After each passage…") through
# to the end of the sentence about the author's opinion.
DIRECTIONS = re.compile(
    r"^.*?(?:opinion of the author only|based on it)\s*\.?\s*", re.IGNORECASE | re.DOTALL
)

PAGE_NOISE = re.compile(r"^\s*(?:COMPREHENSION|Directions:)\s*$", re.MULTILINE)


def paper_pdf(qid: str) -> Path | None:
    """`cds1-2018-051` -> pdfs/CDS1-2018-English.pdf."""
    m = re.match(r"^(cds[12])-(\d{4})-", qid)
    if not m:
        return None
    path = PDFS / f"{m.group(1).upper()}-{m.group(2)}-English.pdf"
    return path if path.exists() else None


OCR_TEXT = Path(__file__).resolve().parent / "ocr_text"


def page_text(pdf: Path) -> str:
    """The paper's text, from its own text layer or from an OCR sidecar.

    Several papers are pure image scans. `scripts/ocr_passages.py` writes a
    sidecar for those; this prefers the real text layer and falls back to it, so
    a scanned paper is repairable without a second code path here. A paper with
    neither returns "" and its questions are reported as unresolved rather than
    guessed at.
    """
    doc = fitz.open(pdf)
    try:
        native = "".join(page.get_text("text") for page in doc)
    finally:
        doc.close()
    if native.strip():
        return native
    sidecar = OCR_TEXT / f"{pdf.stem}.txt"
    return sidecar.read_text(encoding="utf-8") if sidecar.exists() else ""


def clean(text: str) -> str:
    """One passage, as a reader should see it.

    Soft-hyphens and the discretionary breaks the typesetter used to justify a
    narrow column survive extraction as real characters, so `over­population`
    arrives split. Joining them back is what makes the text searchable and
    readable; leaving the line breaks in would render as a ragged column.
    """
    text = PAGE_NOISE.sub("", text)
    text = DIRECTIONS.sub("", text, count=1)
    text = text.replace("­", "").replace("■", "")
    # A hyphen at end of line is a break, not a compound word.
    text = re.sub(r"(\w)[-‐‑]\s*\n\s*(\w)", r"\1\2", text)
    text = re.sub(r"\s*\n\s*", " ", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def passages_for(pdf: Path) -> dict[int, str]:
    """Map each item number to the passage that owns it."""
    raw = page_text(pdf)
    blocks = PASSAGE_HEADING.split(raw)
    if len(blocks) < 2:
        return {}

    owned: dict[int, str] = {}
    for block in blocks[1:]:
        first = ITEM_NUMBER.search(block)
        if not first:
            continue
        body = clean(block[: first.start()])
        if len(body) < 120:  # a heading with no text under it is not a passage
            continue
        # Every item between this heading and the next belongs to this passage.
        for m in ITEM_NUMBER.finditer(block):
            owned[int(m.group(1))] = body
    return owned


def item_number(qid: str) -> int | None:
    m = re.match(r"^cds[12]-\d{4}-(\d+)$", qid)
    return int(m.group(1)) if m else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report, write nothing")
    args = ap.parse_args()

    bank = json.loads(BANK.read_text(encoding="utf-8"))
    # Anything that reads as passage-dependent, whether or not it has one today.
    needs = re.compile(
        r"passage|according to the author|the author (?:believes|says|means|views)",
        re.IGNORECASE,
    )
    targets = [
        q
        for q in bank
        if q.get("id", "").startswith(("cds1-", "cds2-"))
        and (q.get("topic") == "Comprehension" or q.get("passage") or needs.search(q.get("question", "")))
    ]

    cache: dict[Path, dict[int, str]] = {}
    fixed = wrong_before = unresolved = 0
    stranded: list[str] = []

    for q in targets:
        pdf = paper_pdf(q["id"])
        num = item_number(q["id"])
        if not pdf or num is None:
            stranded.append(f"{q['id']} (no source paper)")
            unresolved += 1
            continue
        if pdf not in cache:
            cache[pdf] = passages_for(pdf)
        found = cache[pdf].get(num)
        if not found:
            stranded.append(f"{q['id']} (no text layer in {pdf.name})")
            unresolved += 1
            continue

        before = q.get("passage")
        if before != found:
            if before:
                wrong_before += 1
            fixed += 1
            if not args.check:
                q["passage"] = found

    print(f"passage-dependent questions from real papers: {len(targets)}")
    print(f"  repaired:            {fixed}  (of which {wrong_before} carried the WRONG passage)")
    print(f"  still without one:   {unresolved}")
    for s in stranded:
        print(f"      {s}")

    if args.check:
        print("\n--check: nothing written")
        return 0

    if fixed:
        BANK.write_text(
            json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"\nwrote {BANK.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
