import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { kv, kvConfigured } from "@/lib/kv";
import { rateLimit } from "@/lib/ratelimit";
import {
  SESSION_COOKIE,
  accountKey,
  currentAccount,
  displayName,
  emailKey,
  isEmail,
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
 * Sign up, or sign back in on the same address.
 *
 * There is no password and email ownership is NOT proven — verification is a
 * later step, as asked. That has a consequence worth being explicit about:
 * anyone can claim any address, so the account is only as trustworthy as the
 * cookie it hands back, and the leaderboard must treat a name as a label rather
 * than an identity. It is deliberately not possible to sign in as an existing
 * account from a new device this way — a fresh POST for an address that already
 * exists returns the same account only because there is nothing yet to protect;
 * once verification lands, this endpoint must require it.
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

  let body: { email?: unknown; username?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

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
