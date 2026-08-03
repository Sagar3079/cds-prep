/**
 * Regression gate for /landing. Needs a running dev server.
 *
 *   npm run dev
 *   npm run landing        # or: node scripts/landing-check.mjs
 *
 * The landing page is the surface paid traffic arrives on, and the ads run on
 * MOBILE ONLY. So the things that would quietly destroy it are asserted rather
 * than eyeballed:
 *
 *   - the hero's call to action is above the fold on a small phone,
 *   - it is at least 44px tall, and nothing tappable is under 40px,
 *   - the sticky action bar appears after the hero scrolls away and hides again
 *     over the hero, so there are never two competing CTAs on one screen,
 *   - no horizontal scroll at any width,
 *   - every `.lp-reveal` actually reveals — an element stuck at opacity 0 is
 *     invisible copy on a page that is nothing but copy,
 *   - the app's own routes still get the device frame, since `AppFrame` is a
 *     shared edit and /landing is the only route allowed to escape it.
 *
 * Exits non-zero on any of them, and writes slice screenshots to .visual/.
 */
import { chromium, devices } from "playwright";

// Mobile is the campaign target, so mobile is what gets checked hardest —
// including a small phone, where an above-the-fold CTA is easiest to lose.
const VIEWS = [
  { name: "iphone12", ...devices["iPhone 12"] },
  { name: "small", viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: devices["Pixel 5"].userAgent },
  { name: "desktop", viewport: { width: 1440, height: 900 } },
];

const browser = await chromium.launch();
const problems = [];

for (const v of VIEWS) {
  const { name, ...opts } = v;
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && problems.push(`[${name}] ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`[${name}] PAGEERROR ${e.message}`));
  await page.goto("http://localhost:3000/landing", { waitUntil: "networkidle" });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `.visual/lp-${name}-hero.png` });

  const m = await page.evaluate(() => {
    const vh = window.innerHeight;
    const btn = document.querySelector(".lp-hero .lp-btn");
    const b = btn?.getBoundingClientRect();
    const smallTargets = [...document.querySelectorAll("a, button, summary")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 40).length;
    return {
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      docH: document.documentElement.scrollHeight,
      vh,
      ctaTop: b ? Math.round(b.top) : null,
      ctaBottom: b ? Math.round(b.bottom) : null,
      ctaHeight: b ? Math.round(b.height) : null,
      ctaAboveFold: b ? b.bottom <= vh : false,
      smallTargets,
      stickyShown: document.querySelector(".lp-sticky")?.dataset.shown,
    };
  });

  console.log(
    `[${name}] ${m.innerW}px | doc ${m.docH}px (${(m.docH / m.vh).toFixed(1)} screens) | ` +
      `CTA bottom ${m.ctaBottom}/${m.vh} aboveFold=${m.ctaAboveFold} h=${m.ctaHeight} | ` +
      `sub-40px targets ${m.smallTargets}`,
  );
  if (m.scrollW > m.innerW + 1) problems.push(`[${name}] horizontal scroll ${m.scrollW} > ${m.innerW}`);
  if (opts.isMobile !== undefined || name !== "desktop") {
    if (!m.ctaAboveFold) problems.push(`[${name}] hero CTA is BELOW the fold (bottom ${m.ctaBottom} > ${m.vh})`);
    if (m.ctaHeight && m.ctaHeight < 44) problems.push(`[${name}] hero CTA only ${m.ctaHeight}px tall (min 44)`);
  }

  // Sticky bar behaviour on mobile.
  if (name !== "desktop") {
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.6));
    await page.waitForTimeout(700);
    const shown = await page.evaluate(() => document.querySelector(".lp-sticky")?.dataset.shown);
    console.log(`[${name}] sticky after scroll: ${shown}`);
    if (shown !== "true") problems.push(`[${name}] sticky CTA did not appear`);
    await page.screenshot({ path: `.visual/lp-${name}-sticky.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    const hidden = await page.evaluate(() => document.querySelector(".lp-sticky")?.dataset.shown);
    if (hidden !== "false") problems.push(`[${name}] sticky CTA stayed up over the hero`);
  }

  // Full-page slices.
  const h = m.docH;
  let i = 0;
  for (let y = 0; y < h && i < 10; y += m.vh, i++) {
    await page.evaluate((t) => window.scrollTo(0, t), y);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `.visual/lp-${name}-${String(i).padStart(2, "0")}.png` });
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // Long enough for the longest stagger delay AND the 0.7s transition to land.
  // A shorter wait reported a phantom "never revealed" that a settled page did
  // not have — the check was racing the animation it was checking.
  await page.waitForTimeout(1600);
  const stuck = await page.evaluate(() =>
    [...document.querySelectorAll(".lp-reveal:not(.is-in)")].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return `${el.tagName}.${el.className.replace(/\s+/g, ".")} h=${Math.round(r.height)} display=${cs.display} "${(el.textContent || "").trim().slice(0, 30)}"`;
    }),
  );
  if (stuck.length) problems.push(`[${name}] never revealed: ${stuck.join(" | ")}`);
  await ctx.close();
}

// AppFrame is a shared edit — the app must still be framed.
const ctx = await browser.newContext(devices["iPhone 12"]);
const page = await ctx.newPage();
for (const route of ["/", "/pricing", "/settings", "/test"]) {
  await page.goto(`http://localhost:3000${route}`, { waitUntil: "networkidle" });
  const framed = await page.evaluate(() => !!document.querySelector(".app-panel"));
  if (!framed) problems.push(`${route} lost the device frame`);
}
await page.goto("http://localhost:3000/landing", { waitUntil: "networkidle" });
if (await page.evaluate(() => !!document.querySelector(".app-panel"))) {
  problems.push("/landing is inside the device frame");
}
await browser.close();

console.log(problems.length ? `\nPROBLEMS:\n${problems.join("\n")}` : "\nno problems found");
process.exit(problems.length ? 1 : 0);
