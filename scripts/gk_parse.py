#!/usr/bin/env python3
"""Parse the OCR'd CDS General Knowledge papers into draft question records.

Stage 2 of the GK pipeline. Stage 1 is ``gk_ocr.py``, which caches one JSON
file per English page under ``scripts/ocr_gk_text/`` with a bounding box for
every text line. This script turns that geometry back into questions.

Why not reuse ``ocr_and_parse.py``: the English parser segments on topic
headings (SYNONYMS / ANTONYMS / SPOTTING ERRORS). A GK paper has none — it is
120 items in one undifferentiated run across history, polity, geography,
economy and general science. Segmentation here is purely positional: a line is
a question start only if it is numbered, sits at the column's outer margin
(sub-item and option markers are indented further), and continues the running
item count.

Guarantees this script is built around:

  * **Series A only.** The answer keys are Series A; a different series is the
    same 120 questions in a different order, so applying a Series-A key to it
    would produce confidently wrong answers. The series letter printed on each
    cover was checked by eye and is recorded in ``SERIES``. Anything not A is
    refused outright.
  * **Answers come from the official key or not at all.** Answers are read from
    ``answer_keys/keys.json`` and stamped ``official-key`` only when the entry
    is Series A, ``sourceType == "official"``, and covers this exact paper.
    With no key present the record ships with ``answer: null`` and
    ``answerSource: ""``. Nothing here ever infers an answer from the text.
  * **Drop, don't mangle.** Anything that cannot survive OCR into a clean
    four-option MCQ — figures, maps, tables, match-the-following grids,
    Statement I/II items whose options live in a shared Directions block — is
    excluded and counted, not patched up.
  * **No confident topic labels.** ``topic`` is set only where an unambiguous
    marker term appears, and is otherwise absent. A wrong topic drives the
    wrong instruction text in the app.

Output: ``src/data/questions-gk.draft.json``. This is a draft. It is not
merged into ``src/data/questions.json`` here and must not be — appending to the
main bank reorders ``pickDailyQuestions``' canonical shuffle and silently
changes every existing user's daily set.

    python scripts/gk_parse.py                 # all papers -> draft json
    python scripts/gk_parse.py --only CDS2-2020
    python scripts/gk_parse.py --report        # per-paper table, no write
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OCR_DIR = REPO / "scripts" / "ocr_gk_text"
PDF_DIR = REPO / "pdfs"
KEYS = REPO / "answer_keys" / "keys.json"
OUT = REPO / "src" / "data" / "questions-gk.draft.json"

# Test Booklet Series letter printed on each cover, read off a rendered crop of
# page 1 of every PDF (scripts/gk_ocr.py cannot read it — on the scans it is a
# picture of a letter). Papers not in Series A are refused: see module docstring.
SERIES = {
    "CDS1-2018-GK": "A", "CDS1-2019-GK": "A", "CDS1-2020-GK": "A",
    "CDS1-2021-GK": "A", "CDS1-2022-GK": "A", "CDS1-2023-GK": "A",
    "CDS1-2024-GK": "A", "CDS1-2025-GK": "A",
    "CDS2-2016-GK": "A", "CDS2-2017-GK": "A", "CDS2-2018-GK": "A",
    "CDS2-2019-GK": "B",  # <- not Series A. Refused.
    "CDS2-2020-GK": "A", "CDS2-2021-GK": "A", "CDS2-2022-GK": "A",
    "CDS2-2023-GK": "A", "CDS2-2024-GK": "A", "CDS2-2025-GK": "A",
}

MAX_QNUM = 120


# --------------------------------------------------------------------------
# line reconstruction
# --------------------------------------------------------------------------

# Page furniture printed below the text block: the booklet code ("DZOL-D--LKG/7A",
# "SPSS-D-XHI/49A"), the "[ P.T.O." catchword, and the centred page number.
# Left in place it lands at the end of whichever option happens to be last on
# the page — that was observed on real output before this filter existed.
# Three shapes seen across the eighteen papers: "SPSS-D-XHI/49A",
# "DZOL-D--LKG/7A" and "FDGT-S-GKL (19-A)"; the "(19-A)" half also turns up on
# its own line.
# Two hyphen groups are required so a one-hyphen acronym that happens to end a
# page ("UNESCO-MAB") is not mistaken for page furniture.
BOOKLET_CODE_RE = re.compile(
    r"^([A-Z]{2,6}([-–—]{1,2}[A-Z0-9]{1,8}){2,3}"
    r"(\s*/\s*\d{1,3}\s*[A-Z]?|\s*\(\s*\d{1,3}\s*[-–—]\s*[A-Z]\s*\))?"
    r"|\(\s*\d{1,3}\s*[-–—]\s*[A-Z]\s*\))$")
# The opening bracket of "[ P.T.O." reads as I, l, 1, ( or | about as often as
# it reads as "[", so the leading character is not trusted.
PTO_RE = re.compile(r"^[\[\(|Il1!\s]{0,3}P\s*\.?\s*T\s*\.?\s*O\s*\.?\s*[\]\)\s]*$", re.I)
PAGENO_RE = re.compile(r"^\d{1,3}$")


EN_MARKERS = re.compile(
    r"\b(which|the|following|consider|statements?|correct|answer|above|"
    r"given|below|india|one|of|and|is|are|not)\b", re.I,
)
COVER_RE = re.compile(
    r"(do not open this test booklet|test booklet series|maximum marks|"
    r"space for rough work|penalty for wrong answers)", re.I,
)


def _englishness(payload: dict) -> float:
    text = " ".join(l["text"] for l in payload["lines"])
    if len(text) < 40:
        return 0.0
    return len(EN_MARKERS.findall(text)) / max(1.0, len(text.split()) / 4.0)


def _load_pages(stem: str) -> list[dict]:
    """English item pages only.

    The cache also holds the Hindi side (each item is printed twice) plus the
    probe pages ``gk_ocr.py`` used to work out which parity is English, the
    covers and the rough-work sheets. All of those have to go: a Hindi page
    OCRs as latin noise that would happily masquerade as a question stem.
    """
    d = OCR_DIR / stem
    if not d.is_dir():
        return []
    pages = []
    for p in sorted(d.glob("p*.json")):
        payload = json.loads(p.read_text(encoding="utf-8"))
        text = " ".join(l["text"] for l in payload["lines"])
        if len(payload["lines"]) < 12:          # rough-work / blank
            continue
        if COVER_RE.search(text):               # front or back cover
            continue
        # Positive test: an item page carries option markers, a cover does not.
        # Needed because some Hindi covers carry an English footnote and a
        # numbered instruction list, and those numbers were being taken for
        # item numbers and knocking the whole paper's count out of step.
        if len(re.findall(r"\(\s*[a-dA-D]\s*\)", text)) < 4:
            continue
        # English item pages score 0.65-1.3 on this measure; the Hindi side
        # scores 0.00-0.05, so the gap is wide and the cut is not delicate.
        if _englishness(payload) < 0.30:        # Hindi side
            continue
        pages.append(payload)
    return pages


def _strip_furniture(boxes: list[dict], page_w: float, page_h: float) -> list[dict]:
    """Drop the booklet code / P.T.O. / page number printed under the text block."""
    out = []
    for b in boxes:
        x0, y0, x1, _ = b["box"]
        if y0 <= page_h * 0.80:
            out.append(b)
            continue
        t = b["text"].strip()
        if BOOKLET_CODE_RE.match(t) or PTO_RE.match(t):
            continue
        # The centred page number, which does not always read as a digit — a
        # "9" came back as "?" and rode along as part of an option. Only digits
        # and lone punctuation qualify: a wider rule here deleted the "(b)"
        # marker of every question whose options ran to the foot of the page.
        centred = abs((x0 + x1) / 2 - page_w / 2) < page_w * 0.05
        if centred and (PAGENO_RE.match(t) or (len(t) == 1 and not t.isalnum())):
            continue
        out.append(b)
    return out


def _drop_overlapping(grp: list[dict]) -> list[dict]:
    """Remove duplicate detections of the same printed words.

    The detector occasionally emits both a whole phrase and one of its words as
    separate boxes at the same place; joining them left-to-right produced
    "2 2 and 3" where the paper says "2 and 3". A box that is mostly covered by
    a longer neighbour on the same line, and whose text that neighbour already
    contains, is such a duplicate.
    """
    keep = []
    for i, b in enumerate(grp):
        bx0, bx1 = b["box"][0], b["box"][2]
        bw = max(1.0, bx1 - bx0)
        dup = False
        for j, o in enumerate(grp):
            if i == j:
                continue
            ox0, ox1 = o["box"][0], o["box"][2]
            cover = max(0.0, min(bx1, ox1) - max(bx0, ox0)) / bw
            longer = len(o["text"]) > len(b["text"]) or (
                len(o["text"]) == len(b["text"]) and j < i)
            # Boxes on a printed line are normally disjoint, so any real
            # horizontal overlap is already the signal; the containment test
            # below is what keeps it from eating adjacent words.
            if cover > 0.35 and longer and b["text"].strip() in o["text"]:
                dup = True
                break
        if not dup:
            keep.append(b)
    return keep


def _visual_lines(boxes: list[dict], page_h: float) -> list[dict]:
    """Merge word/phrase boxes that sit on the same printed line."""
    boxes = [b for b in boxes if b["box"][1] < page_h * 0.93]
    if not boxes:
        return []
    heights = [b["box"][3] - b["box"][1] for b in boxes]
    tol = max(6.0, statistics.median(heights) * 0.45)
    boxes.sort(key=lambda b: (b["box"][1] + b["box"][3]) / 2)

    lines: list[list[dict]] = []
    for b in boxes:
        cy = (b["box"][1] + b["box"][3]) / 2
        if lines:
            prev = lines[-1]
            pcy = sum((x["box"][1] + x["box"][3]) / 2 for x in prev) / len(prev)
            if abs(cy - pcy) <= tol:
                prev.append(b)
                continue
        lines.append([b])

    out = []
    for grp in lines:
        grp.sort(key=lambda b: b["box"][0])
        grp = _drop_overlapping(grp)
        text = " ".join(b["text"] for b in grp)
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            continue
        out.append({
            "text": text,
            "x0": min(b["box"][0] for b in grp),
            "x1": max(b["box"][2] for b in grp),
            "y0": min(b["box"][1] for b in grp),
            "y1": max(b["box"][3] for b in grp),
            "score": min(b.get("score", 1.0) for b in grp),
        })
    return out


# An item number printed on its own in the hanging indent, e.g. the box "18."
# sitting to the left of "In which of the following groups of organisms,".
HANGING_NUM_RE = re.compile(r"^\d{1,3}\s*[.):;]?$")


def _is_hanging_number(b: dict, page_w: float) -> bool:
    return (HANGING_NUM_RE.match(b["text"].strip()) is not None
            and (b["box"][2] - b["box"][0]) < page_w * 0.06)


def find_gutter(boxes: list[dict], page_w: float) -> float:
    """Locate the blank vertical channel between the two columns.

    Scans do not sit square on the page: on several papers the printed block is
    shifted far enough that the true gutter is nowhere near the page centre,
    and splitting at ``page_w / 2`` put the tail of every left-column line into
    the right column. The gutter is found instead as the widest x band no text
    touches, searched only in the middle third so a wide outer margin cannot
    win.
    """
    lo, hi = page_w * 0.33, page_w * 0.67
    covered = [0] * (int(page_w) + 1)
    for b in boxes:
        # The right column's hanging numbers reach back across the gutter and
        # would close it; they are placed separately, by line neighbour.
        if _is_hanging_number(b, page_w):
            continue
        x0 = max(0, int(b["box"][0]))
        x1 = min(int(page_w), int(b["box"][2]))
        for x in range(x0, x1 + 1):
            covered[x] = 1
    best = (0, page_w / 2)
    run_start = None
    for x in range(int(lo), int(hi) + 1):
        if not covered[x]:
            if run_start is None:
                run_start = x
        elif run_start is not None:
            if x - run_start > best[0]:
                best = (x - run_start, (run_start + x) / 2)
            run_start = None
    if run_start is not None and hi - run_start > best[0]:
        best = (hi - run_start, (run_start + hi) / 2)
    # A real gutter is a few percent of the page wide; below that, trust the
    # page centre rather than a chance gap inside a paragraph.
    return best[1] if best[0] > page_w * 0.015 else page_w / 2


# A left-column line whose detection ran on into the right column's hanging
# number: "...placed in front of a5." is one box carrying both "…in front of a"
# and the right column's "5.".
TRAILING_NUM_RE = re.compile(r"^(.{8,}?)\s*(\d{1,3}\s*[.):;])$", re.S)


def _unmerge_gutter_boxes(boxes: list[dict], page_w: float, mid: float) -> list[dict]:
    """Split boxes that swallowed the neighbouring column's item number.

    Left unsplit these cost the paper the whole item — its number is buried
    mid-sentence in the other column, so the item never starts.
    """
    out = []
    for b in boxes:
        x0, y0, x1, y1 = b["box"]
        near_gutter = (x0 + x1) / 2 < mid and x1 > mid - page_w * 0.06
        m = TRAILING_NUM_RE.match(b["text"].strip()) if near_gutter else None
        if not m:
            out.append(b)
            continue
        cut = x1 - (x1 - x0) * len(m.group(2)) / max(1, len(b["text"]))
        out.append({**b, "text": m.group(1), "box": [x0, y0, min(cut, x1), y1]})
        out.append({**b, "text": m.group(2), "box": [max(cut, mid), y0, max(x1, mid + 1), y1]})
    return out


def _split_columns(boxes: list[dict], page_w: float
                   ) -> tuple[list[dict], list[dict], list[dict]]:
    """Partition raw OCR boxes into left column, right column and gutter-crossers.

    This has to happen *before* lines are merged. Merging first would fuse the
    first line of the left column with the first line of the right column —
    they share a y band — and the page would come out interleaved word salad.
    """
    mid = find_gutter(boxes, page_w)
    boxes = _unmerge_gutter_boxes(boxes, page_w, mid)
    margin = page_w * 0.03
    left, right, wide = [], [], []
    hanging = []
    for b in boxes:
        x0, y0, x1, y1 = b["box"]
        if _is_hanging_number(b, page_w):
            hanging.append(b)
        elif x0 < mid - margin and x1 > mid + margin:
            wide.append(b)
        elif (x0 + x1) / 2 < mid:
            left.append(b)
        else:
            right.append(b)

    # A hanging number belongs with the text it introduces, not with whatever
    # column its own x happens to fall in. On several papers the right
    # column's numbers are printed left of the gutter, and splitting on x
    # alone stranded every one of them in the left column — which cost those
    # papers roughly a fifth of their items.
    for b in hanging:
        y0, y1 = b["box"][1], b["box"][3]
        best, best_dx = None, None
        for col, boxes_in in ((left, 0), (right, 1)):
            for o in col:
                oy0, oy1 = o["box"][1], o["box"][3]
                if min(y1, oy1) - max(y0, oy0) <= 0:      # not the same line
                    continue
                dx = o["box"][0] - b["box"][2]
                if dx < -page_w * 0.01:                   # must be to the right
                    continue
                if best_dx is None or dx < best_dx:
                    best, best_dx = boxes_in, dx
        if best == 1:
            right.append(b)
        elif best == 0:
            left.append(b)
        elif (b["box"][0] + b["box"][2]) / 2 < mid:
            left.append(b)
        else:
            right.append(b)
    return left, right, wide


def paper_stream(stem: str) -> tuple[list[dict], list[dict]]:
    """Reading-order line stream for a paper, plus the full-width lines found.

    A UPSC GK page is a rigid two-column grid; anything crossing the gutter is
    a table, a wide equation or a figure caption, and is kept aside so the
    questions it overlaps can be excluded rather than silently reordered.
    """
    stream: list[dict] = []
    wides: list[dict] = []
    for page in _load_pages(stem):
        w, h = page["width"], page["height"]
        lb, rb, wb = _split_columns(_strip_furniture(page["lines"], w, h), w)
        for ln in _visual_lines(wb, h):
            ln["page"] = page["page"]
            wides.append(ln)
        for col_i, col_boxes in ((0, lb), (1, rb)):
            for ln in _visual_lines(col_boxes, h):
                ln["page"] = page["page"]
                ln["col"] = col_i
                ln["page_w"] = w
                stream.append(ln)
    return stream, wides


# --------------------------------------------------------------------------
# segmentation
# --------------------------------------------------------------------------

# Item numbers come back with the digits separated ("6 6 ." for 66), so the
# digits are matched individually and de-spaced. Missing one of these is not
# cosmetic: an undetected item start makes the previous item swallow the next
# one's text and then adopt its options.
# "O" for zero is the one letter/digit confusion seen in these numbers ("10o."
# for 100.), so it is allowed but only alongside at least one real digit.
NUM_RE = re.compile(r"^((?:[\dOo][ \t]?){1,3})[.):;]\s*(.*)$", re.S)
# A colon, speck or quote printed in front of the number (": 101. Which of the
# following lenses...") anchors the pattern off the line start.
NUM_LEAD_RE = re.compile(r"^[^\w(\[]+")


def num_match(text: str) -> re.Match | None:
    m = NUM_RE.match(NUM_LEAD_RE.sub("", text))
    return m if m and re.search(r"\d", m.group(1)) else None


def _num(m: re.Match) -> int:
    return int(re.sub(r"[Oo]", "0", re.sub(r"\s", "", m.group(1))))


def _margins(stream: list[dict]) -> dict[tuple[int, int], float]:
    """Left edge of the *numbered* lines in each (page, column).

    Question numbers hang at this edge; sub-item numbers ("1." inside a
    'Consider the following statements' list) sit ~4% of the page width
    further in. That indent is the only thing telling them apart — both are
    just "<digit>." at the start of a line. Measuring it over numbered lines
    only, rather than over every line, keeps a stray left-drifting fragment
    from moving the edge and letting sub-items through.
    """
    by_col: dict[tuple[int, int], list[float]] = {}
    for ln in stream:
        if num_match(ln["text"]):
            by_col.setdefault((ln["page"], ln["col"]), []).append(ln["x0"])
    return {k: min(v) for k, v in by_col.items()}


def _longest_increasing(nums: list[int]) -> list[int]:
    """Indices of a longest strictly increasing subsequence."""
    if not nums:
        return []
    tails: list[int] = []      # index in nums of the smallest tail per length
    prev: list[int] = [-1] * len(nums)
    import bisect
    tail_vals: list[int] = []
    for i, v in enumerate(nums):
        j = bisect.bisect_left(tail_vals, v)
        if j == len(tail_vals):
            tail_vals.append(v)
            tails.append(i)
        else:
            tail_vals[j] = v
            tails[j] = i
        prev[i] = tails[j - 1] if j > 0 else -1
    out = []
    k = tails[-1]
    while k != -1:
        out.append(k)
        k = prev[k]
    return out[::-1]


def segment(stream: list[dict]) -> list[dict]:
    """Cut the line stream into numbered items.

    Two independent constraints have to hold before a numbered line is taken
    as the start of an item, because either alone is forgeable:

      1. it sits at the column's outer margin (rules out sub-items and the
         indented option markers), and
      2. it belongs to a longest strictly increasing run of item numbers over
         the whole paper (rules out a stray "3." that survived rule 1, and
         resynchronises after an item OCR lost entirely).
    """
    margins = _margins(stream)
    cands: list[tuple[int, int]] = []          # (stream index, item number)
    for i, ln in enumerate(stream):
        m = num_match(ln["text"])
        if not m:
            continue
        num = _num(m)
        if not 1 <= num <= MAX_QNUM:
            continue
        margin = margins.get((ln["page"], ln["col"]), ln["x0"])
        if ln["x0"] > margin + ln.get("page_w", 2125) * 0.022:
            continue
        cands.append((i, num))

    keep = {cands[k][0] for k in _longest_increasing([n for _, n in cands])}

    items: list[dict] = []
    cur: dict | None = None
    for i, ln in enumerate(stream):
        if i in keep:
            if cur:
                items.append(cur)
            m = num_match(ln["text"])
            cur = {"qnum": _num(m),
                   "lines": [dict(ln, text=m.group(2).strip())]}
        elif cur is not None:
            cur["lines"].append(ln)
    if cur:
        items.append(cur)
    return items


# --------------------------------------------------------------------------
# option extraction
# --------------------------------------------------------------------------

# OCR mangles the bracketed option letters. Only substitutions actually
# observed in these papers are allowed, and no digit that a sub-item could also
# be is mapped: an earlier version mapped "3" -> "a" and promptly swallowed the
# third statement of a "Consider the following" list as option (a).
# "1".."4" therefore stay unmapped, which is what makes sub-item lists safe.
CONFUSION = {
    "a": "a",
    # "(b)" reads as "(q)" on essentially every option of some papers
    # (CDS2-2021 most of all) — the bowl and stem of the b get inverted by the
    # scan. Only ever accepted where b is the next expected letter.
    "b": "b", "fc": "b", "q": "b",
    "c": "c", "0": "c", "o": "c", "ci": "c", "©": "c",
    "d": "d", "cl": "d", "id": "d",
}
# Scanner specks and bleed-through print a bullet or an apostrophe in front of
# the option marker ("■ (a) Potassium", "'(d) Shri P. D. Siwal").
LEAD_JUNK_RE = re.compile(r"^[^\w\(\[\{|/]+")
MARK_RE = re.compile(r"^[\(\[\{|/]?\s*([A-Za-z0©]{1,2})\s*[\)\]\}\.;,|]\s*(.*)$", re.S)
# On the weaker scans the closing bracket is lost outright and the option runs
# straight into its text ("(aFort William College"). The following character
# has to be a capital for this to fire, which is what stops it matching an
# ordinary word that happens to start "(a..." such as "(about".
MARK_OPEN_RE = re.compile(r"^[\(\[\{|/]\s*([a-d])\s*(?=[A-Z])(.*)$", re.S)
# Both brackets lost: "a Liquid nitrogen". Far too weak to trust on its own —
# option (c) of a real question reads "A State in order to be secular must be
# democratic." and would match. Only used at a known option indent; see
# split_options.
MARK_BARE_RE = re.compile(r"^([a-d])\s+(?=[A-Z0-9])(.*)$", re.S)


def _marker(text: str, allow_bare: bool = False) -> tuple[str | None, str]:
    text = LEAD_JUNK_RE.sub("", text)
    m = MARK_RE.match(text)
    if m:
        return CONFUSION.get(m.group(1).strip().lower()), m.group(2).strip()
    m = MARK_OPEN_RE.match(text)
    if m:
        return m.group(1), m.group(2).strip()
    if allow_bare:
        m = MARK_BARE_RE.match(text)
        if m:
            return m.group(1), m.group(2).strip()
    return None, text


def _scan_markers(lines: list[dict],
                  indent: tuple[float, float] | None) -> list[tuple[int, str, str]]:
    """Find the a, b, c, d marker lines, in order, at most one each."""
    starts: list[tuple[int, str, str]] = []
    nxt = 0
    for i, ln in enumerate(lines):
        if nxt >= 4:
            break
        at_indent = indent is not None and abs(ln["x0"] - indent[0]) <= indent[1]
        letter, rest = _marker(ln["text"], allow_bare=at_indent)
        if letter is not None and letter == "abcd"[nxt]:
            starts.append((i, letter, rest))
            nxt += 1
    return starts


def _has_full_run(lines: list[dict]) -> bool:
    """True if these lines contain a complete (a)(b)(c)(d) marker run."""
    nxt = 0
    for ln in lines:
        letter, _ = _marker(ln["text"])
        if letter is not None and letter == "abcd"[nxt]:
            nxt += 1
            if nxt == 4:
                return True
    return False


def split_options(lines: list[dict]) -> tuple[list[dict], list[list[dict]]] | None:
    """Return (stem lines, [option-a lines, ..., option-d lines]) or None.

    Requires the markers to appear exactly once each, in a, b, c, d order.
    Anything else is a parse we do not trust, and the caller drops it.
    """
    starts = _scan_markers(lines, indent=None)
    if len(starts) != 4 and starts:
        # Some markers lost both brackets. Retry, accepting a naked letter, but
        # only on lines sitting at the indent the bracketed markers established
        # — that is what stops an option beginning "A State in order to be…"
        # from being read as marker (a).
        indent = statistics.median([lines[i]["x0"] for i, _, _ in starts])
        tol = max(12.0, lines[starts[0][0]].get("page_w", 2125) * 0.012)
        starts = _scan_markers(lines, indent=(indent, tol))
    if len(starts) != 4:
        return None
    # A second complete a-b-c-d run after option (d) means this item ran on
    # into the next question, whose number OCR failed to read. Refuse: the
    # options would come from one question and the stem from another, and the
    # key would then mark the wrong option correct.
    if _has_full_run(lines[starts[3][0] + 1:]):
        return None
    first = starts[0][0]
    stem = lines[:first]
    opts: list[list[dict]] = []
    for j, (i, _letter, rest) in enumerate(starts):
        end = starts[j + 1][0] if j + 1 < len(starts) else len(lines)
        body = [dict(lines[i], text=rest)] + lines[i + 1:end]
        opts.append([b for b in body if b["text"]])
    return stem, opts


def _join(lines: list[dict]) -> str:
    """Join printed lines back into a paragraph.

    Justified UPSC body text hyphenates across line ends ("notwith-" /
    "standing"); those have to be re-joined without the hyphen or the stem
    reads as two broken words.
    """
    parts: list[str] = []
    for ln in lines:
        t = ln["text"].strip()
        if not t:
            continue
        if parts and re.search(r"[A-Za-z]-$", parts[-1]) and re.match(r"[a-z]", t):
            parts[-1] = parts[-1][:-1] + t
        else:
            parts.append(t)
    text = re.sub(r"\s+", " ", " ".join(parts)).strip()
    # UPSC typesets decimals with a mid-dot ("+2·0 D", "273·15 K"), so that use
    # is preserved; a mid-dot anywhere else is a scanner speck.
    text = re.sub(r"(?<=\d)[·](?=\d)", ".", text)
    text = re.sub(r"[·•]", " ", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([,;:.?!])", r"\1", text)      # " ," -> ","
    text = re.sub(r"([,;:])\1+", r"\1", text)         # ",," -> ","
    # OCR leaves a stray separator where the option marker's bracket was.
    return re.sub(r"^[.,;:·•\-–—\s]+", "", text).strip()


# --------------------------------------------------------------------------
# exclusion rules
# --------------------------------------------------------------------------

# Deliberately phrase-level rather than word-level. A bare "image" or "picture"
# matches ordinary optics and geography stems — "The image obtained in the
# screen is" was being thrown away as a figure question.
FIGURE_WORDS = re.compile(
    r"(\bfigures?\b|\bfig\.|\bdiagrams?\b|\bsketch\b|"
    r"\b(the|given|following|above|below) map\b|\bmap (given|shown|above|below)\b|"
    r"\bgraph (given|shown|below|above)\b|"
    r"\bshown in the (figure|map|diagram|graph|picture)\b|"
    r"\bin the figure (above|below|given)\b)", re.I,
)
MATCH_WORDS = re.compile(
    r"(\blist[\s\-—]*(i|ii|1|2)\b|\bmatch list|\blists? given below|"
    r"using the codes? given below the lists)", re.I,
)
# "A B C D / 3 1 4 2" answer grids. Note the uppercase-only letter class: a
# missing \b in the pattern above previously let "Socialist 2." look like
# "List 2" and threw away perfectly good Preamble questions.
CODE_OPTION = re.compile(r"^[A-D\d][\sA-D\d.,;:]{4,}$")
# Numbered sub-items printed in the stem, which is what makes a pure-digit
# option like "1, 3, 2, 4" resolvable without the original table.
STEM_LIST_RE = re.compile(r"\b1\s*\..{2,120}?\b2\s*\..{2,120}?\b3\s*\.", re.S)
FIXED_TAIL = re.compile(
    r"\b(none of (the above|these)|all of (the above|these)|both \(?[a-d]\)? and)\b", re.I,
)
OPTION_LETTER_REF = re.compile(r"\(\s*[a-d]\s*\)", re.I)


def swallowed_next_item(item: dict, margins: dict) -> bool:
    """True if this item's body contains what is plainly the next item's number.

    This is the dangerous failure, not a cosmetic one. If an item start is
    missed — its number smudged, or its options absent from the page — the
    previous item runs on and adopts the *following* question's options. The
    stem then reads plausibly while the four options belong to a different
    question, and the official key marks the wrong one correct. Any item whose
    body still contains a margin-aligned higher number is refused.
    """
    for ln in item["lines"][1:]:
        m = num_match(ln["text"])
        if not m:
            continue
        num = _num(m)
        if not item["qnum"] < num <= MAX_QNUM:
            continue
        margin = margins.get((ln["page"], ln["col"]))
        if margin is not None and ln["x0"] <= margin + ln.get("page_w", 2125) * 0.022:
            return True
    return False


def classify_drop(stem: str, options: list[str], item_lines: list[dict],
                  wide_lines: list[dict], gap_limit: float) -> str | None:
    """Return a drop reason, or None if the item is safe to ship."""
    blob = stem + " || " + " | ".join(options)

    if MATCH_WORDS.search(blob):
        return "match-the-following"
    if sum(1 for o in options if CODE_OPTION.match(o.strip())) >= 3:
        # A code grid is only meaningless if what it indexes is gone. Options
        # carrying A-D always index a List I/List II table that OCR cannot
        # reproduce. Pure-digit options index the numbered items in the stem,
        # so they survive whenever the stem still carries that list.
        if any(re.search(r"[A-D]", o) for o in options) or not STEM_LIST_RE.search(stem):
            return "code-grid (no resolvable list)"
    if FIGURE_WORDS.search(blob):
        return "figure-or-map"

    # Geometry: a run of blank vertical space inside the item's own column is
    # a figure, a map or a table that OCR returned nothing for. The limit is
    # measured in line heights, not in inter-line gaps: option-to-option
    # leading is several times the leading inside a paragraph, so a gap-based
    # limit flagged every ordinary four-option question on the tighter-set
    # papers.
    by_col: dict[tuple[int, int], list[dict]] = {}
    for ln in item_lines:
        by_col.setdefault((ln["page"], ln["col"]), []).append(ln)
    for col_lines in by_col.values():
        col_lines.sort(key=lambda l: l["y0"])
        for a, b in zip(col_lines, col_lines[1:]):
            if b["y0"] - a["y1"] > gap_limit:
                return "blank-block (figure/table)"

    # A table wide enough to cross the gutter sits inside this item's span.
    pages = {ln["page"] for ln in item_lines}
    for w in wide_lines:
        if w["page"] not in pages:
            continue
        same = [ln for ln in item_lines if ln["page"] == w["page"]]
        if same and min(l["y0"] for l in same) - 5 <= w["y0"] <= max(l["y1"] for l in same) + 5:
            return "wide-block (table)"

    # "ASEEM is" followed by four expansions is a real CDS question, so the
    # hard floor is only there to catch a stem that lost its subject entirely.
    # Anything under 40 characters still gets a "short-stem" suspect flag.
    if len(stem) < 8 or len(stem.split()) < 2:
        return "stem-too-short"
    if any(len(o.strip()) < 1 for o in options):
        return "empty-option"
    if len(stem) > 1200:
        return "stem-too-long"
    if len(set(o.strip().lower() for o in options)) < 4:
        return "duplicate-options"
    return None


# A single stray letter or digit between two words is the residual OCR failure
# mode that survives every geometric check ("All the individuals s of a
# particular organism"). It cannot be repaired safely, so it is flagged for a
# human instead. "a", "A" and "I" are real English words and are exempt, and
# lone digits are not flagged at all — "Article 9", "1 and 2 only" and the
# numbered sub-items of a 'Consider the following' list are all legitimate,
# which would make a digit rule mostly false positives.
ORPHAN_RE = re.compile(r"(?<= )(?![aAI]\b)[b-zB-HJ-Z]\b(?= )")


def text_quality(records: list[dict]) -> dict:
    """Crude but checkable legibility measure for a paper's parsed text.

    Two things go wrong on the weaker scans, and both are visible without a
    dictionary:

      * ``glued`` — the recogniser drops inter-word spaces, so tokens like
        "Colebrookewasa" appear. Counted as tokens of 16+ letters, which real
        English words in these papers essentially never reach.
      * ``mean_conf`` — the engine's own per-line confidence.

    A paper scoring badly here is not one this parser can rescue; it needs a
    better scan or a human.
    """
    words: list[str] = []
    for r in records:
        words += re.findall(r"[A-Za-z]+", r["question"])
        for o in r["options"]:
            words += re.findall(r"[A-Za-z]+", o)
    if not words:
        return {"glued_rate": 1.0, "mean_word_len": 0.0, "words": 0}
    glued = sum(1 for w in words if len(w) >= 16)
    # Mean token length catches the commoner, milder version of the same fault
    # ("Pulseis feltdue"), which the 16-character rule misses entirely. Clean
    # English prose sits near 4.8; noticeably above that means lost spaces.
    mean_len = sum(len(w) for w in words) / len(words)
    # A lowercase letter running straight into a capital inside one token is
    # almost always a lost space ("ofIndia", "Codeof" -> caught by length, this
    # one by case). Precise enough to rank papers by legibility.
    camel = sum(1 for w in words if re.search(r"[a-z][A-Z]", w))
    return {"glued_rate": round(glued / len(words), 4),
            "camel_rate": round(camel / len(words), 4),
            "mean_word_len": round(mean_len, 2), "words": len(words)}


def suspect_flags(stem: str, options: list[str], score: float) -> list[str]:
    flags = []
    if len(stem) < 40:
        flags.append("short-stem")
    if any(len(o.strip()) < 2 for o in options):
        flags.append("tiny-option")
    if max(len(o) for o in options) > 300:
        flags.append("long-option")
    if score < 0.75:
        flags.append("low-ocr-confidence")
    if ORPHAN_RE.search(" " + stem + " ") or any(
            ORPHAN_RE.search(" " + o + " ") for o in options):
        flags.append("orphan-token")
    return flags


# --------------------------------------------------------------------------
# topic — deliberately conservative
# --------------------------------------------------------------------------

# Every rule here must be one a human can check against the stem in a second.
# When none fires the record simply has no topic, which is the honest answer;
# a wrong topic drives the wrong instruction text in the app.
TOPIC_RULES: list[tuple[str, re.Pattern]] = [
    ("polity", re.compile(
        r"\b(constitution(al)?|fundamental rights?|directive principles?|"
        r"article \d+|schedule of the constitution|lok sabha|rajya sabha|"
        r"parliament|president of india|governor|chief justice|supreme court|"
        r"high court|panchayati raj|election commission|amendment act)\b", re.I)),
    ("economy", re.compile(
        r"\b(gdp|gross domestic product|fiscal deficit|monetary policy|"
        r"reserve bank of india|\brbi\b|inflation|budget estimates?|"
        r"repo rate|subsid(y|ies)|tax(es|ation)?|niti aayog|"
        r"balance of payments?|per capita income)\b", re.I)),
    ("history", re.compile(
        r"\b(dynasty|empire|mughal|maurya|gupta dynasty|sultanate|"
        r"indian national congress|freedom (struggle|movement)|"
        r"satyagraha|revolt of 1857|viceroy|swadeshi|"
        r"non-cooperation|quit india|harappan|indus valley)\b", re.I)),
    ("geography", re.compile(
        r"\b(rainfall|monsoon|latitude|longitude|soil[s]?\b|river basin|"
        r"tributary|plateau|climate|isotherm|equator|glacier|"
        r"tropic of cancer|mountain range|delta\b)\b", re.I)),
    ("science", re.compile(
        r"\b(atom(ic|s)?|molecule|electron|proton|neutron|enzyme|chromosome|"
        r"photosynthesis|velocity|acceleration|wavelength|frequency of|"
        r"chemical reaction|periodic table|vitamin|haemoglobin|"
        r"newton'?s|ohm'?s law|isotope)\b", re.I)),
    ("defence", re.compile(
        r"\b(indian army|indian navy|indian air force|missile|"
        r"aircraft carrier|ins \w+|drdo|paramilitary|"
        r"military exercise|regiment)\b", re.I)),
]


def detect_topic(stem: str, options: list[str]) -> str | None:
    blob = stem + " " + " ".join(options)
    hits = [name for name, rx in TOPIC_RULES if rx.search(blob)]
    # Exactly one rule must fire. Two rules firing means the marker terms are
    # not discriminating for this item, and a coin-flip label is worse than none.
    return hits[0] if len(hits) == 1 else None


# --------------------------------------------------------------------------
# answer keys
# --------------------------------------------------------------------------

def load_keys() -> dict:
    if not KEYS.exists():
        return {}
    try:
        return json.loads(KEYS.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        # The keys file may be mid-write by another process.
        print("  ! answer_keys/keys.json is not valid JSON right now; "
              "shipping every GK record with answer: null", file=sys.stderr)
        return {}


def find_key(keys: dict, session: int, year: int) -> tuple[dict | None, str]:
    """Locate the official Series-A GK key for one paper.

    Tolerant about the entry name because the GK keys are being written by a
    separate process; strict about everything that affects correctness.
    """
    candidates = [
        f"cds{session}-{year}-gk", f"cds{session}-{year}-GK",
        f"gk-cds{session}-{year}", f"cds{session}-{year}_gk",
        f"cds{session}-{year}-general-knowledge",
    ]
    entry_key = None
    for c in candidates:
        if c in keys:
            entry_key = c
            break
    if entry_key is None:
        for k, v in keys.items():
            if not isinstance(v, dict):
                continue
            subj = str(v.get("subject", "")).lower()
            if "general knowledge" not in subj and subj not in ("gk", "general studies"):
                continue
            label = str(v.get("examLabelOnKey", "")) + " " + k
            roman = "II" if session == 2 else "I"
            if str(year) in label and re.search(rf"\b{roman}\b|cds{session}\b", label, re.I):
                entry_key = k
                break
    if entry_key is None:
        return None, "no key entry"

    entry = keys[entry_key]
    label = str(entry.get("examLabelOnKey", ""))
    if label and str(year) not in label:
        # Guards against a key entry that is named for one paper but was
        # transcribed from another's PDF.
        return None, f"key {entry_key} label {label!r} does not mention {year}"
    if "general knowledge" not in str(entry.get("subject", "")).lower():
        return None, f"key {entry_key} subject={entry.get('subject')!r}, not General Knowledge"
    if str(entry.get("set", "")).upper() != "A":
        return None, f"key {entry_key} is Series {entry.get('set')!r}, not A"
    if str(entry.get("sourceType", "")).lower() != "official":
        return None, f"key {entry_key} sourceType={entry.get('sourceType')!r}, not official"
    if not isinstance(entry.get("answers"), dict):
        return None, f"key {entry_key} has no answers map"
    return entry, entry_key


LETTER_TO_INDEX = {"A": 0, "B": 1, "C": 2, "D": 3}


# --------------------------------------------------------------------------
# per-paper build
# --------------------------------------------------------------------------

def parse_paper(stem: str, keys: dict) -> dict:
    m = re.match(r"CDS(\d)-(\d{4})-GK$", stem)
    if not m:
        return {"paper": stem, "error": "unrecognised paper name"}
    session, year = int(m.group(1)), int(m.group(2))

    series = SERIES.get(stem)
    if series != "A":
        return {"paper": stem, "session": session, "year": year, "series": series,
                "refused": f"Test Booklet Series {series} — keys are Series A",
                "found": 0, "kept": 0, "dropped": Counter(), "records": [],
                "suspect": [], "key": None}

    stream, wides = paper_stream(stem)
    if not stream:
        return {"paper": stem, "error": "no OCR cache — run scripts/gk_ocr.py first"}

    line_h = statistics.median([l["y1"] - l["y0"] for l in stream]) or 20.0
    gap_limit = line_h * 6.0

    entry, key_name = find_key(keys, session, year)
    answers = entry["answers"] if entry else {}

    items = segment(stream)
    margins = _margins(stream)
    dropped: Counter = Counter()
    records = []
    suspect = []
    seen: set[int] = set()

    for item in items:
        qnum = item["qnum"]
        if swallowed_next_item(item, margins):
            dropped["swallowed-next-item"] += 1
            continue
        split = split_options(item["lines"])
        if split is None:
            dropped["options-not-abcd"] += 1
            continue
        stem_lines, opt_lines = split
        stem_text = _join(stem_lines)
        options = [_join(o) for o in opt_lines]

        # Geometry checks look only at the span the question actually occupies.
        # Anything trailing after option (d) — typically a shared "Directions"
        # code block for the Statement I/II run that follows — belongs to the
        # next items, and letting it into the span caused false figure drops.
        span = stem_lines + [l for o in opt_lines for l in o]
        reason = classify_drop(stem_text, options, span, wides, gap_limit)
        if reason:
            dropped[reason] += 1
            continue
        if qnum in seen:
            dropped["duplicate-qnum"] += 1
            continue
        seen.add(qnum)

        score = min(l.get("score", 1.0) for l in item["lines"])
        letter = str(answers.get(str(qnum), "")).strip().upper()
        idx = LETTER_TO_INDEX.get(letter)

        fixed = bool(
            any(FIXED_TAIL.search(o) for o in options)
            or any(OPTION_LETTER_REF.search(o) for o in options)
        )

        rec = {
            "id": f"cds{session}-{year}-gk-{qnum:03d}",
            "year": year,
            "session": session,
            "qnum": qnum,
            "subject": "gk",
            "passage": None,
            "question": stem_text,
            "options": options,
            "answer": idx,
            "answerSource": "official-key" if idx is not None else "",
        }
        if fixed:
            rec["fixedOptions"] = True
        topic = detect_topic(stem_text, options)
        if topic:
            rec["topic"] = topic

        flags = suspect_flags(stem_text, options, score)
        if flags:
            suspect.append({"id": rec["id"], "flags": flags,
                            "question": stem_text[:90]})
        records.append(rec)

    records.sort(key=lambda r: r["qnum"])
    conf = [min(l.get("score", 1.0) for l in i["lines"]) for i in items] or [1.0]
    quality = text_quality(records)
    quality["mean_conf"] = round(sum(conf) / len(conf), 3)
    return {
        "paper": stem, "session": session, "year": year, "series": series,
        "found": len(items), "kept": len(records), "dropped": dropped,
        "records": records, "suspect": suspect,
        "key": key_name if entry else None,
        "key_note": None if entry else key_name,
        "answered": sum(1 for r in records if r["answer"] is not None),
        "pages": len(_load_pages(stem)),
        "quality": quality,
    }


def verify(stem: str, n: int, seed: int, dest: Path) -> None:
    """Render the scan behind n randomly chosen parsed questions, for eyeballing.

    The only way to know whether this parser is telling the truth is to put its
    output next to the page it came from and read both. This makes that
    repeatable rather than a one-off.
    """
    import random
    import fitz

    stream, _ = paper_stream(stem)
    items = {i["qnum"]: i for i in segment(stream)}
    result = parse_paper(stem, load_keys())
    kept = {r["qnum"]: r for r in result.get("records", [])}
    if not kept:
        print(f"{stem}: nothing parsed")
        return
    random.Random(seed).shuffle(picks := sorted(kept))
    picks = sorted(picks[:n])

    dest = dest / stem
    dest.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF_DIR / f"{stem}.pdf")
    for q in picks:
        lines = items[q]["lines"]
        for p in sorted({l["page"] for l in lines}):
            ls = [l for l in lines if l["page"] == p]
            page = doc[p]
            scale = page.rect.width / max(l["page_w"] for l in ls)
            clip = fitz.Rect(
                max(0, (min(l["x0"] for l in ls) - 30) * scale),
                max(0, (min(l["y0"] for l in ls) - 25) * scale),
                min(page.rect.width, (max(l["x1"] for l in ls) + 30) * scale),
                min(page.rect.height, (max(l["y1"] for l in ls) + 25) * scale),
            )
            page.get_pixmap(dpi=170, clip=clip).save(dest / f"q{q:03d}_p{p:03d}.png")
        rec = kept[q]
        print(f"\nQ{q} [{rec['id']}]  {rec['question']}")
        for i, o in enumerate(rec["options"]):
            print(f"   ({'abcd'[i]}) {o}")
    print(f"\ncrops -> {dest}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--report", action="store_true", help="print the table, write nothing")
    ap.add_argument("--verify", type=int, default=0,
                    help="render the scan behind N random parsed questions and exit")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    if args.verify:
        if not args.only:
            sys.exit("--verify needs --only <paper>")
        stems = [p.name for p in OCR_DIR.iterdir()
                 if p.is_dir() and args.only.lower() in p.name.lower()]
        for s in stems:
            verify(s, args.verify, args.seed, OCR_DIR / "_verify")
        return

    keys = load_keys()
    stems = sorted(p.name for p in OCR_DIR.iterdir()
                   if p.is_dir() and not p.name.startswith("_")) if OCR_DIR.is_dir() else []
    if args.only:
        stems = [s for s in stems if args.only.lower() in s.lower()]
    if not stems:
        sys.exit(f"no OCR caches in {OCR_DIR} — run scripts/gk_ocr.py first")

    results = [parse_paper(s, keys) for s in stems]
    all_records: list[dict] = []
    for r in results:
        all_records.extend(r.get("records", []))

    print(f"{'paper':16} {'ser':3} {'pg':>3} {'found':>5} {'kept':>5} {'ans':>5} "
          f"{'glued':>6} {'camel':>6} {'wlen':>5} {'conf':>5}  dropped")
    print("-" * 118)
    for r in results:
        if r.get("error"):
            print(f"{r['paper']:16} ERROR: {r['error']}")
            continue
        if r.get("refused"):
            print(f"{r['paper']:16} {r['series'] or '?':3}   -     -     -     -"
                  f"      -      -     -     -  REFUSED: {r['refused']}")
            continue
        drops = ", ".join(f"{k}={v}" for k, v in sorted(r["dropped"].items(), key=lambda kv: -kv[1]))
        q = r["quality"]
        print(f"{r['paper']:16} {r['series']:3} {r['pages']:3} {r['found']:5} "
              f"{r['kept']:5} {r['answered']:5} {q['glued_rate']:6.3f} "
              f"{q['camel_rate']:6.3f} {q['mean_word_len']:5.2f} "
              f"{q['mean_conf']:5.2f}  {drops}")
    total_kept = sum(r.get("kept", 0) for r in results)
    total_ans = sum(r.get("answered", 0) for r in results)
    total_drop = sum(sum(r.get("dropped", Counter()).values()) for r in results)
    print("-" * 100)
    print(f"{'TOTAL':16} {'':3} {'':3} {'':5} {total_kept:5} {total_ans:5}  dropped={total_drop}")

    missing_keys = [r["paper"] for r in results if not r.get("refused")
                    and not r.get("error") and not r.get("key")]
    if missing_keys:
        print(f"\nno official Series-A key yet for: {', '.join(missing_keys)}"
              f"\n  -> those records ship with answer: null / answerSource: \"\"")

    susp = [s for r in results for s in r.get("suspect", [])]
    print(f"\nsuspect parses: {len(susp)} / {total_kept}")
    fc = Counter(f for s in susp for f in s["flags"])
    for k, v in fc.most_common():
        print(f"  {k}: {v}")

    if not args.report:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(all_records, indent=2, ensure_ascii=False) + "\n",
                       encoding="utf-8")
        print(f"\nwrote {len(all_records)} records -> {out}")
        # Kept next to the scripts, not in src/data — it is a QA artefact, not
        # app data.
        side = REPO / "scripts" / "gk_parse_report.json"
        side.write_text(json.dumps(
            [{k: (dict(v) if isinstance(v, Counter) else v)
              for k, v in r.items() if k != "records"} for r in results],
            indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote per-paper report -> {side}")


if __name__ == "__main__":
    main()
