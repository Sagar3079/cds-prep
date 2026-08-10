import { NextResponse } from "next/server";
import {
  createAnonymousAccount,
  currentAccount,
  displayName,
  sessionCookie,
} from "@/lib/account";
import { bumpAsync } from "@/lib/analytics";
import { rateLimit } from "@/lib/ratelimit";
import { kvConfigured } from "@/lib/kv";

/**
 * Give the caller an identity they never asked for.
 *
 * Sign-up used to be the only way to become somebody here, and it cost an email
 * address — which meant the leaderboard was empty, no score outlived the
 * browser it was taken in, and there was no key to join a visit to a test to a
 * payment. This endpoint removes that cost: open a test, get an account, get a
 * name.
 *
 * **Called from the client, on purpose.** Cookies can only be set from a route
 * handler, a Server Action or middleware, and of those three only this one is
 * reached exclusively by something that runs JavaScript. Middleware would mint
 * an account for every uptime pinger, SEO crawler and vulnerability scanner
 * that touches the origin — at the observed rate of scanner traffic that is
 * several thousand permanent records a day, and the real users would be a
 * rounding error inside their own admin panel. Here, a crawler that does not
 * execute JS creates nothing.
 *
 * Idempotent: a caller who already holds a session gets it back untouched. That
 * is what keeps a genuine visitor to one account for life, and it is why the
 * rate limit below can be as tight as it is.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "anon:create");
  if (limited) return limited;

  if (!kvConfigured) {
    /**
     * Not an error the caller can do anything about, and not a reason to break
     * the daily test — which works entirely in localStorage. Say so plainly and
     * let the client decide: daily carries on, random refuses.
     */
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }

  const existing = await currentAccount();
  if (existing) {
    return NextResponse.json({
      ok: true,
      created: false,
      name: displayName(existing),
    });
  }

  const made = await createAnonymousAccount();
  if (!made) {
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }

  bumpAsync("acct:new");

  const res = NextResponse.json({
    ok: true,
    created: true,
    name: displayName(made.account),
  });
  res.cookies.set(sessionCookie(made.token));
  return res;
}
