import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import {
  BILLING_LIVE,
  REFUND_ELIGIBILITY_DAYS,
  SITE,
  SUPPORT_EMAIL,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms & conditions · CDS Prep",
  description:
    "The terms you agree to by using CDS Prep — accounts, subscriptions, acceptable use, and the limits of what this app claims.",
};

/**
 * The counterparty, named the way the rest of the site names it.
 *
 * A contract still needs two sides even when one of them publishes no trading
 * name, so this is the operator of the domain — which is who you are actually
 * agreeing with, and is reachable at one address on every page.
 */
const OPERATOR = `the operator of ${SITE.domain}`;

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & conditions"
      intro={`The agreement between you and ${OPERATOR} when you use ${SITE.name}.`}
    >
      <p>
        By using {SITE.name} at {SITE.domain} — whether or not you create an
        account or pay for anything — you agree to these terms. If you do not
        agree with them, please do not use the app.
      </p>

      <h2>1. Who may use this</h2>
      <p>
        {SITE.name} is intended for candidates preparing for the Combined
        Defence Services examination, and you must be{" "}
        <strong>at least 18 years old</strong> to create an account or buy a
        plan. If you are under 18, you may use the free daily test only with the
        involvement of a parent or guardian.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>
          An account needs an email address. You are responsible for keeping
          access to that mailbox, and for anything done through your account.
        </li>
        <li>
          One person, one account. Creating several accounts to appear more than
          once on a leaderboard is a breach of these terms.
        </li>
        <li>
          A username you choose is <strong>shown publicly</strong> on the
          leaderboard. Do not use one that impersonates somebody, or that you
          would not want a stranger to read. If you set none, your email is
          shown masked rather than in full.
        </li>
        <li>
          We may suspend or remove an account that is being used to cheat the
          leaderboard, to abuse the service, or to harass other people.
        </li>
      </ul>

      <h2>3. Practice, scores, and the leaderboard</h2>
      <p>
        Scores are calculated on our server from the answers you submit, not in
        your browser, and the daily leaderboard shows only today&apos;s results.
        Attempts that are implausibly fast, duplicated, or submitted by
        automated means may be excluded from the leaderboard without notice. The
        leaderboard is a bit of motivation, not a record of anything — we make no
        promise that a rank is preserved, accurate, or meaningful.
      </p>

      <h2>4. What we do not promise</h2>
      <p className="legal-note">
        <strong>
          {SITE.name} is an independent study tool with no affiliation to, or
          endorsement by, the Union Public Service Commission, the Ministry of
          Defence, or any government body.
        </strong>{" "}
        We do not guarantee that practising here will improve your score,
        that you will qualify any examination, or that any question here will
        appear in a future paper. Questions and answers are provided in good
        faith and may contain errors; where an answer comes from a published
        UPSC key we say so, and where it does not we say that too. The official
        paper and the official key always take precedence over anything shown
        here.
      </p>

      <h2>5. Subscriptions and payment</h2>
      {BILLING_LIVE ? (
        <ul>
          <li>
            Today&apos;s test is free. A paid plan adds unlimited random practice
            sets for the length of the plan. Prices are on the{" "}
            <Link href="/pricing">pricing page</Link>, in Indian Rupees, and
            include all applicable taxes.
          </li>
          <li>
            Payment is collected by a third-party payment gateway. We never see
            or store your full card, UPI, or bank details.
          </li>
          <li>
            A plan gives access for its stated period and{" "}
            <strong>does not renew automatically</strong> unless the checkout
            page said so explicitly at the time you paid.
          </li>
          <li>
            Access begins as soon as the gateway confirms payment. See the{" "}
            <Link href="/shipping">delivery page</Link>.
          </li>
          <li>
            Cancellation and refunds are covered by the{" "}
            <Link href="/refunds">refunds &amp; cancellation policy</Link>,
            which forms part of these terms. In short: a refund can be requested
            within {REFUND_ELIGIBILITY_DAYS} days of purchase.
          </li>
          <li>
            We may change prices at any time. A change never affects a plan you
            have already paid for.
          </li>
        </ul>
      ) : (
        <>
          <p className="legal-note">
            <strong>Payments are not live yet.</strong> Nothing on {SITE.name}{" "}
            can be charged for today, no card or UPI details are collected
            anywhere in the app, and the plan sheet says so where it appears.
            Everything currently available is free.
          </p>
          <p>
            When billing does go live it will work as follows, and this section
            will be updated with the date it changed. Today&apos;s test stays
            free. A paid plan will add unlimited random practice sets for the
            length of the plan, priced in Indian Rupees and inclusive of all
            applicable taxes, as listed on the{" "}
            <Link href="/pricing">pricing page</Link>. Payment will be collected
            by a third-party payment gateway; we will never see or store your
            full card, UPI, or bank details. A plan will grant access for its
            stated period and will not renew automatically unless the checkout
            page says so explicitly. Cancellation and refunds will be governed
            by the <Link href="/refunds">refunds &amp; cancellation policy</Link>
            , which forms part of these terms.
          </p>
        </>
      )}

      <h2>6. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          copy, scrape, republish, resell, or redistribute the question bank,
          explanations, or any other content from {SITE.name};
        </li>
        <li>
          use bots, scripts, or automated tools against the app or its APIs;
        </li>
        <li>
          attempt to bypass a paywall, rate limit, or the scoring server, or to
          submit answers by any means other than taking the test;
        </li>
        <li>
          interfere with the service, probe it for vulnerabilities without
          telling us, or use it to harm anyone.
        </li>
      </ul>
      <p>
        If you think you have found a security problem, please write to{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> before doing
        anything else with it. We will not pursue anyone who reports in good
        faith and gives us a reasonable chance to fix it.
      </p>

      <h2>7. Content and intellectual property</h2>
      <p>
        Questions in previous-year papers are published by UPSC and are
        reproduced here for study, with the source paper identified wherever the
        question genuinely came from one. Everything else — the app, its design,
        the explanations, the wording of the hand-written questions, and the
        organisation of the bank — belongs to {OPERATOR} and may not be
        reproduced without permission.
      </p>

      <h2>8. Availability</h2>
      <p>
        The service is provided on an &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo; basis. It may be unavailable during maintenance, or
        because something has broken. Your practice history lives in your own
        browser, so clearing site data or switching device will lose it — that is
        how it works, not a fault, and it is described on the{" "}
        <Link href="/privacy">privacy page</Link>.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the extent permitted by law, {OPERATOR} is not liable for any
        indirect or consequential loss arising from your use of {SITE.name},
        including examination outcomes, lost study time, or lost data. Where
        liability cannot be excluded, it is limited to the amount you paid us in
        the twelve months before the claim — which, if you have only used the
        free daily test, is nil.
      </p>

      <h2>10. Changes to these terms</h2>
      <p>
        We may update these terms. The date at the top of this page changes when
        we do, and continuing to use {SITE.name} after that counts as accepting
        the new version. A change that affects a plan you have already paid for
        will not be applied to that plan.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These terms are governed by the laws of India, and any dispute arising
        from them is subject to the exclusive jurisdiction of the competent
        courts in India.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these terms go to{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or see the{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </LegalPage>
  );
}
