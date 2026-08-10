import "server-only";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * What the access log knows.
 *
 * The app records what people DO — accounts, tests, payments. It has never
 * recorded how they arrived, and for somebody spending money on ads that is the
 * question: which traffic turns into a test and which bounces off the landing
 * page. nginx has logged every request all along, so the answer is on disk and
 * nothing had to be instrumented to get it.
 *
 * This is deliberately the only place that reads outside the app's own store,
 * and it is READ ONLY.
 *
 * ## Why this is a reconstruction, not a measurement
 *
 * A log line cannot say whether a person or a script made a request, whether
 * JavaScript ran, or whether two requests came from one person. What it has is
 * an address, a path, a referrer and a user agent. So:
 *
 * - "Visitors" means distinct addresses, which merges everyone behind one
 *   coaching-centre router and splits one person moving from wifi to mobile
 *   data. In this market the merging is the bigger error, so these figures are
 *   more likely to UNDER-count.
 * - Bots are excluded by user agent and by path, and neither is reliable: the
 *   scanners spraying `/wp-admin` present as Chrome, and are caught by the path
 *   filter instead of the agent one.
 *
 * Every caller must surface this as approximate. The app's own counters are the
 * exact numbers; this is the context around them.
 */

const LOG_DIR = "/var/log/nginx";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Anything self-identifying as automated. */
const BOT =
  /bot|crawl|spider|slurp|scan|curl|wget|python-requests|go-http|zgrab|censys|masscan|nmap|headless|monitor|uptime|pingdom|semrush|ahrefs|bytespider|gptbot|claudebot|facebookexternalhit|preview|lighthouse|dataprovider|expanse/i;

/** Requests that ride along with a page rather than representing an arrival. */
const ASSET =
  /^\/(_next|api|favicon|robots|sitemap|opengraph|icon|apple-)|\.(js|css|woff2?|png|jpe?g|svg|ico|webmanifest|txt|xml|map)$/;

/**
 * The routes this site serves.
 *
 * A request for `/wp-login.php` is a scanner whatever agent it claims, and
 * counting it as a visitor is how a traffic figure becomes fiction. Anything
 * not on this list is discarded before it can reach a chart.
 *
 * The trailing `(\/|$)` is load-bearing. Without it this is an unanchored
 * prefix match, so `/test` also matches `/test.hello`, `/testing/vendor/...`
 * and every other probe that happens to start with a route name — and the
 * "broken pages" table fills up with somebody else's vulnerability scan
 * presented as faults on your own site.
 */
const REAL_PAGE =
  /^\/(landing|test|results|history|leaderboard|settings|pricing|about|contact|terms|privacy|refunds|shipping|download|admin)(\/|$)|^\/$/;

/**
 * Probe shapes, rejected even when they sit under a real route.
 *
 * `/admin/.env` and `/admin/vendor/phpunit/...` both start with a route this
 * app serves, so the boundary check above lets them through. A dotfile or a
 * server-side script extension is never a page here, and a scanner walking
 * every framework it knows should not appear as breakage on your own admin
 * page.
 */
const PROBE = /(^|\/)\.[^/]|\.(php|asp|aspx|jsp|cgi|sh|sql|bak|old|yml|yaml|ini|conf|env)$/i;

/**
 * Routes the app is known to serve successfully. A 4xx on one of these is by
 * definition not the app's doing — see the note at the error branch below.
 */
const SERVED_EXACTLY = new Set([
  "/",
  "/landing",
  "/test",
  "/results",
  "/history",
  "/leaderboard",
  "/settings",
  "/pricing",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
  "/refunds",
  "/shipping",
  "/admin",
  /**
   * NOT bare "/download" — that path genuinely 404s (verified live: only
   * /download/android resolves, to a 302). `REAL_PAGE` above matches the
   * whole `download` prefix because that regex only decides which requests
   * enter the funnel/session-tracking logic, where a bare miss under a real
   * route is still worth attributing to a visitor. This set answers a
   * narrower question — which exact paths return success — and those are not
   * the same list. Confusing the two here would hide a genuine 404.
   */
  "/download/android",
]);

const LINE =
  /^(\S+) \S+ \S+ \[([^\]]+)\] "([A-Z]+) (\S+)[^"]*" (\d{3}) (\d+) "([^"]*)" "([^"]*)"/;

