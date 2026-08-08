import "server-only";
import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { kvConfigured } from "./kv";

/**
 * Per-IP throttling for the four public API routes.
 *
 * `server-only`, same as `kv.ts` and for the same reason: this module reads the
 * Upstash write token, and importing it from a client component would inline
 * that token into the browser bundle.
 *
 * The rule this module follows, borrowed from `kv.ts`: **fail open**. If Redis
 * is slow, unreachable, or unconfigured, the request goes through. A throttle
 * exists to stop abuse; it must never be the thing that stops someone finishing
 * a timed test. Every failure path below returns `null` (allow), never a 429.
 *
 * What this does NOT do, stated plainly: an IP is not an identity. Behind
 * Indian mobile CGNAT a whole city can share one address. So these limits raise
 * the cost of casual abuse and cap accidental runaway clients. They are not an
 * authorization boundary — the durable fix for `/api/account` was email
 * verification, not a smaller number here, and that now gates it.
 *
 * Which header is trusted for "who is calling" is a security decision, not a
 * detail: see `clientIp` at the bottom of this file.
 */

/** Sliding window: 429s smoothly rather than at hard clock boundaries. */
const WINDOWS = {
  /**
   * Sign-up. 5 per hour.
   *
   * The tightest limit here, because this is the only endpoint that mints
   * unbounded state from an unverified email. A real person signs up once; five
   * covers a typo'd address, a retry, and a later username edit. It takes the
   * ceiling from "unlimited" to 120 accounts/day/IP.
   *
   * The cost: on shared CGNAT a genuine sixth signer in the same hour waits.
   * That is the trade accepted knowingly — an open account factory is worse
   * than an occasional wait, and verification is what actually fixes this.
   */
  "account:create": { tokens: 5, window: "1 h" },

  /**
   * Whoami. 60 per minute.
   *
   * Fired once per leaderboard mount, not polled, and it costs two Redis reads.
   * Sixty a minute is far above any real navigation rate while still capping a
   * loop that mounts the page over and over.
   */
  "account:read": { tokens: 60, window: "1 m" },

  /**
   * Score + record a finished test. 20 per hour.
   *
   * A test runs ten minutes and only the first attempt each day counts, so a
   * genuine rate is about one a day. Twenty an hour leaves room for retries on
   * a flaky connection and for a coaching-centre NAT finishing together, while
   * capping the scoring work an anonymous caller can force.
   */
  submit: { tokens: 20, window: "1 h" },

  /**
   * Explanations. 30 per minute.
   *
   * The binding case is the review screen: up to ten cards fire as they scroll
   * into view, so a single reader bursts ten. Thirty allows three such bursts a
   * minute — 3x headroom over the worst legitimate burst.
   *
   * When `SCALEMAX_API_KEY` is set this path costs money per call, and 30/min
   * per IP is a loose cap for that. Per-IP is the wrong axis for spend; pair it
   * with a per-account daily cap before turning the model on.
   */
  explain: { tokens: 30, window: "1 m" },

  /**
   * Board reads. 120 per minute.
   *
   * The leaderboard page polls every 5s while visible — 12/min per open tab,
   * plus one extra on each tab refocus. 120 leaves room for ten tabs behind one
   * address, roughly 10x a single viewer, and still stops a scraper hammering
   * a sorted-set read.
   */
  leaderboard: { tokens: 120, window: "1 m" },

  /**
   * Sending a verification code. 3 per hour.
   *
   * Every one of these costs an email, and an email sent to an address the
   * requester does not own is a message somebody else did not ask for. Three an
   * hour covers a code lost to spam plus one retype of the address, and caps
   * what this endpoint can do to a stranger's inbox — and to the sending
   * domain's reputation, which is the thing that stops the NEXT code arriving.
   */
  "verify:send": { tokens: 3, window: "1 h" },

  /**
   * Checking a code. 20 per hour.
   *
   * Not the real defence: the code itself allows five wrong guesses and is then
   * destroyed, so guessing is bounded whatever this says. This exists to stop a
   * script burning through codes fast enough to matter, and sits far above any
   * human's typo rate.
   */
  "verify:check": { tokens: 20, window: "1 h" },

  /**
   * Starting a random test. 60 per hour.
   *
   * The allowance itself is the limit that matters — two a day, counted in
   * Redis. This only stops a loop hammering the endpoint, and stays well clear
   * of a plan holder practising hard: sixty an hour is a test every minute,
   * with each one taking ten.
   */
  "random:start": { tokens: 60, window: "1 h" },

  /**
   * Opening a checkout. 10 per hour.
   *
   * Every one of these is a live call to Razorpay's Orders API against our
   * credentials, so an unthrottled caller can mint orders in our account for
   * free. A real buyer creates one or two — an abandoned modal, then a retry.
   * Ten leaves room for a genuinely indecisive afternoon and still caps what a
   * script can do to the orders list.
   */
  "payment:order": { tokens: 10, window: "1 h" },

  /**
   * Verifying a payment. 60 per hour.
   *
   * Loose on purpose, and the one limit here that leans the other way. By the
   * time this endpoint is called the money has already moved; a 429 at this
   * point means a paid customer whose payment is not recorded, which is far
   * worse than the abuse this would prevent. Forged calls cost one HMAC and
   * fail the signature check anyway.
   */
  "payment:verify": { tokens: 60, window: "1 h" },

  /**
   * Client error reports. 10 per minute.
   *
   * Each error boundary fires this once per mount via a `useEffect`, so a
   * real user trips it at most a handful of times a session — one broken
   * screen, maybe a retry. Ten a minute leaves headroom for that while still
   * capping what a direct POST to this public endpoint can write, since
   * nothing else gates who may call it.
   */
  log: { tokens: 10, window: "1 m" },
} as const satisfies Record<string, { tokens: number; window: `${number} ${"s" | "m" | "h"}` }>;

