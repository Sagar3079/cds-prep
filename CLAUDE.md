# CLAUDE.md — cds-prep

Guidance for Claude Code working in this repo.

## What this is

A Next.js 16 / React 19 / TypeScript / Tailwind v4 web app for daily CDS (Combined
Defence Services) English practice. Questions are derived from UPSC previous-year
papers via an OCR pipeline. All user state lives in browser `localStorage` — there is
no backend, no database, no auth, no API keys.

**This is a frontend project.** Every task here is UI, UX, data-shaping, or the Python
OCR pipeline.

## Architecture

```
src/
  app/                 Next.js App Router
    page.tsx           home — daily test entry + stats
    test/page.tsx      the 10-question, 10-minute test
    results/page.tsx   scoring + review with correct answers
    history/page.tsx   past attempts, streaks
    layout.tsx, globals.css
  components/          HomeStats, Navbar, QuestionCard, TestClient, Timer
  lib/
    daily.ts           seeded PRNG (mulberry32) → deterministic daily question set,
                       option shuffling with answer remap, MARKING, scoreAnswers
    storage.ts         localStorage read/write, streak + accuracy stats
  data/questions.json  427 questions (the app's only data source)
  types.ts             Question, QuestionPart, Results

scripts/               Python OCR + parsing pipeline (ocr_and_parse.py,
                       seed_questions.py, expand_bank.py, merge_answered_ocr.py)
answer_keys/           keys.json, manual_keys.json (derived; source images gitignored)
pdfs/                  gitignored — fetch locally, see README
```

### Invariants — do not break these

- **`pickDailyQuestions` must stay deterministic for a given date string.** It seeds
  `mulberry32` from `hashString(date)`. Everyone gets the same daily set. Never
  introduce `Date.now()` or `Math.random()` into that path — `pickRandomQuestions` is
  the separate non-deterministic entry point.
- **`shuffleQuestionOptions` remaps `answer` to follow the shuffled option.** If you
  touch option ordering anywhere, the answer index must move with it, or scoring
  silently breaks.
- **Marking is +1 / −0.25 / 0 over 600s**, defined once in `MARKING` (`src/lib/daily.ts`).
  Read it from there; never hardcode the numbers in components.
- **`localStorage` access must stay SSR-safe** — every accessor in `storage.ts` guards
  `typeof window === "undefined"`. Keep that guard on anything new.
- **`answer` may be `null`** in the `Question` type. `answeredPool` filters those out.
  Don't assume it's always a number.

### Answer-quality caveat

Of 427 questions, only 235 have answers traceable to an official or verified key
(`answerSource` = `verified`, `verified-key`, `verified-pyq-pattern`). The remaining
**192 are `predicted-cds-pattern` — model-inferred, not authoritative.** Any feature
that presents answers to a learner should preserve or surface `answerSource`. Do not
add copy that claims all answers are official.

---

## Skills to use

Use these proactively — don't wait to be asked.

### Always, for any UI work

| Skill / plugin | Use it for |
| --- | --- |
| **`impeccable`** | The design layer. Invoke before writing UI code, not after. `/impeccable craft` for new surfaces, `/impeccable polish` and `/impeccable audit` on existing ones, `/impeccable critique` when a screen feels generic. This is the primary design authority in this repo. |
| **`frontend-design`** | Taste and UX writing. Brainstorm a token system and critique the plan *before* coding. Its anti-pattern list (cream+serif+terracotta, near-black+acid-green, broadsheet hairline layouts) is a hard no — this app has a deliberate lavender/white identity; keep it and make it sharper, don't drift to defaults. |
| **`ui-design`** — web skills only | Reference depth: `design-system-patterns`, `visual-design-foundations`, `responsive-design`, `web-component-design`, `interaction-design`, `accessibility-compliance`. Commands: `/ui-design:design-review`, `/ui-design:create-component`, `/ui-design:accessibility-audit`. |

Accessibility is not optional here: this is a timed test taken under pressure. Visible
keyboard focus, correct radio-group semantics on `QuestionCard`, an accessible live
region for `Timer`, and `prefers-reduced-motion` support are baseline, not polish.

### Always, before using an API you haven't verified

| Skill | Use it for |
| --- | --- |
| **`context7`** | This repo runs **Next 16, React 19, Tailwind v4, TypeScript 7** — all recent enough that training-data recall is unreliable. Pull current docs before using an App Router API, a React 19 hook, or Tailwind v4 CSS-first config. Tailwind v4 has no `tailwind.config.js`; theme lives in CSS via `@theme`. Check before you edit. |

### For non-trivial changes

| Skill | Use it for |
| --- | --- |
| **`superpowers`** | `brainstorming` before multi-file features; `writing-plans` then `executing-plans`; `systematic-debugging` for anything scoring- or timer-related; `verification-before-completion` before claiming done; `requesting-code-review` on substantial diffs. |
| **`code-simplifier`** | After a feature lands, on the changed files only. |
| **`figma`** | Only when a Figma file or design reference is actually in play. Run the `figma-design-to-code` skill before `get_design_context`. Requires `claude mcp login plugin:figma:figma`. |
| **`skill-creator`** | Only when authoring or editing a skill — not for app code. |

### Do not use in this repo

- **`reverse-engineering`** — binary/malware analysis. Nothing here is a binary.
- **`clangd-lsp`** — C/C++ language server. There is no C/C++ code.
- **`ui-design` mobile skills** (`mobile-ios-design`, `mobile-android-design`,
  `react-native-design`) — this is a responsive web app; there is no native target.
- **`ida-pro-mcp` / `dynast` MCP servers** — unrelated to this project.

If a skill isn't in the "use" tables above and isn't obviously relevant to a Next.js
web app, don't reach for it.

---

## Conventions

- **TypeScript strict.** No `any`. Import types via `import type`. Path alias is `@/*`.
- **Tailwind v4 only** for styling — no CSS modules, no styled-components, no inline
  style objects for anything Tailwind can express. Shared tokens go in `globals.css`
  under `@theme`.
- **Server Components by default.** Add `"use client"` only where interactivity or
  `localStorage` genuinely requires it (`TestClient`, `Timer`, `HomeStats`, history).
- **Pure logic stays in `src/lib/`** and stays unit-testable — no React imports there.
- Match the existing file's comment density and naming. `daily.ts` is terse and
  comment-light by design; don't over-annotate it.

## Commands

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

Data pipeline (Python, needs the gitignored `pdfs/`):

```bash
python scripts/ocr_and_parse.py     # OCR the source PDFs — slow
python scripts/seed_questions.py    # rebuild src/data/questions.json
```

## Before saying a change is done

1. `npm run build` passes.
2. `npm run lint` passes.
3. Keyboard-only pass over any screen you touched; focus is visible throughout.
4. If you touched `daily.ts`: same date still yields the same question set, and a
   shuffled option still scores correctly.
5. If you touched anything user-facing: run `/impeccable audit` on it.
