import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Razorpay, over the REST API. No SDK.
 *
 * `server-only` at the top is load-bearing, exactly as in `kv.ts`: this module
 * reads `RAZORPAY_KEY_SECRET`, and importing it from a client component would
 * inline that secret into the browser bundle — the build fails instead.
 *
 * There is an official `razorpay` npm package and this deliberately does not
 * use it. Standard Checkout needs precisely two server operations: one POST to
 * create an order, and one HMAC to verify the signature that comes back. Both
 * are below in under fifty lines. `kv.ts` hand-rolls the Upstash REST API for
 * the same reason and says so in the same words; a dependency that ships its
 * own fetch wrapper to save a `fetch` call is not worth adding to a public
 * repo's supply chain. Swapping to the SDK later changes only this file.
 */

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

export const razorpayConfigured = Boolean(KEY_ID && KEY_SECRET);

/**
 * Test keys and live keys are the same shape apart from the prefix, and the
 * difference matters to what the pricing page is allowed to claim. Anything
 * that is not unambiguously `rzp_live_` is reported as test — a malformed key
 * must never cause the site to tell someone their money is real.
 */
export type KeyMode = "test" | "live";
export function keyMode(): KeyMode | null {
  if (!razorpayConfigured) return null;
  return KEY_ID!.startsWith("rzp_live_") ? "live" : "test";
}

/** The key id, for Checkout to open with. Public by design — the secret is not. */
export const checkoutKeyId = (): string | null => KEY_ID ?? null;

/** Razorpay's floor. Below this the Orders API rejects the call outright. */
export const MIN_PAISE = 100;

/** A receipt is capped at 40 characters by the API, so this stays well inside. */
export const newReceipt = (planId: string) =>
  `cds_${planId}_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`.slice(
    0,
    40,
  );

/**
 * Redis keys for the two things a payment leaves behind: the order we quoted,
 * and the payment that settled it. They live here rather than beside the route
 * that writes them because a `route.ts` may only export request handlers —
 * Next type-checks that, and an extra export fails the build.
 */
export const pendingOrderKey = (orderId: string) => `rzp:order:${orderId}`;
export const paidKey = (orderId: string) => `rzp:paid:${orderId}`;

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
}

/**
 * Deliberately a result union rather than a thrown error: the caller has to
 * turn a failure into an HTTP status, and the status Razorpay gave us is the
 * only honest input to that. 401 means our credentials are wrong — a
 * deployment fault, not a customer one — and must not be reported as a
 * customer error.
 */
export type CreateOrderResult =
  | { ok: true; order: RazorpayOrder }
  | { ok: false; status: 401 | 500; message: string };

const API = "https://api.razorpay.com/v1";

const authHeader = () =>
  `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")}`;

export async function createOrder(input: {
  amountPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<CreateOrderResult> {
  if (!razorpayConfigured) {
    return { ok: false, status: 500, message: "Payments are not configured." };
  }
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < MIN_PAISE) {
    // Caught here as well as at the route, because a float amount reaching
    // Razorpay is the kind of bug that only shows up as a charged customer.
    return { ok: false, status: 500, message: "Invalid amount." };
  }

  let res: Response;
  try {
    res = await fetch(`${API}/orders`, {
      method: "POST",
      headers: {
        authorization: authHeader(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: input.currency ?? "INR",
        receipt: input.receipt,
        notes: input.notes,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Unlike `kv.ts`, this one does NOT fail open. A leaderboard is a
    // nice-to-have; an order is the thing a payment is tied to, and opening
    // Checkout without one produces a payment that cannot be captured and is
    // auto-refunded days later.
    return {
      ok: false,
      status: 500,
      message: "Could not reach the payment gateway. Try again in a moment.",
    };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // The gateway's own wording can name internal fields, so it goes to the
    // server log and a plain sentence goes to the customer.
    console.error(`[razorpay] create order ${res.status}: ${detail.slice(0, 400)}`);
    if (res.status === 401) {
      return {
        ok: false,
        status: 401,
        message: "Payments are misconfigured on this deployment.",
      };
    }
    return {
      ok: false,
      status: 500,
      message: "The payment gateway refused the order. Try again in a moment.",
    };
  }

  const order = (await res.json()) as RazorpayOrder;
  return { ok: true, order };
}

/**
 * The whole security model of Standard Checkout, in one function.
 *
 * Checkout hands the browser three values and the browser hands them to us; a
 * browser is not a trusted narrator, so `razorpay_payment_id` on its own proves
 * nothing. What proves it is that only Razorpay and this server know the key
 * secret, so only those two can produce this HMAC over the pair. A mismatch is
 * a forged or tampered callback and must never be treated as a payment.
 *
 * `timingSafeEqual`, not `===`: comparing a secret-derived digest with `===`
 * returns at the first differing byte and leaks, over enough attempts, how much
 * of a guess was right.
 */
export function verifyPaymentSignature(o: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!KEY_SECRET) return false;
  const expected = createHmac("sha256", KEY_SECRET)
    .update(`${o.orderId}|${o.paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(o.signature, "utf8");
  // Lengths differing is not secret — a hex digest's length is public — and
  // `timingSafeEqual` throws rather than returning false when they differ.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The webhook secret. A DIFFERENT secret from `RAZORPAY_KEY_SECRET` — it is
 * chosen when the webhook is created in the dashboard and is the only thing
 * that distinguishes a real event from a POST anybody can send to a public URL.
 */
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

export const webhookConfigured = Boolean(WEBHOOK_SECRET);

/**
 * Verify a webhook delivery.
 *
 * The digest is over the RAW request body, byte for byte. Parsing the JSON and
 * re-serialising it changes key order and whitespace and the HMAC no longer
 * matches, which is why the route reads `req.text()` and parses afterwards
 * rather than the other way round.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
