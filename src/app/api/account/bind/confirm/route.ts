import { NextResponse } from "next/server";
import { readJsonCapped } from "@/lib/body";
import {
  accountKey,
  currentAccount,
  displayName,
  emailKey,
  makePermanent,
  newToken,
  SESSION_TTL_SEC,
  sessionCookie,
  sessionKey,
  type Account,
} from "@/lib/account";
import { bumpAsync } from "@/lib/analytics";
import { transferPlan } from "@/lib/entitlement";
import { kv } from "@/lib/kv";
import { OTP_MAX_ATTEMPTS, checkBindCode } from "@/lib/otp";
import { rateLimit } from "@/lib/ratelimit";

const MESSAGES = {
  wrong: "That code doesn't match. Check it and try again.",
  expired: "That code has expired. Ask for a new one.",
  exhausted: "Too many wrong attempts — that code is now dead. Ask for a new one.",
} as const;

/**
 * Step two: prove the mailbox, then attach the address.
 *
 * **The code is checked before anything is written, and that ordering is the
 * point.** `email:<hash>` is written NX and has no TTL — whoever lands in it
 * owns that address on this site permanently, and there is no code anywhere
 * that removes one. So an implementation that reserved the index first and
 * verified afterwards would let anybody type a stranger's address and lock the
 * real owner out for good, with no recovery path short of hand-editing Redis.
 * Nothing here touches the index until the mailbox has answered.
 *
 * The address comes from the stored bind record, never from this request body —
 * otherwise a caller could take a code mailed to an address they own and
 * confirm it against one they do not.
 *
 * Two outcomes, decided by whether the proven address already has an account:
 *
 * - **Free** — it becomes this account's address. The record stops being
 *   disposable and its TTL is dropped.
 * - **Taken** — this is a returning customer on a new device. They are signed
 *   in as the older account, and any plan sitting on the anonymous one they are
 *   leaving behind moves across with them. Signing them in and stranding the
 *   plan would defeat the entire purpose of the prompt that sent them here.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "verify:check");
  if (limited) return limited;

  const acct = await currentAccount();
  if (!acct) {
    return NextResponse.json({ error: "Session expired. Start again." }, { status: 401 });
  }

  const read = await readJsonCapped<{ code?: unknown }>(req);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const code = read.value.code;
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    return NextResponse.json({ error: "Enter the six-digit code." }, { status: 400 });
  }

  const checked = await checkBindCode(acct.id, code.trim());
  if (!checked.ok) {
    return NextResponse.json(
      { error: MESSAGES[checked.reason], attemptsAllowed: OTP_MAX_ATTEMPTS },
      { status: 400 },
    );
  }

  const email = checked.email;
  const ekey = emailKey(email);

  /**
   * Claim the index first, account blob second.
   *
   * If the blob were written first and the NX claim then lost a race, two
   * account records would name the same address while only one is reachable
   * through the index — and the loser could never sign in again, because
   * sign-in resolves by index. Claiming first means the loser simply falls
   * through to the restore path below, which is the correct outcome anyway.
   */
  const won = await kv.setIfAbsent(ekey, acct.id);

  if (won) {
    const updated: Account = {
      ...acct,
      email,
      emailVerified: true,
      anonymous: false,
    };
    await kv.set(accountKey(acct.id), JSON.stringify(updated));
    // No longer disposable: drop the ninety-day reaper TTL.
    await makePermanent(acct.id);
    bumpAsync("bind:ok");
    return NextResponse.json({
      ok: true,
      outcome: "bound",
      name: displayName(updated),
    });
  }

  const ownerId = await kv.get(ekey);
  if (!ownerId) {
    /**
     * The index says taken but will not say by whom. That is the crash window
     * between claiming an address and writing its account record, and it is
     * unreachable state rather than anything the caller did.
     */
    return NextResponse.json(
      { error: "Something went wrong attaching that address. Email support and it'll be sorted." },
      { status: 500 },
    );
  }

  if (ownerId === acct.id) {
    // Already this account's address — a double-submitted form, or a retry.
    return NextResponse.json({ ok: true, outcome: "bound", name: displayName(acct) });
  }

  // Returning customer. Move anything they paid for across before switching them.
  const moved = await transferPlan(acct.id, ownerId);

  const ownerRaw = await kv.get(accountKey(ownerId));
  if (!ownerRaw) {
    return NextResponse.json(
      { error: "That account couldn't be loaded. Email support and it'll be sorted." },
      { status: 500 },
    );
  }
  let owner: Account;
  try {
    owner = JSON.parse(ownerRaw) as Account;
  } catch {
    return NextResponse.json(
      { error: "That account couldn't be loaded. Email support and it'll be sorted." },
      { status: 500 },
    );
  }

  /**
   * Confirming a code from that mailbox proves ownership, which is the same
   * evidence `/api/account/claim` accepts for the same conclusion. An older
   * record that never finished verifying is verified now.
   */
  if (!owner.emailVerified || owner.anonymous) {
    owner = { ...owner, emailVerified: true, anonymous: false };
    await kv.set(accountKey(ownerId), JSON.stringify(owner));
    await makePermanent(ownerId);
  }

  const token = newToken();
  await kv.set(sessionKey(token), ownerId);
  void kv.expire(sessionKey(token), SESSION_TTL_SEC);

  bumpAsync("restore:ok");

  const res = NextResponse.json({
    ok: true,
    outcome: "restored",
    name: displayName(owner),
    planMoved: Boolean(moved),
  });
  res.cookies.set(sessionCookie(token));
  return res;
}
