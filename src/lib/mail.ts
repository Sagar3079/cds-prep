import "server-only";
import { SITE, SUPPORT_EMAIL } from "./legal";

/**
 * Outbound mail, over Resend's REST API. No SDK, same reasoning as `kv.ts` and
 * `razorpay.ts`: sending an email here is one POST with a bearer token.
 *
 * `server-only` because this module holds the API key.
 *
 * Resend rather than the Hostinger mailbox behind `support@prepcadet.in`: a
 * one-time code is only useful if it arrives within a minute and lands in the
 * inbox. A normal IMAP mailbox sending automated mail is exactly the pattern
 * spam filters are built to catch, and its daily cap is low enough that one bad
 * afternoon would silently stop verification for everyone. The address people
 * see is still `support@prepcadet.in`, which is the one address this site uses
 * for everything.
 *
 * Everything below fails SOFT and says so in its return value. A dead mail
 * provider must never take the app down; it makes verification unavailable,
 * which the caller turns into a sentence a person can act on.
 */

const API_KEY = process.env.RESEND_API_KEY;

/** Overridable so a staging deployment can send from a domain it owns. */
const FROM = process.env.MAIL_FROM ?? `${SITE.name} <${SUPPORT_EMAIL}>`;

export const mailConfigured = Boolean(API_KEY);

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: string };

async function send(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<SendResult> {
  if (!API_KEY) return { ok: false, reason: "mail-not-configured" };

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // The provider's wording can name the account and the domain, so it goes to
    // the log; the caller gets a token it can turn into plain English.
    console.error(`[mail] send failed ${res.status}: ${detail.slice(0, 400)}`);
    return { ok: false, reason: res.status === 401 ? "bad-key" : "rejected" };
  }

  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: body.id ?? null };
}

/**
 * The verification code email.
 *
 * Deliberately plain. A one-time code has one job — be read and typed within a
 * few minutes — and every extra thing in the message (a logo, a marketing
 * footer, a tracked link) costs deliverability on the one email that cannot
 * afford to be filtered. Both parts carry the code as text, because a client
 * with images or HTML disabled must still be able to read it.
 */
export function sendVerificationCode(
  to: string,
  code: string,
  minutes: number,
): Promise<SendResult> {
  const subject = `${code} is your ${SITE.name} verification code`;
  const text = [
    `Your ${SITE.name} verification code is ${code}.`,
    ``,
    `It expires in ${minutes} minutes and can be used once.`,
    ``,
    `If you did not ask to verify an email address on ${SITE.domain}, ignore`,
    `this message — nothing has been changed on your account.`,
    ``,
    `— ${SITE.name}, ${SUPPORT_EMAIL}`,
  ].join("\n");

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">
<p>Your ${SITE.name} verification code is:</p>
<p style="font-size:30px;font-weight:700;letter-spacing:0.18em;margin:20px 0">${code}</p>
<p>It expires in ${minutes} minutes and can be used once.</p>
<p style="color:#666">If you did not ask to verify an email address on ${SITE.domain}, ignore this message — nothing has been changed on your account.</p>
<p style="color:#666">— ${SITE.name}, <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
</div>`;

  return send({ to, subject, text, html });
}
