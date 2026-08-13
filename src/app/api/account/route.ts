import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { rateLimit } from "@/lib/ratelimit";
import {
  SESSION_COOKIE,
  currentAccount,
  displayName,
  SESSION_TTL_SEC,
} from "@/lib/account";

/**
 * Read-only. There is no `POST` here any more, and there must not be one again.
 *
 * What used to sit below this comment took an address from the request body,
 * claimed it with `setIfAbsent(emailKey(email), id)`, and handed back a
 * year-long session cookie — no code, no mailbox, no existing session, nothing
 * that tied the caller to the address they had typed. Two guards were bolted on
 * over time (an existing account mailed a code instead of minting a session)
 * but neither covered the case that mattered: an address nobody had registered
 * yet. Anyone could squat any address in one unauthenticated request.
 *
 * That squat is not inert, which is what made this critical rather than untidy.
 * `email:<hash>` has no TTL and nothing anywhere deletes an entry from it, so
 * when the real owner later binds their address through the OTP-verified flow,
 * `bind/confirm` finds the index already taken, reads the squatted record as
 * "your older account", moves the plan the victim has just paid for across with
 * `transferPlan`, and signs the victim into the squatter's session.
 *
 * Nothing called it. Sign-up is gone — an account is minted anonymously by
 * `/api/session/anon` the first time somebody starts a test — and attaching an
 * address is `POST /api/account/bind` + `/bind/confirm`, which prove the mailbox
 * before touching the index. The only live callers of this route send bare
 * `GET`s for whoami. So the write path was dead code with a live takeover in it,
 * and deleting it is the fix; there is nothing here to re-guard.
 */

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
