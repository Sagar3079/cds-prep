import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, statSync, statfsSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { kv } from "./kv";
import { statKey, type Metric } from "./analytics";
import { istDayKey } from "./entitlement";

const run = promisify(execFile);
const ROOT = process.cwd();

/**
 * Whether the dashboard's own numbers can be believed.
 *
 * This exists because of a specific failure: the panel showed "0 tests in 30
 * days" for a metric nothing had ever written, and there was no way to tell
 * that apart from "nobody took a test". Those demand opposite responses — fix
 * the funnel, or fix the code — and a dashboard that cannot distinguish them
 * sends you to work on the wrong one.
 *
 * So every metric declares whether a writer exists in the running build and
 * whether the family has ever been written. A zero next to "no writer" is a
 * bug report; a zero next to "measured, last write 2 hours ago" is a fact about
 * the business.
 */

export type Trust = "measured" | "reconstructed" | "derived" | "no-writer";

export interface MetricHealth {
  metric: string;
  /** Where the number comes from, in words a human can check. */
  source: string;
  trust: Trust;
  /** Has this family ever been written? */
  everWritten: boolean;
  /** Most recent IST day with a non-zero value, if any. */
  lastDay: string | null;
  total30d: number;
}

/**
 * The provenance of every number the panel shows.
 *
 * Hand-maintained, and that is the point: it is a claim about the code that a
 * person has to update when the code changes, rather than something inferred at
 * runtime and therefore capable of being confidently wrong. `derived` means
 * computed from permanent records and correct for all history; `measured` means
 * a counter that only knows about days since it shipped.
 */
const PROVENANCE: Record<string, { source: string; trust: Trust }> = {
  visit: {
    source: "beacon, once per tab · days to 10 Aug rebuilt from nginx logs",
    trust: "reconstructed",
  },
  "acct:new": { source: "derived from every acct:* record's createdAt", trust: "derived" },
  "pay:ok": { source: "derived from every rzp:paid:* record's paidAt", trust: "derived" },
  "test:start:daily": { source: "browser, when a daily test begins", trust: "measured" },
  "test:start:random": { source: "browser, when a random test begins", trust: "measured" },
  /**
   * "measured" here means "the app counted a real POST" — it does NOT mean
   * server-verified. /api/attempt bounds-checks shape (the counts must add
   * up) for both modes but re-derives nothing: it never confirms a "daily"
   * submission actually corresponds to that day's real question set the way
   * /api/submit does for the leaderboard. A caller holding any session cookie
   * can self-report fabricated results here, daily included. Calling this
   * "measured" without saying so would be the same mistake this file exists
   * to catch elsewhere — a trust label that oversells what happened.
   */
  "test:done:daily": {
    source: "self-reported via POST /api/attempt — shape-checked, not verified against the answer key",
    trust: "measured",
  },
  "test:done:random": {
    source: "self-reported via POST /api/attempt — no server-side answer key exists for a random set",
    trust: "measured",
  },
  "pay:order": { source: "server, when a Razorpay order is created", trust: "measured" },
  "pay:fail": { source: "browser, when Razorpay reports a decline", trust: "measured" },
  "bind:ok": { source: "server, when an email is attached", trust: "measured" },
  "restore:ok": { source: "server, when a purchase is restored", trust: "measured" },
};

/**
 * Does a writer for this metric exist in the source tree?
 *
 * Read from disk rather than hardcoded, so it cannot drift from reality the way
 * a hand-maintained list would. It answers "does the code write this", which is
 * a different question from "has it ever run" — a metric can have a writer and
 * still be all zeros because the build serving traffic predates it, which is
 * exactly the state this panel was built to expose.
 */
const WRITER_FILES = [
  "src/lib/attempts.ts",
  "src/lib/analytics.ts",
  "src/app/api/beacon/route.ts",
  "src/app/api/session/anon/route.ts",
  "src/app/api/attempt/route.ts",
  "src/app/api/payments/order/route.ts",
  "src/app/api/payments/verify/route.ts",
  "src/app/api/payments/webhook/route.ts",
  "src/app/api/account/bind/confirm/route.ts",
  "src/components/TestClient.tsx",
  "src/components/CheckoutButton.tsx",
  "src/components/VisitBeacon.tsx",
  "src/lib/clientSession.ts",
];

