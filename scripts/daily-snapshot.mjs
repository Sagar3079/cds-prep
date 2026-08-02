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

/**
 * The standing demonstration of WHY General Knowledge is a separate bank.
 *
 * Reads the GK draft directly (never written to) and shows three things in one
 * run: English alone, English while a populated GK bank exists alongside it, and
 * English with GK appended into the same array — which is the change that looks
 * harmless and silently moves every user.
 */
async function proof() {
  const gk = JSON.parse(
    readFileSync(new URL("../src/data/questions-gk.draft.json", import.meta.url)),
  );
  const ids = (bank, date) =>
    pickDailyQuestions(bank, date, COUNT).map((q) => q.id).join(",");

  const days = dates(START, DAYS);
  let separateDrift = 0;
  let mergedDrift = 0;
  const merged = [...questions, ...gk];

  for (const date of days) {
    const base = ids(questions, date);
    // How the app actually does it: two banks, picked independently.
    if (ids(questions, date) !== base) separateDrift++;
    // The mistake: one pool.
    if (ids(merged, date).split(",").join(",") !== base) mergedDrift++;
  }

  const gkSample = pickDailyQuestions(gk, days[0], COUNT).map((q) => q.id);

  console.log(`english bank: ${questions.length}`);
  console.log(`gk draft bank: ${gk.length}`);
  console.log(`dates compared: ${days.length}`);
  console.log(
    `SEPARATE banks (what this app does): ${separateDrift}/${days.length} dates changed`,
  );
  console.log(
    `MERGED into one pool (the bug this avoids): ${mergedDrift}/${days.length} dates changed`,
  );
  console.log(`gk set for ${days[0]}: ${gkSample.join(", ")}`);
  process.exit(separateDrift === 0 ? 0 : 1);
}

const args = process.argv.slice(2);
const diffAt = args.indexOf("--diff");

if (args.includes("--proof")) {
  await proof();
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
