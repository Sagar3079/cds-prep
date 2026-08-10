import type { Metadata } from "next";
import Link from "next/link";
import CheckoutButton from "@/components/CheckoutButton";
import {
  BILLING_LIVE,
  FREE_RANDOM_PER_DAY,
  LAST_UPDATED,
  PLANS,
  REFUND_ELIGIBILITY_DAYS,
  SUPPORT_EMAIL,
  rupees,
} from "@/lib/legal";
import { keyMode } from "@/lib/razorpay";
import { pageMetadata } from "@/lib/pageMeta";

export const metadata: Metadata = pageMetadata({
  path: "/pricing",
  title: "Pricing",
  description:
    "What CDS Prep costs. Today's test is free. Weekly ₹49, monthly ₹149, in Indian Rupees, inclusive of taxes.",
});

/**
 * Rendered per request rather than at build time, solely so that whether
 * checkout appears is decided by the environment the server is running in.
 * Prerendered, this page would freeze the answer at build — turn payments on
 * afterwards and the buttons stay missing until someone rebuilds, with nothing
 * failing to say why. It is a low-traffic page and the render is cheap.
 */
export const dynamic = "force-dynamic";

const FREE_INCLUDES = [
  "One ten-question English set every day",
  "One ten-question General Knowledge set every day",
  `${FREE_RANDOM_PER_DAY} extra random tests a day, drawn from the whole bank`,
  "Real marking — +1, −0.25, 0 — on a ten-minute clock",
  "Full review with the answer and an explanation",
  "Streaks, accuracy, and per-topic history",
  "The daily leaderboard",
];

const PAID_ADDS = [
  "Unlimited random sets, any time of day",
  "Drawn from the whole bank, not just today's window",
  "Weighted towards the topics you keep getting wrong",
];

/**
 * The prices, on a page of their own.
 *
 * It exists for two readers at once. A candidate wants to know what they get;
 * a payment gateway's reviewer wants the amount, the currency, the tax
 * position and the billing period stated unambiguously in one place. Both are
 * served by the same page, and the numbers come from `legal.ts` — the same
 * array the in-app plan sheet reads, so the two can never disagree.
 */
