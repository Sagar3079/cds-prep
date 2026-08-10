import "server-only";
import { kv } from "./kv";
import { ANON_TTL_SEC } from "./account";
import { istDayKey } from "./entitlement";
import { bumpAsync, statKey } from "./analytics";
import type { Subject } from "@/types";

/**
 * Server-side record of finished tests.
 *
 * Attempts have always lived in `localStorage` (`lib/storage.ts`), which means
 * they die with the browser, cannot be compared between people, and are
 * invisible from the outside — there was no way to answer "how many tests were
 * taken yesterday" because nothing wrote it down. This is the server half.
 * `localStorage` remains the source of truth the app renders from; this is a
 * copy kept for history and for the admin panel.
 *
 * Two sorted sets and some counters, all bounded:
 *
 * - `att:<accountId>` — that person's last fifty attempts.
 * - `att:recent` — the last five hundred attempts by anyone, for the live feed.
 *
 * Trimmed on every write rather than swept later, because a reaper that has to
 * be remembered is a leak with a delay on it.
 */

const PER_ACCOUNT_KEEP = 50;
const RECENT_KEEP = 500;

export const RECENT_KEY = "att:recent";
export const accountAttemptsKey = (id: string) => `att:${id}`;

export interface Attempt {
  subject: Subject;
  mode: "daily" | "random";
  /** Marks scored, which may be negative — this exam has negative marking. */
  score: number;
  correct: number;
  wrong: number;
  blank: number;
  total: number;
  at: number;
}

/** What the global feed carries: an attempt plus who took it. */
export interface RecentAttempt extends Attempt {
  accountId: string;
  name: string;
}

/**
 * Record one finished test.
 *
 * Never awaited on the client's critical path — the caller fires this and
 * redirects. A failure loses one row of history, which is the right thing to
 * lose next to making somebody wait to see their own result.
 */
export async function recordAttempt(
  accountId: string,
  name: string,
  a: Attempt,
): Promise<void> {
  const perAccount = accountAttemptsKey(accountId);
  const entry: RecentAttempt = { ...a, accountId, name };

  await kv.zadd(perAccount, a.at, JSON.stringify(a));
  await kv.zremrangebyrank(perAccount, 0, -(PER_ACCOUNT_KEEP + 1));
  /**
   * Match the account's own lifetime. An anonymous account is reaped after
   * ninety idle days and its history should not outlive it; a bound account had
   * its TTL dropped, and this one is re-armed on every attempt, so an active
   * user's history never expires out from under them.
   */
  await kv.expire(perAccount, ANON_TTL_SEC);

  await kv.zadd(RECENT_KEY, a.at, JSON.stringify(entry));
  await kv.zremrangebyrank(RECENT_KEY, 0, -(RECENT_KEEP + 1));

  bumpAsync(a.mode === "random" ? "test:done:random" : "test:done:daily");

  /**
   * Running totals for the day, so an average can be read without walking every
   * attempt. Two counters rather than a list: the panel wants a mean, and a
   * mean is a sum and a count.
   */
  const day = istDayKey(a.at);
  const sumKey = statKey(`score:sum:${a.subject}`, day);
  const nKey = statKey(`score:n:${a.subject}`, day);
  await kv.incrBy(sumKey, Math.round(a.score * 100));
  const n = await kv.incr(nKey);
  if (n === 1) {
    void kv.expire(sumKey, 400 * 86400);
    void kv.expire(nKey, 400 * 86400);
  }
}

const parseZ = <T>(flat: string[] | null): { value: T; score: number }[] => {
  if (!flat) return [];
  const out: { value: T; score: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try {
      out.push({ value: JSON.parse(flat[i]) as T, score: Number(flat[i + 1]) });
    } catch {
      // A member that will not parse is a member written by an older shape.
      // Skipping it is better than failing the whole page it appears on.
    }
  }
  return out;
};

/** Newest first. */
export async function recentAttempts(limit = 50): Promise<RecentAttempt[]> {
  const flat = await kv.zrevrange(RECENT_KEY, 0, Math.max(0, limit - 1));
  return parseZ<RecentAttempt>(flat).map((r) => r.value);
}

/** One person's history, newest first. */
export async function attemptsFor(accountId: string, limit = 50): Promise<Attempt[]> {
  const flat = await kv.zrevrange(accountAttemptsKey(accountId), 0, Math.max(0, limit - 1));
  return parseZ<Attempt>(flat).map((r) => r.value);
}
