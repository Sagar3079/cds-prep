import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { kv } from "./kv";
import { generateUsername } from "./username";

export const SESSION_COOKIE = "cds_sid";

export interface Account {
  id: string;
  /**
   * Absent on an anonymous account.
   *
   * Identity used to start with an address; it now starts with a cookie, and
   * the address arrives later — when somebody buys a plan and binds one so it
   * survives the cookie, or restores a purchase on a new phone. Every reader
   * has to cope with it missing: `displayName` and `maskEmail` below are the
   * two that used to call string methods on it unguarded.
   */
  email?: string;
  username?: string;
  createdAt: number;
  /** Email ownership is NOT proven yet — verification is a later step. */
  emailVerified: boolean;
  /**
   * True until an email is bound. Anonymous accounts are created on a TTL and
   * reaped if they go cold; binding an email or holding a plan makes the record
   * permanent. Without this flag there is no way to tell a disposable record
   * from one somebody paid for.
   */
  anonymous?: boolean;
}

/**
 * The display name on a public leaderboard.
 *
 * With no username the email is masked, never shown whole: a leaderboard is
 * public, and publishing the address someone signed up with — to spammers as
 * much as to other candidates — is not something they asked for by taking a
 * test. Keeps the first character and the domain so a person can still find
 * their own row.
 */
export function displayName(a: Pick<Account, "email" | "username">): string {
  if (a.username?.trim()) return a.username.trim().slice(0, 24);
  /**
   * Every account minted since anonymous sign-up landed carries a generated
   * username, so the branches below are for the accounts that predate it — and
   * for the one case a generator cannot rule out, which is the store handing
   * back a record with neither field. Falling through to a `TypeError` here
   * would take out the leaderboard and the submit route with it.
   */
  if (!a.email) return "Cadet";
  const [user = "", domain = ""] = a.email.split("@");
  const head = user.slice(0, 1) || "?";
  return `${head}${"•".repeat(Math.max(3, Math.min(6, user.length - 1)))}@${domain}`;
}

/** Deliberately permissive: this is a format check, not proof of anything. */
export function isEmail(s: unknown): s is string {
  return typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

/**
 * An address with its local part blanked out — enough to spot a typo or
 * recognise your own inbox, not enough to hand the whole address to whoever is
 * holding the cookie. Shared by every path that has to name an address back to
 * a caller who has not yet proved they own it.
 */
export function maskEmail(email: string | undefined): string {
  if (!email) return "no email yet";
  return email.replace(/^(.)(.*)(@.*)$/, (_, first, mid: string, domain) =>
    `${first}${"•".repeat(Math.min(6, Math.max(3, mid.length)))}${domain}`,
  );
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();

/** Emails are keyed by hash so the index cannot be enumerated back to addresses. */
export const emailKey = (email: string) =>
  `email:${createHash("sha256").update(normaliseEmail(email)).digest("hex").slice(0, 32)}`;

export const accountKey = (id: string) => `acct:${id}`;
export const sessionKey = (token: string) =>
  `sess:${createHash("sha256").update(token).digest("hex")}`;

export const newToken = () => randomBytes(32).toString("base64url");

/**
 * How long a session lives, and — because the TTL is re-armed on every
 * authenticated request below — how long somebody may be away before it lapses
 * rather than how long it lasts in total. A candidate revising for CDS is back
 * most days; the people this protects are the ones who stop for a term and
 * come back, and being silently signed out is a bad way to be welcomed.
 */
export const SESSION_DAYS = 365;
export const SESSION_TTL_SEC = SESSION_DAYS * 86400;

/**
 * How long an anonymous account survives without being used.
 *
 * Account records have never expired, which was right when one existed only
 * because somebody typed an address. Now one exists because somebody opened a
 * test, at roughly eight hundred visitors a day, and permanent is the wrong
 * default for a record that may represent a single interrupted test.
 *
 * Ninety days, re-armed on every authenticated request, so the reaper only ever
 * catches accounts nobody has come back to for a season. The moment an account
 * stops being disposable — an email is bound, a plan is bought — `makePermanent`
 * below drops the TTL and it joins the records that live forever.
 */
export const ANON_DAYS = 90;
export const ANON_TTL_SEC = ANON_DAYS * 86400;

/**
 * The one place session cookie attributes are written.
 *
 * They were duplicated across four routes, which is how the pair of them drift.
 * `secure` stays keyed to NODE_ENV because local development is plain HTTP.
 */
export const sessionCookie = (token: string) =>
  ({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });

/** Promote a disposable record to a permanent one. Call before granting anything. */
export async function makePermanent(id: string): Promise<void> {
  await kv.persist(accountKey(id));
}

/**
 * Mint an account for somebody who never asked for one.
 *
 * Returns the record and the raw session token; the caller owns setting the
 * cookie, because only a route handler may.
 *
 * Write order matters and is not arbitrary. The account record goes first: if
 * `sess:` were written first and `acct:` then failed, the cookie would point at
 * nothing, `currentAccount()` would return null forever, and the very next
 * request would mint *another* account — one orphaned pair per request, all of
 * them permanent, for as long as the store was unhappy. Writing the record
 * first makes the failure mode a session that was never issued instead.
 */
export async function createAnonymousAccount(): Promise<{
  account: Account;
  token: string;
} | null> {
  const id = randomBytes(9).toString("base64url");
  const account: Account = {
    id,
    username: generateUsername(),
    createdAt: Date.now(),
    emailVerified: false,
    anonymous: true,
  };

  const wrote = await kv.setEx(accountKey(id), ANON_TTL_SEC, JSON.stringify(account));
  if (wrote !== "OK") return null;

  const token = newToken();
  await kv.set(sessionKey(token), id);
  void kv.expire(sessionKey(token), SESSION_TTL_SEC);

  return { account, token };
}

/** The signed-in account, or null. Never throws — callers degrade to anonymous. */
export async function currentAccount(): Promise<Account | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = await kv.get(sessionKey(token));
  if (!id) return null;

  /**
   * Slide the expiry forward. Without this the session dies a fixed period
   * after SIGN-UP no matter how much the app is used — somebody practising
   * daily is signed out mid-revision on an anniversary they have no way to
   * see coming.
   *
   * Not awaited: it is a housekeeping write whose result nothing reads, and
   * making every authenticated request wait on a second Redis round trip to
   * refresh a year-long TTL is a poor trade. `kv` swallows its own failures,
   * so there is no rejection to leak.
   */
  void kv.expire(sessionKey(token), SESSION_TTL_SEC);
  const raw = await kv.get(accountKey(id));
  if (!raw) return null;
  try {
    const acct = JSON.parse(raw) as Account;
    /**
     * Slide the record's own expiry too.
     *
     * Anonymous accounts are born on a ninety-day TTL while the session that
     * points at them lasts a year. Re-arming only the session would let the
     * record vanish out from under a live cookie after a quiet season, and the
     * user would come back to a working session pointing at nothing. Only
     * anonymous records carry a TTL at all; a bound account was made permanent
     * when it bound, and `EXPIRE` on it would put the expiry back.
     */
    if (acct.anonymous) void kv.expire(accountKey(id), ANON_TTL_SEC);
    return acct;
  } catch {
    return null;
  }
}
