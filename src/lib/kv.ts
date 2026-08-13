import "server-only";

/**
 * Minimal Upstash Redis REST client.
 *
 * No SDK: the REST API is a POST of a command array, and the three calls this
 * app makes are not worth a dependency that ships its own fetch wrapper.
 *
 * `server-only` at the top is load-bearing, not decorative. This module holds
 * the write token; importing it from a client component would inline that token
 * into the browser bundle, and the build fails instead.
 */
const URL_ = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

export const kvConfigured = Boolean(URL_ && TOKEN);

/**
 * One round trip, with failures left intact.
 *
 * `cmd` below is the one everything uses, and it swallows every failure into
 * the same `null` a missing key returns. That is deliberate and it is right for
 * a leaderboard — but it means a caller cannot tell "Redis says this key does
 * not exist" from "Redis never answered", and there is one place in this app
 * where confusing those two silently destroys something a customer paid for
 * (see `activePlanStrict` in `entitlement.ts`). This variant throws instead, so
 * that caller can decide for itself. Nothing else should use it: fail-open is
 * the correct behaviour everywhere the store backs something optional.
 */
async function cmdStrict<T>(...parts: (string | number)[]): Promise<T | null> {
  if (!kvConfigured) throw new Error("kv: not configured");
  const res = await fetch(URL_!, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(parts.map(String)),
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`kv: ${String(parts[0])} answered HTTP ${res.status}`);
  const data = (await res.json()) as { result?: T; error?: string };
  /**
   * Both checks exist so that `null` out of here means one thing only: the
   * response body carried `"result": null`, which is Redis saying the key is
   * not there. Upstash reports a command error as a non-200 with an `error`
   * field, so the first is belt to the `res.ok` braces above; the second
   * catches a body of some shape this client did not expect. Reading either as
   * "no value" is the exact confusion this function exists to refuse.
   */
  if (typeof data.error === "string") throw new Error(`kv: ${data.error}`);
  if (!("result" in data)) {
    throw new Error(`kv: ${String(parts[0])} answered with no result`);
  }
  return data.result ?? null;
}

async function cmd<T>(...parts: (string | number)[]): Promise<T | null> {
  try {
    return await cmdStrict<T>(...parts);
  } catch {
    // A leaderboard is a nice-to-have; it must never take a test down with it.
    // Unconfigured, unreachable, timed out, a 500 from Upstash or a body that
    // is not JSON all land here and all read as "no value", exactly as before.
    return null;
  }
}

