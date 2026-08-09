import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

/**
 * ESLint 9 flat config. `next lint` was removed in Next 16 — this repo has no
 * linter until this file — so this IS the setup, not a tweak of one.
 *
 * `eslint-config-next`'s flat exports replace the removed command:
 *   - `core-web-vitals` — the React/hooks/import/Next.js rule base, plus the
 *     Core Web Vitals ruleset.
 *   - `typescript` — layers `typescript-eslint`'s `recommended` (non
 *     type-checked; see the note below) over it.
 *
 * `eslint-config-next`'s own base only wires a hand-picked handful of
 * `jsx-a11y` rules at `warn` (alt-text, aria-props/proptypes,
 * aria-unsupported-elements, role-has-required-aria-props,
 * role-supports-aria-props — see its `index.js`). CLAUDE.md's accessibility
 * bar is explicit and non-negotiable here ("Visible keyboard focus, correct
 * radio-group semantics… baseline, not polish"), so the plugin's full
 * `recommended` config is layered on top, scoped to files that actually carry
 * JSX.
 *
 * NOT type-checked linting: `typescript-eslint` has no API to target TS 7 yet
 * (github.com/typescript-eslint/typescript-eslint/issues/10940) — this repo's
 * real `typescript` dependency is 7.x, the Go-native compiler, whose package
 * doesn't expose the classic Program API `recommendedTypeChecked` needs.
 * `scripts/link-lint-typescript.mjs` (a postinstall step) gives the
 * `typescript-eslint` packages a private, classic-API-compatible `typescript`
 * so they can parse and run their *syntactic* rules at all; type-aware rules
 * are out of reach until TS 7.1 ships that API, so this is `recommended`, not
 * `recommendedTypeChecked`. See that script for the full explanation.
 */
const eslintConfig = defineConfig([
  globalIgnores([
    // eslint-config-next's own defaults (core-web-vitals.js / typescript.js
    // both set these — repeated explicitly since we also add to the list).
    ".next/**",
    // The blue/green slot builds. `.next/**` above does NOT cover these — the
    // glob is literal — so once ops/deploy.sh started building into .next-a and
    // .next-b, `npm run lint` began linting 210 files of generated output and
    // reported 391 errors that were not in this repo's source at all. Any
    // NEXT_DIST_DIR the deploy uses belongs here.
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright screenshots from `npm run visual` — gitignored, not source.
    ".visual/**",
    // The Python OCR pipeline's own scratch output — not JS/TS, but the OCR
    // text files are large and glob-matching them for nothing is wasted work.
    "scripts/ocr_text/**",
    "scripts/__pycache__/**",
  ]),
  ...nextVitals,
  ...nextTs,
  {
    // Only `.rules` is taken, not the whole `flatConfigs.recommended` object:
    // that object also carries its own `plugins: { "jsx-a11y": ... }`, and
    // `eslint-config-next`'s base config already registers that same plugin
    // key (via its own interop-wrapped import) on the same files — ESLint's
    // flat config refuses to have one plugin key point at two different
    // object references ("Cannot redefine plugin \"jsx-a11y\""). Adding just
    // the rules is enough; they attach to the plugin already registered.
    files: ["src/**/*.{jsx,tsx}"],
    rules: { ...jsxA11y.flatConfigs.recommended.rules },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // `no-explicit-any` is already 'warn' by default under `recommended`;
      // CLAUDE.md says "No `any`" outright, so it is promoted to an error —
      // the codebase has none today (see the lint run this shipped with).
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // `eslint-plugin-react-hooks` v7 (pulled in by `eslint-config-next`)
      // ships a much larger "recommended" set than the classic
      // rules-of-hooks/exhaustive-deps pair — `refs` and
      // `set-state-in-effect` are new rules aimed at React Compiler
      // compatibility. This app does not use the React Compiler (no
      // `babel-plugin-react-compiler`/`experimental.reactCompiler` anywhere
      // in the repo), and a first full run surfaced 42 pre-existing
      // instances across the Potter animation system and several
      // hydration-safe `useEffect(() => setState(...), [])` reads of
      // `localStorage` — many of them the exact "latest-value ref" and
      // "sync client-only state after mount" patterns CLAUDE.md and this
      // codebase's own comments call out as deliberate (see
      // `PotterRider.tsx`, `PotterCoach.tsx`'s `secondsRef`/`answeredRef`,
      // and `usePotterDrag.ts`).
      //
      // Rewriting all 42 to satisfy compiler-readiness rules for a compiler
      // this project doesn't run is out of scope for a lint-setup pass, and
      // touching that many call sites in `src/components`/`src/lib` risks
      // colliding with other work happening in those files right now. Kept
      // at `warn`, not `off`, so they stay visible in `npm run lint` and any
      // *new* code introducing the same pattern is still flagged — just
      // doesn't fail the build. `react-hooks/purity`, the third rule in this
      // same new family, is left at `error`: its 2 hits were reviewed
      // individually and are disabled at the call site with a reason
      // (`PotterCoach.tsx`, `TestClient.tsx`), so the rule stays sharp for
      // anything new.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // `scripts/*.mjs` and this config file are Node tooling, not app code —
    // Next's React/JSX/Core-Web-Vitals rules have nothing to check there, and
    // a top-level `console.log` is how a CLI script is supposed to report.
    files: ["scripts/**/*.mjs", "eslint.config.mjs"],
    rules: {
      "no-console": "off",
    },
  },
]);

export default eslintConfig;
