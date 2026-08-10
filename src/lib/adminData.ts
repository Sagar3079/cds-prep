import "server-only";
import { kv, kvConfigured } from "./kv";
import { accountKey, type Account } from "./account";
import { activePlan, istDayKey } from "./entitlement";
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
} = {}): Promise<
  Walk<AdminUser> & { anonymous: number; bound: number; createdAts: number[] }
> {
  const limit = opts.limit ?? 500;
  const walk = await walkKeys("acct:*");
  const accounts = await readAccounts(walk.items);

  // Newest first — the question a dashboard is nearly always asking.
  accounts.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const page = accounts.slice(0, limit);

  /**
   * Plans for the page in one round trip.
   *
   * `Promise.all` over `activePlan` looked concurrent but was not: `kv` opens
   * one HTTPS request per command, so a page of five hundred users was five
   * hundred in flight at once — which is a different way to be slow, and rather
   * ruder to the store.
   */
  const planRaw =
    opts.withPlans === false
      ? page.map(() => null)
      : await kv.mget(page.map((a) => `entl:${a.id}`));

  const users: AdminUser[] = await Promise.all(
    page.map(async (a, i) => {
      let plan: { planId: string; until: number } | null = null;
      const raw = planRaw[i];
      if (raw) {
        try {
          const e = JSON.parse(raw) as { planId?: string; until?: number };
          if (typeof e.until === "number" && e.until > Date.now()) {
            plan = { planId: e.planId ?? "?", until: e.until };
          }
        } catch {
          plan = null;
        }
      }
      return {
        id: a.id,
        name: a.username?.trim() || (a.email ? a.email.split("@")[0] : "Cadet"),
        email: a.email ?? null,
        emailVerified: Boolean(a.emailVerified),
        anonymous: Boolean(a.anonymous),
        generatedName: looksGenerated(a.username),
        createdAt: a.createdAt ?? 0,
        plan,
      };
    }),
  );

  return {
    items: users,
    complete: walk.complete,
    scanned: accounts.length,
    anonymous: accounts.filter((a) => !a.email).length,
    bound: accounts.filter((a) => Boolean(a.email)).length,
    // Every account's creation time, not just this page's — the "new accounts
    // per day" chart is built from these rather than from a counter that only
    // knows about days since it shipped.
    createdAts: accounts.map((a) => a.createdAt ?? 0).filter(Boolean),
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
   * Flag payments whose account holds no live plan.
   *
   * One MGET rather than a `GET` per row. The loop this replaces made one
   * sequential round trip per payment at up to six seconds each, so a hundred
   * payments was a dashboard that timed out — a panel that gets slower the more
   * money you take is the wrong shape.
   *
   * An expired plan reads the same as one never granted, so this is a prompt to
   * look rather than proof of a fault. The unambiguous case is a payment with
   * no account at all, which `orphaned` already carries.
   */
  const page = rows.slice(0, limit);
  const withAccounts = page.filter((r) => r.accountId);
  if (withAccounts.length > 0) {
    const plans = await kv.mget(withAccounts.map((r) => `entl:${r.accountId}`));
    withAccounts.forEach((row, i) => {
      const raw = plans[i];
      if (!raw) {
        row.ungranted = true;
        return;
      }
      try {
        const until = (JSON.parse(raw) as { until?: number }).until;
        row.ungranted = !(typeof until === "number" && until > Date.now());
      } catch {
        row.ungranted = true;
      }
    });
  }

  const orderWalk = await walkKeys("rzp:order:*");

  /**
   * A real set difference, not a subtraction of two differently-scoped totals.
   *
   * This used to be `orderWalk.items.length - rows.length`: orders currently
   * ALIVE (a 7-day TTL keeps that count small) minus payments taken EVER
   * (permanent, unbounded). The moment lifetime payments exceed a week's
   * worth of new orders — which happens almost immediately for a site with
   * any history — that subtraction goes negative, `Math.max(0, …)` floors it,
   * and the figure reads zero forever regardless of how many checkouts are
   * actually being abandoned. Comparing the actual order IDs against the
   * actual paid IDs is what `openOrders()` below already does correctly;
   * this is the same technique, reusing `walk.items` (already fetched above)
   * instead of a second `rzp:paid:*` scan.
   */
  const paidIds = new Set(walk.items.map((k) => k.slice("rzp:paid:".length)));
  const abandoned = orderWalk.items.filter(
    (k) => !paidIds.has(k.slice("rzp:order:".length)),
  ).length;

  return {
    items: rows.slice(0, limit),
    complete: walk.complete,
    scanned: rows.length,
    totalPaise: rows.reduce((n, r) => n + r.paise, 0),
    paidCount: rows.length,
    orders: orderWalk.items.length,
    // Order keys carry a 7-day TTL, so this is naturally a rolling one-week
    // window rather than all time.
    abandoned,
  };
}


/* -------------------------------------------------------------- open orders */

export interface OpenOrder {
  orderId: string;
  planId: string | null;
  paise: number;
  accountId: string | null;
  createdAt: number;
  /** Seconds until the order record disappears. */
  ttlSec: number | null;
  /** Whether the account this order names still exists. */
  accountExists: boolean;
}

/**
 * Orders started and never paid.
 *
 * Invisible in the payments view by construction: that one walks `rzp:paid:*`,
 * and an order with no payment has no key there to be found under. So the
 * abandoned-checkout figure has only ever been a subtraction — orders minus
 * payments — which is a number with no rows behind it and nothing to act on.
 *
 * The check that matters is `accountExists`. An order naming an account that is
 * gone cannot be granted to anyone if it is ever paid, which is the same defect
 * as the null-account payment already sitting in this store, caught earlier.
 * Order records carry a seven-day TTL, so this evidence deletes itself.
 */
export async function openOrders(limit = 100): Promise<OpenOrder[]> {
  const orders = await walkKeys("rzp:order:*");
  if (orders.items.length === 0) return [];

  const paid = await walkKeys("rzp:paid:*");
  const paidIds = new Set(
    paid.items.map((k) => k.slice("rzp:paid:".length)),
  );

  const unpaidKeys = orders.items.filter(
    (k) => !paidIds.has(k.slice("rzp:order:".length)),
  );
  if (unpaidKeys.length === 0) return [];

  const page = unpaidKeys.slice(0, limit);
  const raws = await kv.mget(page);

  const rows: OpenOrder[] = [];
  page.forEach((key, i) => {
    const raw = raws[i];
    if (!raw) return;
    try {
      const o = JSON.parse(raw) as {
        planId?: string;
        paise?: number;
        accountId?: string | null;
        createdAt?: number;
      };
      rows.push({
        orderId: key.slice("rzp:order:".length),
        planId: o.planId ?? null,
        paise: typeof o.paise === "number" ? o.paise : 0,
        accountId: o.accountId ?? null,
        createdAt: o.createdAt ?? 0,
        ttlSec: null,
        accountExists: false,
      });
    } catch {
      // Skip; see readAccounts.
    }
  });

  // One MGET for the accounts, one TTL per row. TTL has no batch form, so this
  // is capped at the page rather than run over the whole family.
  const named = rows.filter((r) => r.accountId);
  if (named.length > 0) {
    const accts = await kv.mget(named.map((r) => accountKey(r.accountId!)));
    named.forEach((r, i) => {
      r.accountExists = accts[i] != null;
    });
  }
  await Promise.all(
    rows.slice(0, 40).map(async (r) => {
      r.ttlSec = await kv.ttl(`rzp:order:${r.orderId}`);
    }),
  );

  return rows.sort((a, b) => b.createdAt - a.createdAt);
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
/**
 * Bucket timestamps into a day series.
 *
 * The counters in `lib/analytics.ts` only know about events since they shipped,
 * which is correct for things nothing recorded before — tests finished, visits.
 * It is NOT correct for accounts and payments: both are permanent records
 * carrying their own timestamp, so their history is sitting right there and
 * reading it from a counter reports zero for days that demonstrably had events.
 * That is what this fixes. Derived at read time, so it is right for every day
 * the records cover rather than only for days after a deploy.
 */
function bucketByDay(timestamps: number[], days: number): Record<string, number> {
  const window = recentDays(days);
  const out: Record<string, number> = {};
  for (const d of window) out[d] = 0;
  for (const ts of timestamps) {
    if (!ts) continue;
    const day = istDayKey(ts);
    if (day in out) out[day] += 1;
  }
  return out;
}

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

  /**
   * Replace two counter series with the truth.
   *
   * Accounts and payments are permanent records with their own timestamps, so
   * their day-by-day history is fully recoverable and does not depend on when
   * instrumentation shipped. Reporting them from counters showed 0 new accounts
   * over thirty days while ten accounts created inside that window sat in the
   * store — a chart that is not merely incomplete but wrong.
   *
   * Everything else genuinely cannot be recovered: nothing anywhere recorded a
   * finished test or a page view before the counters existed.
   */
  metrics["acct:new"] = bucketByDay(users.createdAts, days);
  metrics["pay:ok"] = bucketByDay(
    payments.items.map((p) => p.paidAt),
    days,
  );

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