export const kv = {
  get: (key: string) => cmd<string>("GET", key),
  /**
   * `get`, where `null` is an answer rather than a shrug.
   *
   * It returns null only when the store replied and the key is genuinely not
   * there; a timeout, a dropped connection, a non-200 or an unparseable body
   * all throw. The one caller is the read a plan grant extends from, where
   * "no existing plan" and "could not tell" have to lead to different
   * outcomes — treating a failed read as an empty account is how somebody's
   * remaining paid days get overwritten with a fresh thirty.
   */
  getStrict: (key: string) => cmdStrict<string>("GET", key),
  set: (key: string, value: string) => cmd<string>("SET", key, value),
  /**
   * Set with an expiry, in one round trip.
   *
   * `set` followed by `expire` is two calls, and a crash between them leaves a
   * key that never dies. Anonymous accounts are created on a TTL and there are
   * a great many of them, so that leak is not one to accept.
   */
  setEx: (key: string, ttlSec: number, value: string) =>
    cmd<string>("SET", key, value, "EX", ttlSec),
  /** Set only if absent. Returns true when this call created the key. */
  setIfAbsent: async (key: string, value: string, ttlSec?: number) => {
    const r = ttlSec
      ? await cmd<string>("SET", key, value, "NX", "EX", ttlSec)
      : await cmd<string>("SET", key, value, "NX");
    return r === "OK";
  },
  expire: (key: string, sec: number) => cmd<number>("EXPIRE", key, sec),
  /**
   * Drop the expiry, making a key permanent.
   *
   * The counterpart to anonymous accounts being born on a TTL: the moment one
   * binds an email or holds a plan it has to stop being disposable, and this is
   * the call that promotes it.
   */
  persist: (key: string) => cmd<number>("PERSIST", key),
  /** Seconds left, -1 for no expiry, -2 for no key. Null if unreachable. */
  ttl: (key: string) => cmd<number>("TTL", key),
  /**
   * Server statistics, as one text blob to be parsed by the caller.
   *
   * `CONFIG GET` is the obvious way to ask for limits and returns an empty
   * array on Upstash, so `INFO` is the only source for key count and memory.
   */
  info: () => cmd<string>("INFO"),
  del: (key: string) => cmd<number>("DEL", key),
  /**
   * Many keys, one round trip.
   *
   * The admin panel reads accounts a page at a time, and a page of fifty read
   * one-by-one is fifty sequential HTTPS calls at up to six seconds each. That
   * is the difference between a dashboard and a timeout. Missing keys come back
   * as nulls in position, so the caller can still line results up with input.
   */
  mget: async (keys: string[]) => {
    if (keys.length === 0) return [];
    return (await cmd<(string | null)[]>("MGET", ...keys)) ?? keys.map(() => null);
  },
  /** Remove a member from a sorted set. Needed to move a board row between accounts. */
  zrem: (key: string, member: string) => cmd<number>("ZREM", key, member),
  /**
   * Trim a sorted set by rank, lowest scores first.
   *
   * Attempt history is append-only and would otherwise grow without limit for
   * as long as somebody keeps practising. With scores as timestamps, dropping
   * the lowest ranks drops the oldest entries — which is what makes a "last N
   * attempts" list a fixed-size record rather than a slow leak.
   */
  zremrangebyrank: (key: string, start: number, stop: number) =>
    cmd<number>("ZREMRANGEBYRANK", key, start, stop),
  /** Lowest first, with scores. `zrevrange` is the counterpart. */
  zrange: (key: string, start: number, stop: number) =>
    cmd<string[]>("ZRANGE", key, start, stop, "WITHSCORES"),
  /** Returns the value AFTER the increment, or null if the store is unreachable. */
  incr: (key: string) => cmd<number>("INCR", key),
  incrBy: (key: string, by: number) => cmd<number>("INCRBY", key, by),
  zadd: (key: string, score: number, member: string) =>
    cmd<number>("ZADD", key, score, member),
  /**
   * Add, but never lower an existing score.
   *
   * `GT` is what makes a weekly leaderboard hold each person's BEST rather than
   * their most recent. Doing it read-then-write instead would be a race — two
   * submissions in the same moment both read the old score and the second wins
   * regardless of which is higher — and would also need a round trip it does
   * not need. Redis 6.2+; Upstash supports it.
   */
  zaddGt: (key: string, score: number, member: string) =>
    cmd<number>("ZADD", key, "GT", "CH", score, member),
  /** Highest first. */
  zrevrange: (key: string, start: number, stop: number) =>
    cmd<string[]>("ZRANGE", key, start, stop, "REV", "WITHSCORES"),
  zcard: (key: string) => cmd<number>("ZCARD", key),
  zscore: (key: string, member: string) => cmd<string>("ZSCORE", key, member),
  zrevrank: (key: string, member: string) =>
    cmd<number>("ZREVRANK", key, member),
  /**
   * One page of a key scan: `[nextCursor, keys]`.
   *
   * Cursored on purpose — there is no `KEYS` here and there should not be, as
   * it blocks the store for as long as it takes to walk every key. Callers
   * must loop, and must bound their loop.
   */
  scan: async (cursor: string, match: string, count = 1000) => {
    const r = await cmd<[string, string[]]>(
      "SCAN",
      cursor,
      "MATCH",
      match,
      "COUNT",
      count,
    );
    return r ?? ["0", [] as string[]];
  },
};
