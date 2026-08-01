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
Every question carries an `answerSource` field:

| `answerSource` | Count | What it means |
| --- | --- | --- |
| `verified` | 62 | Checked against an official key |
| `verified-key` | 38 | Taken from a published answer key |
| `verified-pyq-pattern` | 135 | Matched to a known previous-year answer pattern |
| `predicted-cds-pattern` | **192** | **Model-inferred. Not authoritative.** |

So roughly **45% of answers are predictions, not official keys.** Use this app for
timed practice and exposure to question patterns — not as a source of truth for any
individual answer. If a question's answer looks wrong to you, it may well be. Corrections
via PR are very welcome; please include the source you verified against.

## Data pipeline

The source PDFs are **not** included in this repository (see *Exam content* below).
To rebuild the question bank, first place the papers in `pdfs/` — `pdfs/_manifest.json`
lists the expected filenames — then:

```bash
python scripts/ocr_and_parse.py     # OCR the scanned PDFs (slow)
python scripts/seed_questions.py    # rebuild src/data/questions.json
```

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
