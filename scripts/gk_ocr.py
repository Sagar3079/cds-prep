#!/usr/bin/env python3
"""OCR the CDS General Knowledge question papers into cached, geometry-aware JSON.

This is stage 1 of the GK pipeline (stage 2 is ``gk_parse.py``). It is separate
from ``ocr_and_parse.py`` — the English pipeline — because the two papers have
nothing in common structurally:

  * GK booklets print every item **twice**, once in Hindi and once in English,
    on facing pages. Only the English pages are usable, so the parity of the
    English side has to be detected per PDF.
  * 17 of the 18 GK PDFs are pure scans with no text layer at all, so this
    stage needs a real OCR engine.

Engine: ``rapidocr-onnxruntime`` (pip-installable, no system binary, unlike the
tesseract the English pipeline assumes). It returns a bounding box per text
line, which is what makes the two-column reconstruction in ``gk_parse.py``
possible — a blind left/right page crop cannot tell a wide table apart from a
normal paragraph, and mis-cropping is exactly how a question gets mangled.

Output, one file per page, is cached under ``scripts/ocr_gk_text/<stem>/``:

    {"page": 12, "width": 1700, "height": 2200,
     "lines": [{"box": [x0, y0, x1, y1], "text": "...", "score": 0.98}, ...]}

Re-running is cheap: cached pages are skipped.

Requires: pymupdf, numpy, rapidocr-onnxruntime.

    python scripts/gk_ocr.py                 # every CDS*-GK.pdf
    python scripts/gk_ocr.py CDS2-2020       # substring filter
    python scripts/gk_ocr.py --workers 8
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PDF_DIR = REPO / "pdfs"
OCR_DIR = REPO / "scripts" / "ocr_gk_text"

DPI = 250
# The rec model drops inter-word spaces when the crop is downscaled too far, so
# these are raised well above the library defaults. Verified on CDS2-2020 p2:
# defaults produce "Whichoneofthefollowing", these produce the real spacing.
MAX_SIDE_LEN = 3000
DET_LIMIT_SIDE_LEN = 1200

# Words that only occur on an English page. Used to pick the English parity.
_EN_MARKERS = re.compile(
    r"\b(which|the|following|consider|statements?|correct|answer|above|"
    r"given|below|india|one|of|and|is|are|not)\b",
    re.I,
)


def _engine():
    from rapidocr_onnxruntime import RapidOCR

    # Each worker gets a small thread budget; the parallelism is across pages.
    n = max(1, int(os.environ.get("GK_OCR_THREADS", "4")))
    return RapidOCR(
        return_word_box=True,
        max_side_len=MAX_SIDE_LEN,
        det_limit_side_len=DET_LIMIT_SIDE_LEN,
        intra_op_num_threads=n,
        inter_op_num_threads=n,
    )


_ENGINE = None


def _get_engine():
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = _engine()
    return _ENGINE


def ocr_page(pdf_path: Path, page_no: int) -> dict:
    """OCR one page. Uses the embedded text layer when the PDF has one."""
    import fitz
    import numpy as np

    doc = fitz.open(pdf_path)
    page = doc[page_no]
    lines: list[dict] = []

    native = page.get_text("dict")
    native_chars = len(page.get_text().strip())
    if native_chars > 200 and os.environ.get("GK_USE_TEXTLAYER"):
        # CDS1-2018-GK is the only PDF with an embedded text layer, and it is
        # NOT usable by default: on that file the "(a)".."(d)" option markers
        # are simply absent from the text layer even though they are printed on
        # the page, so a parser trusting it silently loses the option
        # boundaries. Rendering and OCRing the page recovers them. Opt in with
        # GK_USE_TEXTLAYER=1 only if you have checked the markers survive.
        for block in native["blocks"]:
            for line in block.get("lines", []):
                text = "".join(s["text"] for s in line["spans"]).strip()
                if not text:
                    continue
                x0, y0, x1, y1 = line["bbox"]
                lines.append(
                    {"box": [round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)],
                     "text": text, "score": 1.0}
                )
        w, h = page.rect.width, page.rect.height
        doc.close()
        return {"page": page_no, "width": w, "height": h, "lines": lines,
                "source": "textlayer"}

    pix = page.get_pixmap(dpi=DPI)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    img = img[:, :, :3]
    w, h = pix.width, pix.height
    doc.close()

    res, _ = _get_engine()(img)
    for box, text, score in res or []:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        text = text.strip()
        if not text:
            continue
        lines.append(
            {"box": [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)],
             "text": text, "score": round(float(score), 3)}
        )
    return {"page": page_no, "width": w, "height": h, "lines": lines, "source": "ocr"}


def page_englishness(payload: dict) -> float:
    """Fraction of OCR'd characters that look like English prose.

    Devanagari renders as low-confidence latin garbage under a latin/CJK model,
    so this is measured on word hits rather than on the alphabet alone.
    """
    text = " ".join(l["text"] for l in payload["lines"])
    if len(text) < 40:
        return 0.0
    hits = len(_EN_MARKERS.findall(text))
    return hits / max(1.0, len(text.split()) / 4.0)


def _cache_path(pdf: Path, page_no: int) -> Path:
    return OCR_DIR / pdf.stem / f"p{page_no:03d}.json"


def _run_page(args) -> tuple[str, int, int]:
    pdf_name, page_no = args
    pdf = PDF_DIR / pdf_name
    out = _cache_path(pdf, page_no)
    if out.exists() and out.stat().st_size > 20:
        return pdf_name, page_no, -1
    payload = ocr_page(pdf, page_no)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return pdf_name, page_no, len(payload["lines"])


def detect_english_parity(pdf: Path) -> int:
    """Return 0 or 1 — the page-index parity that carries the English items."""
    import fitz

    doc = fitz.open(pdf)
    n = doc.page_count
    doc.close()
    scores = {0: 0.0, 1: 0.0}
    # Sample four content pages from the middle of the booklet; covers and
    # rough-work pages at either end are not representative.
    probes = [p for p in (n // 3, n // 3 + 1, n // 2, n // 2 + 1) if 0 < p < n - 1]
    for p in probes:
        cache = _cache_path(pdf, p)
        if cache.exists():
            payload = json.loads(cache.read_text(encoding="utf-8"))
        else:
            payload = ocr_page(pdf, p)
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        scores[p % 2] += page_englishness(payload)
    return 0 if scores[0] >= scores[1] else 1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("filter", nargs="?", default="")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--all-pages", action="store_true",
                    help="OCR both language sides instead of just the English one")
    args = ap.parse_args()

    import fitz

    pdfs = sorted(PDF_DIR.glob("CDS*-GK.pdf"))
    if args.filter:
        pdfs = [p for p in pdfs if args.filter.lower() in p.name.lower()]
    if not pdfs:
        sys.exit(f"no GK PDFs matching {args.filter!r} in {PDF_DIR}")

    jobs: list[tuple[str, int]] = []
    parity_note = {}
    for pdf in pdfs:
        doc = fitz.open(pdf)
        n = doc.page_count
        doc.close()
        parity = detect_english_parity(pdf)
        parity_note[pdf.name] = parity
        pages = range(n) if args.all_pages else [p for p in range(n) if p % 2 == parity]
        jobs.extend((pdf.name, p) for p in pages)
        print(f"{pdf.name}: {n} pages, English parity={parity}, queued {len(list(pages))}")

    (OCR_DIR).mkdir(parents=True, exist_ok=True)
    (OCR_DIR / "_parity.json").write_text(json.dumps(parity_note, indent=2), encoding="utf-8")

    todo = [j for j in jobs if not _cache_path(PDF_DIR / j[0], j[1]).exists()]
    print(f"\n{len(todo)} pages to OCR ({len(jobs) - len(todo)} cached)")
    t0 = time.time()
    done = 0
    if args.workers <= 1:
        for j in todo:
            _run_page(j)
            done += 1
            print(f"  {done}/{len(todo)} {j[0]} p{j[1]}", flush=True)
    else:
        with ProcessPoolExecutor(max_workers=args.workers) as ex:
            futs = [ex.submit(_run_page, j) for j in todo]
            for fut in as_completed(futs):
                name, page, nlines = fut.result()
                done += 1
                if done % 10 == 0 or done == len(todo):
                    rate = done / max(0.1, time.time() - t0)
                    print(f"  {done}/{len(todo)}  {rate:.1f} pg/s  last={name} p{page}", flush=True)
    print(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
