"""
Recover the underlined part of every sentence-improvement item from the source
paper, and record it as the question's `target`.

Why this exists
---------------
A sentence-improvement item prints one part of the sentence underlined and asks
you to replace it. The underline IS the question. Our OCR pipeline reads text
and discards formatting, so every one of these shipped as a flat sentence with
four replacements and nothing marked — you had to reverse-engineer the target
from the options.

Why the underline and not a heuristic
-------------------------------------
It is tempting to infer the target from the options: they are all prepositions,
so find the preposition. A heuristic like that was measured at 81% on this bank
once and rejected, because the failure mode is not "no highlight" but "the wrong
word highlighted with confidence", which teaches the wrong thing. The underline
printed on the page is ground truth. This reads that.

How it works, and why it is anchored to the stem
------------------------------------------------
The first version of this script searched each page for horizontal rules and
matched every one against every improvement stem in the paper. That found
450-odd "rules" per paper — table borders, answer-sheet lines, dot leaders —
and with hundreds of spurious crops competing, some coincidentally matched a
stem span perfectly. Checked by hand, roughly a third of its output was wrong,
including several that scored 1.00. Precision cannot be bought with a threshold
when the candidate is drawn from the wrong part of the page.

So the search is inverted. For each page:

1. OCR it into lines, keeping each line's box.
2. Locate the question's own stem among those lines. If the stem is not on this
   page, nothing on this page can be its underline, and we stop.
3. Look for rules ONLY inside the stem's own bounding box, on its own baseline.
4. Crop the text sitting on that rule, OCR just the crop, and align it against
   the spans of THAT ONE stem.

Step 2 is what makes step 4 trustworthy: the candidate set collapses from every
span of every question in the paper to the thirty-odd spans of a single known
sentence.

    python scripts/extract_underlines.py --check
    python scripts/extract_underlines.py --check --paper CDS1-2016-English
    python scripts/extract_underlines.py
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

try:
    import fitz  # PyMuPDF
    import numpy as np
    from PIL import Image
    from rapidocr_onnxruntime import RapidOCR
except ImportError as exc:  # pragma: no cover
    sys.exit(f"missing dependency: {exc}. Need pymupdf, numpy, pillow, rapidocr-onnxruntime")

ROOT = Path(__file__).resolve().parent.parent
BANK = ROOT / "src" / "data" / "questions.json"
PDFS = ROOT / "pdfs"

DPI = 300
ZOOM = DPI / 72

# An underline, in pixels at 300 DPI.
MIN_RULE = 55
RULE_DENSITY = 0.88
BELOW_MAX = 0.15
ABOVE_MAX = 0.5
# How far under a line's box the rule may sit and still be that line's underline.
BASELINE_SLOP = 26
# One line of text above the rule, for the crop.
LINE_H = 44

# Alignment thresholds. Much lower than the un-anchored version needed, and
# meaningfully safer, because the candidate spans all come from one sentence
# that we have already confirmed is printed at this spot on the page.
MIN_SCORE = 0.72
MIN_MARGIN = 0.04
MAX_SPAN_WORDS = 8

# Locating the stem on the page: a run of this many consecutive letters from
# the stem, found verbatim in the page's OCR, is enough to anchor it. Both
# sides are OCR of the same print, so they agree over short runs far more often
# than over whole sentences.
ANCHOR_LEN = 14

NO_IMPROVEMENT = re.compile(r"^\s*no\s*improvement\s*$", re.IGNORECASE)


def is_improvement(q: dict) -> bool:
    """Read it off the options, not the topic — 29 of these are misfiled."""
    return any(NO_IMPROVEMENT.match(o or "") for o in q.get("options", []))


def paper_of(qid: str) -> Path | None:
    m = re.match(r"^(cds[12])-(\d{4})-", qid)
    if not m:
        return None
    p = PDFS / f"{m.group(1).upper()}-{m.group(2)}-English.pdf"
    return p if p.exists() else None


def norm(s: str) -> str:
    """Compare on letters alone: OCR loses spaces and mangles punctuation."""
    return re.sub(r"[^a-z]", "", s.lower())


def spans(stem: str) -> list[tuple[str, str]]:
    """Every contiguous run of up to MAX_SPAN_WORDS words, with its key."""
    words = stem.split()
    out = []
    for i in range(len(words)):
        for n in range(1, min(MAX_SPAN_WORDS, len(words) - i) + 1):
            text = " ".join(words[i : i + n])
            key = norm(text)
            if key:
                out.append((text, key))
    return out


def find_rules(dark: "np.ndarray", box: tuple[int, int, int, int]) -> list[tuple[int, int, int]]:
    """Horizontal rules inside `box` = (x0, y0, x1, y1)."""
    x0b, y0b, x1b, y1b = box
    h, w = dark.shape
    y0b = max(5, y0b)
    y1b = min(h - 7, y1b)
    runs: list[tuple[int, int, int]] = []
    for y in range(y0b, y1b):
        row = dark[y, x0b:x1b]
        xs = np.flatnonzero(row)
        if xs.size < MIN_RULE // 2:
            continue
        splits = np.flatnonzero(np.diff(xs) > 3)
        starts = np.concatenate(([0], splits + 1))
        ends = np.concatenate((splits, [xs.size - 1]))
        for s, e in zip(starts, ends):
            x0, x1 = int(xs[s]) + x0b, int(xs[e]) + x0b
            if x1 - x0 < MIN_RULE:
                continue
            if (
                dark[y, x0 : x1 + 1].mean() > RULE_DENSITY
                and dark[y - 5 : y - 3, x0 : x1 + 1].mean() < ABOVE_MAX
                and dark[y + 3 : y + 7, x0 : x1 + 1].mean() < BELOW_MAX
            ):
                runs.append((y, x0, x1))
    merged: list[tuple[int, int, int]] = []
    for y, x0, x1 in sorted(runs):
        if merged and y - merged[-1][0] <= 4 and abs(x0 - merged[-1][1]) < 30:
            continue
        merged.append((y, x0, x1))
    return merged


def page_lines(result) -> list[tuple[str, tuple[int, int, int, int]]]:
    lines = []
    for box, text, _score in result:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        lines.append((text, (int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys)))))
    # Two columns: sort down the left column, then down the right.
    if not lines:
        return []
    mid = (min(b[0] for _t, b in lines) + max(b[2] for _t, b in lines)) / 2
    left = sorted((l for l in lines if l[1][0] < mid), key=lambda l: l[1][1])
    right = sorted((l for l in lines if l[1][0] >= mid), key=lambda l: l[1][1])
    return left + right


def locate_stem(stem: str, lines) -> tuple[int, int, int, int] | None:
    """Bounding box of the stem where it is printed on this page, or None.

    Anchors on short verbatim letter-runs rather than the whole sentence: the
    bank's text and this page's text are two different OCR passes over the same
    print, so they agree locally much more reliably than globally.
    """
    if not lines:
        return None
    keys = [norm(t) for t, _b in lines]
    joined = "".join(keys)
    # Char offset -> line index.
    owner: list[int] = []
    for i, k in enumerate(keys):
        owner.extend([i] * len(k))

    target = norm(stem)
    if len(target) < ANCHOR_LEN:
        return None
    hits: list[int] = []
    for start in range(0, max(1, len(target) - ANCHOR_LEN), 6):
        probe = target[start : start + ANCHOR_LEN]
        at = joined.find(probe)
        if at >= 0:
            hits.append(at)
    if not hits:
        return None

    lo = owner[min(hits)]
    hi = owner[min(max(hits) + ANCHOR_LEN - 1, len(owner) - 1)]
    # The stem may run past the last anchor; include the following line when
    # the anchors stop short of the stem's length.
    hi = min(len(lines) - 1, max(hi, lo + max(0, len(target) // 45)))
    boxes = [b for _t, b in lines[lo : hi + 1]]
    return (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes) + BASELINE_SLOP,
    )


def best_span(crop: str, cands: list[tuple[str, str]]):
    key = norm(crop)
    if not key:
        return None
    scored = sorted(
        ((SequenceMatcher(None, key, k).ratio(), text) for text, k in cands),
        reverse=True,
    )
    top = scored[0]
    # Runner-up must be a materially different span, not a neighbouring
    # sub-span of the same words.
    runner = next((s for s in scored[1:] if norm(s[1]) != norm(top[1])), None)
    margin = top[0] - runner[0] if runner else 1.0
    return top[1], top[0], margin


def process(pdf: Path, group: list[dict], engine: RapidOCR, log) -> dict[str, tuple[str, float]]:
    doc = fitz.open(pdf)
    pending = {q["id"]: q for q in group}
    found: dict[str, tuple[str, float]] = {}
    try:
        for pno, page in enumerate(doc):
            if not pending:
                break
            pix = page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM))
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                pix.height, pix.width, pix.n
            )
            rgb = img[:, :, :3]
            dark = rgb.mean(axis=2) < 128
            result, _ = engine(pix.tobytes("png"))
            lines = page_lines(result) if result else []

            for qid in list(pending):
                q = pending[qid]
                box = locate_stem(q["question"], lines)
                if box is None:
                    continue
                rules = find_rules(dark, box)
                if not rules:
                    continue
                cands = spans(q["question"])
                best = None
                for y, x0, x1 in rules:
                    crop = rgb[max(0, y - LINE_H) : y - 1, max(0, x0 - 4) : x1 + 5]
                    if crop.size == 0 or crop.shape[0] < 12:
                        continue
                    buf = io.BytesIO()
                    Image.fromarray(crop).resize(
                        (crop.shape[1] * 2, crop.shape[0] * 2)
                    ).save(buf, "PNG")
                    res, _ = engine(buf.getvalue())
                    text = " ".join(t for _b, t, _s in res) if res else ""
                    hit = best_span(text, cands)
                    if hit and (best is None or hit[1] > best[1]):
                        best = hit
                if best and best[1] >= MIN_SCORE and best[2] >= MIN_MARGIN:
                    found[qid] = (best[0], best[1])
                    log(f"  {qid}  p{pno + 1}  {best[1]:.2f}  target={best[0]!r}")
                    del pending[qid]
            print(f"  page {pno + 1}/{doc.page_count}", end="\r", flush=True)
    finally:
        doc.close()
    print()
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report, write nothing")
    ap.add_argument("--paper", help="limit to one paper, e.g. CDS1-2016-English")
    args = ap.parse_args()

    bank = json.loads(BANK.read_text(encoding="utf-8"))
    items = [q for q in bank if is_improvement(q)]
    by_paper: dict[Path, list[dict]] = {}
    orphans = 0
    for q in items:
        pdf = paper_of(q["id"])
        if pdf is None:
            orphans += 1
            continue
        if args.paper and pdf.stem != args.paper:
            continue
        by_paper.setdefault(pdf, []).append(q)

    total = sum(len(v) for v in by_paper.values())
    print(f"sentence-improvement items: {len(items)}")
    print(f"  hand-written, no source paper: {orphans}")
    print(f"  from papers: {total}\n")

    engine = RapidOCR()
    resolved: dict[str, tuple[str, float]] = {}
    for pdf, group in sorted(by_paper.items()):
        print(f"{pdf.name}: {len(group)} items")
        resolved.update(process(pdf, group, engine, print))

    missing = [q for g in by_paper.values() for q in g if q["id"] not in resolved]
    print(f"\nresolved {len(resolved)} of {total}")
    if missing:
        print(f"no confident underline for {len(missing)} — left unhighlighted:")
        for q in missing:
            print(f"  {q['id']} | {q['question'][:62]}")

    if args.check:
        print("\n--check: nothing written")
        return 0
    for q in items:
        if q["id"] in resolved:
            q["target"] = resolved[q["id"]][0]
    if resolved:
        BANK.write_text(
            json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"\nwrote {BANK.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