function writerExists(metric: string): boolean {
  for (const rel of WRITER_FILES) {
    try {
      const body = readFileSync(path.join(ROOT, rel), "utf8");
      // The metric name appearing as a string literal anywhere other than its
      // own declaration in analytics.ts counts as a writer.
      if (rel.endsWith("analytics.ts")) continue;
      if (body.includes(`"${metric}"`)) return true;
    } catch {
      // A file that cannot be read tells us nothing either way.
    }
  }
  return false;
}

/**
 * @param derived Totals for metrics the dashboard computes from stored records
 *   rather than from counters. Without these, a row would say "from records"
 *   and then report the counter's zero beside it — the table would contradict
 *   the very numbers it exists to vouch for.
 */
export async function metricHealth(
  days = 30,
  derived: Record<string, { total: number; lastDay: string | null }> = {},
): Promise<MetricHealth[]> {
  const window: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i -= 1) window.push(istDayKey(now - i * 86_400_000));

  const out: MetricHealth[] = [];
  for (const metric of Object.keys(PROVENANCE)) {
    const values = await kv.mget(window.map((d) => statKey(metric as Metric, d)));
    let total = 0;
    let lastDay: string | null = null;
    values.forEach((raw, i) => {
      const n = raw == null ? 0 : Number(raw);
      if (Number.isFinite(n) && n > 0) {
        total += n;
        lastDay = window[i];
      }
    });
    const p = PROVENANCE[metric];
    const override = derived[metric];
    const resolvedTotal = override ? override.total : total;
    const resolvedLast = override ? override.lastDay : lastDay;
    out.push({
      metric,
      source: p.source,
      // A declared writer that does not exist in the tree is the loudest
      // possible signal, and overrides whatever the map claims. Derived
      // metrics are exempt: they have no writer by design, because they are
      // computed from records at read time.
      trust: p.trust === "derived" || writerExists(metric) ? p.trust : "no-writer",
      everWritten: resolvedTotal > 0,
      lastDay: resolvedLast,
      total30d: resolvedTotal,
    });
  }
  return out;
}

export interface DeployInfo {
  liveSlot: string | null;
  liveCommit: string | null;
  head: string | null;
  headSubject: string | null;
  /** True when the running build is not what the checkout is at. */
  drifted: boolean;
  dirtyFiles: number;
  unpushed: number;
  buildAgeMs: number | null;
  uptimeSec: number | null;
  rssMb: number | null;
  upstreamPort: string | null;
}

const readOr = (p: string): string | null => {
  try {
    return readFileSync(p, "utf8").trim();
  } catch {
    return null;
  }
};

const git = async (args: string[]): Promise<string | null> => {
  try {
    const { stdout } = await run("git", ["-C", ROOT, ...args], { timeout: 5000 });
    return stdout.trim();
  } catch {
    return null;
  }
};

/**
 * What is actually running, versus what the repo says.
 *
 * The distinction has already caused real confusion here: instrumentation was
 * written, typechecked and committed while the process serving traffic was
 * built from an older commit — so metrics that had perfectly good writers
 * reported zero, and the zero looked like a fact about users.
 */
export async function deployInfo(): Promise<DeployInfo> {
  const liveSlot = readOr(path.join(ROOT, ".deploy-slot"));
  const liveCommit = readOr(path.join(ROOT, ".deploy-slot.commit"));
  const head = await git(["rev-parse", "HEAD"]);
  const headSubject = await git(["log", "-1", "--format=%s"]);
  const status = await git(["status", "--porcelain"]);
  const ahead = await git(["rev-list", "--count", "origin/main..HEAD"]);

  let buildAgeMs: number | null = null;
  if (liveSlot) {
    try {
      buildAgeMs = Date.now() - statSync(path.join(ROOT, `.next-${liveSlot}`)).mtimeMs;
    } catch {
      buildAgeMs = null;
    }
  }

  let upstreamPort: string | null = null;
  try {
    const conf = readFileSync("/etc/nginx/conf.d/cds-prep-upstream.conf", "utf8");
    upstreamPort = /^\s*server\s+127\.0\.0\.1:(\d+);/m.exec(conf)?.[1] ?? null;
  } catch {
    upstreamPort = null;
  }

  return {
    liveSlot,
    liveCommit,
    head,
    headSubject,
    drifted: Boolean(liveCommit && head && liveCommit !== head),
    dirtyFiles: status ? status.split("\n").filter(Boolean).length : 0,
    unpushed: ahead ? Number(ahead) || 0 : 0,
    buildAgeMs,
    uptimeSec: Math.round(process.uptime()),
    rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    upstreamPort,
  };
}

