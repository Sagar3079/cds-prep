import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/account";
import { kv } from "@/lib/kv";
import { PLANS } from "@/lib/legal";
import { rateLimit } from "@/lib/ratelimit";
import {
  MIN_PAISE,
  checkoutKeyId,
  createOrder,
  keyMode,
  newReceipt,
  pendingOrderKey,
  razorpayConfigured,
} from "@/lib/razorpay";

/** Long enough that a payment finished on a flaky connection still finds its
 *  order, short enough that abandoned checkouts do not accumulate forever. */
const PENDING_TTL_SEC = 7 * 86400;

/**
 * Open a checkout for one plan.
 *
 * The body carries a **plan id and nothing else**. It deliberately does not
 * carry an amount: the browser is where a price would be tampered with, and a
 * request that says "monthly, 100 paise" must be impossible to express rather
 * than merely rejected. The price is read from `PLANS` — the same array the
 * pricing page renders — so the amount charged and the amount displayed cannot
 * drift apart.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "payment:order");
  if (limited) return limited;

  if (!razorpayConfigured) {
    return NextResponse.json(
      { error: "Payments are not enabled on this deployment." },
      { status: 503 },
    );
  }

  let body: { planId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const plan = PLANS.find((p) => p.id === body.planId);
  if (!plan) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }
  if (plan.paise < MIN_PAISE) {
    // Unreachable while `PLANS` holds real prices, and here so that it stays
    // unreachable: a plan edited down to ₹0 should fail on our side, loudly,
    // rather than at the gateway with a customer watching.
    return NextResponse.json(
      { error: "That plan is priced below the minimum a card payment allows." },
      { status: 400 },
    );
  }

  const acct = await currentAccount();

  const result = await createOrder({
    amountPaise: plan.paise,
    currency: "INR",
    receipt: newReceipt(plan.id),
    notes: {
      plan: plan.id,
      // Present only when signed in — practice works without an account, and
      // so does buying. This is what ties a payment to a person in the
      // dashboard when there is a person to tie it to.
      ...(acct ? { accountId: acct.id } : {}),
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  /**
   * The order, remembered.
   *
   * `/api/payments/verify` proves a payment is genuine from the signature
   * alone, which needs no stored state — so this write is allowed to fail. It
   * exists so that a verified payment can be recorded against the plan and
   * price that were actually quoted, instead of against whatever the browser
   * says afterwards. `kv` fails open and returns null when Redis is
   * unconfigured; verification still works, with less detail recorded.
   */
  await kv.set(
    pendingOrderKey(result.order.id),
    JSON.stringify({
      planId: plan.id,
      paise: plan.paise,
      currency: result.order.currency,
      accountId: acct?.id ?? null,
      createdAt: Date.now(),
    }),
  );
  await kv.expire(pendingOrderKey(result.order.id), PENDING_TTL_SEC);

  return NextResponse.json({
    orderId: result.order.id,
    amount: result.order.amount,
    currency: result.order.currency,
    /**
     * Sent from here rather than baked in as `NEXT_PUBLIC_RAZORPAY_KEY_ID`.
     * A `NEXT_PUBLIC_` value is frozen into the bundle at build time, and this
     * app is built on a box that does not always have the runtime environment
     * — a build made before the key was set would ship an empty key id and
     * fail only in front of a customer. The key id is public either way.
     */
    keyId: checkoutKeyId(),
    mode: keyMode(),
    planName: plan.name,
  });
}
