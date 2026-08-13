import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { kv } from "./kv";

/**
 * The gate on /admin.
 *
 * This module fronts plaintext email addresses and live Razorpay records, which
 * makes it the highest-value target in the app and the one place where the
 * house habit of degrading gracefully is wrong. Everything else here treats an
 * unreachable Redis as "carry on without the leaderboard"; `kv.get` returns null
 * indistinguishably for a missing key, a non-2xx response and a dead socket, and
 * `rateLimit` allows the request when it cannot reach its store. Copy either
 * pattern into an authorisation check and an outage becomes an open door.
 *
 * So: **null means deny, everywhere below.**
 */

const PASSWORD = process.env.ADMIN_PASSWORD;
const SECRET = process.env.ADMIN_SESSION_SECRET;

/**
 * Both, or the panel does not exist.
 *
 * Not one-or-the-other and no defaults: a development fallback password is a
 * production password on the day someone forgets to set the real one, and the
 * blue/green slots both read the same env file, so "it worked on the other
 * slot" is not a failure mode worth engineering around.
 */
export const adminConfigured = Boolean(PASSWORD && SECRET);

export const ADMIN_COOKIE = "cds_adm";

/**
 * Eight hours.
 *
 * A working day, not a year. The user session is deliberately long because
 * being signed out mid-revision is a bad welcome; an admin session has the
 * opposite trade — the cost of re-typing a password is nothing next to a
 * forgotten laptop in a browser that is still authorised tomorrow.
 */
const ADMIN_TTL_SEC = 8 * 60 * 60;

const adminSessionKey = (token: string) =>
  `adm:${createHash("sha256").update(token).digest("hex")}`;

/**
 * The salt is the session secret rather than a stored one — there is exactly
 * one password here and no user table to per-row salt.
 */
const SALT = SECRET ? Buffer.from(SECRET, "utf8") : null;

/**
 * The known-good digest, computed ONCE when this module is first imported.
 *
 * It used to be recomputed inside `passwordMatches` on every attempt, which
 * meant two scrypt runs per login rather than one. Both inputs are process-wide
 * constants read from the environment — the answer cannot change between
 * requests, so paying for it per request bought nothing and doubled the cost of
 * the flood described below. The one-off ~60-100ms this adds to module load
 * happens while the process is starting, where nothing is waiting on it.
 *
 * Not a secret-handling regression: `PASSWORD` is already resident in this
 * process's environment for its whole life, so holding its digest alongside it
 * gives an attacker who can read this memory nothing they did not already have.
 */
const KNOWN_HASH = PASSWORD && SALT ? scryptSync(PASSWORD, SALT, 64) : null;

/**
 * `crypto.scrypt`, not `scryptSync`, and the difference is availability rather
 * than style.
 *
 * This is one `next start` process behind nginx serving the entire site, so a
 * synchronous scrypt does not merely slow the login down — it stops Node's
 * event loop dead for its whole duration, freezing every other request in
 * flight, including tests being taken on a timer. `/api/admin/login` is
 * reachable by anyone (curl omits `Origin`, which `sameOrigin` below treats as
 * same-origin) behind nothing but a per-IP, fail-open, 10/hour throttle, which
 * makes a site-wide stall something an outsider can trigger on demand. The
 * async form hands the work to libuv's threadpool, so the cost lands on the
 * attempt instead of on everyone else.
 *
 * The expense per attempt is unchanged and deliberate: `rateLimit` is a
 * throttle, not the defence — it is per-IP, it fails open, and when KV is
 * unconfigured there is no throttle at all — so each guess still has to cost
 * tens of milliseconds of CPU. Nothing about moving threads makes it cheaper.
 */
const scryptAsync = (password: string, salt: Buffer, keylen: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });

/**
 * Password comparison that costs something.
 *
 * Hashing both sides is what makes the comparison safe: `timingSafeEqual`
 * throws outright on a length mismatch, so comparing raw secrets would leak the
 * length of the real one through the exception. Two scrypt digests are always
 * 64 bytes.
 */
async function passwordMatches(submitted: string): Promise<boolean> {
  if (!KNOWN_HASH || !SALT) return false;
  const a = await scryptAsync(submitted, SALT, 64);
  return timingSafeEqual(a, KNOWN_HASH);
}

/**
 * Trade the password for a session. Returns the raw token, or null.
 *
 * Only the hash is stored, so a Redis dump does not yield a usable cookie —
 * the same reasoning as `sess:` for user sessions.
 */
