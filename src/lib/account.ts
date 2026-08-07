import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { kv } from "./kv";

export const SESSION_COOKIE = "cds_sid";

export interface Account {
  id: string;
  email: string;
  username?: string;
  createdAt: number;
  /** Email ownership is NOT proven yet — verification is a later step. */
  emailVerified: boolean;
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
  const [user = "", domain = ""] = a.email.split("@");
  const head = user.slice(0, 1) || "?";
  return `${head}${"•".repeat(Math.max(3, Math.min(6, user.length - 1)))}@${domain}`;
}

/** Deliberately permissive: this is a format check, not proof of anything. */
export function isEmail(s: unknown): s is string {
  return typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();

/** Emails are keyed by hash so the index cannot be enumerated back to addresses. */
export const emailKey = (email: string) =>
  `email:${createHash("sha256").update(normaliseEmail(email)).digest("hex").slice(0, 32)}`;

export const accountKey = (id: string) => `acct:${id}`;
export const sessionKey = (token: string) =>
  `sess:${createHash("sha256").update(token).digest("hex")}`;

export const newToken = () => randomBytes(32).toString("base64url");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * How long a session lives, and — because the TTL is re-armed on every
 * authenticated request below — how long somebody may be away before it lapses
 * rather than how long it lasts in total. A candidate revising for CDS is back
 * most days; the people this protects are the ones who stop for a term and
 * come back, and being silently signed out is a bad way to be welcomed.
 */
export const SESSION_DAYS = 365;
export const SESSION_TTL_SEC = SESSION_DAYS * 86400;

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
    return JSON.parse(raw) as Account;
  } catch {
    return null;
  }
}
