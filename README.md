# CDS English Prep

Daily CDS (Combined Defence Services) English practice, built from UPSC previous-year
papers. A small Next.js app: one timed test a day, real UPSC marking, instant review,
and a streak history that lives entirely in your browser.

No backend, no account, no data leaves your machine.

## Run locally

```bash
git clone https://github.com/Sagar3079/cds-prep.git
cd cds-prep
npm install
npm run dev
```

Open **http://localhost:3000**.

The app ships with `src/data/questions.json` (803 questions), so it runs immediately —
you only need the data pipeline below if you want to rebuild or extend the question bank.

## Features

- **Daily test** — 10 questions, 10-minute timer. Deterministic: the same date always
  produces the same set, so your score is comparable to anyone else's on that day.
- **Random mode** — a fresh set on demand, drawn from the same bank.
- **UPSC marking** — +1 correct, −0.25 wrong, 0 skipped, 600 seconds.
- **Instant review** with correct answers after submit.
- **History & streaks**, saved in `localStorage`.
- **Adaptive practice** — random sets pull harder from topics you get wrong. The daily
  test does not adapt, so it stays comparable between people.
- Light and dark themes, responsive, keyboard-navigable.

## Answer accuracy — please read

The question bank is **803 questions**, and the answers are not all equally reliable.
**486 come from a real UPSC paper**; the other 317 were written by hand and are stored
as Python literals in `scripts/`.

| origin | count | where it comes from |
| --- | --- | --- |
| OCR'd from real papers | **486** | CDS-1 2015–2025 and CDS-2 2020–2024, fifteen papers |
| hand-written, id `pred-*` | **192** | literal list in `scripts/expand_bank.py` |
| hand-written, id `seed-*` | **125** | literal list in `scripts/seed_questions.py` |

### `answerSource` — what each label is actually worth

| `answerSource` | count | what it means |
| --- | --- | --- |
| `official-key` | **464** | Read from the answer key UPSC published for that paper (Series A). The strongest provenance here. |
| `verified` | 22 | Hand-typed from the paper without a key, with the transcriber's own doubts in the comments |
| `verified-pyq-pattern` | 125 | A constant stamped on every hand-written `seed-*` record. Records nothing about verification. |
| `predicted-cds-pattern` | 192 | A constant stamped on every hand-written `pred-*` record. No model runs at any point. |

So **464 of 803 answers (58%) now trace to an official UPSC key**, up from 38 claimed —
twelve of which were wrong. `answer_keys/keys.json` holds 1,798 official answers across
fifteen papers; it used to be an empty object whose code path never fired.

### The hand-typed 2018 key was wrong on a fifth of its entries

`answer_keys/manual_keys.json` was the sole source of the 38 answers previously labelled
`verified-key` — the bank's strongest tier at the time. It **disagrees with the key UPSC
actually published on 13 of its 63 entries (20.6%)**, and twelve of those were live in
the app. All have been re-derived from the official key. Anything still carrying the
`verified-key` label would be from a paper with no official key, and the UI now presents
that label as "Hand-typed key" rather than as verification.

### The `year` and `session` fields lie for the 317 hand-written questions

`pred-*` records all claim `year: 2024, session: 1` and `seed-*` all claim
`year: 2020, session: 1`, both hardcoded in the scripts. Those questions are not in
those papers. Questions with a `cds1-`/`cds2-` id carry their real paper.

### What is deliberately not here

- **CDS-1 2015 and 2017, CDS-2 2015–2018:** UPSC never published keys for those cycles,
  so those questions keep whatever answer they had and are not labelled `official-key`.
- **CDS-2 2019 and 2025:** the scans are too degraded to mine. 2019 is column-interleaved
  so every line is clipped at the fold; 2025 is a coaching "solved" scan whose hand-inked
  ticks corrupt an option in nearly every question.