export interface TrafficSummary {
  /** IST day -> distinct addresses that requested a real page. */
  visitorsByDay: Record<string, number>;
  /** Where they came from, biggest first. */
  sources: { source: string; visitors: number }[];
  /** First page of each visitor's session. */
  landingPages: { path: string; visitors: number }[];
  /** Hour of day in IST, 0-23. */
  byHour: number[];
  devices: { device: string; visitors: number }[];
  browsers: { browser: string; visitors: number }[];
  /** Distinct addresses reaching each step, in order. */
  funnel: { step: string; visitors: number }[];
  /** Requests that failed, by status and path. */
  errors: { status: number; path: string; count: number }[];
  totals: {
    requests: number;
    humanPageViews: number;
    visitors: number;
    botRequests: number;
    /** Visitors who saw exactly one distinct page and left. */
    bounced: number;
    /**
     * Requests that never reached the app — connections to the bare IP with a
     * Host matching no server block, answered by nginx's default server.
     * Counted separately so scanner noise is neither hidden nor mistaken for a
     * fault on a real page.
     */
    foreignHostRequests: number;
  };
  /** Which files were read and how far back they reach. */
  meta: { files: number; bytes: number; parsedMs: number; from: string; to: string };
}

const istDay = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const istHour = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).getUTCHours();

/** `10/Aug/2026:00:28:22 +0200` */
const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};
function parseTime(raw: string): Date | null {
  // Hand-parsed rather than `new Date(...)`: the log's format is not one the
  // Date constructor accepts portably, and this runs on every line.
  const m = /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(raw);
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (month === undefined) return null;
  const sign = m[7] === "-" ? 1 : -1;
  const offsetMin = sign * (Number(m[8]) * 60 + Number(m[9]));
  return new Date(
    Date.UTC(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6])) +
      offsetMin * 60_000,
  );
}

function classifySource(referer: string, agent: string): string {
  if (/Instagram/i.test(agent)) return "Instagram (in-app)";
  if (/FBAN|FBAV|FB_IAB/i.test(agent)) return "Facebook (in-app)";
  if (!referer || referer === "-") return "Direct / unknown";
  try {
    const host = new URL(referer).hostname.replace(/^www\./, "");
    if (host.endsWith("prepcadet.in")) return "Internal";
    if (/google\./.test(host)) return "Google";
    if (/bing\./.test(host)) return "Bing";
    if (/instagram\./.test(host)) return "Instagram";
    if (/facebook\./.test(host)) return "Facebook";
    if (/(youtube|youtu\.be)/.test(host)) return "YouTube";
    if (/(t\.co|twitter|x\.com)/.test(host)) return "X / Twitter";
    if (/whatsapp/.test(host)) return "WhatsApp";
    if (/telegram|t\.me/.test(host)) return "Telegram";
    if (/reddit/.test(host)) return "Reddit";
    if (/quora/.test(host)) return "Quora";
    return host;
  } catch {
    return "Direct / unknown";
  }
}

function classifyDevice(agent: string): string {
  if (/iPad|Tablet/i.test(agent)) return "Tablet";
  if (/Mobile|Android|iPhone/i.test(agent)) return "Mobile";
  return "Desktop";
}

