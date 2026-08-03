import Link from "next/link";
import { LAST_UPDATED, SUPPORT_EMAIL } from "@/lib/legal";

/**
 * The frame every policy page shares: title, the date the wording last
 * changed, the prose, and a way back.
 *
 * These pages are read in two very different situations — by a candidate
 * wondering what happens to their email, and by a payment-gateway reviewer
 * checking a box. Both want the same thing: short paragraphs, a visible last
 * updated date, and a support address that is never more than one screen away.
 */
export default function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  /** One sentence under the heading. Says what the page is for in plain words. */
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">
          {intro}
        </p>
        <p className="mt-2 text-xs text-muted">
          Last updated {LAST_UPDATED}
        </p>
      </header>

      <section className="card legal-prose">{children}</section>

      <footer className="pt-1 pb-2 text-center">
        <p className="text-[0.8125rem] text-muted">
          Questions about this page?{" "}
          <a className="legal-link" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
        </p>
        <Link href="/" className="btn-ghost mt-3">
          Back to today&apos;s test
        </Link>
      </footer>
    </div>
  );
}
