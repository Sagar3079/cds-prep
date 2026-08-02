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

- **`pickDailyQuestions` must stay deterministic for a given date string, across all
  users.** The bank is shuffled once from a fixed `CANON_SEED`; the date only selects
  which window of that canonical order is today's. It accepts an `excludeIds` argument
  and **deliberately ignores it** — per-user state entering this path is exactly what
  broke determinism before. Never introduce `Date.now()`, `Math.random()`, or any
  localStorage read into it. `pickRandomQuestions` is the separate non-deterministic
  entry point and is where per-user exclusion belongs.
- **Calendar days are local, never UTC.** Use `dateKey()` / `todayKey()` from
  `storage.ts`. `toISOString().slice(0,10)` is a bug here — users are in IST, so before
  05:30 it returns the previous day and attempts overwrite each other.
- **`saveAttempt` is append-only.** It assigns `attemptNo` and `savedAt` itself; callers
  must not set them. Never reintroduce overwrite-on-date-match — a retake must not erase
  the earlier attempt.
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

The bank is **803 questions**: 486 mined from real papers (ids `cds1-*` / `cds2-*`) and
317 hand-typed Python literals in `scripts/expand_bank.py` (192, `pred-*`) and
`scripts/seed_questions.py` (125, `seed-*`).

`answerSource` is the only honest signal, and the labels are not equal:

- **`official-key` (464)** — read from the answer key UPSC published for that paper
  (Series A). `answer_keys/keys.json` holds all 1,798 of them across fifteen papers.
  This is the one tier you may describe to a learner as authoritative.
- **`verified` (22)** — hand-typed from the paper with no key. Likely, not settled.
- **`verified-pyq-pattern` (125)** and **`predicted-cds-pattern` (192)** — constants
  stamped on every hand-written record. They record nothing about verification, despite
  one of them starting with the word "verified".

Two traps that have already caused real bugs:

- **`year` and `session` are fabricated for the 317 hand-written questions** — `pred-*`
  all claim `2024/1`, `seed-*` all claim `2020/1`. Only show a paper reference for ids
  starting `cds1-`/`cds2-`.
- **A hand-typed key is not a key.** `answer_keys/manual_keys.json` was the sole source
  of the old `verified-key` tier and disagreed with the official UPSC key on 20.6% of
  its entries; twelve wrong answers shipped under the app's strongest label before this
  was caught. If you add answers, they come from `answer_keys/keys.json` or they are not
  `official-key`.

Any feature showing an answer must surface `answerSource` honestly and must not imply a
hand-written answer carries the authority of a key. See README.md for the full numbers.

---

## Skills to use

Use these proactively — don't wait to be asked.

### Always, for any UI work

| Skill / plugin | Use it for |
| --- | --- |
| **`impeccable`** | The design layer. Invoke before writing UI code, not after. `/impeccable craft` for new surfaces, `/impeccable polish` and `/impeccable audit` on existing ones, `/impeccable critique` when a screen feels generic. This is the primary design authority in this repo. |
| **`frontend-design`** | Taste and UX writing. Brainstorm a token system and critique the plan *before* coding. Its anti-pattern list (cream+serif+terracotta, near-black+acid-green, broadsheet hairline layouts) is a hard no. |
| **`ui-design`** — web skills only | Reference depth: `design-system-patterns`, `visual-design-foundations`, `responsive-design`, `web-component-design`, `interaction-design`, `accessibility-compliance`. Commands: `/ui-design:design-review`, `/ui-design:create-component`, `/ui-design:accessibility-audit`. |

## Design system

`src/app/globals.css` is the source of truth, not Figma. Every colour is a CSS custom
property; Tailwind reads them through `@theme inline`, so redefining a token under dark
mode reskins every utility in the app. Semantic utilities: `paper surface surface-2 ink
muted line accent accent-ink accent-soft streak streak-ink streak-soft ok ok-ink ok-soft
err err-ink err-soft on-accent`.

