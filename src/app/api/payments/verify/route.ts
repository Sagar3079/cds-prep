import { NextResponse } from "next/server";
import { readJsonCapped } from "@/lib/body";
import { currentAccount } from "@/lib/account";
import { kv } from "@/lib/kv";
import { PLANS, type PlanId } from "@/lib/legal";
import { grantPlan } from "@/lib/entitlement";
import { bumpAsync } from "@/lib/analytics";
import { rateLimit } from "@/lib/ratelimit";
import {
  paidKey,
  pendingOrderKey,
  razorpayConfigured,
  verifyPaymentSignature,
} from "@/lib/razorpay";

interface PendingOrder {
  planId: string;
  paise: number;
  currency: string;
  accountId: string | null;
  createdAt: number;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Confirm that a payment really happened, and record it.
 *
 * Checkout hands the browser three values on success and the browser posts
 * them here. None of them are trusted on arrival: the signature is an HMAC
 * that only Razorpay and this server can produce, and it is the only thing
 * that makes the other two mean anything. A mismatch returns 400 and writes
 * nothing — a forged POST must not be able to mark an order paid.
 *
 * A verified payment records to `rzp:paid:<order_id>` and grants the plan. The
 * webhook does exactly the same from Razorpay's side; whichever gets there
 * first does both, and the loser does neither.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "payment:verify");
  if (limited) return limited;

  if (!razorpayConfigured) {
    return NextResponse.json(
      { error: "Payments are not enabled on this deployment." },
      { status: 503 },
    );
  }

  const read = await readJsonCapped<{
    razorpay_order_id?: unknown;
    razorpay_payment_id?: unknown;
    razorpay_signature?: unknown;
  }>(req);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = read.value;

  const orderId = str(body.razorpay_order_id);
  const paymentId = str(body.razorpay_payment_id);
  const signature = str(body.razorpay_signature);

  if (!orderId || !paymentId || !signature) {
    return NextResponse.json(
      { error: "Missing payment details." },
      { status: 400 },
    );
  }

  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    // Worth a log line: a genuine Checkout callback never lands here, so every
    // one of these is either a forgery or a real bug in the flow above.
    console.error(`[razorpay] signature mismatch for order ${orderId}`);
    return NextResponse.json(
      {
        error:
          "We could not verify that payment. If money has left your account, email support and it will be sorted manually.",
      },
      { status: 400 },
    );
  }

  // Signature good — the payment is real from here down.

  const rawPending = await kv.get(pendingOrderKey(orderId));
  let pending: PendingOrder | null = null;
  if (rawPending) {
    try {
      pending = JSON.parse(rawPending) as PendingOrder;
    } catch {
      pending = null;
    }
  }

  const acct = await currentAccount();
  const record = {
    orderId,
    paymentId,
    planId: pending?.planId ?? null,
    paise: pending?.paise ?? null,
    currency: pending?.currency ?? "INR",
    // The account that created the order wins over the one holding the cookie
    // now: the browser can change hands between opening a checkout and
    // finishing one, and the buyer is whoever the order was quoted to.
    accountId: pending?.accountId ?? acct?.id ?? null,
    paidAt: Date.now(),
  };

  /**
   * NX, so a double-submit or a retried request cannot overwrite the first
   * record with a later timestamp. A second call for an order already marked
   * paid is not an error — the customer paid once and is asking again whether
   * it worked — so it still answers yes.
   */
  const firstToRecord = await kv.setIfAbsent(
    paidKey(orderId),
    JSON.stringify(record),
  );

  /**
   * `setIfAbsent` returning false is ambiguous on its own, and the ambiguity
   * matters here more than almost anywhere else in this app: it means EITHER
   * the NX write genuinely lost a race — the webhook, or a concurrent
   * `/verify` call, already recorded this exact payment, which is the normal
   * and safe case — OR the write itself never landed because the store was
   * briefly unreachable, in which case NOTHING about this payment exists
   * anywhere. A signature-valid payment with real money moved must not
   * silently vanish behind a "Payment confirmed" message just because a
   * transient Redis hiccup was indistinguishable from a race loss. One more
   * read settles which case this actually is before deciding what to tell
   * the customer.
   */
  let genuinelyRecorded = firstToRecord;
  if (!firstToRecord) {
    genuinelyRecorded = (await kv.get(paidKey(orderId))) != null;
  }
  if (!genuinelyRecorded) {
    return NextResponse.json(
      {
        error:
          "Payment taken but we couldn't confirm it just now. Email support with this order number and it will be sorted manually.",
        orderId,
        paymentId,
      },
      { status: 502 },
    );
  }

  /**
   * The point of all of this: turn a payment into access.
   *
   * Gated on `firstToRecord`, and that is load-bearing rather than tidy.
   * `grantPlan` extends from whatever is left on the account so that buying a
   * second month early adds to the first instead of discarding it — which means
   * calling it twice for ONE payment hands out sixty days for a thirty-day
   * purchase. This route and the webhook both run for the same payment in the
   * normal case, so the one that lost the race must not grant.
   *
   * Only when the order carried an account and a plan — the order route now
   * requires both, but a payment made before that rule existed, or one whose
   * pending record has expired, would have neither, and granting a plan to
   * `null` is not a thing to attempt. Those are recorded and reconciled by
   * hand, which is the honest failure.
   */
  /**
   * Counted here rather than at the webhook, and gated on the same NX write
   * that gates the grant — otherwise `verify` and the webhook would both count
   * one payment and the admin panel would report double the revenue it took.
   */
  if (firstToRecord) bumpAsync("pay:ok");

  if (firstToRecord && record.accountId && record.planId) {
    await grantPlan({
      accountId: record.accountId,
      planId: record.planId as PlanId,
      orderId,
    });
  }

  const plan = PLANS.find((p) => p.id === record.planId);

  return NextResponse.json({
    verified: true,
    orderId,
    paymentId,
    planId: record.planId,
    planName: plan?.name ?? null,
  });
}
