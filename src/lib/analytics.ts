import "server-only";
import { kv } from "./kv";
import { istDayKey } from "./entitlement";

/**
 * Event counters, so the admin panel can answer "how many this week".
 *
 * Nothing in this app has ever recorded anything with a time axis. Accounts and
 * payments are permanent and can be walked; everything else — board rows, the
 * `done:` claims, free-random usage, client errors — lives two or three days and
 * is gone. A dashboard built only on what exists today could report totals and
 * nothing else, and no amount of later work can recover a week that was never
 * written down. Hence counters at event time, cheap and lossy by design:
 * `INCR` on one key per metric per IST day.
 *
 * Deliberately NOT per-account. A per-account time series is a second copy of
 * the account table growing daily, and the questions the panel actually asks —
 * how many tests yesterday, how many payments this week — are answered by a
 * scalar. Anything needing per-account granularity reads the account records.
 */

/**
 * 400 days.
 *
 * Long enough to compare a month against the same month last year, short enough
 * that the family is bounded: one key per metric per day, so a dozen metrics is
 * under five thousand keys standing at any time, forever.
 */
const STAT_TTL_SEC = 400 * 86400;

export type Metric =
  | "visit"
  | "acct:new"
  | "test:start:daily"
  | "test:start:random"
  | "test:done:daily"
  | "test:done:random"
  | "pay:order"
  | "pay:ok"
  | "pay:fail"
  | "bind:ok"
  | "restore:ok";

export const statKey = (metric: Metric | string, day: string) => `stat:${metric}:${day}`;

/**
 * Count one event.
 *
 * Never awaited by callers on a user-facing path, and never allowed to throw:
 * a counter that takes down a test submission is worse than a gap in a chart.
 * `kv` already swallows its own failures, so the only job here is to arm the
 * TTL exactly once — on the call that created the key, which is the one that
 * gets 1 back.
 */
export async function bump(metric: Metric, by = 1): Promise<void> {
  const key = statKey(metric, istDayKey());
  const n = by === 1 ? await kv.incr(key) : await kv.incrBy(key, by);
  if (n === by) void kv.expire(key, STAT_TTL_SEC);
}

/** Fire-and-forget wrapper for hot paths that must not wait on a counter. */
export function bumpAsync(metric: Metric, by = 1): void {
  void bump(metric, by).catch(() => {});
}

/** The last `days` IST day keys, oldest first. */
export function recentDays(days: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i -= 1) out.push(istDayKey(now - i * 86400_000));
  return out;
}

/**
 * Read a metric across a window, one round trip.
 *
 * Missing days are zero rather than null: a day on which nothing happened is a
 * real zero, and a chart that distinguishes "no events" from "no key" is
 * showing the reader an implementation detail.
 */
export async function series(metric: Metric | string, days: number): Promise<Record<string, number>> {
  const window = recentDays(days);
  const values = await kv.mget(window.map((d) => statKey(metric, d)));
  const out: Record<string, number> = {};
  window.forEach((day, i) => {
    const raw = values[i];
    const n = raw == null ? 0 : Number(raw);
    out[day] = Number.isFinite(n) ? n : 0;
  });
  return out;
}