The direction is bright and gamified — a mobile-first column that stays the app at every
breakpoint while the page grows around it. `.shell` is that column (460 / 620 / 460).

### Contrast rules — not negotiable

- `accent` `#2F6BFF` is **4.0:1**. Fills and buttons only. Blue *text* uses `accent-ink`.
- `streak` `#FF8A3D` is **2.3:1**. Fills and icons only, never text. Orange *text* uses
  `streak-ink`.

### Motion

`--ease` for hovers, lifts, anything continuous. `--spring` (slight overshoot) for
confirmations **only** — a tick landing, a badge filling, a dialog arriving. Overshoot on
a hover lift reads as rubbery. `globals.css` carries a global `prefers-reduced-motion`
guard that neutralises all CSS animation and transition, so components must not add their
own guards for CSS-driven effects. JS-driven animation (the results confetti) still has
to check `matchMedia` itself.

### Two traps

- The component classes in `globals.css` are **unlayered**, so they beat anything in
  `@layer utilities`. A Tailwind padding utility will not override `.card` — build from
  raw utilities instead when you need different padding.
- The old `lavender-*` palette is **gone**. If you see it in a diff or an older file,
  it will render as an unknown utility with no style — replace it with a semantic name.

Figma (https://www.figma.com/design/Lc1YFPfOhD6eGUlxYygkGQ, page `v2 — Responsive`) holds
the static frames this was built from. The `v1 — archived` page is an abandoned navy
direction — ignore it.

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
npm run dev        # http://localhost:3000
npm run build
npm run typecheck  # tsc --noEmit
npm run lint        # eslint . — flat config in eslint.config.mjs
npm run visual      # scripts/visual-check.mjs against a running dev server
```

`next lint` was removed in Next 16; `eslint.config.mjs` (ESLint 9 flat config,
`eslint-config-next` + `typescript-eslint` + `eslint-plugin-jsx-a11y`) replaces it. One
wrinkle: this repo's `typescript` dependency is 7.x (the Go-native compiler), and
`typescript-eslint` has no API to target TS 7 yet — it only runs against a classic-API
`typescript`. `scripts/link-lint-typescript.mjs` (a `postinstall` step, re-run on every
`npm install`) gives just the lint toolchain a private copy of the `@typescript/typescript6`
compatibility shim via a symlink inside its own `node_modules`, without touching the
project's real `typescript` dependency — `tsc`/`next build` are unaffected. See that
script's header comment for the full story if `npm run lint` ever starts failing with
"typescript-eslint does not support TS 7.0".

Data pipeline (Python, needs the gitignored `pdfs/`):

```bash
python scripts/ocr_and_parse.py     # OCR the source PDFs — slow
python scripts/seed_questions.py    # rebuild src/data/questions.json
```

## Before saying a change is done

1. `npm run build` passes.
2. `npm run typecheck` passes.
3. `npm run lint` exits 0. Warnings are fine if they're already-known, listed debt
   (see `eslint.config.mjs`'s comments); a *new* warning your change introduced is not —
   fix it or justify a scoped `eslint-disable-next-line` with a reason, never a blanket
   rule-off.
4. If you touched anything with a viewport-dependent layout (mobile nav, the run header,
   Potter, any panel that scrolls): `npm run visual` passes at every viewport it checks,
   against a running `npm run dev`. It fails loudly, not silently, on horizontal scroll,
   `.panel-body > main` overflowing at phone width, and Potter losing his self-skip gate.
5. Keyboard-only pass over any screen you touched; focus is visible throughout.
6. If you touched `daily.ts`: the same date still yields the same set *regardless of
   what is in localStorage*, and a shuffled option still scores correctly.
7. If you touched `storage.ts`: a second attempt on the same day does not overwrite the
   first, and a date near midnight IST resolves to the local day.
8. If you touched anything user-facing: run `/impeccable audit` on it.
