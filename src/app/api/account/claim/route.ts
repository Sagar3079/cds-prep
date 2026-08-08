import { NextResponse } from "next/server";
import { readJsonCapped } from "@/lib/body";
import { kv, kvConfigured } from "@/lib/kv";
import { OTP_MAX_ATTEMPTS, checkCode } from "@/lib/otp";
import { rateLimit } from "@/lib/ratelimit";
import {
  SESSION_COOKIE,
  SESSION_TTL_SEC,
  accountKey,
  displayName,
  emailKey,
  isEmail,
  newToken,
  normaliseEmail,
  sessionKey,
  type Account,
} from "@/lib/account";

/**
 * Trade a six-digit code for a session on an address that already has an
 * account — signing back in from a new device, in other words.
 *
 * This is the other half of the takeover fix in `../route.ts`. `POST
 * /api/account` will no longer hand a session to whoever types an existing
 * address; it sends a code instead, and this endpoint is the only way that code
 * becomes a cookie. The proof of ownership therefore sits between the claim and
 * the session, which is exactly where it was missing before.
 *
 * Succeeding here also marks the address verified. It is the same evidence
 * `/api/account/verify/check` accepts for the same conclusion — a code that only
 * the mailbox received came back — and refusing to draw it twice would leave
 * somebody who verified on their phone unverified on their laptop.
 */

const MESSAGES = {
  wrong: "That code doesn't match. Check it and try again.",
  expired: "That code has expired. Ask for a new one.",
  exhausted: "Too many wrong attempts — that code is now dead. Ask for a new one.",
} as const;

export async function POST(req: Request) {
  const limited = await rateLimit(req, "verify:check");
  if (limited) return limited;

  if (!kvConfigured) {
    return NextResponse.json(
      { error: "Accounts are not configured on this deployment." },
      { status: 503 },
    );
  }

  const read = await readJsonCapped<{ email?: unknown; code?: unknown }>(req);
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

  // Same normalisation `verify/check` does, and for the same reason: people
  // paste codes with spaces in them, and spending one of five attempts on a
  // formatting difference is not a mistake anybody would recognise as theirs.
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) {
    return NextResponse.json(
      { error: "Enter the six digits from the email." },
      { status: 400 },
    );
  }

  const id = await kv.get(emailKey(email));
  const raw = id ? await kv.get(accountKey(id)) : null;

  /**
   * No account on that address reports "expired", the same words a real but
   * elapsed code gets. Saying "no such account" here would turn this endpoint
   * into an address oracle that answers faster and without a mail round trip —
   * and unlike the sign-up form, this one can be asked about any address at all.
   */
  if (!id || !raw) {
    return NextResponse.json(
      { error: MESSAGES.expired, attemptsAllowed: OTP_MAX_ATTEMPTS },
      { status: 400 },
    );
  }

  const result = await checkCode(id, code);
  if (!result.ok) {
    return NextResponse.json(
      { error: MESSAGES[result.reason], attemptsAllowed: OTP_MAX_ATTEMPTS },
      { status: 400 },
    );
  }

  let acct: Account;
  try {
    acct = JSON.parse(raw) as Account;
  } catch {
    return NextResponse.json(
      { error: "That account couldn't be read. Email support." },
      { status: 500 },
    );
  }

  // The code proved the mailbox, so the address is verified from here on.
  acct = { ...acct, emailVerified: true };
  await kv.set(accountKey(id), JSON.stringify(acct));

  const token = newToken();
  await kv.set(sessionKey(token), id);
  await kv.expire(sessionKey(token), SESSION_TTL_SEC);

  const res = NextResponse.json({
    signedIn: true,
    name: displayName(acct),
    hasUsername: Boolean(acct.username),
    emailVerified: true,
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
