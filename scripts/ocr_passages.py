"""
OCR the comprehension pages of a SCANNED paper so `fix_passages.py` has text
to split.

Most papers in `pdfs/` carry a text layer and need nothing from here. A few are
pure image scans — `page.get_text()` returns an empty string for every page —
and those are the ones whose comprehension questions currently ship with no
passage at all, which makes them unanswerable.

Output is a sidecar text file per paper under `scripts/ocr_text/`, in the same
shape a text layer would have produced, so the repair script can treat both
kinds of paper identically.

OCR is not proofreading. What comes out of here is a candidate, and the
passages it produces are reviewed against the scan before they reach the bank —
a garbled passage is worse than a missing one, because a missing passage is
visibly missing and a garbled one reads as the author's own words.

    python scripts/ocr_passages.py CDS1-2017-English
    python scripts/ocr_passages.py --all-scans
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    sys.exit("PyMuPDF is required: pip install pymupdf")

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:  # pragma: no cover
    sys.exit("rapidocr-onnxruntime is required: pip install rapidocr-onnxruntime")

ROOT = Path(__file__).resolve().parent.parent
PDFS = ROOT / "pdfs"
OUT = Path(__file__).resolve().parent / "ocr_text"

# 300 DPI. At 200 the justified two-column body text of these papers loses
# enough letter separation that the recogniser starts merging short words.
ZOOM = 300 / 72


def is_scan(pdf: Path) -> bool:
    doc = fitz.open(pdf)
    try:
        return not any(page.get_text("text").strip() for page in doc)
    finally:
        doc.close()


def order_lines(result, page_width: int) -> list[str]:
    """Detected text boxes, in the order a person reads them.

    These papers are set in two columns. The recogniser emits boxes in roughly
    top-to-bottom order across the WHOLE page, so a naive sort interleaves the
    columns — a passage in the left column ends up shuffled line-by-line into
    the answer options printed beside it, which is unreadable and, worse, looks
    like a passage.

    So: split on the page midpoint by each box's own left edge, then read each
    column down. A box straddling the middle is a full-width heading and sorts
    with the column it starts in, which is where a heading belongs anyway.
    """
    mid = page_width / 2
    left: list[tuple[float, float, str]] = []
    right: list[tuple[float, float, str]] = []
    for box, text, _score in result:
        x = min(p[0] for p in box)
        y = min(p[1] for p in box)
        (left if x < mid else right).append((y, x, text))
    for col in (left, right):
        col.sort(key=lambda b: (b[0], b[1]))
    return [b[2] for b in left + right]


def ocr_pdf(pdf: Path, engine: RapidOCR) -> str:
    doc = fitz.open(pdf)
    chunks: list[str] = []
    try:
        for i, page in enumerate(doc):
            pix = page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM))
            result, _ = engine(pix.tobytes("png"))
            lines = order_lines(result, pix.width) if result else []
            chunks.append(f"\n<<<PAGE {i + 1}>>>\n" + "\n".join(lines))
            print(f"  page {i + 1}/{doc.page_count}", end="\r", flush=True)
    finally:
        doc.close()
    print()
    return "".join(chunks)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paper", nargs="?", help="e.g. CDS1-2017-English")
    ap.add_argument("--all-scans", action="store_true", help="every image-only paper")
    args = ap.parse_args()

    if args.all_scans:
        papers = sorted(p for p in PDFS.glob("*.pdf") if is_scan(p))
    elif args.paper:
        pdf = PDFS / f"{args.paper}.pdf"
        if not pdf.exists():
            sys.exit(f"no such paper: {pdf}")
        papers = [pdf]
    else:
        scans = sorted(p.stem for p in PDFS.glob("*.pdf") if is_scan(p))
        print("image-only papers (no text layer):")
        for s in scans:
            print(f"  {s}")
        return 0

    OUT.mkdir(exist_ok=True)
    engine = RapidOCR()
    for pdf in papers:
        print(f"{pdf.name}:")
        text = ocr_pdf(pdf, engine)
        dest = OUT / f"{pdf.stem}.txt"
        dest.write_text(text, encoding="utf-8")
        print(f"  -> {dest.relative_to(ROOT)} ({len(text)} chars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
