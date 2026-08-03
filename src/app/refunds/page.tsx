import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import {
  BILLING_LIVE,
  REFUND_ELIGIBILITY_DAYS,
  REFUND_WINDOW,
  REPLY_WINDOW,
  SITE,
  SUPPORT_EMAIL,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Refunds & cancellation · CDS Prep",
  description:
    "How to cancel a CDS Prep plan, when a refund is available, and how long it takes.",
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refunds & cancellation"
      intro="How to cancel, when money comes back, and how long it takes."
    >
      {!BILLING_LIVE && (
        <p className="legal-note">
          <strong>Payments are not live yet.</strong> {SITE.name} cannot charge
          you for anything today and asks for no card or UPI details anywhere in
          the app, so there is nothing to refund. This policy is published in
          advance and applies from the day billing goes live.
        </p>
      )}

      <h2>Cancelling</h2>
      <ul>
        <li>
          You can cancel at any time by emailing{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the
          address on the account.
        </li>
        <li>
          Cancelling stops any future charge. Your plan keeps working until the
          end of the period you have already paid for — cancelling does not cut
          your access short.
        </li>
        <li>
          Plans do not renew automatically unless the checkout page said so
          explicitly at the time you paid.
        </li>
        <li>
          Cancelling does not delete your account. To delete it as well, say so
          in the same email and see the{" "}
          <Link href="/privacy">privacy policy</Link>.
        </li>
      </ul>

      <h2>When you can get a refund</h2>
      <p>
        A plan is digital and access is granted immediately, so the window is
        short and stated plainly rather than left to case-by-case judgement:
      </p>
      <ul>
        <li>
          <strong>
            Within {REFUND_ELIGIBILITY_DAYS} days of payment, if you have taken
            fewer than three paid random tests
          </strong>{" "}
          — full refund, no reason needed.
        </li>
        <li>
          <strong>Any time, if you were charged in error</strong> — a duplicate
          charge, a charge after you cancelled, or a payment that went through
          without unlocking access. Full refund, and we would rather you told us
          than absorbed it.
        </li>
        <li>
          <strong>Any time, if the service was substantially unavailable</strong>{" "}
          for a meaningful part of your plan and we could not fix it. Refunded
          in proportion to the time lost.
        </li>
      </ul>

      <h2>When you cannot</h2>
      <ul>
        <li>
          After {REFUND_ELIGIBILITY_DAYS} days from payment, or once you have
          taken three or more paid random tests — whichever comes first. At that
          point the plan has been used.
        </li>
        <li>
          Because your exam result was not what you hoped for. {SITE.name} makes
          no promise about examination outcomes, and says so in the{" "}
          <Link href="/terms">terms</Link>.
        </li>
        <li>
          Where an account was suspended for cheating the leaderboard or
          breaching the acceptable-use terms.
        </li>
        <li>
          For the free daily test, which costs nothing in the first place.
        </li>
      </ul>

      <h2>How to ask</h2>
      <p>
        Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the
        address on the account with the date of payment and the amount. Include
        the payment reference if you have it — it makes the whole thing faster,
        but we can find the payment without it.
      </p>
      <p>
        We reply {REPLY_WINDOW}. If the refund is approved it is sent back{" "}
        <strong>to the original payment method</strong>, since that is the only
        destination a gateway allows, and typically reaches your account within{" "}
        {REFUND_WINDOW} of us approving it. The last leg of that is your bank,
        not us.
      </p>
      <p>
        There is no fee for requesting or receiving a refund, and we do not
        deduct anything from the amount refunded.
      </p>

      <h2>If you disagree with the outcome</h2>
      <p>
        Reply to the same thread and say so. Every complaint is acknowledged{" "}
        {REPLY_WINDOW} and we aim to close it within 15 working days. Contact
        details are on the <Link href="/contact">contact page</Link>.
      </p>
    </LegalPage>
  );
}
