/**
 * Check every factual claim on the landing page against the actual data.
 *
 * The landing page takes paid traffic and makes specific, checkable claims —
 * how many questions there are, and how many carry an answer read from the key
 * UPSC published. Those numbers are hardcoded in `BANK_FACTS` (a landing page
 * should not parse a megabyte of JSON at request time), and a hardcoded number
 * beside a growing dataset is a claim with a shelf life.
 *
 * So this asserts them. Run it whenever the banks change; it exits non-zero and
 * says which number moved.
 *
 *   node scripts/landing-facts.mjs
 */
import { readFileSync } from "node:fs";

const read = (p) => {
  try {
    return JSON.parse(readFileSync(new URL(p, import.meta.url)));
  } catch {
    return [];
  }
};

const english = read("../src/data/questions.json");
const gk = read("../src/data/questions-gk.json");
const all = [...english, ...gk];

const actual = {
  questions: all.length,
  officialKey: all.filter((q) => q.answerSource === "official-key").length,
  papers: new Set(
    all.map((q) => (q.id.match(/^(cds[12]-\d{4})/) || [])[1]).filter(Boolean),
  ).size,
};

// Kept in step with `BANK_FACTS` in src/app/landing/page.tsx by hand — this
// script exists to make that hand-step impossible to forget.
const page = readFileSync(
  new URL("../src/app/landing/page.tsx", import.meta.url),
  "utf8",
);
const claimed = {};
for (const key of ["questions", "officialKey", "papers"]) {
  const m = new RegExp(`${key}:\\s*([\\d_]+)`).exec(page);
  claimed[key] = m ? Number(m[1].replace(/_/g, "")) : NaN;
}

let bad = 0;
console.log("claim         page      actual");
for (const key of Object.keys(actual)) {
  const ok = claimed[key] === actual[key];
  if (!ok) bad++;
  console.log(
    `${key.padEnd(13)} ${String(claimed[key]).padEnd(9)} ${actual[key]}  ${ok ? "ok" : "<-- DRIFTED"}`,
  );
}

if (bad) {
  console.error(
    `\n${bad} claim(s) on the landing page no longer match the banks.` +
      `\nUpdate BANK_FACTS in src/app/landing/page.tsx.`,
  );
  process.exit(1);
}
console.log("\nall landing-page claims match the data");
