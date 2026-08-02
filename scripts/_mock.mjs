import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 980, height: 620 }, deviceScaleFactor: 2.5 });
await p.goto(pathToFileURL(process.env.S + "/kuromi-artifact.html").href);
await p.waitForTimeout(600);
await p.locator("#hero").screenshot({ path: process.env.S + "/kuromi-v2.png" });
await b.close();
