import { NextResponse } from "next/server";
import { readTextCapped } from "@/lib/body";
import { makePermanent } from "@/lib/account";
import { kv } from "@/lib/kv";
import {
  PAYMENT_RECORD_TTL_SEC,
  grantConfirmedFor,
  grantPlan,
  grantedKey,
} from "@/lib/entitlement";
import { bumpAsync } from "@/lib/analytics";
import { PLANS } from "@/lib/legal";

/** A payment.captured event is a couple of KB. This is generous, not tight. */
const MAX_WEBHOOK_BYTES = 64_000;
import {
  paidKey,
  pendingOrderKey,
  verifyWebhookSignature,
  webhookConfigured,
} from "@/lib/razorpay";

interface PendingOrder {
  planId: string;
  paise: number;
  currency: string;
  accountId: string | null;
  createdAt: number;
}

/** Razorpay's event envelope, only as far as this route reads it. */
interface WebhookEvent {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        /**
         * What `/api/payments/order` asked Razorpay to remember for us, handed
         * back on every event for the order — `accountId` and `plan`. Unknown
         * value types on purpose: this is inbound JSON, and the signature check
         * proves who sent it, not what shape it is in.
         */
        notes?: Record<string, unknown>;
      };
    };
    order?: { entity?: { id?: string } };
  };
}

/** Same shape as `/api/payments/verify`'s, for the same untrusted-JSON reason. */
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Razorpay's own account of what happened.
 *
 * `/api/payments/verify` depends on the browser surviving long enough to make
 * one more request. It usually does; when it does not — the tab is closed on
 * the "success" screen, the phone drops off the network at the bank's redirect,
 * the app is backgrounded and killed — the money has moved and nothing on this
 * side knows. That is a real refund case, not a theoretical one, and it is what
 * this endpoint exists to close: Razorpay reports the capture server to server,
 * retries until it gets a 2xx, and needs no browser at all.
 *
 * The two paths write the SAME record under the same key with `setIfAbsent`, so
 * whichever arrives first wins and the other is a no-op. That is the whole
 * reconciliation story — no reconciling job, no duplicate rows. The grant is
 * claimed separately, on `rzp:granted:*`, precisely so that losing the record
 * write is not the same thing as being told somebody else has granted.
 */
