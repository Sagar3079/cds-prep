import { NextResponse } from "next/server";
import { accountKey, currentAccount, type Account } from "@/lib/account";
import { kv, kvConfigured } from "@/lib/kv";
import { OTP_MAX_ATTEMPTS, checkCode } from "@/lib/otp";
import { rateLimit } from "@/lib/ratelimit";

const MESSAGES = {
  wrong: "That code doesn't match. Check it and try again.",
  expired: "That code has expired. Ask for a new one.",
  exhausted: `Too many wrong attempts — that code is now dead. Ask for a new one.`,
} as const;

/** Confirm a six-digit code and mark the address verified. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "verify:check");
  if (limited) return limited;

  if (!kvConfigured) {
    return NextResponse.json(
      { error: "Email verification is not available on this deployment." },
      { status: 503 },
    );
  }

  const acct = await currentAccount();
  if (!acct) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (acct.emailVerified) return NextResponse.json({ verified: true });

  let body: { code?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  // Normalised before checking: people paste codes with spaces in them, and
  // rejecting "123 456" as wrong burns one of five attempts on a formatting
  // difference nobody would call a mistake.
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) {
    return NextResponse.json(
      { error: "Enter the six digits from the email." },
      { status: 400 },
    );
  }

  const result = await checkCode(acct.id, code);
  if (!result.ok) {
    return NextResponse.json(
      { error: MESSAGES[result.reason], attemptsAllowed: OTP_MAX_ATTEMPTS },
      { status: 400 },
    );
  }

  // Re-read rather than writing the account we loaded at the top: a username
  // edit in another tab between the two must not be rolled back by this.
  const raw = await kv.get(accountKey(acct.id));
  const latest = raw ? (JSON.parse(raw) as Account) : acct;
  await kv.set(
    accountKey(acct.id),
    JSON.stringify({ ...latest, emailVerified: true }),
  );

  return NextResponse.json({ verified: true });
}
