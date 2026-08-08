#!/usr/bin/env python3
"""Parse OCR text files into clean questions.json with quality filters.

⚠️  THIS SCRIPT REPLACES THE QUESTION BANK with only what it can parse out of
`scripts/ocr_text/`. It is not a merge.

It is also the script whose `keys.json` join no longer works: it expects a flat
`{qnum: letter}` mapping, while `answer_keys/keys.json` is nested per paper
(`{paper: {answers: {...}}}`). The lookup therefore silently resolves to None for
every question, which is why nothing in the shipped bank carries the
`coaching-key` tag this file stamps. The 464 `official-key` answers that ARE in
the bank were produced by a join that exists nowhere in this repo — reconstruct
it here before trusting this script to mine a new paper.

Paths resolve from this file (they used to come from `$HOME`) and the write goes
through `guarded_write`.
"""
import re
import json
import sys
from pathlib import Path

from _bank_guard import bank_path, guarded_write, repo_root

ROOT = repo_root()
OCR_DIR = ROOT / "scripts" / "ocr_text"
OUT = bank_path()
KEYS = ROOT / "answer_keys" / "keys.json"

TOPIC_HEADERS = [
    "SYNONYMS", "ANTONYMS", "SPOTTING ERRORS", "SPOTTING THE ERRORS",
    "ERROR DETECTION", "FILL IN THE BLANKS", "FILL IN THE BLANK",
    "ORDERING OF WORDS", "ORDERING OF SENTENCES", "SENTENCE ARRANGEMENT",
    "COMPREHENSION", "CLOZE COMPREHENSION", "CLOZE TEST",
    "IDIOMS AND PHRASES", "IDIOMS/PHRASES", "IDIOMS & PHRASES",
    "SENTENCE IMPROVEMENT", "SELECTING WORDS", "WORD SUBSTITUTION",
    "PARTS OF SPEECH", "PREPOSITIONS AND DETERMINERS", "PREPOSITIONS & DETERMINERS",
    "PHRASE SUBSTITUTION", "MATCHING LIST", "WORD CLASSES",
]


def clean(text: str) -> str:
    text = text.replace("\r", "\n")
    text = re.sub(r"\(ad\)", "(d)", text, flags=re.I)
    text = re.sub(r"\(da\)", "(d)", text, flags=re.I)
    text = re.sub(r"\(ab\)", "(b)", text, flags=re.I)
    text = re.sub(r"\(ac\)", "(c)", text, flags=re.I)
    text = re.sub(r"\(\s*([a-dA-D])\s*\)", r"(\1)", text)
    text = re.sub(r"===== PAGE \d+ =====", "\n", text)
    text = re.sub(r"[A-Z]{2,5}-[A-Z0-9/\-]{2,20}", " ", text)
    text = re.sub(r"SPACE FOR ROUGH WORK", " ", text, flags=re.I)
    text = re.sub(r"T\.B\.C\..{0,40}", " ", text)
    text = re.sub(r"Serial No\..{0,20}", " ", text, flags=re.I)
    return text


def is_junk(s: str) -> bool:
    if not s or len(s) < 1:
        return True
    if len(s) > 350:
        return True
    # too many non-alpha
    letters = sum(c.isalpha() for c in s)
    if letters < max(1, len(s) * 0.4):
        return True
    junk_tokens = ["No error", "Directions", "underlined", "Answer Sheet", "TEST BOOKLET"]
    # options that swallowed next question
    if re.search(r"\b\d{1,3}\s*[\.\)]\s+[A-Z]", s):
        return True
    if s.count("(") > 3:
        return True
    return False


def is_junk_question(q: str) -> bool:
    if len(q) < 8 or len(q) > 1200:
        return True
    letters = sum(c.isalpha() for c in q)
    if letters < len(q) * 0.45:
        return True
    if "Penalty for wrong" in q or "TEST BOOKLET" in q:
        return True
    if "IMMEDIATELY AFTER" in q:
        return True
    return False


def detect_topic(block: str) -> str | None:
    up = block.upper()
    for t in TOPIC_HEADERS:
        if t in up:
            return t.title().replace("And", "and")
    return None


