import { NextResponse } from "next/server";
import { readJsonCapped } from "@/lib/body";
import { currentAccount } from "@/lib/account";
import { kv, kvConfigured } from "@/lib/kv";
import { PLANS } from "@/lib/legal";
import { rateLimit } from "@/lib/ratelimit";
import { bumpAsync } from "@/lib/analytics";
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

  /**
   * No store, no checkout — even though Razorpay alone could take the money.
   *
   * Everything that makes a payment mean something lives in Redis: the pending
   * order, the captured-payment record, and the entitlement itself. `kv` fails
   * open, so with it unconfigured every one of those writes silently returns
   * null while the charge goes through perfectly. The customer is billed, the
   * plan is never granted, and there is no server-side trace to reconcile from
   * — the worst of the three possible outcomes. Refusing to open the checkout at
   * all is the only one that cannot take somebody's money for nothing.
   *
   * This catches the deployment being misconfigured, which is the case that
   * lasts. A Redis that is configured but unreachable mid-payment is a different
   * problem, and the webhook — which Razorpay retries — is what covers it.
   */
  if (!kvConfigured) {
    return NextResponse.json(
      {
        error:
          "Payments are briefly unavailable on this deployment. Nothing has been charged — please try again shortly.",
      },
      { status: 503 },
    );
  }

  const read = await readJsonCapped<{ planId?: unknown }>(req);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = read.value;

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

  /**
   * Buying requires an account. It no longer requires a verified email.
   *
   * The rule this replaces was: signed in AND verified, on the reasoning that a
   * plan is access granted to somebody and an anonymous payment has no somebody
   * to grant it to. The first live payment this app took landed with
   * `accountId: null` and could not have unlocked anything for anyone.
   *
   * That reasoning was right about the disease and wrong about the cure. What
   * broke that payment was the *missing account*, not the missing address — and
   * every visitor now has an account before they can reach a checkout button,
   * so `accountId` is never null again. Demanding a verified email on top meant
   * demanding a signup, a mailbox and a six-digit code from somebody holding a
   * card, which is three chances to leave.
   *
   * What the address was actually protecting is recoverability: a plan on an
   * anonymous account lives on one cookie, and a cleared cookie loses it. That
   * protection moved to where it costs nothing to convert — the bind prompt
   * shown immediately after a successful payment (`CheckoutButton`), and the
   * restore path in settings. The trade is deliberate: a small window in which
   * a purchase is device-bound, against a checkout somebody will actually
   * finish. Anyone who does lose one can restore it by binding the address
   * later, and the admin panel lists every payment whose account holds no live
   * plan so an orphan is visible rather than silent.
   */
  const acct = await currentAccount();
  if (!acct) {
    return NextResponse.json(
      {
        error:
          "Your session isn't set up yet — take a test first, or switch cookies on if they're blocked.",
        need: "sign-in",
      },
      { status: 401 },
    );
  }

  const result = await createOrder({
    amountPaise: plan.paise,
    currency: "INR",
    receipt: newReceipt(plan.id),
    notes: {
      plan: plan.id,
      // Always present now that buying requires an account: this is what ties
      // a payment to a person, in the Razorpay dashboard and in our own store.
      accountId: acct.id,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  /**
   * A checkout opened. The denominator for conversion.
   *
   * `rzp:order:*` records this too, but only for seven days and only as a
   * count of keys — it cannot say which day an order was started once it has
   * expired, so a trend needs its own counter.
   */
  bumpAsync("pay:order");

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
      accountId: acct.id,
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
