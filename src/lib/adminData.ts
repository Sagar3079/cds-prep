import "server-only";
import { kv, kvConfigured } from "./kv";
import { accountKey, type Account } from "./account";
import { activePlan } from "./entitlement";
import { series, recentDays, type Metric } from "./analytics";
import { recentAttempts, attemptsFor } from "./attempts";
import { looksGenerated } from "./username";

/**
 * Everything the admin panel reads.
 *
 * The hard constraint shaping this file is that Upstash gives us `SCAN` and
 * nothing better: there are no secondary indexes, so "accounts created today"
 * and "revenue this month" are both full walks of their key family. That is
 * survivable for payments, which number in the hundreds, and is not survivable
 * for accounts once every visitor has one. Hence the split:
 *
 * - **Counters** (`lib/analytics.ts`) answer anything with a time axis. They
 *   are written at event time and read in one round trip.
 * - **Walks** answer "who exactly", are paged, bounded, and always report
 *   whether they finished.
 *
 * Every walk here returns `complete`. A dashboard that renders a truncated
 * count as if it were the total is worse than one that admits it stopped —
 * `/api/stats` already has this bug, silently capping at twenty pages, and it
 * is not a pattern to copy.
 */

/** Ceiling on a single walk. Roughly a second of round trips. */
const MAX_PAGES = 40;
const PAGE = 500;

export interface Walk<T> {
  items: T[];
  /** False when the walk hit its page ceiling with the cursor still open. */
  complete: boolean;
  scanned: number;
}

async function walkKeys(match: string, maxPages = MAX_PAGES): Promise<Walk<string>> {
  const keys: string[] = [];
  let cursor = "0";
  let pages = 0;
  do {
    const [next, batch] = await kv.scan(cursor, match, PAGE);
    keys.push(...batch);
    cursor = next;
    pages += 1;
  } while (cursor !== "0" && pages < maxPages);
  return { items: keys, complete: cursor === "0", scanned: keys.length };
}

/* ------------------------------------------------------------------ accounts */

export interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
  anonymous: boolean;
  generatedName: boolean;
  createdAt: number;
  plan: { planId: string; until: number } | null;
}

/**
 * Read account records in bulk.
 *
 * `MGET` rather than a loop of `GET`: a page of five hundred read one at a time
 * is five hundred sequential HTTPS calls at up to six seconds each, which is
 * not a page load. Chunked because a single MGET of thousands of keys makes an
 * unreasonably large request.
 */
async function readAccounts(keys: string[]): Promise<Account[]> {
  const out: Account[] = [];
  for (let i = 0; i < keys.length; i += 200) {
    const raw = await kv.mget(keys.slice(i, i + 200));
    for (const r of raw) {
      if (!r) continue;
      try {
        out.push(JSON.parse(r) as Account);
      } catch {
        // A record that will not parse is one row missing from a table, not a
        // reason to fail the request that was asked for the other four hundred.
      }
    }
  }
  return out;
}

export async function listUsers(opts: {
  limit?: number;
  withPlans?: boolean;
} = {}): Promise<Walk<AdminUser> & { anonymous: number; bound: number }> {
  const limit = opts.limit ?? 500;
  const walk = await walkKeys("acct:*");
  const accounts = await readAccounts(walk.items);

  // Newest first — the question a dashboard is nearly always asking.
  accounts.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const page = accounts.slice(0, limit);

  const users: AdminUser[] = await Promise.all(
    page.map(async (a) => {
      const plan = opts.withPlans === false ? null : await activePlan(a.id);
      return {
        id: a.id,
        name: a.username?.trim() || (a.email ? a.email.split("@")[0] : "Cadet"),
        email: a.email ?? null,
        emailVerified: Boolean(a.emailVerified),
        anonymous: Boolean(a.anonymous),
        generatedName: looksGenerated(a.username),
        createdAt: a.createdAt ?? 0,
        plan: plan ? { planId: plan.planId, until: plan.until } : null,
      };
    }),
  );

  return {
    items: users,
    complete: walk.complete,
    scanned: accounts.length,
    anonymous: accounts.filter((a) => !a.email).length,
    bound: accounts.filter((a) => Boolean(a.email)).length,
  };
}

/* ------------------------------------------------------------------ payments */

export interface AdminPayment {
  orderId: string;
  paymentId: string | null;
  planId: string | null;
  paise: number;
  accountId: string | null;
  paidAt: number;
  via: string | null;
  /** True when the payment landed with no account to attach it to. */
  orphaned: boolean;
  /** True when an account is named but holds no live plan for it. */
  ungranted: boolean;
}

/**
 * Every payment ever taken, newest first.
 *
 * `rzp:paid:*` is permanent and keyed by order id with no by-account index, so
 * this is the only way to answer any revenue question — and the only way to
 * find the failure this panel exists to surface: money received against an
 * account that never got a plan. That has happened once already in production.
 *
 * READ ONLY. `rzp:paid:<orderId>` is not merely a record: its NX write is the
 * entire guard against `verify` and the webhook both granting for one payment.
 * Deleting or pre-creating one causes a real customer to silently never receive
 * what they paid for, so nothing in the admin surface may write to this family.
 */
