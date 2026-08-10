import { NextResponse } from "next/server";
import { readJsonCapped } from "@/lib/body";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { kv, kvConfigured } from "@/lib/kv";
import { mailConfigured, sendVerificationCode } from "@/lib/mail";
import { OTP_TTL_MINUTES, issueCode } from "@/lib/otp";
import { rateLimit } from "@/lib/ratelimit";
import {
  SESSION_COOKIE,
  accountKey,
  currentAccount,
  displayName,
  emailKey,
  isEmail,
  maskEmail,
  newToken,
  normaliseEmail,
  sessionKey,
  SESSION_TTL_SEC,
  type Account,
} from "@/lib/account";

/** Who am I? Used by the leaderboard to highlight your own row. */
export async function GET(req: Request) {
  const limited = await rateLimit(req, "account:read");
  if (limited) return limited;

  const acct = await currentAccount();
  if (!acct) return NextResponse.json({ signedIn: false });

  const res = NextResponse.json({
    signedIn: true,
    name: displayName(acct),
    hasUsername: Boolean(acct.username),
    emailVerified: acct.emailVerified,
    /**
     * Whether there is an address at all — not what it is. Every account now
     * starts without one, so "signed in" no longer implies "recoverable", and
     * the post-payment prompt and the settings restore panel both need to know
     * which. Still no address in the response: this route has never returned
     * one, and a caller holding the cookie has not proved they own it.
     */
    hasEmail: Boolean(acct.email),
  });

  /**
   * Re-stamp the cookie with a fresh year.
   *
   * `currentAccount()` already slid the server half; this is the browser half,
   * and both have to move or the shorter one decides. A cookie's max-age is
   * fixed when it is written, so without this the session would still expire a
   * year after sign-up however recently it was used — the exact bug the server
   * side just avoided.
   */
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SEC,
    });
  }
  return res;
}

/**
 * Sign up on a new address, or begin signing back in on one that already exists.
 *
 * The rule this endpoint now enforces, and the reason it changed: **claiming an
 * address that already has an account never mints a session here.** It used to.
 * The comment that stood in this place said "once verification lands, this
 * endpoint must require it" — verification landed with the six-digit codes and
 * this endpoint was not updated, which left a full account takeover open for
 * anyone who could type a stranger's email. Because the account record was
 * spread into the response (`{...prev}`), the forged session inherited the
 * victim's verified status and, with it, their paid entitlement.
 *
 * So there are two paths:
 *
 * - **No account on that address** — created, and a session is handed back as
 *   before. There is genuinely nothing to protect yet: the address is unproven,
 *   the account holds nothing, and the leaderboard treats a name as a label
 *   rather than as an identity.
 * - **An account already exists** — a code goes to the address and the caller
 *   gets `needsCode`, not a cookie. `POST /api/account/claim` trades that code
 *   for the session. The one exception is a caller who already holds a valid
 *   session for that same account, who is not claiming anything and is usually
 *   just editing a username.
 *
 * Known and accepted: the two paths are distinguishable, so this reveals whether
 * an address is registered. That is the same signal every sign-in form gives and
 * it is a far smaller problem than the one it replaces.
 */
export async function POST(req: Request) {
  // Before parsing: a malformed body is as good a way to spam sign-ups as a
  // valid one, so the throttle must not sit behind validation.
  const limited = await rateLimit(req, "account:create");
  if (limited) return limited;

  if (!kvConfigured) {
    return NextResponse.json(
      { error: "Accounts are not configured on this deployment." },
      { status: 503 },
    );
  }

  const read = await readJsonCapped<{ email?: unknown; username?: unknown }>(req);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = read.value;

  if (!isEmail(body.email)) {
    return NextResponse.json(
      { error: "That doesn't look like an email address." },
      { status: 400 },
    );
  }
  const email = normaliseEmail(body.email);

  let username: string | undefined;
  if (typeof body.username === "string" && body.username.trim()) {
    username = body.username.trim().slice(0, 24);
    if (!/^[\p{L}\p{N} ._-]+$/u.test(username)) {
      return NextResponse.json(
        { error: "Usernames can use letters, numbers, spaces, . _ and - only." },
        { status: 400 },
      );
    }
  }

  const ekey = emailKey(email);
  let id = await kv.get(ekey);

  if (!id) {
    id = randomBytes(9).toString("base64url");
    // NX so two submissions racing on the same address cannot mint two accounts.
    const won = await kv.setIfAbsent(ekey, id);
    if (!won) id = (await kv.get(ekey)) ?? id;
  }

  const existingRaw = await kv.get(accountKey(id));

  /**
   * The takeover gate. An existing account is only handed straight back to a
   * caller who is already signed in as it; anyone else has to prove the address
   * is theirs first, whatever they typed in the form.
   */
  if (existingRaw) {
    const me = await currentAccount();
    if (me?.id !== id) {
      if (!mailConfigured) {
        return NextResponse.json(
          {
            error:
              "That address already has an account, and signing back in needs an emailed code — which isn't configured on this deployment.",
          },
          { status: 503 },
        );
      }

      // Two throttles, deliberately. `account:create` above caps how often this
      // endpoint may be poked at all; this one caps how often it may put mail in
      // somebody else's inbox, and it is the tighter of the two. Without it this
      // path would be a looser way to do exactly what `verify:send` exists to
      // limit.
      const mailLimited = await rateLimit(req, "verify:send");
      if (mailLimited) return mailLimited;

      const code = await issueCode(id);
      const sent = await sendVerificationCode(email, code, OTP_TTL_MINUTES);
      if (!sent.ok) {
        return NextResponse.json(
          {
            error:
              "We couldn't send the code just now. Try again in a moment, or email support.",
          },
          { status: 502 },
        );
      }

      return NextResponse.json({
        signedIn: false,
        needsCode: true,
        to: maskEmail(email),
        expiresInMinutes: OTP_TTL_MINUTES,
      });
    }
  }

  let acct: Account;
  if (existingRaw) {
    const prev = JSON.parse(existingRaw) as Account;
    acct = { ...prev, username: username ?? prev.username };
  } else {
    acct = {
      id,
      email,
      username,
      createdAt: Date.now(),
      emailVerified: false,
    };
  }
  await kv.set(accountKey(id), JSON.stringify(acct));

  const token = newToken();
  await kv.set(sessionKey(token), id);
  await kv.expire(sessionKey(token), SESSION_TTL_SEC);

  const res = NextResponse.json({
    signedIn: true,
    name: displayName(acct),
    hasUsername: Boolean(acct.username),
    emailVerified: acct.emailVerified,
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  return res;
}
