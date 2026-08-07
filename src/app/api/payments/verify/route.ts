import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/account";
import { kv } from "@/lib/kv";
import { PLANS } from "@/lib/legal";
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
 * What this does NOT do, stated plainly: it records the payment, and it does
 * not grant anything. There is no paywall in this app yet, so there is nothing
 * to unlock; inventing an entitlement here that nothing reads would be a
 * second source of truth about what someone has bought. Whatever eventually
 * gates unlimited random tests reads `rzp:paid:*`, and it belongs in the
 * change that adds the gate.
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

  let body: {
    razorpay_order_id?: unknown;
    razorpay_payment_id?: unknown;
    razorpay_signature?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

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
  await kv.setIfAbsent(paidKey(orderId), JSON.stringify(record));

  const plan = PLANS.find((p) => p.id === record.planId);

  return NextResponse.json({
    verified: true,
    orderId,
    paymentId,
    planId: record.planId,
    planName: plan?.name ?? null,
  });
}
