import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { BILLING_LIVE, SITE, SUPPORT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy · CDS Prep",
  description:
    "Exactly what CDS Prep stores, where it stores it, who else can see it, and how to have it deleted.",
};

/**
 * Written against the code, not from a template.
 *
 * Every claim below is checkable in this repo: practice state in
 * `src/lib/storage.ts`, accounts in `src/lib/account.ts`, scoring and the
 * leaderboard in `src/app/api/submit` and `src/app/api/leaderboard`, error
 * reports in `src/app/api/log`, rate limiting in `src/lib/ratelimit.ts`. If any
 * of those change, this page is wrong until it changes too.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="What is stored, where, who can see it, and how to get rid of it."
    >
      <p>
        Short version: your practice history never leaves your browser. The only
        things that reach a server are what you deliberately send — an email
        address if you sign up, and a score if you post one to the leaderboard.
        There is no advertising, no third-party analytics, no tracking pixels,
        and nothing here is sold or shared for marketing.
      </p>

      <h2>1. What stays on your device</h2>
      <p>
        Your answers, scores, streaks, attempt history, topic mastery, subject
        preference, theme, and companion settings are kept in your browser&apos;s{" "}
        <strong>local storage</strong>. They are not uploaded, not backed up,
        and not visible to us.
      </p>
      <p>
        The consequence is worth stating plainly: <strong>clearing your
        browser data, using private browsing, or switching to another device
        loses that history</strong>, and we cannot restore it because we never
        had it.
      </p>

      <h2>2. What we collect, and why</h2>
      <h3>If you never create an account</h3>
      <p>
        Nothing that identifies you. You can take the daily test, review it, and
        keep a streak without ever telling us who you are.
      </p>

      <h3>If you create an account</h3>
      <ul>
        <li>
          <strong>Your email address</strong> — so the account can be recovered
          and so we can reach you about it. It is stored, and it is also indexed
          under a one-way SHA-256 hash so the list of accounts cannot be read
          back into a list of addresses.
        </li>
        <li>
          <strong>A username, if you set one</strong> — this is public on the
          leaderboard. If you set none, the leaderboard shows your email masked
          (for example <code>s••••@gmail.com</code>) rather than in full.
        </li>
        <li>
          <strong>A session cookie</strong> named <code>cds_sid</code>. It is
          httpOnly — script on the page cannot read it — and its only job is to
          keep you signed in. It is not an advertising or tracking cookie, and
          there are no others.
        </li>
        <li>
          <strong>The account creation date.</strong>
        </li>
      </ul>

      <h3>If you post a score to the leaderboard</h3>
      <ul>
        <li>
          Your score for that day and subject, and the display name described
          above. Both are <strong>publicly visible</strong> to anyone who opens
          the leaderboard.
        </li>
        <li>
          A marker recording that your account has completed that day&apos;s
          test, so one attempt cannot be posted twice.
        </li>
        <li>
          Answers are sent to the server to be scored there rather than in your
          browser. They are used for that and are not kept as a per-question
          record against your name.
        </li>
      </ul>

      <h3>Automatically, on any request</h3>
      <ul>
        <li>
          <strong>Your IP address</strong>, used transiently for rate limiting —
          to stop one client hammering an endpoint. It is not built into a
          profile and is not used to identify you. Standard web-server request
          logs on our host may also record it, as they do for any website.
        </li>
        <li>
          <strong>Error reports</strong>, if a page crashes: the error message,
          the stack trace, the route it happened on, and a coarse timestamp.
          These carry no email, no cookie, and no test answers, and they are
          deleted automatically after three days.
        </li>
      </ul>

      <h2>3. Payments</h2>
      {BILLING_LIVE ? (
        <p>
          Payments are handled by a third-party payment gateway. Your card, UPI,
          or bank details go to them and{" "}
          <strong>never reach our servers</strong> — we receive only the fact
          that a payment succeeded, its amount, and a reference number, which we
          keep as long as tax law requires. The gateway has its own privacy
          policy governing what it does with those details.
        </p>
      ) : (
        <p className="legal-note">
          <strong>No payment data is collected at all today.</strong> Billing is
          not live on {SITE.name}: no card, UPI, or bank details are requested
          anywhere in the app. When payments do go live they will be handled by
          a third-party gateway and those details will never reach our servers —
          we will receive only the fact of a successful payment, its amount, and
          a reference number. This page will be updated on the day that changes.
        </p>
      )}

      <h2>4. Who else can see it</h2>
      <ul>
        <li>
          <strong>Anyone, for the leaderboard</strong> — display name and score,
          by design. Nothing else on it is public.
        </li>
        <li>
          <strong>Upstash</strong>, which provides the Redis database that holds
          accounts, sessions, leaderboard entries, and error reports.
        </li>
        <li>
          <strong>Our hosting provider</strong>, which serves the site and keeps
          ordinary access logs.
        </li>
        <li>
          <strong>A payment gateway</strong>, once billing is live, for payments
          only.
        </li>
      </ul>
      <p>
        That is the whole list. We do not sell personal data, we do not share it
        with advertisers or data brokers, and we have no analytics or tracking
        scripts on any page. We would disclose data if a law or a valid court
        order required it, and not otherwise.
      </p>

      <h2>5. How long it is kept</h2>
      <ul>
        <li>Account and email: until you ask us to delete it.</li>
        <li>Sessions: until they expire or you sign out.</li>
        <li>
          Leaderboard entries: they are per-day, and old days are not the
          public board.
        </li>
        <li>Error reports: three days, then deleted automatically.</li>
        <li>
          Payment records, once billing is live: as long as Indian tax and
          accounting law requires.
        </li>
      </ul>

      <h2>6. Your choices</h2>
      <ul>
        <li>
          <strong>Delete everything on your device</strong> — clear site data
          for {SITE.domain} in your browser. That removes all of it at once, is
          immediate, and does not involve us.{" "}
          <Link href="/settings">Settings</Link> can reset your topic history on
          its own if that is all you want gone.
        </li>
        <li>
          <strong>Delete your account</strong> — email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the
          address you signed up with and we will remove the account, its email,
          and its leaderboard entries.
        </li>
        <li>
          <strong>See a copy, or correct something</strong> — same address, same
          way.
        </li>
        <li>
          <strong>Stay off the leaderboard</strong> — simply do not create an
          account. The daily test works without one.
        </li>
      </ul>

      <h2>7. Security</h2>
      <p>
        The site is served over HTTPS. Session cookies are httpOnly and
        SameSite-restricted, sessions are stored as hashes rather than as the
        token itself, and API endpoints are rate limited. Email ownership is{" "}
        <strong>not yet verified</strong> at sign-up — we say so rather than
        implying an address has been confirmed when it has not. No system is
        perfectly secure, and we do not claim otherwise.
      </p>

      <h2>8. Children</h2>
      <p>
        {SITE.name} is meant for candidates aged 18 and over and is not directed
        at children. If you believe a child has created an account, write to{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will
        remove it.
      </p>

      <h2>9. Changes</h2>
      <p>
        If this policy changes, the date at the top of the page changes with it.
        A change that materially affects what we collect will be announced in the
        app rather than made quietly.
      </p>

      <h2>10. Contact</h2>
      <p>
        Privacy questions and deletion requests:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Full details on
        the <Link href="/contact">contact page</Link>.
      </p>
    </LegalPage>
  );
}
