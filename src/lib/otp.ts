import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { kv } from "./kv";

/**
 * Six-digit email verification codes.
 *
 * The threat this is actually defending against is guessing, and six digits is
 * only a million tries. So the code is short-lived, single-use, and — the part
 * that carries the weight — capped at a handful of attempts, after which the
 * code is destroyed rather than merely rejected. Ten minutes at five guesses is
 * a 1-in-200,000 chance per code, and burning it forces the attacker back
 * through the send throttle for another go.
 *
 * Codes are stored HASHED. The store already holds the email index and the
 * sessions; a plaintext code sitting beside them would let anyone who can read
 * Redis verify any address without touching the mailbox, which is the exact
 * property verification is supposed to establish.
 */

export const OTP_TTL_MINUTES = 10;
const OTP_TTL_SEC = OTP_TTL_MINUTES * 60;
/** After this many wrong guesses the code is destroyed, not just refused. */
export const OTP_MAX_ATTEMPTS = 5;

const otpKey = (accountId: string) => `otp:${accountId}`;

/** `randomInt`, not `Math.random()`: this is a credential, not a shuffle. */
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

const hash = (code: string, accountId: string) =>
  // Salted with the account id so the same code for two accounts does not
  // produce the same digest, and a stolen digest is useless anywhere else.
  createHash("sha256").update(`${accountId}:${code}`).digest("hex");

interface Stored {
  hash: string;
  attempts: number;
  sentAt: number;
}

/**
 * Mint a code and remember its hash. Returns the plaintext ONCE, for the mail
 * that is about to carry it — it is never readable again from anywhere.
 */
export async function issueCode(accountId: string): Promise<string> {
  const code = newCode();
  const record: Stored = {
    hash: hash(code, accountId),
    attempts: 0,
    sentAt: Date.now(),
  };
  await kv.set(otpKey(accountId), JSON.stringify(record));
  await kv.expire(otpKey(accountId), OTP_TTL_SEC);
  return code;
}

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "wrong" | "exhausted" };

/**
 * Check a code, consuming an attempt.
 *
 * "expired" covers no-code-at-all as well as a genuinely elapsed one, on
 * purpose: distinguishing them tells a caller whether an address currently has
 * a code outstanding, which is information about someone else's account.
 */
export async function checkCode(
  accountId: string,
  supplied: string,
): Promise<CheckResult> {
  const raw = await kv.get(otpKey(accountId));
  if (!raw) return { ok: false, reason: "expired" };

  let record: Stored;
  try {
    record = JSON.parse(raw) as Stored;
  } catch {
    await kv.del(otpKey(accountId));
    return { ok: false, reason: "expired" };
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await kv.del(otpKey(accountId));
    return { ok: false, reason: "exhausted" };
  }

  const a = Buffer.from(record.hash, "utf8");
  const b = Buffer.from(hash(supplied, accountId), "utf8");
  const match = a.length === b.length && timingSafeEqual(a, b);

  if (!match) {
    const attempts = record.attempts + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      // Burnt, not just counted. The next try needs a whole new code, which
      // costs a round trip through the send throttle.
      await kv.del(otpKey(accountId));
      return { ok: false, reason: "exhausted" };
    }
    await kv.set(otpKey(accountId), JSON.stringify({ ...record, attempts }));
    // Re-arm the TTL the SET above cleared, so a wrong guess cannot extend the
    // code's life beyond the window it was issued for.
    const left = Math.max(
      1,
      OTP_TTL_SEC - Math.floor((Date.now() - record.sentAt) / 1000),
    );
    await kv.expire(otpKey(accountId), left);
    return { ok: false, reason: "wrong" };
  }

  // Single use: correct or not, this code is now spent.
  await kv.del(otpKey(accountId));
  return { ok: true };
}
