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

  /**
   * The actual gate, mirroring `../route.ts`. This module's own docstring
   * says this file is the sole place an account is mutated, so this is where
   * the invariant has to be enforced even though `/bind` checks it too — a
   * caller who somehow reaches this endpoint with a pending code from before
   * their account last verified must not be allowed to silently re-point the
   * permanent `email:<hash>` index at a second address. See `../route.ts` for
   * why that would be irreversible.
   */
  if (acct.emailVerified) {
    return NextResponse.json(
      { error: "This account already has an email attached. Contact support to change it." },
      { status: 409 },
    );
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

  /**
   * Load and validate the owner account BEFORE touching anything of this
   * caller's own. `transferPlan` below is what deletes `acct.id`'s plan as
   * part of moving it — it used to run first, so if the owner record then
   * turned out unloadable, the caller's own plan was already gone, the
   * response was a 500, and nobody was signed in to receive what had just
   * been taken from them. Validating first means that failure costs nothing
   * beyond the one request: `acct.id`'s plan stays put, and the caller can
   * simply try again once the owner record exists.
   */
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
   * evidence `/api/account/verify/check` accepts for the same conclusion. An
   * older record that never finished verifying is verified now. (This used to
   * name `/api/account/claim`; that route is gone — see `../../route.ts`.)
   */
  if (!owner.emailVerified || owner.anonymous) {
    owner = { ...owner, emailVerified: true, anonymous: false };
    await kv.set(accountKey(ownerId), JSON.stringify(owner));
    await makePermanent(ownerId);
  }

  // The owner account is confirmed loadable — only now is it safe to move
  // anything the caller paid for across, since this is the step that deletes
  // it from `acct.id`.
  //
  // `transferPlan` now throws rather than silently truncating a balance when
  // it can't tell "the owner has no plan" from "the read failed" (see
  // entitlement.ts's `activePlanStrict`). Uncaught, that was a 500 with no
  // session cookie set — the caller ends up signed into neither account,
  // holding a code that has already been spent (`checkBindCode` is single-use
  // above this point), unable to retry. Caught here, `acct.id`'s plan is
  // provably untouched (the strict read throws before anything is written),
  // so the honest answer is the same "try again" 500 the owner-load failure
  // above already gives — nothing was moved, nothing was lost.
  let moved: Awaited<ReturnType<typeof transferPlan>>;
  try {
    moved = await transferPlan(acct.id, ownerId);
  } catch {
    // Two different failures inside `transferPlan` land here, and both leave
    // `acct.id`'s plan provably untouched (it throws before writing anything)
    // — but the code the confirmed address just spent is single-use, so
    // "try again" costs a fresh one against a 3/hour send limit. Worth saying
    // plainly rather than blaming the account load, which this may not be.
    return NextResponse.json(
      {
        error:
          "Your account is fine, but the transfer couldn't be confirmed. Email support and it'll be sorted.",
      },
      { status: 500 },
    );
  }

  /**
   * `setEx`, so the key cannot outlive its expiry. The TTL was a separate,
   * unawaited `expire` — and `kv` reports no failure it ever suffers — so a
   * dropped second call left an immortal `sess:` key behind, which for a
   * session is worse than a leak: it is a cookie that stays valid for as long
   * as Redis lives, on the one account here that holds a paid plan.
   */
  const token = newToken();
  await kv.setEx(sessionKey(token), SESSION_TTL_SEC, ownerId);

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