export async function POST(req: Request) {
  /**
   * Deliberately NOT rate limited, unlike every other route here. Razorpay
   * retries a non-2xx for hours, so a 429 does not shed load — it converts one
   * delivery into a retry storm and can leave a real payment unrecorded for
   * longer. The signature check below is one HMAC and rejects anything
   * unsigned, which is the cheaper and correct filter for a public URL.
   */
  if (!webhookConfigured) {
    // 503 rather than 404: Razorpay will retry, and once the secret is
    // installed a delivery that arrived during the gap still lands.
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  /**
   * The RAW body. The digest is over these exact bytes, so it must be read as
   * text and parsed afterwards — `req.json()` re-serialises and the HMAC fails.
   *
   * Capped, because this route is the one place that both accepts an unbounded
   * public POST and deliberately declines to rate limit itself. The signature
   * check is cheap, but it cannot run until the body is in memory, so without a
   * ceiling anyone who knows the URL can make this process buffer whatever they
   * like. A Razorpay event is a couple of KB; 64 is generous.
   */
  const read = await readTextCapped(req, MAX_WEBHOOK_BYTES);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const raw = read.value;

  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) {
    console.error("[razorpay] webhook signature mismatch");
    // 400, not 401: this is a malformed/forged delivery and Razorpay should not
    // keep retrying it.
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(raw) as WebhookEvent;
  } catch {
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  }

  // Only the one that means money settled. Everything else is acknowledged so
  // Razorpay stops retrying it, and ignored — subscribing to more events later
  // must not start failing deliveries here.
  if (event.event !== "payment.captured") {
    return NextResponse.json({ ok: true, ignored: event.event ?? null });
  }

  const payment = event.payload?.payment?.entity;
  const orderId = payment?.order_id;
  const paymentId = payment?.id;
  if (!orderId || !paymentId) {
    // Acknowledged, not retried: a capture with no order is not something a
    // retry will fix, and this app creates no order-less payments.
    console.error("[razorpay] payment.captured with no order_id");
    return NextResponse.json({ ok: true, ignored: "no order_id" });
  }

  const rawPending = await kv.get(pendingOrderKey(orderId));
  let pending: PendingOrder | null = null;
  if (rawPending) {
    try {
      pending = JSON.parse(rawPending) as PendingOrder;
    } catch {
      pending = null;
    }
  }

  /**
   * Who bought this, with the order's own copy as the fallback.
   *
   * `rzp:order:*` is written by `/api/payments/order` through a `kv` that fails
   * open, so a transient Redis error there leaves this route reading `null` and
   * a real payment permanently ungrantable — no account to grant to, and no
   * later delivery that would know any better. But the buyer's id was never
   * only in our store: it went to Razorpay in the order's `notes` at creation
   * and comes back on every event for that order. Nothing read it until now.
   *
   * Ours first, Razorpay's second, and that order is deliberate — the local
   * record also carries the price we quoted, and a note is a copy that cannot
   * be corrected once the order exists. The notes are trustworthy in the way
   * that matters here: they arrive inside a body this route has already
   * HMAC-verified, so they are our own values coming back, not a caller's.
   */
  const notes = payment?.notes;
  const accountId = pending?.accountId ?? str(notes?.accountId);
  const planId = pending?.planId ?? str(notes?.plan);

  /**
   * Same shape as the one `/api/payments/verify` writes, field for field, so
   * whatever reads `rzp:paid:*` never has to care which path recorded it.
   * There is no session here — a webhook carries no cookie — so the account can
   * only come from the order we quoted, which is the right source anyway.
   *
   * TTL for the same reason `/verify` now gives it one: a payment record is
   * worth keeping while its plan is live and while support might ask about it,
   * and is worth nothing forever.
   */
  const record = {
    orderId,
    paymentId,
    planId,
    paise: pending?.paise ?? payment?.amount ?? null,
    currency: pending?.currency ?? payment?.currency ?? "INR",
    accountId,
    paidAt: Date.now(),
    via: "webhook",
  };

  const won = await kv.setIfAbsent(
    paidKey(orderId),
    JSON.stringify(record),
    PAYMENT_RECORD_TTL_SEC,
  );

  /**
   * The point of all of this: turn a payment into access.
   *
   * Claimed on its own key rather than on the record write above, for the
   * reason set out at `grantedKey`: an NX write reports the same failure when
   * it loses a genuine race and when it never reached Redis, so a grant gated
   * on it can be skipped by both routes at once and never retried by anything.
   * `won` now decides only who wrote the record; this decides who grants.
   *
   * Only when the order carried an account and a plan we recognise. Granting to
   * `null` is not a thing to attempt, and no claim is taken when we cannot use
   * it — an unclaimed marker leaves a later delivery free to try again.
   */
  const plan = PLANS.find((p) => p.id === record.planId);
  if (record.planId && !plan) {
    // Unchecked, this reached `grantPlan` as a cast and was granted as
    // `days ?? 0`: an entitlement already expired at the moment it was written,
    // silently. A renamed plan id is the only way a live order gets here.
    console.error(
      `[razorpay] order ${orderId} names unknown plan "${record.planId}" — not granting`,
    );
  }

  // Stays false only when this delivery genuinely could not confirm a grant
  // it was responsible for — see the two branches below. No account / no
  // recognised plan is a reconciliation case, not a delivery failure, so it
  // leaves this at its default and still gets a 2xx.
  let grantFailed = false;
  if (record.accountId && plan) {
    const claimed = await kv.setIfAbsent(
      grantedKey(orderId),
      paymentId,
      PAYMENT_RECORD_TTL_SEC,
    );
    if (claimed) {
      try {
        // "Call before granting anything" — an anonymous account that has just
        // paid must stop carrying the ninety-day reaper TTL it was born with,
        // or the plan outlives the account it belongs to.
        await makePermanent(record.accountId);
        await grantPlan({
          accountId: record.accountId,
          planId: plan.id,
          orderId,
        });
        // Counted on the grant, not on the record write, so that one payment is
        // one count whichever route got here first and a released claim picked
        // up by the other one is not counted twice.
        bumpAsync("pay:ok");
      } catch (err) {
        // Nothing was written — `grantPlan` throws only on a read it could not
        // trust — so hand the claim back and let the next delivery try.
        await kv.del(grantedKey(orderId));
        grantFailed = true;
        console.error(
          `[razorpay] grant failed for order ${orderId} (account ${record.accountId}) — claim released for redelivery`,
          err,
        );
      }
    } else {
      /**
       * Lost the claim race — normally because `/verify` already finished,
       * which is fine: a 2xx here changes nothing and Razorpay stops
       * redelivering, correctly. But "the marker is held" also covers "held
       * by a `/verify` call that is still mid-flight, or about to fail and
       * hand it back", and answering 2xx in THAT case is the one way this
       * delivery can go quiet on a payment nobody actually granted — the
       * marker's 400-day TTL means nothing else will ever ask again. Confirm
       * before agreeing it's done.
       */
      const confirmed = await grantConfirmedFor(record.accountId, orderId);
      if (!confirmed) {
        grantFailed = true;
        console.error(
          `[razorpay] order ${orderId}: grant claim held elsewhere but not yet confirmed granted — requesting redelivery`,
        );
      }
    }
  }

  /**
   * The one case here worth a non-2xx. Razorpay redelivers until it gets a 2xx,
   * the claim was handed back above, and the payment record already exists — so
   * a retry is a genuine second attempt at the grant rather than a duplicate of
   * anything. Everything else answers 200, including a missing account and an
   * unknown plan: redelivery cannot fix either, and turning them into a retry
   * storm helps nobody.
   */
  if (grantFailed) {
    return NextResponse.json(
      { ok: false, error: "Could not grant yet — retry this delivery." },
      { status: 500 },
    );
  }

  // 200 either way. `won: false` means the browser got there first, which is
  // the normal case and is not a failure — retrying it would change nothing.
  return NextResponse.json({ ok: true, recorded: won });
}
