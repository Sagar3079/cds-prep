#!/usr/bin/env python3
"""OCR CDS English PDFs (column-aware) and parse into structured questions."""
import fitz
import pytesseract
import os
import re
import json
import sys
from PIL import Image
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

PDF_DIR = Path.home() / "cds-prep" / "pdfs"
OUT_DIR = Path.home() / "cds-prep" / "scripts" / "ocr_text"
QUESTIONS_OUT = Path.home() / "cds-prep" / "scripts" / "ocr_parsed_raw.json"
DPI = 220


def ocr_page(page):
    pix = page.get_pixmap(dpi=DPI)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    w, h = img.size
    mid = w // 2
    gap = max(15, w // 80)
    left = img.crop((0, 0, mid - gap, h))
    right = img.crop((mid + gap, 0, w, h))
    cfg = "--psm 6"
    left_t = pytesseract.image_to_string(left, config=cfg)
    right_t = pytesseract.image_to_string(right, config=cfg)
    return left_t + "\n" + right_t


def ocr_pdf(pdf_path: Path) -> str:
    cache = OUT_DIR / (pdf_path.stem + ".txt")
    if cache.exists() and cache.stat().st_size > 500:
        return cache.read_text(encoding="utf-8")
    doc = fitz.open(pdf_path)
    parts = []
    for i in range(doc.page_count):
        # skip rough-work / blank-ish pages later
        text = ocr_page(doc[i])
        parts.append(f"\n\n===== PAGE {i} =====\n{text}")
        print(f"  {pdf_path.name} page {i+1}/{doc.page_count}", flush=True)
    doc.close()
    full = "\n".join(parts)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cache.write_text(full, encoding="utf-8")
    return full


def clean_text(text: str) -> str:
    text = text.replace("\r", "\n")
    # Fix common OCR option glitches
    text = re.sub(r"\(ad\)", "(d)", text, flags=re.I)
    text = re.sub(r"\(da\)", "(d)", text, flags=re.I)
    text = re.sub(r"\(ab\)", "(b)", text, flags=re.I)
    text = re.sub(r"\(ac\)", "(c)", text, flags=re.I)
    text = re.sub(r"\(\s*([a-dA-D])\s*\)", r"(\1)", text)
    # Remove page markers and booklet codes
    text = re.sub(r"===== PAGE \d+ =====", "\n", text)
    text = re.sub(r"SRSU-[A-Z0-9/\s]+", " ", text)
    text = re.sub(r"SPSS-[A-Z0-9/\s]+", " ", text)
    text = re.sub(r"SPACE FOR ROUGH WORK", " ", text, flags=re.I)
    text = re.sub(r"DO NOT OPEN THIS TEST BOOKLET.*?(?=Directions|SYNONYMS|ANTONYMS|\d+\.)", " ", text, flags=re.I | re.S)
    return text


TOPIC_HEADERS = [
    "SYNONYMS", "ANTONYMS", "SPOTTING ERRORS", "SPOTTING THE ERRORS",
    "ERROR DETECTION", "FILL IN THE BLANKS", "FILL IN THE BLANK",
    "ORDERING OF WORDS", "ORDERING OF SENTENCES", "SENTENCE ARRANGEMENT",
    "COMPREHENSION", "CLOZE COMPREHENSION", "CLOZE TEST",
    "IDIOMS AND PHRASES", "IDIOMS/PHRASES", "PHRASE SUBSTITUTION",
    "SENTENCE IMPROVEMENT", "SELECTING WORDS", "WORD SUBSTITUTION",
    "PARTS OF SPEECH", "PREPOSITIONS AND DETERMINERS",
]


def detect_topic(block: str) -> str | None:
    up = block.upper()
    for t in TOPIC_HEADERS:
        if t in up:
            return t.title()
    return None


def parse_questions(text: str, year: int, session: int) -> list[dict]:
    text = clean_text(text)
    # Split by question numbers at start of line: 1.  2. ... 100.
    # Also handle "1 ." with space
    pattern = re.compile(
        r"(?:^|\n)\s*(\d{1,3})\s*[\.\)]\s+",
        re.M,
    )
    splits = list(pattern.finditer(text))
    questions = []
    current_topic = None
    current_passage = None

    # Track topic headers before each question
    for i, m in enumerate(splits):
        qnum = int(m.group(1))
        if qnum < 1 or qnum > 120:
            continue
        start = m.end()
        end = splits[i + 1].start() if i + 1 < len(splits) else len(text)
        chunk = text[start:end].strip()

        # Look for topic in the text between previous end and this question
        prev_end = splits[i - 1].end() if i > 0 else 0
        between = text[prev_end:m.start()]
        topic = detect_topic(between)
        if topic:
            current_topic = topic
            if "Comprehension" in topic and "Cloze" not in topic:
                # try extract passage from between
                pass_m = re.search(
                    r"(?:Passage|PASSAGE)\s*[:\-]?\s*(.+)",
                    between,
                    re.S | re.I,
                )
                if pass_m:
                    current_passage = re.sub(r"\s+", " ", pass_m.group(1)).strip()[:2000]
            elif "Cloze" in (topic or ""):
                current_passage = None
            else:
                current_passage = None

        # Extract options (a)(b)(c)(d)
        opt_pat = re.compile(
            r"\(([a-dA-D])\)\s*(.*?)(?=\(([a-dA-D])\)|\Z)",
            re.S,
        )
        opts_raw = {}
        for om in re.finditer(r"\(([a-dA-D])\)\s*", chunk):
            letter = om.group(1).lower()
            ostart = om.end()
            # find next option or end
            nxt = re.search(r"\(([a-dA-D])\)\s*", chunk[ostart:])
            oend = ostart + nxt.start() if nxt else len(chunk)
            oval = chunk[ostart:oend].strip()
            oval = re.sub(r"\s+", " ", oval).strip(" .;-")
            # strip trailing direction junk
            oval = re.sub(r"(Directions\s*:.*)$", "", oval, flags=re.I).strip()
            if letter not in opts_raw and oval:
                opts_raw[letter] = oval

        if len(opts_raw) < 4:
            # try alternate: a) b) c) d)
            for om in re.finditer(r"(?:^|\s)([a-dA-D])[\.\)]\s+", chunk):
                letter = om.group(1).lower()
                ostart = om.end()
                nxt = re.search(r"(?:^|\s)([a-dA-D])[\.\)]\s+", chunk[ostart:])
                oend = ostart + nxt.start() if nxt else len(chunk)
                oval = re.sub(r"\s+", " ", chunk[ostart:oend]).strip(" .;-")
                if letter not in opts_raw and oval:
                    opts_raw[letter] = oval

        if len(opts_raw) < 4:
            continue

        # Question text = everything before first option
        first_opt = re.search(r"\(([a-dA-D])\)", chunk)
        if not first_opt:
            first_opt = re.search(r"(?:^|\s)([a-dA-D])[\.\)]\s+", chunk)
        qtext = chunk[: first_opt.start()].strip() if first_opt else chunk
        qtext = re.sub(r"\s+", " ", qtext).strip()
        # Remove "The correct sequence should be" noise handled as part of q
        if len(qtext) < 3:
            continue

        options = [
            opts_raw.get("a", ""),
            opts_raw.get("b", ""),
            opts_raw.get("c", ""),
            opts_raw.get("d", ""),
        ]
        if any(len(o) < 1 for o in options):
            continue
        # Cap option length
        options = [o[:400] for o in options]

        qid = f"cds{session}-{year}-{qnum:03d}"
        questions.append(
            {
                "id": qid,
                "year": year,
                "session": session,
                "qnum": qnum,
                "passage": current_passage if current_topic and "Comprehension" in (current_topic or "") and "Cloze" not in (current_topic or "") else None,
                "question": qtext[:1500],
                "options": options,
                "answer": None,  # filled later
                "answerSource": "",
                "topic": current_topic or "General",
            }
        )

    # Dedupe by qnum (keep first good)
    by_num = {}
    for q in questions:
        if q["qnum"] not in by_num:
            by_num[q["qnum"]] = q
    return list(by_num.values())


def process_one(pdf_name: str) -> dict:
    m = re.match(r"CDS(\d)-(\d{4})-English\.pdf", pdf_name)
    if not m:
        return {"file": pdf_name, "error": "bad name", "count": 0}
    session, year = int(m.group(1)), int(m.group(2))
    path = PDF_DIR / pdf_name
    print(f"START {pdf_name}", flush=True)
    try:
        if pdf_name == "CDS1-2018-English.pdf":
            # text PDF
            doc = fitz.open(path)
            text = "\n".join(doc[i].get_text() for i in range(doc.page_count))
            doc.close()
            OUT_DIR.mkdir(parents=True, exist_ok=True)
            (OUT_DIR / (path.stem + ".txt")).write_text(text, encoding="utf-8")
        else:
            text = ocr_pdf(path)
        qs = parse_questions(text, year, session)
        print(f"DONE {pdf_name}: {len(qs)} questions", flush=True)
        return {"file": pdf_name, "year": year, "session": session, "count": len(qs), "questions": qs}
    except Exception as e:
        print(f"FAIL {pdf_name}: {e}", flush=True)
        return {"file": pdf_name, "error": str(e), "count": 0}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pdfs = sorted([p.name for p in PDF_DIR.glob("CDS*-English.pdf")])
    # Allow filtering: python ocr_and_parse.py CDS1-2018
    if len(sys.argv) > 1:
        filt = sys.argv[1]
        pdfs = [p for p in pdfs if filt in p]

    all_q = []
    # Sequential is safer for memory; parallel for speed on multi-core
    workers = int(os.environ.get("OCR_WORKERS", "2"))
    if workers <= 1:
        results = [process_one(p) for p in pdfs]
    else:
        results = []
        with ProcessPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(process_one, p): p for p in pdfs}
            for fut in as_completed(futs):
                results.append(fut.result())

    for r in results:
        if r.get("questions"):
            all_q.extend(r["questions"])

    # Sort
    all_q.sort(key=lambda q: (q["year"], q["session"], q["qnum"]))
    QUESTIONS_OUT.parent.mkdir(parents=True, exist_ok=True)
    QUESTIONS_OUT.write_text(json.dumps(all_q, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nTOTAL: {len(all_q)} questions -> {QUESTIONS_OUT}")
    for r in sorted(results, key=lambda x: x.get("file", "")):
        print(f"  {r.get('file')}: {r.get('count', 0)}  {r.get('error', '')}")


if __name__ == "__main__":
    main()