export interface HostInfo {
  tlsDaysLeft: number | null;
  tlsExpires: string | null;
  diskFreeGb: number | null;
  diskTotalGb: number | null;
  memFreeMb: number | null;
  memTotalMb: number | null;
  load1: number;
  cores: number;
  storeKeys: number | null;
  storeMemoryMb: number | null;
}

/**
 * The box, and the store.
 *
 * Read directly rather than by shelling out. `certbot certificates` would give
 * the same answer but takes seconds and writes to its own log — a panel that is
 * only ever read must not have side effects, and one that polls must not be
 * slow.
 */
export async function hostInfo(): Promise<HostInfo> {
  let tlsDaysLeft: number | null = null;
  let tlsExpires: string | null = null;
  try {
    const cert = new X509Certificate(
      readFileSync("/etc/letsencrypt/live/prepcadet.in/cert.pem"),
    );
    const to = new Date(cert.validTo);
    tlsExpires = to.toISOString().slice(0, 10);
    tlsDaysLeft = Math.floor((to.getTime() - Date.now()) / 86_400_000);
  } catch {
    // No cert readable — local development, or a permissions change.
  }

  let diskFreeGb: number | null = null;
  let diskTotalGb: number | null = null;
  try {
    const fs = statfsSync("/");
    diskFreeGb = Math.round((fs.bavail * fs.bsize) / 1e9);
    diskTotalGb = Math.round((fs.blocks * fs.bsize) / 1e9);
  } catch {
    // Not fatal.
  }

  let storeKeys: number | null = null;
  let storeMemoryMb: number | null = null;
  try {
    const info = await kv.info();
    if (info) {
      const keys = /db0:keys=(\d+)/.exec(info)?.[1];
      const mem = /used_memory:(\d+)/.exec(info)?.[1];
      storeKeys = keys ? Number(keys) : null;
      storeMemoryMb = mem ? Math.round((Number(mem) / 1e6) * 100) / 100 : null;
    }
  } catch {
    // The store being unreachable is itself reported elsewhere.
  }

  return {
    tlsDaysLeft,
    tlsExpires,
    diskFreeGb,
    diskTotalGb,
    memFreeMb: Math.round(os.freemem() / 1e6),
    memTotalMb: Math.round(os.totalmem() / 1e6),
    load1: Math.round(os.loadavg()[0] * 100) / 100,
    cores: os.cpus().length,
    storeKeys,
    storeMemoryMb,
  };
}

export interface ClientError {
  key: string;
  message: string;
  route: string;
  stack?: string;
  ts: number;
  /** The deploy smoke test writes one of these; it is not a real fault. */
  synthetic: boolean;
}

/** Client-side crashes reported by the error boundaries. Three-day TTL. */
export async function clientErrors(limit = 30): Promise<ClientError[]> {
  const keys: string[] = [];
  let cursor = "0";
  let pages = 0;
  do {
    const [next, batch] = await kv.scan(cursor, "errlog:*", 500);
    keys.push(...batch);
    cursor = next;
    pages += 1;
  } while (cursor !== "0" && pages < 10);

  if (keys.length === 0) return [];
  const raws = await kv.mget(keys.slice(0, limit));

  const out: ClientError[] = [];
  raws.forEach((raw, i) => {
    if (!raw) return;
    try {
      const e = JSON.parse(raw) as {
        message?: string;
        route?: string;
        stack?: string;
        ts?: number;
      };
      const message = e.message ?? "(no message)";
      out.push({
        key: keys[i],
        message,
        route: e.route ?? "(unknown route)",
        stack: e.stack,
        ts: e.ts ?? 0,
        // Flagged rather than hidden: a panel that reads "1 error" forever gets
        // ignored, and then a real error goes unnoticed behind it.
        synthetic: message === "deploy smoke test" || e.route === "/deploy-check",
      });
    } catch {
      // Unparseable record, skip.
    }
  });
  return out.sort((a, b) => b.ts - a.ts);
}
