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

async function cmd<T>(...parts: (string | number)[]): Promise<T | null> {
  if (!kvConfigured) return null;
  try {
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
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: T };
    return data.result ?? null;
  } catch {
    // A leaderboard is a nice-to-have; it must never take a test down with it.
    return null;
  }
}

export const kv = {
  get: (key: string) => cmd<string>("GET", key),
  set: (key: string, value: string) => cmd<string>("SET", key, value),
  /** Set only if absent. Returns true when this call created the key. */
  setIfAbsent: async (key: string, value: string, ttlSec?: number) => {
    const r = ttlSec
      ? await cmd<string>("SET", key, value, "NX", "EX", ttlSec)
      : await cmd<string>("SET", key, value, "NX");
    return r === "OK";
  },
  expire: (key: string, sec: number) => cmd<number>("EXPIRE", key, sec),
  del: (key: string) => cmd<number>("DEL", key),
  /** Returns the value AFTER the increment, or null if the store is unreachable. */
  incr: (key: string) => cmd<number>("INCR", key),
  zadd: (key: string, score: number, member: string) =>
    cmd<number>("ZADD", key, score, member),
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