export async function listPayments(limit = 500): Promise<Walk<AdminPayment> & {
  totalPaise: number;
  paidCount: number;
  orders: number;
  abandoned: number;
}> {
  const walk = await walkKeys("rzp:paid:*");
  const raws = await kv.mget(walk.items);

  const rows: AdminPayment[] = [];
  for (const r of raws) {
    if (!r) continue;
    try {
      const p = JSON.parse(r) as {
        orderId: string;
        paymentId?: string;
        planId?: string;
        paise?: number;
        accountId?: string | null;
        paidAt?: number;
        via?: string;
      };
      rows.push({
        orderId: p.orderId,
        paymentId: p.paymentId ?? null,
        planId: p.planId ?? null,
        paise: typeof p.paise === "number" ? p.paise : 0,
        accountId: p.accountId ?? null,
        paidAt: p.paidAt ?? 0,
        via: p.via ?? null,
        orphaned: !p.accountId,
        ungranted: false,
      });
    } catch {
      // Skip; see readAccounts.
    }
  }

  rows.sort((a, b) => b.paidAt - a.paidAt);

  /**
   * Flag payments whose account holds no live plan. An expired plan reads the
   * same as one never granted, so this is a prompt to look rather than proof of
   * a fault — but the one real orphan in this store had no account at all, and
   * that case is unambiguous.
   */
  for (const row of rows.slice(0, limit)) {
    if (!row.accountId) continue;
    const plan = await activePlan(row.accountId);
    row.ungranted = !plan;
  }

  const orderWalk = await walkKeys("rzp:order:*");

  return {
    items: rows.slice(0, limit),
    complete: walk.complete,
    scanned: rows.length,
    totalPaise: rows.reduce((n, r) => n + r.paise, 0),
    paidCount: rows.length,
    orders: orderWalk.items.length,
    // An order with no matching payment was started and not finished. Order
    // keys live seven days, so this is a one-week window, not all time.
    abandoned: Math.max(0, orderWalk.items.length - rows.length),
  };
}

/* ----------------------------------------------------------------- overview */

const TRACKED: Metric[] = [
  "visit",
  "acct:new",
  "test:start:daily",
  "test:start:random",
  "test:done:daily",
  "test:done:random",
  "pay:order",
  "pay:ok",
  "pay:fail",
  "bind:ok",
  "restore:ok",
];

export interface Overview {
  configured: boolean;
  days: string[];
  metrics: Record<string, Record<string, number>>;
  averages: { english: Record<string, number>; gk: Record<string, number> };
  totals: {
    accounts: number;
    anonymous: number;
    bound: number;
    accountsComplete: boolean;
    payments: number;
    revenuePaise: number;
    abandonedOrders: number;
    orphanedPayments: number;
    ungrantedPayments: number;
  };
  recent: Awaited<ReturnType<typeof recentAttempts>>;
  payments: AdminPayment[];
}

/** Mean score per day per subject, reconstructed from the sum/count counters. */
async function averageSeries(subject: "english" | "gk", days: number) {
  const sums = await series(`score:sum:${subject}`, days);
  const counts = await series(`score:n:${subject}`, days);
  const out: Record<string, number> = {};
  for (const day of Object.keys(sums)) {
    const n = counts[day] ?? 0;
    // Sums are stored as hundredths so a negative-marked score stays an integer.
    out[day] = n > 0 ? sums[day] / 100 / n : 0;
  }
  return out;
}

export async function overview(days = 30): Promise<Overview> {
  if (!kvConfigured) {
    return {
      configured: false,
      days: [],
      metrics: {},
      averages: { english: {}, gk: {} },
      totals: {
        accounts: 0,
        anonymous: 0,
        bound: 0,
        accountsComplete: false,
        payments: 0,
        revenuePaise: 0,
        abandonedOrders: 0,
        orphanedPayments: 0,
        ungrantedPayments: 0,
      },
      recent: [],
      payments: [],
    };
  }

  const metrics: Record<string, Record<string, number>> = {};
  for (const m of TRACKED) metrics[m] = await series(m, days);

  const [users, payments, recent, english, gk] = await Promise.all([
    listUsers({ limit: 1, withPlans: false }),
    listPayments(200),
    recentAttempts(40),
    averageSeries("english", days),
    averageSeries("gk", days),
  ]);

  return {
    configured: true,
    days: recentDays(days),
    metrics,
    averages: { english, gk },
    totals: {
      accounts: users.scanned,
      anonymous: users.anonymous,
      bound: users.bound,
      accountsComplete: users.complete,
      payments: payments.paidCount,
      revenuePaise: payments.totalPaise,
      abandonedOrders: payments.abandoned,
      orphanedPayments: payments.items.filter((p) => p.orphaned).length,
      ungrantedPayments: payments.items.filter((p) => p.ungranted).length,
    },
    recent,
    payments: payments.items.slice(0, 50),
  };
}

export { attemptsFor };
