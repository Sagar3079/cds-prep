import { NextResponse } from "next/server";
import { readJsonCapped } from "@/lib/body";
import { currentAccount, isEmail, maskEmail, normaliseEmail } from "@/lib/account";
import { mailConfigured, sendVerificationCode } from "@/lib/mail";
import { OTP_TTL_MINUTES, issueBindCode } from "@/lib/otp";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Step one of putting an address on an account that does not have one.
 *
 * Two journeys arrive here and they are the same request:
 *
 * - **Securing a purchase.** Somebody paid on an anonymous account, and their
 *   plan currently lives on one cookie. Clearing it, or picking up a different
 *   phone, loses what they paid for.
 * - **Restoring one.** Somebody who already secured a purchase is on a new
 *   device and wants it back.
 *
 * The caller does not have to know which they are doing, and deliberately is not
 * told: this endpoint's reply is identical whether the address is free or
 * already has an account behind it. The alternative leaks whether a given
 * address is registered to anybody who can type one, and the answer is decided
 * at confirm time anyway, from state the caller cannot influence.
 *
 * Nothing is written to the account here. A code goes to the mailbox and the
 * address is parked with it; `./confirm` is the only thing that changes an
 * account. That ordering is the whole security property — see the comment there.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "verify:send");
  if (limited) return limited;

  const acct = await currentAccount();
  if (!acct) {
    return NextResponse.json(
      { error: "Take a test first — that's what creates your account." },
      { status: 401 },
    );
  }

  const read = await readJsonCapped<{ email?: unknown }>(req);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }

  if (!isEmail(read.value.email)) {
    return NextResponse.json(
      { error: "That doesn't look like an email address." },
      { status: 400 },
    );
  }
  const email = normaliseEmail(read.value.email);

  if (!mailConfigured) {
    return NextResponse.json(
      { error: "We can't send codes just now. Try again later, or email support." },
      { status: 503 },
    );
  }

  const code = await issueBindCode(acct.id, email);
  const result = await sendVerificationCode(email, code, OTP_TTL_MINUTES);

  if (!result.ok) {
    // Leave the code in place: a provider 500 is often a lie and the mail may
    // yet land, and destroying it would guarantee the retry fails too.
    return NextResponse.json(
      { error: "We couldn't send the code just now. Try again in a moment." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    sent: true,
    to: maskEmail(email),
    expiresInMinutes: OTP_TTL_MINUTES,
  });
}
