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
      <div className="px-4 py-8">
        <div className="shell">
          <div className="card fade-up flex flex-col items-center gap-4 py-12 text-center">
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
    <div className="px-4 py-8">
      <TestClient questions={questions} mode={mode} subject={subject} />
    </div>
  );
}