export default function PricingPage() {
  /**
   * Whether a card can actually be taken, read from the gateway credentials
   * rather than from `BILLING_LIVE`.
   *
   * The two are deliberately separate. `BILLING_LIVE` governs what every policy
   * page *claims*, and with test keys installed the honest claim is still "not
   * live" — no real money can move. `mode` governs whether the buttons render.
   * Flipping `BILLING_LIVE` belongs in the commit that installs a `rzp_live_`
   * key, not this one.
   */
  const mode = keyMode();

  return (
    <div className="space-y-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Pricing
        </h1>
        <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">
          Today&apos;s test is free and stays free. A plan adds unlimited random
          practice.
        </p>
      </header>

      {mode === null && !BILLING_LIVE && (
        <p className="legal-note">
          <strong>Payments are not live yet.</strong> Nothing on this page can
          be bought today, and the app asks for no card or UPI details anywhere.
          The prices below are what plans will cost when billing opens.
        </p>
      )}

      {/* Billing is switched on but this server has no gateway credentials —
          the window between the claim going up and the keys landing on the
          box. Saying nothing here leaves someone who has just read the terms
          staring at a price with no way to pay it and no idea why. */}
      {mode === null && BILLING_LIVE && (
        <p className="legal-note">
          <strong>Checkout is briefly unavailable.</strong> The prices below are
          correct and nothing has been charged. Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> if it is still
          unavailable when you come back.
        </p>
      )}

      {mode === "test" && (
        <p className="legal-note">
          <strong>Checkout is in test mode.</strong> The buttons below open a
          real payment window, but the gateway is running on test credentials —
          no money moves and no real card is charged. Use Razorpay&apos;s test
          card <span className="tabular-nums">4111 1111 1111 1111</span> with
          any future expiry and any CVV.
        </p>
      )}

      <section className="card space-y-3" aria-labelledby="free-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="free-heading" className="text-base font-extrabold text-ink">
            Daily practice
          </h2>
          <span className="text-lg font-extrabold text-ink">Free</span>
        </div>
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          No account needed. No card, ever.
        </p>
        <ul className="space-y-1.5">
          {FREE_INCLUDES.map((line) => (
            <li
              key={line}
              className="flex gap-2 text-[0.8125rem] leading-relaxed text-muted"
            >
              <span aria-hidden="true" className="text-ok-ink font-bold">
                ✓
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3" aria-labelledby="plans-heading">
        <div>
          <h2 id="plans-heading" className="text-base font-extrabold text-ink">
            Unlimited random tests
          </h2>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
            Everything above, plus:
          </p>
        </div>
        <ul className="space-y-1.5">
          {PAID_ADDS.map((line) => (
            <li
              key={line}
              className="flex gap-2 text-[0.8125rem] leading-relaxed text-muted"
            >
              <span aria-hidden="true" className="text-accent-ink font-bold">
                ✓
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-2.5 pt-1">
          {PLANS.map((p) => (
            <div
              key={p.id}
              // The plan sheet links straight to the row it chose, so someone
              // sent here from the review lands on their plan rather than at
              // the top of a page they have to re-read.
              id={p.id}
              className="scroll-mt-4 rounded-2xl border-2 border-line bg-paper p-3.5"
            >
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2 font-bold text-ink">
                    {p.name}
                    {"best" in p && p.best && (
                      <span className="chip chip-blue uppercase">
                        Best value
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem] text-muted">
                    {p.blurb}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-lg font-extrabold tabular-nums text-ink">
                    {rupees(p.paise)}
                  </span>
                  <span className="block text-xs text-muted">
                    for {p.days} days
                  </span>
                </span>
              </div>
              {mode && (
                <CheckoutButton
                  className="mt-3"
                  planId={p.id}
                  planName={p.name}
                  label={`Pay ${rupees(p.paise)}`}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card legal-prose" aria-labelledby="terms-heading">
        <h2 id="terms-heading">The billing details, stated plainly</h2>
        <ul>
          <li>
            All prices are in <strong>Indian Rupees (INR)</strong> and{" "}
            <strong>include all applicable taxes</strong>. The amount shown is
            the amount charged — there is no fee added at checkout.
          </li>
          <li>
            A plan is a <strong>one-time charge for a fixed period</strong>{" "}
            {PLANS.map((p) => `${p.name.toLowerCase()} is ${p.days} days`).join(
              ", ",
            )}
            . It does <strong>not renew automatically</strong> unless the
            checkout page says so explicitly at the time you pay.
          </li>
          <li>
            Access starts as soon as payment is confirmed. See the{" "}
            <Link href="/shipping">delivery policy</Link>.
          </li>
          <li>
            Cancel any time by emailing{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. A refund
            can be requested within {REFUND_ELIGIBILITY_DAYS} days — the{" "}
            <Link href="/refunds">refunds &amp; cancellation policy</Link> has
            the exact conditions.
          </li>
          <li>
            We may change these prices. A change never affects a plan already
            paid for.
          </li>
          <li>
            Buying a plan means agreeing to the{" "}
            <Link href="/terms">terms &amp; conditions</Link> and the{" "}
            <Link href="/privacy">privacy policy</Link>.
          </li>
        </ul>
        <p className="legal-note">
          <strong>A plan buys more practice, and nothing else.</strong> It does
          not change how questions are marked, your leaderboard rank, or any
          examination outcome. CDS Prep is an independent study tool and is not
          affiliated with UPSC or the Ministry of Defence —{" "}
          <Link href="/about">more about that here</Link>.
        </p>
      </section>

      <footer className="pt-1 pb-2 text-center">
        <p className="text-xs text-muted">Last updated {LAST_UPDATED}</p>
        <Link href="/" className="btn-ghost mt-3">
          Back to today&apos;s test
        </Link>
      </footer>
    </div>
  );
}
