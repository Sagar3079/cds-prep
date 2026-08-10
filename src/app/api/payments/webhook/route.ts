import { NextResponse } from "next/server";
import { readTextCapped } from "@/lib/body";
import { kv } from "@/lib/kv";
import { grantPlan } from "@/lib/entitlement";
import { bumpAsync } from "@/lib/analytics";
import type { PlanId } from "@/lib/legal";

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
      entity?: { id?: string; order_id?: string; amount?: number; currency?: string };
    };
    order?: { entity?: { id?: string } };
  };
}

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
 * reconciliation story — no reconciling job, no duplicate rows.
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
   * Same shape as the one `/api/payments/verify` writes, field for field, so
   * whatever reads `rzp:paid:*` never has to care which path recorded it.
   * There is no session here — a webhook carries no cookie — so the account can
   * only come from the order we quoted, which is the right source anyway.
   */
  const record = {
    orderId,
    paymentId,
    planId: pending?.planId ?? null,
    paise: pending?.paise ?? payment?.amount ?? null,
    currency: pending?.currency ?? payment?.currency ?? "INR",
    accountId: pending?.accountId ?? null,
    paidAt: Date.now(),
    via: "webhook",
  };

  const won = await kv.setIfAbsent(paidKey(orderId), JSON.stringify(record));

  /**
   * Counted on the same NX write that gates the grant below. This route and
   * `verify` both run for the same payment in the normal case, so counting
   * outside this guard would report twice the revenue actually taken.
   */
  if (won) bumpAsync("pay:ok");

  /**
   * The point of all of this: turn a payment into access.
   *
   * Only when the order carried an account and a plan — the order route now
   * requires both, but a payment made before that rule existed, or one whose
   * pending record has expired, would have neither, and granting a plan to
   * `null` is not a thing to attempt. Those are recorded and reconciled by
   * hand, which is the honest failure.
   */
  if (won && record.accountId && record.planId) {
    await grantPlan({
      accountId: record.accountId,
      planId: record.planId as PlanId,
      orderId,
    });
  }


  // 200 either way. `won: false` means the browser got there first, which is
  // the normal case and is not a failure — retrying it would change nothing.
  return NextResponse.json({ ok: true, recorded: won });
}
