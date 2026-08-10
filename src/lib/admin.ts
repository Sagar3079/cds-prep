import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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
 * Password comparison that costs something.
 *
 * `rateLimit` is the throttle in front of this, but it is not the defence: it
 * is per-IP, it fails open, and when KV is unconfigured there is no throttle at
 * all. So each attempt has to be expensive on its own — scrypt at these
 * parameters is tens of milliseconds, which is nothing once per day and ruinous
 * at guessing speed.
 *
 * Hashing both sides first is what makes the comparison safe: `timingSafeEqual`
 * throws outright on a length mismatch, so comparing raw secrets would leak the
 * length of the real one through the exception. Two scrypt digests are always
 * 64 bytes. The salt is the session secret rather than a stored one — there is
 * exactly one password here and no user table to per-row salt.
 */
function passwordMatches(submitted: string): boolean {
  if (!PASSWORD || !SECRET) return false;
  const salt = Buffer.from(SECRET, "utf8");
  const a = scryptSync(submitted, salt, 64);
  const b = scryptSync(PASSWORD, salt, 64);
  return timingSafeEqual(a, b);
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
  if (!passwordMatches(submitted)) return null;

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
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
