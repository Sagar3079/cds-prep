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

The app ships with `src/data/questions.json` (427 questions), so it runs immediately —
you only need the data pipeline below if you want to rebuild or extend the question bank.

## Features

- **Daily test** — 10 questions, 10-minute timer. Deterministic: the same date always
  produces the same set, so your score is comparable to anyone else's on that day.
- **Random mode** — a fresh set on demand, drawn from the same bank.
- **UPSC marking** — +1 correct, −0.25 wrong, 0 skipped, 600 seconds.
- **Instant review** with correct answers after submit.
- **History & streaks**, saved in `localStorage`.
- Lavender / white theme, responsive, keyboard-navigable.

## Answer accuracy — please read

The question bank is **427 questions**, and the answers are not all equally reliable.
**Only 110 of the 427 questions actually come from a UPSC paper.** The other 317 were
written by hand and are stored as Python literals in `scripts/`.

| origin | count | where it comes from |
| --- | --- | --- |
| OCR'd from real papers | **110** | CDS-1 2018 (73), CDS-1 2016 (15), CDS-1 2015 (12), CDS-1 2017 (10) |
| hand-written, id `pred-*` | **192** | literal list in `scripts/expand_bank.py` |
| hand-written, id `seed-*` | **125** | literal list in `scripts/seed_questions.py` |

### The `year` and `session` fields lie for 317 questions

The hand-written questions are stamped with a paper they have no connection to —
`pred-*` records all say `year: 2024, session: 1` and `seed-*` records all say
`year: 2020, session: 1`, both hardcoded in the scripts. **There is no 2020 or 2024
paper content in this bank at all.** Do not try to check one of those questions against
the real paper; it isn't in it.

### The `answerSource` labels are not verification tiers

All four labels are unconditional string constants written by the generating script.
None of them records how an answer was actually checked:

| `answerSource` | count | what it really means |
| --- | --- | --- |
| `verified-key` | 38 | **the only tier backed by an external artifact** (`answer_keys/manual_keys.json`, CDS-1 2018 only) |
| `verified` | 62 | hand-typed dict in `merge_answered_ocr.py`, with the author's own uncertainty in the comments |
| `verified-pyq-pattern` | 135 | constant applied to every hand-written `seed-*` record |
| `predicted-cds-pattern` | 192 | constant applied to every hand-written `pred-*` record — no model runs at any point |

So **38 of 427 answers (8.9%) trace to anything outside the scripts themselves.**
`answer_keys/keys.json` is an empty object; the code path that would populate it never
fires.

### Answer positions are heavily skewed

Across the whole bank the correct option sits at index 1 **56.7%** of the time
(116 / 242 / 44 / 25 across indices 0–3). The 110 OCR-derived questions are statistically
uniform; the 317 hand-written ones put the answer in slot A or B **93–96%** of the time.
The app shuffles options before display (`shuffleQuestionOptions` in `src/lib/daily.ts`)
and correctly remaps the answer index, so this is not exploitable through the UI — but
`questions.json` ships to the browser in full, answers included.

**Use this for timed practice and question-pattern exposure. Do not treat any individual
answer as authoritative.** Corrections are the most valuable contribution you can make —
see *Contributing*.

## Data pipeline

⚠️ **The pipeline does not currently reproduce the shipped `questions.json`, and running
it will destroy data.** Known issues, all open:

- `scripts/seed_questions.py` overwrites `questions.json` unconditionally, with no merge
  and no backup. Running it alone drops the bank from 427 to 199 records.
- `scripts/rebuild_bank.py` filters out every `seed-*` and `pred-*` id and would delete
  317 questions. It has never been run.
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

Sources: [upsc.gov.in](https://upsc.gov.in) for the 2015–2024 papers; 2025 papers were
mirrored from third-party coaching sites.

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

Answer corrections are the most useful contribution — especially for the 192
`predicted-cds-pattern` questions. Open a PR with the question `id`, the corrected
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
