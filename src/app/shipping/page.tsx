import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { BILLING_LIVE, SITE, SUPPORT_EMAIL } from "@/lib/legal";
import { pageMetadata } from "@/lib/pageMeta";

export const metadata: Metadata = pageMetadata({
  path: "/shipping",
  title: "Delivery policy",
  description:
    "CDS Prep sells digital access only. Nothing is shipped; access unlocks as soon as payment is confirmed.",
});

/**
 * Payment gateways require a "shipping and delivery" page even from merchants
 * who ship nothing. Saying so explicitly is the point of the page — a
 * digital-only seller with no delivery page reads to a reviewer as an
 * incomplete application, and one with a copy-pasted courier policy reads as
 * worse.
 */
export default function ShippingPage() {
  return (
    <LegalPage
      title="Delivery policy"
      intro="Nothing is shipped. Everything here is digital and arrives instantly."
    >
      <h2>There is nothing to ship</h2>
      <p>
        {SITE.name} sells access to a web app. There are{" "}
        <strong>no physical goods</strong>, no books, no printed material, and
        no courier is involved at any point. Consequently there are{" "}
        <strong>no shipping charges, no delivery addresses, and no tracking
        numbers</strong>, and we do not deliver to or outside any particular
        region — the site is reachable wherever you can open it.
      </p>

      <h2>How access is delivered</h2>
      {BILLING_LIVE ? (
        <ul>
          <li>
            Access unlocks <strong>immediately</strong> once the payment gateway
            confirms your payment — in practice within a few seconds, and in
            almost every case under five minutes.
          </li>
          <li>
            It is delivered to the account you paid with. Sign in with that
            email on any device and the plan is there; there is no download, no
            licence key, and no activation step.
          </li>
          <li>
            A payment receipt is emailed by the payment gateway to the address
            you gave at checkout.
          </li>
        </ul>
      ) : (
        <p className="legal-note">
          <strong>Payments are not live yet.</strong> Everything on {SITE.name}{" "}
          is currently free, so all of it is already &ldquo;delivered&rdquo; the
          moment you open the site. When paid plans go live, access will unlock
          immediately on payment confirmation — within seconds in practice, and
          in almost every case under five minutes — attached to the account you
          paid with, with no download, licence key, or activation step. This
          page will be updated on the day that changes.
        </p>
      )}

      <h2>The free daily test</h2>
      <p>
        Today&apos;s ten-question set in each subject is free and needs no
        account and no payment. Open the site and it is there.
      </p>

      <h2>If access does not appear</h2>
      <p>
        If a payment has gone through and the plan is not active within{" "}
        <strong>30 minutes</strong>, email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with the amount,
        the date, and the payment reference. We will either activate it or
        refund it — see the{" "}
        <Link href="/refunds">refunds &amp; cancellation policy</Link>. You are
        not expected to be out of pocket while we work out what happened.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or the{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </LegalPage>
  );
}
