#!/usr/bin/env node
/**
 * Postinstall shim: give the lint toolchain a `typescript` it can actually run against.
 *
 * This repo's real `typescript` dependency is 7.x — the Go-native ("Corsa") compiler.
 * Its published package deliberately exposes almost nothing on the classic entry point
 * (`require("typescript")` returns just `{ version, versionMajorMinor }`) because the
 * old Program/compiler API that tools introspect doesn't ship until TS 7.1. `eslint`,
 * `next build` and `tsc --noEmit` all keep working against real 7.x — none of them need
 * that API — but `typescript-eslint` does, and it refuses to run at all against a 7.x
 * `typescript`, refusing with an explicit "typescript-eslint does not support TS 7.0" and
 * pointing at Microsoft's own "run side by side with TypeScript 6.0" guidance:
 * https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0
 * (tracking issue: https://github.com/typescript-eslint/typescript-eslint/issues/10940).
 *
 * Microsoft's guidance is to alias the project's *own* `typescript` dependency to the
 * `@typescript/typescript6` compatibility package. That's a global change — it would
 * repoint what `require("typescript")` resolves to for `next build`'s own internal
 * type-checking too, for every other tool, and for every other agent relying on this
 * repo's declared TypeScript 7 stack (see CLAUDE.md). Too big a blast radius for what is
 * really only a lint-time problem.
 *
 * `npm`'s `overrides` field looks like the scoped alternative — "give *only* the packages
 * under typescript-eslint a different typescript" — but it doesn't actually nest a
 * private copy for a *peerDependency*-only conflict like this one; it just warns and
 * keeps the hoisted root copy, which is exactly the 7.x copy typescript-eslint refuses to
 * load (verified empirically against npm 11.12.1 before writing this).
 *
 * So this script does by hand what `overrides` was supposed to do: it drops a directory
 * junction/symlink named `typescript` inside `node_modules/<pkg>/node_modules/` for every
 * package that actually does `require("typescript")` on the lint path, pointing at the
 * `@typescript/typescript6` devDependency (the classic-API-compatible shim Microsoft
 * publishes for exactly this transition). Node's module resolution checks a package's own
 * `node_modules` before walking up, so those packages pick up the 6.x-compatible shim
 * while the project's root `dependencies.typescript` (7.x, used by `next build` and
 * `tsc --noEmit`) is never touched.
 *
 * Safe to re-run — `npm install` re-runs this every time. Never throws: a broken shim
 * should degrade to "lint doesn't work", not "nobody can `npm install`".
 */
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shimSource = join(root, "node_modules", "@typescript", "typescript6");

// Every package on the lint path observed (by grepping their published .js) to
// `require("typescript")` at runtime. A few siblings that only use it for types are
// harmless to include defensively — a stale symlink they never read costs nothing.
const TARGETS = [
  "typescript-eslint",
  "@typescript-eslint/eslint-plugin",
  "@typescript-eslint/parser",
  "@typescript-eslint/typescript-estree",
  "@typescript-eslint/utils",
  "@typescript-eslint/type-utils",
  "@typescript-eslint/project-service",
  "@typescript-eslint/tsconfig-utils",
  "ts-api-utils",
];

function link(pkg) {
  const pkgDir = join(root, "node_modules", ...pkg.split("/"));
  if (!existsSync(pkgDir)) return; // not installed (e.g. pruned) — nothing to shim

  const nm = join(pkgDir, "node_modules");
  const linkPath = join(nm, "typescript");

  try {
    const st = lstatSync(linkPath, { throwIfNoEntry: false });
    if (st) {
      // Already the right link — leave it alone.
      if (st.isSymbolicLink() && resolve(dirname(linkPath), readlinkSync(linkPath)) === shimSource) {
        return;
      }
      rmSync(linkPath, { recursive: true, force: true });
    }
    mkdirSync(nm, { recursive: true });
    symlinkSync(shimSource, linkPath, process.platform === "win32" ? "junction" : "dir");
  } catch (err) {
    console.warn(`[link-lint-typescript] skipped ${pkg}: ${err.message}`);
  }
}

if (!existsSync(shimSource)) {
  // @typescript/typescript6 isn't installed (e.g. a production install with dev
  // dependencies omitted) — lint isn't going to run here anyway.
  process.exit(0);
}

for (const pkg of TARGETS) link(pkg);
