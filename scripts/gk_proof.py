#!/usr/bin/env python3
"""Proofreading harness for the GK draft.

`gk_parse.py` got the *structure* right (question number, stem meaning, four
options in order) but not the *characters* — the OCR drops inter-word spaces
and inserts noise. This script exists to close that gap the only honest way:
put every promoted record next to the piece of paper it came from, read both,
and record a correction.

Three subcommands:

    crops <paper>     render one PNG per parsed question, wide enough to read
    apply             fold scripts/gk_corrections.json into the draft
    build             run the sanity gates and write src/data/questions-gk.json

The corrections file is hand-written from the crops (see `crops`), never
generated. A regex that "fixes" text it has not seen is exactly the failure
mode this whole exercise is meant to catch.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import fitz  # noqa: E402
from gk_parse import OCR_DIR, PDF_DIR, REPO, paper_stream, segment  # noqa: E402

DRAFT = REPO / "src" / "data" / "questions-gk.draft.json"
OUT = REPO / "src" / "data" / "questions-gk.json"
CORRECTIONS = REPO / "scripts" / "gk_corrections.json"
PROOF_DIR = OCR_DIR / "_proof"


# --------------------------------------------------------------------------
# crops
# --------------------------------------------------------------------------

def crops(stem: str, dpi: int = 190, only: set[int] | None = None) -> None:
    """One PNG per parsed question, cropped to the lines the parser used."""
    stream, _ = paper_stream(stem)
    items = {i["qnum"]: i for i in segment(stream)}
    draft = json.loads(DRAFT.read_text(encoding="utf-8"))
    paper = f"cds{stem[3]}-{stem[5:9]}-gk"
    want = [r["qnum"] for r in draft if r["id"].startswith(paper + "-")]
    if only:
        want = [q for q in want if q in only]

    dest = PROOF_DIR / stem
    dest.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF_DIR / f"{stem}.pdf")
    made = 0
    for q in want:
        item = items.get(q)
        if not item:
            continue
        lines = item["lines"]
        for p in sorted({l["page"] for l in lines}):
            ls = [l for l in lines if l["page"] == p]
            page = doc[p]
            scale = page.rect.width / max(l["page_w"] for l in ls)
            clip = fitz.Rect(
                max(0, (min(l["x0"] for l in ls) - 34) * scale),
                max(0, (min(l["y0"] for l in ls) - 16) * scale),
                min(page.rect.width, (max(l["x1"] for l in ls) + 34) * scale),
                min(page.rect.height, (max(l["y1"] for l in ls) + 16) * scale),
            )
            suffix = "" if len({l["page"] for l in lines}) == 1 else f"_p{p:03d}"
            page.get_pixmap(dpi=dpi, clip=clip).save(dest / f"q{q:03d}{suffix}.png")
            made += 1
    print(f"{stem}: {made} crops -> {dest}")


# --------------------------------------------------------------------------
# apply + gates
# --------------------------------------------------------------------------

BAD_CHARS = "�"
LONG_WORD = re.compile(r"[A-Za-z][A-Za-z'’\-]{25,}")
DOUBLED = re.compile(r"[,;:]{2,}|\.\.(?!\.)|\?\?|!!")

# The papers are typeset Indian-style, with a space before `?` and `:`. Two
# proofreaders transcribed that literally and two normalised it, which would
# have left the file inconsistent between papers. It is pure typography, so it
# is settled here, once, for every record — not per record.
CURLY = {"‘": "'", "’": "'", "“": '"', "”": '"',
         "–": "-", "—": "-", "（": "(", "）": ")"}


def normalise(s: str) -> str:
    for a, b in CURLY.items():
        s = s.replace(a, b)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+([,;:?!.])(?=\s|$)", r"\1", s)
    return s


# Options whose text only makes sense where it was printed. `shuffleQuestionOptions`
# must leave these alone: "None of the above" sitting at (a) is nonsense, and an
# option that names another option's letter breaks outright.
FIXED_TAIL = re.compile(
    r"\b(none of (the above|these|the following)|all of (the above|these)|"
    r"both \(?[a-d]\)? and|neither \(?[a-d]\)? nor)\b", re.I)
OPTION_LETTER_REF = re.compile(r"\(\s*[a-d]\s*\)")
# The statement-code family — "1 only", "2 and 3 only", "Both 1 and 2",
# "Neither 1 nor 2". Shuffling these scores correctly but prints the code block
# out of the order the paper uses, which reads as a typo to anyone who has sat
# the exam. Cheaper to pin them than to explain them.
CODE_OPTION = re.compile(
    r"^(both\s+\d\s+and\s+\d|neither\s+\d\s+nor\s+\d|"
    r"[\d,\s]+(and\s+\d)?\s*(only)?|"
    r"\d(\s*,\s*\d)*\s+and\s+\d\s*(only)?)\.?$", re.I)


def is_fixed(options: list[str]) -> bool:
    if any(FIXED_TAIL.search(o) or OPTION_LETTER_REF.search(o) for o in options):
        return True
    return all(CODE_OPTION.match(o.strip()) for o in options)


def gate(records: list[dict], keys: dict, existing_ids: set[str]) -> list[str]:
    """Every rule that must hold before this file is allowed near a learner."""
    errs: list[str] = []
    seen: set[str] = set()
    for r in records:
        rid = r["id"]
        if rid in seen:
            errs.append(f"{rid}: duplicate id")
        seen.add(rid)
        if rid in existing_ids:
            errs.append(f"{rid}: collides with questions.json")
        if r.get("subject") != "gk":
            errs.append(f"{rid}: subject is {r.get('subject')!r}")
        if r.get("answerSource") != "official-key":
            errs.append(f"{rid}: answerSource is {r.get('answerSource')!r}")
        if len(r.get("options") or []) != 4:
            errs.append(f"{rid}: {len(r.get('options') or [])} options")
        if not isinstance(r.get("answer"), int) or not 0 <= r["answer"] <= 3:
            errs.append(f"{rid}: answer {r.get('answer')!r} out of range")

        # answer must re-derive from the official key, not from the draft
        m = re.match(r"(cds[12]-\d{4}-gk)-(\d+)$", rid)
        paper, qnum = m.group(1), str(int(m.group(2)))
        entry = keys.get(paper)
        if not entry:
            errs.append(f"{rid}: no key entry for {paper}")
        else:
            letter = str(entry["answers"].get(qnum, "")).strip().upper()
            idx = {"A": 0, "B": 1, "C": 2, "D": 3}.get(letter)
            if idx is None:
                errs.append(f"{rid}: key has no answer for q{qnum}")
            elif idx != r.get("answer"):
                errs.append(f"{rid}: answer {r.get('answer')} != key {letter}({idx})")

        # year / session must match the id, which is the paper it came from
        if f"cds{r.get('session')}-{r.get('year')}-gk" != paper:
            errs.append(f"{rid}: year/session {r.get('year')}/{r.get('session')} "
                        f"disagrees with id")

        texts = [r.get("question", "")] + list(r.get("options") or [])
        for t in texts:
            if not t or not t.strip():
                errs.append(f"{rid}: empty text field")
            if any(c in t for c in BAD_CHARS):
                errs.append(f"{rid}: replacement character in text")
            if DOUBLED.search(t):
                errs.append(f"{rid}: doubled punctuation in {t[:40]!r}")
            w = LONG_WORD.search(t)
            if w:
                errs.append(f"{rid}: {len(w.group())}-char word {w.group()!r}")
        # A literal `?` is legitimate — it ends the stem, and a two-part stem
        # ("...is/are correct? 1. ... Select the correct answer...") carries one
        # mid-string. What is never legitimate is a `?` standing in for a glyph
        # the OCR could not read (`NaHCO?`), which shows up glued to a word or
        # floating after a space.
        for t in texts:
            if re.search(r"\s\?|\?(?=[A-Za-z0-9])", t):
                errs.append(f"{rid}: stray question mark in {t[:50]!r}")
        for o in (r.get("options") or []):
            if "?" in o:
                errs.append(f"{rid}: question mark inside option {o[:40]!r}")
    return errs


def load_corrections() -> dict:
    if not CORRECTIONS.exists():
        return {}
    return json.loads(CORRECTIONS.read_text(encoding="utf-8"))


def apply_corrections(records: list[dict], corr: dict) -> tuple[list[dict], list[str]]:
    """Fold the hand-written corrections in. Anything marked drop leaves."""
    out, dropped = [], []
    for r in records:
        c = corr.get(r["id"])
        if c is None:
            out.append(dict(r))
            continue
        if c.get("drop"):
            dropped.append(f"{r['id']}: {c['drop']}")
            continue
        r = dict(r)
        if "question" in c:
            r["question"] = c["question"]
        if "options" in c:
            if len(c["options"]) != 4:
                raise SystemExit(f"{r['id']}: correction has {len(c['options'])} options")
            r["options"] = c["options"]
        if "topic" in c:
            if c["topic"] is None:
                r.pop("topic", None)
            else:
                r["topic"] = c["topic"]
        out.append(r)
    return out, dropped


def finish(r: dict) -> dict:
    r["question"] = normalise(r["question"])
    r["options"] = [normalise(o) for o in r["options"]]
    if is_fixed(r["options"]):
        r["fixedOptions"] = True
    else:
        r.pop("fixedOptions", None)
    # Field order matches the English bank so a diff of the two reads straight.
    order = ["id", "year", "session", "qnum", "subject", "passage", "question",
             "fixedOptions", "options", "answer", "answerSource", "topic"]
    return {k: r[k] for k in order if k in r}


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("crops")
    c.add_argument("paper")
    c.add_argument("--dpi", type=int, default=190)
    c.add_argument("--q", default="", help="comma list of question numbers")

    b = sub.add_parser("build")
    b.add_argument("--papers", required=True, help="comma list, e.g. cds1-2018-gk,...")
    b.add_argument("--dry-run", action="store_true")

    args = ap.parse_args()

    if args.cmd == "crops":
        stems = [p.name for p in OCR_DIR.iterdir()
                 if p.is_dir() and args.paper.lower() in p.name.lower()]
        only = {int(x) for x in args.q.split(",") if x.strip()} or None
        for s in sorted(stems):
            crops(s, args.dpi, only)
        return

    draft = json.loads(DRAFT.read_text(encoding="utf-8"))
    keys = json.loads((REPO / "answer_keys" / "keys.json").read_text(encoding="utf-8"))
    existing = {q["id"] for q in json.loads(
        (REPO / "src" / "data" / "questions.json").read_text(encoding="utf-8"))}

    papers = [p.strip() for p in args.papers.split(",") if p.strip()]
    picked = [r for r in draft if any(r["id"].startswith(p + "-") for p in papers)]
    corr = load_corrections()
    records, dropped = apply_corrections(picked, corr)
    unkeyed = [r["id"] for r in records if r.get("answerSource") != "official-key"]
    records = [finish(r) for r in records
               if r.get("answerSource") == "official-key"]

    errs = gate(records, keys, existing)
    print(f"papers   : {', '.join(papers)}")
    print(f"picked   : {len(picked)}")
    print(f"corrected: {sum(1 for r in picked if r['id'] in corr and not corr[r['id']].get('drop'))}")
    print(f"dropped  : {len(dropped)}")
    for d in dropped:
        print(f"    {d}")
    print(f"no key   : {len(unkeyed)}  {', '.join(unkeyed)}")
    print(f"fixedOpts: {sum(1 for r in records if r.get('fixedOptions'))}")
    print(f"topics   : {sum(1 for r in records if r.get('topic'))}")
    print(f"final    : {len(records)}")
    if errs:
        print(f"\nGATE FAILURES ({len(errs)}):")
        for e in errs[:80]:
            print(f"    {e}")
        sys.exit(1)
    print("\nall gates pass")
    if args.dry_run:
        return
    OUT.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n",
                   encoding="utf-8")
    print(f"wrote {len(records)} records -> {OUT}")


if __name__ == "__main__":
    main()
