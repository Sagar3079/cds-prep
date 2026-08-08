import { NextResponse } from "next/server";
import { currentAccount, maskEmail } from "@/lib/account";
import { kvConfigured } from "@/lib/kv";
import { mailConfigured, sendVerificationCode } from "@/lib/mail";
import { OTP_TTL_MINUTES, issueCode } from "@/lib/otp";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Send a verification code to the address on the signed-in account.
 *
 * The address is taken from the SESSION, never from the request body. A body
 * field would turn this into an open form for mailing arbitrary strangers from
 * our domain, which costs somebody an unwanted email and costs us the sending
 * reputation that makes the next code arrive at all.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "verify:send");
  if (limited) return limited;

  if (!kvConfigured || !mailConfigured) {
    return NextResponse.json(
      { error: "Email verification is not available on this deployment." },
      { status: 503 },
    );
  }

  const acct = await currentAccount();
  if (!acct) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (acct.emailVerified) {
    // Not an error — a second tab, or a refresh after verifying.
    return NextResponse.json({ sent: false, alreadyVerified: true });
  }

  const code = await issueCode(acct.id);
  const result = await sendVerificationCode(acct.email, code, OTP_TTL_MINUTES);

  if (!result.ok) {
    // The code is left in place: the mail may yet arrive (a provider 500 is
    // often a lie), and destroying it would guarantee the retry fails too.
    return NextResponse.json(
      {
        error:
          "We couldn't send the code just now. Try again in a moment, or email support.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    sent: true,
    // The address, masked. Enough to spot a typo, not enough to hand the whole
    // address to whoever is holding the cookie.
    to: maskEmail(acct.email),
    expiresInMinutes: OTP_TTL_MINUTES,
  });
}