export async function signIn(submitted: unknown): Promise<string | null> {
  if (typeof submitted !== "string" || submitted.length === 0) return null;
  if (submitted.length > 512) return null;
  if (!(await passwordMatches(submitted))) return null;

  const token = randomBytes(32).toString("base64url");
  const wrote = await kv.setEx(adminSessionKey(token), ADMIN_TTL_SEC, "1");
  // A session that was not durably recorded is not a session.
  if (wrote !== "OK") return null;
  return token;
}

/** Revoke server-side, not just in the browser. */
export async function signOut(): Promise<void> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (token) await kv.del(adminSessionKey(token));
}

export const adminCookie = (token: string) =>
  ({
    name: ADMIN_COOKIE,
    value: token,
    httpOnly: true,
    /**
     * Stricter than the user session on both axes, deliberately.
     *
     * `strict` because nothing should ever navigate into the panel from another
     * site, and `secure` unconditionally rather than keyed to NODE_ENV — an
     * admin cookie must never be put on the wire in plaintext, and a
     * misconfigured environment variable is not a reason to allow it.
     */
    sameSite: "strict" as const,
    secure: true,
    path: "/",
    maxAge: ADMIN_TTL_SEC,
  });

/** Whether the caller holds a live admin session. Null KV reply means no. */
export async function isAdmin(): Promise<boolean> {
  if (!adminConfigured) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const hit = await kv.get(adminSessionKey(token));
  return hit === "1";
}

/**
 * The mandatory first statement of every admin route handler.
 *
 * There is no middleware in this app, so nothing enforces this centrally — one
 * handler that forgets to call it exposes everything that handler reads. Shaped
 * like `rateLimit`: returns a response to return, or null to continue.
 *
 * The 404 is not decoration. An unauthenticated 401 confirms the path exists;
 * this way the panel is indistinguishable from any other missing route.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdmin()) return null;
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * Headers for every admin response.
 *
 * `no-store` because a dashboard of emails cached by any intermediary is a
 * leak, and `noindex` because the panel must never reach a search index. Note
 * that /admin is deliberately absent from robots.ts — listing it there would
 * publish the path to everyone who reads robots.txt.
 */
export const ADMIN_HEADERS = {
  "cache-control": "no-store, no-cache, must-revalidate",
  "x-robots-tag": "noindex, nofollow, noarchive",
} as const;

/**
 * Reject cross-origin state changes.
 *
 * `sameSite: strict` already blocks the cookie on a cross-site POST, so this is
 * belt and braces — but it is one comparison, and this is the only place in the
 * app where a forged state change would be expensive.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // Same-origin fetches may omit it entirely.

  /**
   * Compare against the host the BROWSER asked for, not `req.url`.
   *
   * This is the whole bug that shipped: behind nginx, `req.url` is the address
   * the proxy dialled — `http://127.0.0.1:3101/...` — so `new URL(req.url).host`
   * is `127.0.0.1:3101` and can never equal `prepcadet.in`. Every browser
   * login was refused as cross-origin, while curl sailed through because it
   * sends no `Origin` header at all and took the early return above. A check
   * that only fails for real clients is worse than no check.
   *
   * **`host` is preferred over `x-forwarded-host`, and the order matters** —
   * the same reasoning `clientIp` in `lib/ratelimit.ts` spells out for its own
   * pair of headers. The site's nginx config sets `proxy_set_header Host $host`
   * (ops/nginx/prepcadet.in) and sets no `X-Forwarded-Host` at all, so that
   * second header reaches the app exactly as the caller typed it. Reading it
   * first — which is what this did — meant the value an attacker chooses beat
   * the one the proxy pins, and the comparison below could be made to agree
   * with any `Origin` at all simply by sending the two headers to match.
   *
   * Not reachable from a browser today (`X-Forwarded-Host` is not
   * CORS-safelisted and nothing here answers a preflight), so this was a check
   * that could be defeated only by a client that already sends no `Origin` and
   * takes the early return above. It is still the wrong way round, and the cost
   * of having it right is nothing.
   *
   * The fallback stays for a deployment whose edge rewrites `Host` and carries
   * the browser's own in `x-forwarded-host`. It is only reachable when the
   * trusted header is absent, so it cannot be used to override it.
   */
  const expected =
    req.headers.get("host")?.trim() ||
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!expected) return false;

  try {
    return new URL(origin).host === expected;
  } catch {
    return false;
  }
}