export type LimitedRoute = keyof typeof WINDOWS;

/** Plain language. A person who hits one of these did not do anything technical. */
const MESSAGES: Record<LimitedRoute, string> = {
  "account:create":
    "That's a lot of join attempts in a short time. Give it a few minutes and try again.",
  "account:read": "Too many requests just now. Give it a moment and try again.",
  submit:
    "You've sent a lot of results in a short time. Wait a little and try again.",
  explain: "Too many explanations at once. Give it a moment and they'll load.",
  leaderboard: "The board is being asked for too often. It'll be back shortly.",
  "verify:send":
    "We've sent a few codes already. Check your inbox and spam, then try again in a little while.",
  "verify:check":
    "Too many attempts. Wait a few minutes, then request a fresh code.",
  "random:start":
    "That's a lot of tests started at once. Give it a moment and try again.",
  "payment:order":
    "That's a lot of checkout attempts in a short time. Give it a few minutes and try again.",
  "payment:verify":
    "Too many verification attempts just now. If you've been charged, email support and it will be sorted manually.",
  log: "Too many error reports just now. Give it a moment.",
};

/**
 * Built once per process, not per request. Both the Redis client and the
 * limiters' in-memory block cache only help when they outlive the handler.
 */
const limiters: Record<LimitedRoute, Ratelimit> | null = kvConfigured
  ? (() => {
      // The same credentials `kv.ts` uses. No new environment variables.
      const redis = new Redis({
        url: process.env.KV_REST_API_URL!,
        token: process.env.KV_REST_API_TOKEN!,
      });
      // Shared across limiters: an IP already blocked on one route is usually
      // about to be blocked on the next, and a cache hit skips Redis entirely.
      const ephemeralCache = new Map<string, number>();
      const entries = Object.entries(WINDOWS) as [
        LimitedRoute,
        (typeof WINDOWS)[LimitedRoute],
      ][];
      return Object.fromEntries(
        entries.map(([name, { tokens, window }]) => [
          name,
          new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(tokens, window),
            // Separate keyspace per route, so a burst of board reads cannot
            // spend somebody's sign-up allowance.
            prefix: `rl:${name}`,
            // Well under the 6s `kv.ts` allows itself. On timeout the SDK
            // returns success, which is the fail-open behaviour we want, and
            // this number is the ceiling on what a dead store can add to any
            // one request — measured at ~1.5s/request against a black-holed
            // endpoint. Normal Upstash round trips are well under 200ms.
            timeout: 1500,
            ephemeralCache,
          }),
        ]),
      ) as Record<LimitedRoute, Ratelimit>;
    })()
  : null;

/**
 * Best guess at who is calling.
 *
 * **`x-real-ip` is preferred over `x-forwarded-for`, and the order matters.**
 * This app runs behind the nginx config in `ops/nginx/prepcadet.in`, which sets
 * `X-Real-IP $remote_addr` — the address of the TCP peer, which nginx observed
 * rather than read, and which a caller therefore cannot choose. It also sets
 * `X-Forwarded-For $proxy_add_x_forwarded_for`, and that directive *appends* to
 * whatever `X-Forwarded-For` the client already sent. So a request arriving with
 * a handwritten `X-Forwarded-For: 1.2.3.4` reaches the app as
 * `1.2.3.4, <real address>`, and reading the leftmost entry — which is what this
 * function used to do — returned the value the attacker picked. One header per
 * request bought a fresh bucket, which defeated every limit in this file:
 * unlimited sign-ups, unlimited Razorpay order creation, unlimited everything.
 *
 * Falling back to the leftmost `x-forwarded-for` entry is kept for deployments
 * where a platform edge sets that header itself and no `x-real-ip` exists. It is
 * only reachable when the trusted header is absent, so it cannot be used to
 * override it.
 *
 * Requests with no forwarding header at all share the "unknown" bucket — the
 * only safe default, and not a case that arises behind the real proxy.
 */
function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

/**
 * Returns a ready-to-send 429 when the caller is over the limit, or `null` when
 * the request should proceed. `null` is also what you get when the store is
 * unconfigured or misbehaving — see the fail-open note at the top.
 *
 * Usage, as the first statement of a handler:
 *
 * ```ts
 * const limited = await rateLimit(req, "explain");
 * if (limited) return limited;
 * ```
 */
export async function rateLimit(
  req: Request,
  route: LimitedRoute,
): Promise<NextResponse | null> {
  if (!limiters) return null;
  try {
    const { success, reset } = await limiters[route].limit(clientIp(req));
    if (success) return null;

    // `reset` is a millisecond epoch. Retry-After is whole seconds, and 0 would
    // invite an instant retry, so never go below 1.
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: MESSAGES[route] },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  } catch {
    // Store unreachable, credentials rotated, anything at all: let it through.
    return null;
  }
}