function classifyBrowser(agent: string): string {
  if (/Instagram/i.test(agent)) return "Instagram in-app";
  if (/FBAN|FBAV/i.test(agent)) return "Facebook in-app";
  if (/EdgA?\//.test(agent)) return "Edge";
  if (/OPR\/|Opera/.test(agent)) return "Opera";
  if (/SamsungBrowser/.test(agent)) return "Samsung Internet";
  if (/MiuiBrowser/.test(agent)) return "MIUI Browser";
  if (/Firefox\//.test(agent)) return "Firefox";
  if (/Chrome\//.test(agent)) return "Chrome";
  if (/Safari\//.test(agent)) return "Safari";
  return "Other";
}

const topN = <T extends string>(counts: Map<T, Set<string>>, n: number) =>
  [...counts.entries()]
    .map(([k, v]) => [k, v.size] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);

/**
 * Which log files to read, newest first, stopping once `days` are covered.
 *
 * Bounded on purpose. The rotated archive goes back weeks and a full parse of
 * everything would be tens of megabytes on a request that a person is waiting
 * on; the panel asks for a window and gets exactly the files that can serve it.
 */
async function logFiles(days: number): Promise<string[]> {
  if (!existsSync(LOG_DIR)) return [];
  let names: string[];
  try {
    names = await readdir(LOG_DIR);
  } catch {
    return [];
  }
  const cutoff = Date.now() - (days + 1) * 86_400_000;
  return names
    .filter((n) => n.startsWith("access.log"))
    .map((n) => path.join(LOG_DIR, n))
    .filter((p) => {
      try {
        return statSync(p).mtimeMs >= cutoff;
      } catch {
        return false;
      }
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

/**
 * Parse the logs into one summary.
 *
 * Streamed line by line rather than read into memory: the live log alone runs
 * to tens of megabytes during a campaign, and `readFile` on it would spike the
 * server's heap by that much while somebody is waiting for a dashboard.
 */
export async function summarise(days = 14): Promise<TrafficSummary> {
  const started = Date.now();
  const files = await logFiles(days);
  const since = Date.now() - days * 86_400_000;

  const visitorDays = new Map<string, Set<string>>();
  const sources = new Map<string, Set<string>>();
  const landing = new Map<string, Set<string>>();
  const devices = new Map<string, Set<string>>();
  const browsers = new Map<string, Set<string>>();
  const byHour = new Array<number>(24).fill(0);
  const errors = new Map<string, number>();

  /** Which funnel steps each address reached. */
  const steps = new Map<string, Set<string>>();
  /**
   * Distinct PATHS per visitor, not request count.
   *
   * Counting requests would call almost nobody a bounce: a single visitor
   * generates several log lines for one page even with RSC excluded. Bounce
   * means "saw one page and left", so the unit has to be pages.
   */
  const pagesPerVisitor = new Map<string, Set<string>>();
  const firstSeen = new Map<string, number>();
  const allVisitors = new Set<string>();

  let requests = 0;
  let humanPageViews = 0;
  let botRequests = 0;
  /** Requests answered by nginx's default server, i.e. aimed at the bare IP. */
  let foreignHostRequests = 0;
  let bytes = 0;
  let from = "";
  let to = "";

  for (const file of files) {
    try {
      bytes += statSync(file).size;
    } catch {
      continue;
    }
    const stream = file.endsWith(".gz")
      ? createReadStream(file).pipe(createGunzip())
      : createReadStream(file);
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    try {
      for await (const line of rl) {
        requests += 1;
        const m = LINE.exec(line);
        if (!m) continue;

        const [, ip, rawTime, , rawPath, statusStr, , referer, agent] = m;
        const at = parseTime(rawTime);
        if (!at || at.getTime() < since) continue;

        const status = Number(statusStr);
        const query = rawPath.includes("?") ? rawPath.slice(rawPath.indexOf("?")) : "";
        const reqPath = rawPath.split("?")[0];

        /**
         * Drop React Server Component fetches.
         *
         * Next prefetches every `<Link>` in view, and each prefetch is a
         * `?_rsc=` request that looks exactly like a page view in the log. The
         * landing page has five links to `/` and six to the policy pages, so
         * counting these would report a hundred-odd people "reaching home" when
         * a handful actually pressed anything — the funnel would be wrong by
         * more than an order of magnitude, in the flattering direction.
         *
         * They cannot be salvaged: the only header distinguishing a prefetch
         * from a real client-side navigation is `next-router-prefetch`, and the
         * combined log format does not record it. So RSC traffic is excluded
         * entirely and in-app navigation is simply not measurable from logs —
         * which is what the client-side counters are for.
         */
        if (query.includes("_rsc=")) continue;

        if (BOT.test(agent)) {
          botRequests += 1;
          continue;
        }

        if (status >= 400) {
          /**
           * A 4xx on a route the app definitely serves did not come from the
           * app.
           *
           * `/` is a real page; the app never 404s it. What produces `404 /`
           * — 531 times in one fortnight — is a scanner connecting to the bare
           * IP with a Host header that matches no server block, so nginx's
           * default server answers before the request reaches Next at all.
           * Reporting those as broken pages would send somebody hunting a
           * fault on their own home page.
           *
           * 5xx is always kept: the app genuinely produced it.
           */
          const appServesThisPath = SERVED_EXACTLY.has(reqPath);
          if (status < 500 && appServesThisPath) {
            foreignHostRequests += 1;
            continue;
          }
          if (REAL_PAGE.test(reqPath) && !PROBE.test(reqPath)) {
            const key = `${status} ${reqPath}`;
            errors.set(key, (errors.get(key) ?? 0) + 1);
          }
          continue;
        }

        if (ASSET.test(reqPath) || PROBE.test(reqPath) || !REAL_PAGE.test(reqPath)) continue;

        humanPageViews += 1;
        allVisitors.add(ip);

        const day = istDay(at);
        if (!from || day < from) from = day;
        if (!to || day > to) to = day;

        let set = visitorDays.get(day);
        if (!set) visitorDays.set(day, (set = new Set()));
        set.add(ip);

        byHour[istHour(at)] += 1;
        let paths = pagesPerVisitor.get(ip);
        if (!paths) pagesPerVisitor.set(ip, (paths = new Set()));
        paths.add(reqPath);

        const add = (map: Map<string, Set<string>>, key: string) => {
          let s = map.get(key);
          if (!s) map.set(key, (s = new Set()));
          s.add(ip);
        };

        add(sources, classifySource(referer, agent));
        add(devices, classifyDevice(agent));
        add(browsers, classifyBrowser(agent));

        // The earliest page each address requested is its landing page. Files
        // are read newest-first, so "earliest" has to be decided by timestamp
        // rather than by arrival order.
        const seen = firstSeen.get(ip);
        if (seen === undefined || at.getTime() < seen) {
          firstSeen.set(ip, at.getTime());
          for (const [, s] of landing) s.delete(ip);
          add(landing, reqPath);
        }

        let reached = steps.get(ip);
        if (!reached) steps.set(ip, (reached = new Set()));
        if (reqPath === "/landing") reached.add("landing");
        if (reqPath === "/") reached.add("home");
        if (reqPath.startsWith("/test")) reached.add("test");
        if (reqPath.startsWith("/results")) reached.add("results");
        if (reqPath.startsWith("/pricing")) reached.add("pricing");
      }
    } catch {
      // A truncated or unreadable rotation is one file's worth of history
      // missing, not a reason to fail the whole dashboard.
    } finally {
      rl.close();
      stream.destroy?.();
    }
  }

  const reachedCount = (step: string) =>
    [...steps.values()].filter((s) => s.has(step)).length;

  return {
    visitorsByDay: Object.fromEntries(
      [...visitorDays.entries()].sort().map(([d, s]) => [d, s.size]),
    ),
    sources: topN(sources, 12).map(([source, visitors]) => ({ source, visitors })),
    landingPages: topN(landing, 10).map(([p, visitors]) => ({ path: p, visitors })),
    byHour,
    devices: topN(devices, 5).map(([device, visitors]) => ({ device, visitors })),
    browsers: topN(browsers, 8).map(([browser, visitors]) => ({ browser, visitors })),
    /**
     * Hard navigations only. In-app clicks move between these pages without a
     * request, so a step reading zero means "nobody loaded this page fresh",
     * NOT "nobody got here". The client counters are the authority on
     * navigation; this is the authority on arrival.
     */
    funnel: [
      { step: "Loaded /landing", visitors: reachedCount("landing") },
      { step: "Loaded / (home)", visitors: reachedCount("home") },
      { step: "Loaded /test", visitors: reachedCount("test") },
      { step: "Loaded /results", visitors: reachedCount("results") },
      { step: "Loaded /pricing", visitors: reachedCount("pricing") },
    ],
    errors: [...errors.entries()]
      .map(([k, count]) => {
        const sp = k.indexOf(" ");
        return { status: Number(k.slice(0, sp)), path: k.slice(sp + 1), count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    totals: {
      requests,
      humanPageViews,
      visitors: allVisitors.size,
      botRequests,
      bounced: [...pagesPerVisitor.values()].filter((p) => p.size === 1).length,
      foreignHostRequests,
    },
    meta: { files: files.length, bytes, parsedMs: Date.now() - started, from, to },
  };
}

/**
 * Cached summary.
 *
 * Parsing tens of megabytes takes seconds, and the dashboard polls every
 * fifteen. Without this the box would spend most of its time re-reading logs
 * for one viewer. Held in the module rather than in Redis because it is derived
 * data that any process can rebuild, and stale-while-revalidate is not worth
 * the complexity for a single reader.
 */
let cache: { at: number; days: number; value: TrafficSummary } | null = null;
const CACHE_MS = 5 * 60_000;

export async function trafficSummary(days = 14): Promise<TrafficSummary> {
  if (cache && cache.days === days && Date.now() - cache.at < CACHE_MS) {
    return cache.value;
  }
  const value = await summarise(days);
  cache = { at: Date.now(), days, value };
  return value;
}
