import type { Metadata } from "next";

/**
 * A run in progress is per-session state, not a page anyone should land on
 * from a search result — robots.ts disallows it too, and this is the half that
 * still applies once a crawler has the URL from somewhere else.
 */
export const metadata: Metadata = {
  title: "Your test",
  robots: { index: false, follow: false },
};

import Link from "next/link";
import TestClient from "@/components/TestClient";
import { bankFor, isSubjectReady } from "@/lib/bank";
import { SUBJECT_LABEL, toSubject } from "@/lib/subject";

export default async function TestPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; subject?: string }>;
}) {
  const params = await searchParams;
  const mode = params.mode === "random" ? "random" : "daily";
  // Anything unrecognised is english — a hand-typed query string should get a
  // test, not an error page.
  const subject = toSubject(params.subject);
  const questions = bankFor(subject);

  // The GK bank is produced by the OCR pipeline and may be absent, empty, or
  // only a paper or two deep while it is being built. Rendering a "test" of
  // three questions, or none, is worse than saying plainly that it isn't ready.
  if (!isSubjectReady(subject)) {
    return (
      <div className="px-4 py-6">
        <div className="shell">
          <div className="card card-empty fade-up flex flex-col items-center gap-4 text-center">
            {/* One expression, not `{expr} text`: where a text child is the
                last thing in an element, the JSX transform trims the space that
                separated it from the expression and the heading renders as
                "General Knowledgeisn't ready yet". */}
            <p className="text-lg font-bold tracking-tight text-ink">
              {`${SUBJECT_LABEL[subject]} isn’t ready yet`}
            </p>
            <p className="max-w-[28ch] text-sm leading-relaxed text-muted">
              The question bank for this subject is still being built from the
              past papers. It will appear on the home screen the moment there is
              enough of it to run a real test.
            </p>
            <Link href="/test" className="btn-primary">
              Take the English test
            </Link>
            <Link href="/" className="btn-ghost">
              Back home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    // pt-6 matches every other screen — this page alone had py-8, and the
    // extra vertical padding is what pushed the options past the fold at
    // 360x800 (the fit check in scripts/visual-check.mjs). The bottom is
    // pb-2, not pb-6: during a run the sticky Prev/Next/Submit bar sits at
    // `bottom: 0` and paints over whatever is beneath it, so full bottom
    // padding under that bar is dead scroll height the phone cannot spare.
    // `run-page` is the hook globals.css uses to trim this top padding at phone
    // width — a class, not a utility, because the rule has to win against one.
    <div className="run-page px-4 pt-6 pb-2">
      <TestClient questions={questions} mode={mode} subject={subject} />
    </div>
  );
}