def parse_questions(text: str, year: int, session: int) -> list[dict]:
    text = clean(text)
    pattern = re.compile(r"(?:^|\n)\s*(\d{1,3})\s*[\.\)]\s+", re.M)
    splits = list(pattern.finditer(text))
    questions = []
    current_topic = None
    current_passage = None

    for i, m in enumerate(splits):
        qnum = int(m.group(1))
        if qnum < 1 or qnum > 100:
            continue
        start = m.end()
        end = splits[i + 1].start() if i + 1 < len(splits) else len(text)
        chunk = text[start:end].strip()

        prev_end = splits[i - 1].end() if i > 0 else max(0, m.start() - 400)
        between = text[prev_end:m.start()]
        topic = detect_topic(between)
        if topic:
            current_topic = topic
            if "Comprehension" in topic and "Cloze" not in topic:
                pm = re.search(r"(?:Passage|PASSAGE)\s*[IVX0-9]*\s*[:\-]?\s*(.+)", between, re.S | re.I)
                if pm:
                    current_passage = re.sub(r"\s+", " ", pm.group(1)).strip()[:1800]
            else:
                current_passage = None

        opts_raw = {}
        for om in re.finditer(r"\(([a-dA-D])\)\s*", chunk):
            letter = om.group(1).lower()
            ostart = om.end()
            nxt = re.search(r"\(([a-dA-D])\)\s*", chunk[ostart:])
            oend = ostart + nxt.start() if nxt else len(chunk)
            oval = re.sub(r"\s+", " ", chunk[ostart:oend]).strip(" .;-")
            oval = re.sub(r"(Directions\s*:.*)$", "", oval, flags=re.I).strip()
            oval = re.sub(r"(The correct sequence should be.*)$", "", oval, flags=re.I).strip()
            if letter not in opts_raw and oval:
                opts_raw[letter] = oval

        if len(opts_raw) < 4:
            continue

        first_opt = re.search(r"\(([a-dA-D])\)", chunk)
        qtext = chunk[: first_opt.start()].strip() if first_opt else ""
        qtext = re.sub(r"\s+", " ", qtext).strip()
        # drop trailing labels
        qtext = re.sub(r"\s*The correct sequence should be\s*$", "", qtext, flags=re.I).strip()

        if is_junk_question(qtext):
            continue

        options = [opts_raw.get(l, "") for l in "abcd"]
        if any(is_junk(o) for o in options):
            continue

        # normalize options
        options = [o[:300] for o in options]

        passage = None
        if current_topic and "Comprehension" in current_topic and "Cloze" not in current_topic:
            passage = current_passage

        questions.append({
            "id": f"cds{session}-{year}-{qnum:03d}",
            "year": year,
            "session": session,
            "qnum": qnum,
            "passage": passage,
            "question": qtext[:1200],
            "options": options,
            "answer": None,
            "answerSource": "",
            "topic": current_topic or "General",
        })

    by_num = {}
    for q in questions:
        if q["qnum"] not in by_num:
            by_num[q["qnum"]] = q
    return list(by_num.values())


def load_keys():
    if KEYS.exists():
        return json.loads(KEYS.read_text())
    return {}


def main():
    keys = load_keys()
    all_q = []
    for f in sorted(OCR_DIR.glob("CDS*-English.txt")):
        m = re.match(r"CDS(\d)-(\d{4})", f.stem)
        if not m:
            continue
        sess, year = int(m.group(1)), int(m.group(2))
        qs = parse_questions(f.read_text(encoding="utf-8"), year, sess)
        key = keys.get(f"{year}-{sess}", {})
        for q in qs:
            letter = key.get(str(q["qnum"])) or key.get(q["qnum"])
            if letter:
                q["answer"] = "ABCD".index(str(letter).upper())
                q["answerSource"] = "coaching-key"
        all_q.extend(qs)
        answered = sum(1 for q in qs if q["answer"] is not None)
        print(f"{f.name}: {len(qs)} clean ({answered} with keys)")

    # dedupe by id
    by_id = {q["id"]: q for q in all_q}
    all_q = sorted(by_id.values(), key=lambda q: (q["year"], q["session"], q["qnum"]))
    guarded_write(
        all_q,
        path=OUT,
        force="--force" in sys.argv,
        label="parse_ocr.py",
    )
    print(f"with answers: {sum(1 for q in all_q if q['answer'] is not None)}")


if __name__ == "__main__":
    main()
