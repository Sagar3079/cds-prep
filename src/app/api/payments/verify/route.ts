import { NextResponse } from "next/server";
import { readJsonCapped } from "@/lib/body";
import { currentAccount, makePermanent } from "@/lib/account";
import { kv } from "@/lib/kv";
import { PLANS } from "@/lib/legal";
import {
  PAYMENT_RECORD_TTL_SEC,
  grantConfirmedFor,
  grantPlan,
  grantedKey,
} from "@/lib/entitlement";
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
 * webhook does exactly the same from Razorpay's side, and the two decisions are
 * taken separately: whoever wins the record write records, and whoever wins the
 * `rzp:granted:<order_id>` claim grants. They are usually the same caller and
 * they do not have to be — see the grant block below for why one NX write
 * cannot honestly answer both questions.
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
   *
   * With a TTL rather than forever. A payment record earns its keep while the
   * plan it bought is live and while support might still be asked about it, and
   * nothing after that; unbounded, a record written by a botched deploy or some
   * long-dead edge case sits in the store for the life of the account. 400 days
   * is the figure this codebase already uses for its longest-lived keys, and the
   * grant marker below deliberately carries the same one.
   */
  const firstToRecord = await kv.setIfAbsent(
    paidKey(orderId),
    JSON.stringify(record),
    PAYMENT_RECORD_TTL_SEC,
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
   * NOT gated on `firstToRecord` any more, and that is the whole of this block.
   * `grantPlan` extends from whatever is left on the account, so calling it
   * twice for one payment hands out sixty days for a thirty-day purchase and
   * something has to make it happen exactly once. `firstToRecord` looked like
   * that something and was not: it reports a loss both when the webhook
   * genuinely recorded this payment first AND when the NX write timed out on
   * the wire after landing, and in the second case this route reported success
   * off the read above while nobody granted anything — the webhook arriving
   * later found the key present, called it a race loss, and skipped too. No
   * TTL, no retry, no trace: paid, told it worked, nothing.
   *
   * So the grant claims its own one-shot key. `grantedKey` answers only "has
   * anyone taken responsibility for granting this order", which is a question
   * the record write cannot answer for it, and whichever of the two routes runs
   * second still gets to claim it when the first never did.
   *
   * Only when the order carried an account and a plan we recognise — the order
   * route now requires both, but a payment made before that rule existed, or
   * one whose pending record has expired, would have neither, and granting a
   * plan to `null` is not a thing to attempt. The claim is deliberately not
   * taken in that case either: the webhook can recover an account from the
   * order's own notes where this route cannot, and a claim taken here would
   * lock it out of doing so. Those are recorded and reconciled by hand, which
   * is the honest failure.
   */
  const plan = PLANS.find((p) => p.id === record.planId);
  if (record.planId && !plan) {
    // A planId matching nothing in `PLANS` used to reach `grantPlan` as an
    // unchecked cast and be granted as `days ?? 0` — an entitlement that
    // expired the moment it was written, with nothing anywhere saying so. Same
    // reasoning as the signature-mismatch log above: a real checkout never
    // produces one, so every line here is a bug or a renamed plan id.
    console.error(
      `[razorpay] order ${orderId} names unknown plan "${record.planId}" — not granting`,
    );
  }

  // Stays true when there is nothing this payment needed granted (no account,
  // or an unknown plan already logged above) — that is a reconciliation case,
  // not a confirmation failure, and must not turn a real "verified: true"
  // into a false "couldn't confirm" for the customer.
  let granted = true;
  if (record.accountId && plan) {
    const claimed = await kv.setIfAbsent(
      grantedKey(orderId),
      paymentId,
      PAYMENT_RECORD_TTL_SEC,
    );
    if (claimed) {
      try {
        // Documented as "call before granting anything", and never once called
        // from a payment path: an anonymous account that has just paid was
        // still carrying the ninety-day reaper TTL it was born with, so a plan
        // could outlive the account holding it.
        await makePermanent(record.accountId);
        await grantPlan({
          accountId: record.accountId,
          planId: plan.id,
          orderId,
        });
        /**
         * Counted on the grant rather than on the record write, so that one
         * payment is one count no matter which route got here first, and so
         * that a claim handed back below is not counted twice when the webhook
         * picks it up. The cost is that a payment nobody could grant never
         * reaches this counter — those are the rows the admin panel already
         * flags as orphaned, and they are a reconciliation case rather than a
         * conversion.
         */
        bumpAsync("pay:ok");
      } catch (err) {
        /**
         * The grant did not happen, so the marker must stop claiming it did.
         * `grantPlan` only throws where it has written nothing — on a read it
         * could not trust, before any write — so handing the claim back costs
         * nothing and is exactly what lets the webhook, seconds behind at
         * worst, grant instead. Held, this order becomes the permanent
         * no-plan case this whole block exists to prevent.
         */
        await kv.del(grantedKey(orderId));
        granted = false;
        console.error(
          `[razorpay] grant failed for order ${orderId} (account ${record.accountId}) — claim released for the webhook`,
          err,
        );
      }
    } else {
      /**
       * Lost the claim race — almost always because the webhook (or an
       * earlier `/verify` call for the same order) already finished, which is
       * fine and common. But "the marker is held" and "the marker is held by
       * something that hasn't finished, or already failed and is a heartbeat
       * from releasing it" look identical from here, and this route only gets
       * to answer the customer once. Confirm the grant actually landed before
       * saying so.
       */
      granted = await grantConfirmedFor(record.accountId, orderId);
      if (!granted) {
        console.error(
          `[razorpay] order ${orderId}: grant claim held elsewhere but not yet confirmed granted`,
        );
      }
    }
  }

  if (!granted) {
    // Same shape as the record-write ambiguity above: money moved, this
    // request cannot vouch that a plan came out the other end, and "verified:
    // true" would be a promise this route isn't in a position to make. The
    // webhook (or a support ticket) is what resolves it from here.
    return NextResponse.json(
      {
        error:
          "Payment taken but we couldn't confirm your plan just now. Email support with this order number and it will be sorted manually.",
        orderId,
        paymentId,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    verified: true,
    orderId,
    paymentId,
    planId: record.planId,
    planName: plan?.name ?? null,
  });
}
