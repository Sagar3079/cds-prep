import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import {
  MERCHANT,
  REPLY_WINDOW,
  SITE,
  SUPPORT_EMAIL,
  SUPPORT_HOURS,
  missingMerchantFields,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact us · CDS Prep",
  description:
    "How to reach CDS Prep — support email, hours, and postal address.",
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact us"
      intro="One address, read by a person. No ticket numbers, no bots."
    >
      <h2>Support</h2>
      <dl>
        <div>
          <dt>Email</dt>
          <dd>
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </dd>
        </div>
        {MERCHANT.phone && (
          <div>
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${MERCHANT.phone.replace(/[^+\d]/g, "")}`}>
                {MERCHANT.phone}
              </a>
            </dd>
          </div>
        )}
        <div>
          <dt>Hours</dt>
          <dd>{SUPPORT_HOURS}</dd>
        </div>
        <div>
          <dt>Reply time</dt>
          <dd>Usually {REPLY_WINDOW}</dd>
        </div>
        {MERCHANT.legalName && (
          <div>
            <dt>Operated by</dt>
            <dd>{MERCHANT.legalName}</dd>
          </div>
        )}
        {MERCHANT.address && (
          <div>
            <dt>Address</dt>
            <dd className="whitespace-pre-line">{MERCHANT.address}</dd>
          </div>
        )}
        {MERCHANT.gstin && (
          <div>
            <dt>GSTIN</dt>
            <dd>{MERCHANT.gstin}</dd>
          </div>
        )}
      </dl>

      <h2>What to write about</h2>
      <p>
        Email the same address for all of it — a wrong answer in the bank, a
        billing or refund question, deleting your account and data, a bug, or a
        privacy request. It helps to include the date of the test and the
        question you mean, since the daily set is the same for everyone on a
        given day.
      </p>

      <h2>Reporting a wrong answer</h2>
      <p>
        Please do report these. The bank is built from scanned papers, and an
        OCR mistake that survived proofreading is a real possibility. Tell us
        the date, the subject, and roughly how the question began — we will
        check it against the published answer key and correct it or explain why
        it stands.
      </p>

      <h2>Grievances</h2>
      <p>
        If something has gone wrong and the answer you got did not resolve it,
        reply to the same thread and say so plainly. Every complaint reaching{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> is acknowledged{" "}
        {REPLY_WINDOW} and we aim to close it within 15 working days.
      </p>

      {process.env.NODE_ENV !== "production" &&
        missingMerchantFields.length > 0 && (
          /* Dev-only. A payment gateway will reject an application whose
             contact page carries no postal address or phone number, and the
             failure is silent — the page simply renders without them. This
             says so where it will be seen, and never ships to a visitor. */
          <p className="legal-note">
            <strong>Dev note — not shown in production.</strong> These fields
            are still unset in <code>src/lib/legal.ts</code> and a payment
            gateway will ask for them:{" "}
            {missingMerchantFields.join(", ")}.
          </p>
        )}

      <h2>Who we are not</h2>
      <p className="legal-note">
        {SITE.name} is not the Union Public Service Commission and cannot help
        with your application form, admit card, result, or any part of the
        recruitment process. For those, contact UPSC directly. Nobody from{" "}
        {SITE.name} will ever call you about a job, a seat, or a result.
      </p>
    </LegalPage>
  );
}
