/**
 * Render the app in a real browser, screenshot it, and assert the layout
 * invariants that are impossible to check from source.
 *
 *   npm run dev            # in another terminal
 *   node scripts/visual-check.mjs
 *
 * Everything in this project was verified for a long time by typechecking,
 * building and curling for a 200 — none of which can see that a character is
 * flying over the question text, or that a panel has no frame. This can.
 *
 * Screenshots land in .visual/ (gitignored).
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import questions from "../src/data/questions.json" with { type: "json" };

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = ".visual";

const fails = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) fails.push(name);
};

/** Real ids, so /api/explain resolves them. */
function sampleQuestions(n = 4) {
  const wanted = ["official-key", "predicted-cds-pattern"];
  const out = [];
  for (const src of wanted) {
    for (const q of questions) {
      if (q.answerSource !== src || q.passage) continue;
      out.push(q);
      if (out.length >= n) return out;
    }
  }
  return out;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR ${e.message}`));

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

// Seed a finished attempt so /results has something real to render.
await page.evaluate((qs) => {
  sessionStorage.setItem(
    "cds-last-result",
    JSON.stringify({
      date: "2026-08-02",
      mode: "daily",
      timeTaken: 240,
      questions: qs,
      answers: qs.map((q, i) => (i === 0 ? q.answer : i === 1 ? (q.answer + 1) % 4 : null)),
    })
  );
}, sampleQuestions());

for (const [name, path] of [["home", "/"], ["test", "/test"], ["results", "/results"], ["settings", "/settings"], ["history", "/history"]]) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png` });

  const m = await page.evaluate(() => {
    const rect = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height };
    };
    const panel = document.querySelector(".app-panel");
    return {
      panel: rect(".app-panel"),
      radius: panel ? parseFloat(getComputedStyle(panel).borderRadius) : 0,
      main: rect(".panel-body > main"),
      figure: rect(".potter-rider .potter"),
      cardRight: rect("[data-review-card]")?.right ?? null,
      docScrollW: document.documentElement.scrollWidth,
      viewW: window.innerWidth,
    };
  });

  console.log(`\n[${name}]`);
  check("panel is framed", !!m.panel && m.radius > 0, m.panel ? `${Math.round(m.panel.width)}px wide, r=${m.radius}` : "no panel");
  check("page does not scroll sideways", m.docScrollW <= m.viewW + 1, `${m.docScrollW} vs ${m.viewW}`);
  if (m.figure && m.cardRight !== null) {
    // 3px of tolerance: the extremes of the weave are allowed to touch the
    // card's own padding, but never its text.
    check("Potter stays out of the cards", m.figure.left >= m.cardRight - 3,
      `figure.left=${Math.round(m.figure.left)} cardRight=${Math.round(m.cardRight)}`);
    check("Potter stays inside the panel", m.figure.right <= m.panel.right + 1,
      `figure.right=${Math.round(m.figure.right)} panel.right=${Math.round(m.panel.right)}`);
  }
}

// Scrolling the review is where the rider is most likely to escape its lane.
await page.goto(`${BASE}/results`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
console.log("\n[results — scrolling]");
for (const top of [0, 400, 900, 1600, 2400]) {
  await page.evaluate((t) => document.querySelector(".panel-body > main")?.scrollTo({ top: t }), top);
  await page.waitForTimeout(900);
  const m = await page.evaluate(() => {
    const f = document.querySelector(".potter-rider .potter")?.getBoundingClientRect();
    const cards = [...document.querySelectorAll("[data-review-card]")].map((c) => c.getBoundingClientRect());
    if (!f || !cards.length) return null;
    return { left: f.left, worstCardRight: Math.max(...cards.map((c) => c.right)) };
  });
  if (!m) continue;
  check(`scroll ${top}: clear of the cards`, m.left >= m.worstCardRight - 3,
    `left=${Math.round(m.left)} cardRight=${Math.round(m.worstCardRight)}`);
}

console.log(`\nconsole errors: ${consoleErrors.length ? consoleErrors.slice(0, 5).join(" | ") : "none"}`);
await browser.close();

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(", ")}` : "\nall visual checks passed");
process.exit(fails.length ? 1 : 0);
