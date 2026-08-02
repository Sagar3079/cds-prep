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

/** The signed-in account, or null. Never throws — callers degrade to anonymous. */
export async function currentAccount(): Promise<Account | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = await kv.get(sessionKey(token));
  if (!id) return null;
  const raw = await kv.get(accountKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Account;
  } catch {
    return null;
  }
}