- **CDS-2 2022:** mined, but dropped. Its series letter could not be read off the scan,
  and a spot check found a question contradicting the key. A wrong series means every
  answer in the paper is wrong under the strongest label, so it was not worth 14 questions.
- **Comprehension passages:** dropped across the board. Every paper's passages are
  full-width and the scans cut them mid-line.

### Answer positions are skewed, but only in the hand-written half

| set | A / B / C / D | worst slot |
| --- | --- | --- |
| 486 from real papers | 128 / 142 / 116 / 100 | 29.2% — near uniform |
| 317 hand-written | 87 / 213 / 14 / 3 | **94.6% in slot A or B** |
| whole bank | 215 / 355 / 130 / 103 | 44.2% |

The real-paper half is what you would expect from a genuine exam. The hand-written half
is the fingerprint of someone typing "wrong option, right option, filler, filler". The
app shuffles options before display (`shuffleQuestionOptions` in `src/lib/daily.ts`) and
correctly remaps the answer index, so it is not exploitable through the UI — but
`questions.json` ships to the browser in full, answers included.

**Use this for timed practice and question-pattern exposure.** The 464 `official-key`
answers are as good as the published key. Treat the rest as practice, not truth.
Corrections are the most valuable contribution you can make — see *Contributing*.

## Data pipeline

⚠️ **The pipeline does not currently reproduce the shipped `questions.json`, and running
it will destroy data.** Known issues, all open:

- `scripts/seed_questions.py` overwrites `questions.json` unconditionally, with no merge
  and no backup. Running it alone drops the bank from 803 to 199 records.
- `scripts/rebuild_bank.py` filters out every `seed-*` and `pred-*` id and would delete
  every hand-written and newly-mined question. It has never been run.
- `scripts/merge_answered_ocr.py` shells out to `python3` and reads files without an
  explicit encoding, so it fails on Windows.
- Every script resolves paths from `Path.home() / "cds-prep"` rather than from
  `__file__`, so unless the repo sits at exactly `~/cds-prep` they silently write to a
  phantom directory and report success.
- `scripts/expand_bank.py` — the de-facto final step — is the only script not documented
  here, and the shipped JSON has since been hand-edited away from what it generates.

Fixing this is issue #1. Until then, treat `src/data/questions.json` as the source of
truth and edit it directly.

The source PDFs and their OCR transcriptions are **not** included in this repository
(see *Exam content* below). `pdfs/_manifest.json` lists the expected filenames.

Sources: [upsc.gov.in](https://upsc.gov.in) for the papers and for every answer key in
`answer_keys/keys.json`. Note that `https://upsc.gov.in/...` soft-404s to the homepage
with HTTP 200 for PDF paths — the `www.` host serves the real files.

## Project layout

```
src/app/          App Router pages — home, test, results, history
src/components/   QuestionCard, TestClient, Timer, Navbar, HomeStats
src/lib/daily.ts  seeded question selection, option shuffling, MARKING, scoring
src/lib/storage.ts  localStorage attempts, streaks, accuracy
src/data/         questions.json
scripts/          Python OCR + parsing pipeline
```

Marking lives in one place: the `MARKING` constant in `src/lib/daily.ts`.

## Contributing

Answer corrections are the most useful contribution — especially for the 317 hand-written
(`pred-*` / `seed-*`) questions. Open a PR with the question `id`, the corrected
`answer` index, and the key or paper you verified it against.

If you're using Claude Code on this repo, see [`CLAUDE.md`](./CLAUDE.md) for the
conventions and invariants it follows.

## Exam content

This repository is MIT-licensed **for its source code**.

UPSC question papers and third-party answer keys are the property of their respective
rights holders and are **not redistributed here**. `pdfs/` and the answer-key images in
`answer_keys/` are gitignored; obtain them yourself from the original sources. The
derived `questions.json` is included so the app is usable out of the box.

This project is not affiliated with, endorsed by, or connected to UPSC.

## Licence

[MIT](./LICENSE) — code only. Exam content: see [NOTICE](./NOTICE).
