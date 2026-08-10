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
/**
 * A separate key for the wrong-guess counter, incremented with `INCR`.
 *
 * The counter used to live inside the same JSON blob as the code, updated by
 * reading the blob, adding one in JavaScript, and writing it back — three
 * steps with two network round trips between them, and nothing serializing
 * concurrent callers. A burst of guesses fired without waiting for each other
 * (which costs an attacker nothing — no `await` needed between requests) would
 * nearly all read the SAME attempts value before any of their writes landed,
 * so the stored count advanced by however many writes happened to finish last
 * rather than by the true number of guesses. `INCR` is a single atomic
 * operation at the Redis level; there is no window for two callers to observe
 * the same pre-increment value.
 */
const attemptsKey = (accountId: string) => `otp:${accountId}:attempts`;

/** `randomInt`, not `Math.random()`: this is a credential, not a shuffle. */
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

const hash = (code: string, accountId: string) =>
  // Salted with the account id so the same code for two accounts does not
  // produce the same digest, and a stolen digest is useless anywhere else.
  createHash("sha256").update(`${accountId}:${code}`).digest("hex");

const hashesMatch = (storedHash: string, accountId: string, supplied: string) => {
  const a = Buffer.from(storedHash, "utf8");
  const b = Buffer.from(hash(supplied, accountId), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
};

interface Stored {
  hash: string;
  sentAt: number;
}

/**
 * Mint a code and remember its hash. Returns the plaintext ONCE, for the mail
 * that is about to carry it — it is never readable again from anywhere.
 *
 * The attempts counter is a fresh key, not a field reset inside this record:
 * deleting it here (rather than leaving a stale count from a previous code to
 * be inherited) is what makes a freshly issued code start with a clean budget.
 */
export async function issueCode(accountId: string): Promise<string> {
  const code = newCode();
  const record: Stored = { hash: hash(code, accountId), sentAt: Date.now() };
  await kv.set(otpKey(accountId), JSON.stringify(record));
  await kv.expire(otpKey(accountId), OTP_TTL_SEC);
  await kv.del(attemptsKey(accountId));
  return code;
}

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "wrong" | "exhausted" };

/**
 * Check a code, consuming an attempt on a wrong guess.
 *
 * "expired" covers no-code-at-all as well as a genuinely elapsed one, on
 * purpose: distinguishing them tells a caller whether an address currently has
 * a code outstanding, which is information about someone else's account.
 *
 * The correctness check happens before the attempts budget is touched at all —
 * a right answer is never at the mercy of a race on the counter, and a wrong
 * one is only ever recorded through the atomic `INCR` below.
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

  if (hashesMatch(record.hash, accountId, supplied)) {
    // Single use: this code is now spent, whatever else happens to it.
    await kv.del(otpKey(accountId));
    await kv.del(attemptsKey(accountId));
    return { ok: true };
  }

  const attempts = await kv.incr(attemptsKey(accountId));
  if (attempts === 1) {
    // Only the caller who created the key arms its TTL, so it cannot be
    // pushed out past the code's own remaining life by a later wrong guess.
    const left = Math.max(
      1,
      OTP_TTL_SEC - Math.floor((Date.now() - record.sentAt) / 1000),
    );
    await kv.expire(attemptsKey(accountId), left);
  }
  // `kv` returns null on an unreachable store rather than throwing. Treating
  // that as "wrong, not yet exhausted" matches how the rest of this codebase
  // degrades under an outage — a guess that cannot be counted is not silently
  // treated as the one that burns the code.
  if (attempts !== null && attempts >= OTP_MAX_ATTEMPTS) {
    // Burnt, not just counted. The next try needs a whole new code, which
    // costs a round trip through the send throttle.
    await kv.del(otpKey(accountId));
    await kv.del(attemptsKey(accountId));
    return { ok: false, reason: "exhausted" };
  }
  return { ok: false, reason: "wrong" };
}

/* ------------------------------------------------------------------------- *
 * Binding an address to an account that does not have one yet.
 * ------------------------------------------------------------------------- */

/**
 * A separate key family, for two independent reasons.
 *
 * **Collision.** `issueCode` overwrites `otp:<accountId>` and resets `attempts`
 * to zero. A bind code and an in-session verify code issued for the same
 * account would destroy each other, and the second one would silently hand back
 * a fresh attempt budget for the first.
 *
 * **Scope.** The stored record carries the address the code was mailed to, and
 * `checkBindCode` returns it rather than accepting one from the caller. Without
 * that, the obvious implementation — mail a code to the address in the body,
 * then confirm with `{code, email}` — lets somebody request a code for an
 * address they own and confirm with an address they do not. The address is
 * decided at send time and is not negotiable afterwards.
 */
const bindKey = (accountId: string) => `bind:${accountId}`;
/** Same reasoning as `attemptsKey` above: a separate key, incremented with `INCR`. */
const bindAttemptsKey = (accountId: string) => `bind:${accountId}:attempts`;

interface StoredBind extends Stored {
  email: string;
}

export async function issueBindCode(
  accountId: string,
  email: string,
): Promise<string> {
  const code = newCode();
  const record: StoredBind = { hash: hash(code, accountId), sentAt: Date.now(), email };
  await kv.set(bindKey(accountId), JSON.stringify(record));
  await kv.expire(bindKey(accountId), OTP_TTL_SEC);
  await kv.del(bindAttemptsKey(accountId));
  return code;
}

export type BindCheckResult =
  | { ok: true; email: string }
  | { ok: false; reason: "expired" | "wrong" | "exhausted" };

/**
 * As `checkCode`, but yields the address the code was actually sent to.
 *
 * The higher-stakes of the two: a correct guess here permanently claims an
 * address via the NX write on `email:<hash>` in `bind/confirm/route.ts`, and
 * nothing anywhere removes an entry from that index. The same atomic `INCR`
 * fix applies for the same reason — this is the code whose brute-force budget
 * a race would have been most valuable to defeat.
 */
export async function checkBindCode(
  accountId: string,
  supplied: string,
): Promise<BindCheckResult> {
  const raw = await kv.get(bindKey(accountId));
  if (!raw) return { ok: false, reason: "expired" };

  let record: StoredBind;
  try {
    record = JSON.parse(raw) as StoredBind;
  } catch {
    await kv.del(bindKey(accountId));
    return { ok: false, reason: "expired" };
  }

  if (hashesMatch(record.hash, accountId, supplied)) {
    await kv.del(bindKey(accountId));
    await kv.del(bindAttemptsKey(accountId));
    return { ok: true, email: record.email };
  }

  const attempts = await kv.incr(bindAttemptsKey(accountId));
  if (attempts === 1) {
    const left = Math.max(
      1,
      OTP_TTL_SEC - Math.floor((Date.now() - record.sentAt) / 1000),
    );
    await kv.expire(bindAttemptsKey(accountId), left);
  }
  if (attempts !== null && attempts >= OTP_MAX_ATTEMPTS) {
    await kv.del(bindKey(accountId));
    await kv.del(bindAttemptsKey(accountId));
    return { ok: false, reason: "exhausted" };
  }
  return { ok: false, reason: "wrong" };
}
