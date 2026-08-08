/**
 * Determinism guard for `pickDailyQuestions`.
 *
 *   node scripts/daily-snapshot.mjs > before.json      # before a change
 *   node scripts/daily-snapshot.mjs > after.json       # after it
 *   node scripts/daily-snapshot.mjs --diff before.json after.json
 *
 * The daily set is one canonical shuffle of the answered bank from a fixed
 * `CANON_SEED`, with the date choosing which window of it is today's. That makes
 * the whole thing order-sensitive: appending a single question to the bank
 * reshuffles every window and silently moves every existing user to a different
 * set and a different position in the cycle. Nothing in the app can see that
 * happen — no test fails, no type breaks, the numbers just change.
 *
 * So it gets snapshotted. This walks a fixed run of dates, records the exact ids
 * `pickDailyQuestions` returns for each, and diffs two runs. Zero drift is the
 * only passing result.
 *
 * Deliberately imports the REAL `src/lib/daily.ts` (Node ≥ 22.18 strips the
 * types) rather than reimplementing the maths — a reimplementation could agree
 * with itself while disagreeing with the app.
 */
import { readFileSync, writeFileSync } from "node:fs";
import questions from "../src/data/questions.json" with { type: "json" };
import { pickDailyQuestions } from "../src/lib/daily.ts";

/** Fixed window, so two runs on different days still compare. */
const START = "2026-01-01";
const DAYS = 30;
const COUNT = 10;
const DAY_MS = 86400000;

function dates(start, n) {
  const [y, m, d] = start.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(base + i * DAY_MS);
    return t.toISOString().slice(0, 10);
  });
}

function snapshot() {
  const out = {};
  for (const date of dates(START, DAYS)) {
    // excludeIds is deliberately ignored by pickDailyQuestions — passing junk
    // here is part of the assertion, not an oversight.
    out[date] = pickDailyQuestions(questions, date, COUNT, ["cds1-2018-001"]).map(
      (q) => q.id,
    );
  }
  return { bank: questions.length, start: START, days: DAYS, count: COUNT, sets: out };
}

const GOLDEN = new URL("./daily-golden.json", import.meta.url);

/**
 * The standing demonstration of WHY General Knowledge is a separate bank — and,
 * since it is cited in CLAUDE.md as the proof of that invariant, a check that
 * can actually fail.
 *
 * It could not, before. The "separate banks" half compared
 * `ids(questions, date)` against a `base` computed by calling
 * `ids(questions, date)` — the same expression, same arguments, one line apart.
 * It was true by construction on every date, `separateDrift` was structurally
 * incapable of being anything but 0, and `--proof` therefore exited 0 whatever
 * had happened to the bank. The invariant CLAUDE.md believed was under guard was
 * not being watched at all.
 *
 * So the real half now compares today's English ids against
 * `scripts/daily-golden.json`, a committed record of what those thirty dates
 * returned when the bank was known good. That is a genuine assertion: reorder
 * the bank, append a question to the wrong file, or change the shuffle, and it
 * fails with the dates that moved.
 *
 * The contrast half is unchanged and was always real: merging GK into the
 * English array moves every date, which is the mistake the two-file layout
 * exists to prevent.
 *
 * Regenerate the golden file ONLY when a daily-set change is intended:
 *   node scripts/daily-snapshot.mjs --bless
 */
async function proof() {
  const gk = JSON.parse(
    readFileSync(new URL("../src/data/questions-gk.draft.json", import.meta.url)),
  );
  const ids = (bank, date) =>
    pickDailyQuestions(bank, date, COUNT).map((q) => q.id).join(",");

  const days = dates(START, DAYS);
  const merged = [...questions, ...gk];

  let golden = null;
  try {
    golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  } catch {
    console.error(
      `No ${GOLDEN.pathname} to compare against.\n` +
        "Create it with:  node scripts/daily-snapshot.mjs --bless",
    );
    process.exit(2);
  }

  const drifted = [];
  let mergedDrift = 0;

  for (const date of days) {
    const base = ids(questions, date);
    // What the app does: English picked from its own bank, GK nowhere near it.
    // Compared against the committed record rather than against itself.
    if ((golden.sets[date] ?? []).join(",") !== base) {
      drifted.push({ date, expected: (golden.sets[date] ?? []).join(","), got: base });
    }
    // The mistake: one pool.
    if (ids(merged, date) !== base) mergedDrift++;
  }

  const gkSample = pickDailyQuestions(gk, days[0], COUNT).map((q) => q.id);

  console.log(`english bank: ${questions.length} (golden recorded ${golden.bank})`);
  console.log(`gk draft bank: ${gk.length}`);
  console.log(`dates compared: ${days.length}`);
  console.log(
    `SEPARATE banks (what this app does): ${drifted.length}/${days.length} dates changed vs golden`,
  );
  console.log(
    `MERGED into one pool (the bug this avoids): ${mergedDrift}/${days.length} dates changed`,
  );
  console.log(`gk set for ${days[0]}: ${gkSample.join(", ")}`);

  for (const d of drifted.slice(0, 5)) {
    console.log(`  ${d.date}\n    expected ${d.expected}\n    got      ${d.got}`);
  }

  if (mergedDrift === 0) {
    // Not a pass. Either the GK draft is empty or the picker stopped depending
    // on bank order — and if merging changes nothing, this proof proves nothing.
    console.error(
      "\nCONTRAST FAILED: merging GK changed no dates, so this run demonstrates nothing.",
    );
    process.exit(1);
  }
  process.exit(drifted.length === 0 ? 0 : 1);
}

const args = process.argv.slice(2);
const diffAt = args.indexOf("--diff");

if (args.includes("--proof")) {
  await proof();
} else if (args.includes("--bless")) {
  // Records the current daily sets as the expected ones. A deliberate act: it is
  // how an INTENDED change to the bank is accepted, and running it to make a
  // failing --proof go away discards the only guard on the invariant.
  const snap = snapshot();
  writeFileSync(GOLDEN, JSON.stringify(snap, null, 2) + "\n");
  console.log(
    `blessed ${GOLDEN.pathname} — ${snap.days} dates, bank ${snap.bank}`,
  );
} else if (diffAt === -1) {
  const snap = snapshot();
  const target = args[0];
  const json = JSON.stringify(snap, null, 2);
  if (target) {
    writeFileSync(target, json);
    console.log(`wrote ${target} — ${snap.days} dates, bank ${snap.bank}`);
  } else {
    console.log(json);
  }
} else {
  const [aPath, bPath] = args.slice(diffAt + 1);
  const a = JSON.parse(readFileSync(aPath, "utf8"));
  const b = JSON.parse(readFileSync(bPath, "utf8"));
  const drift = [];
  for (const date of Object.keys(a.sets)) {
    const before = a.sets[date].join(",");
    const after = (b.sets[date] ?? []).join(",");
    if (before !== after) drift.push({ date, before, after });
  }
  console.log(`bank: ${a.bank} → ${b.bank}`);
  console.log(`dates compared: ${Object.keys(a.sets).length}`);
  if (drift.length === 0) {
    console.log("DRIFT: none — every date returns byte-identical ids");
  } else {
    console.log(`DRIFT: ${drift.length} date(s) changed`);
    for (const d of drift.slice(0, 5)) {
      console.log(`  ${d.date}\n    before ${d.before}\n    after  ${d.after}`);
    }
  }
  process.exit(drift.length === 0 ? 0 : 1);
}
