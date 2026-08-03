import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { SITE, SUPPORT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "About us · CDS Prep",
  description:
    "What CDS Prep is, who runs it, and where the questions come from. Independent — not affiliated with UPSC or the Ministry of Defence.",
};

export default function AboutPage() {
  return (
    <LegalPage
      title="About us"
      intro="What this is, who runs it, and where the questions come from."
    >
      <h2>What {SITE.name} is</h2>
      <p>
        {SITE.name} is a daily practice app for the Combined Defence Services
        examination conducted by the Union Public Service Commission. Every day
        it serves one ten-question set in English and one in General Knowledge,
        timed at ten minutes and marked the way the real paper is marked —{" "}
        <strong>+1 for a correct answer, −0.25 for a wrong one, 0 for a
        blank</strong>. You then review every question with the answer and an
        explanation.
      </p>
      <p>
        The idea is small on purpose. Twenty minutes a day, a streak you can see,
        and a record of the topics you keep losing marks on. It is not a course
        and it does not pretend to replace one.
      </p>

      <h2>Where the questions come from</h2>
      <p>
        The bank is built from previous-year CDS papers, read out of the
        published PDFs by an OCR pipeline and then proofread. Every question
        carries a label saying how its answer was established, and that label is
        shown to you when you review:
      </p>
      <ul>
        <li>
          <strong>Official key</strong> — the answer is the one UPSC published
          in the answer key for that paper. This is the only tier described as
          authoritative anywhere in the app.
        </li>
        <li>
          <strong>Verified</strong> — typed from the paper, where no key was
          published for it.
        </li>
        <li>
          <strong>Pattern</strong> — written in the style of the exam rather
          than taken from a specific paper. Useful for drilling; not a
          previous-year question, and never presented as one.
        </li>
      </ul>
      <p>
        Where a question did not come from a real paper, no paper reference is
        shown for it. We would rather show you less than imply an authority that
        is not there.
      </p>

      <h2>Who runs it</h2>
      <p>
        {SITE.name} is a small independent project, run by email. One address —{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> — reaches a
        person, for anything from a wrong answer in the bank to a billing
        question. See the <Link href="/contact">contact page</Link>.
      </p>

      <h2>What we do not claim</h2>
      <p className="legal-note">
        <strong>
          {SITE.name} is an independent study tool. It is not affiliated with,
          endorsed by, or connected to the Union Public Service Commission, the
          Ministry of Defence, or any Indian government body.
        </strong>{" "}
        We do not sell exam forms, coaching admissions, recruitment, or
        placement. No one here can influence a result, a selection, or a merit
        list, and nobody from {SITE.name} will ever ask you for money to do so.
        The question bank is a study aid — practising here is not a prediction
        of your score, and we make no guarantee about the outcome of any
        examination.
      </p>

      <h2>How it is paid for</h2>
      <p>
        Today&apos;s test is free and stays free. A paid plan adds unlimited
        random sets drawn from the whole bank, weighted towards the topics you
        keep getting wrong. The prices and what is included are on the{" "}
        <Link href="/pricing">pricing page</Link>.
      </p>
    </LegalPage>
  );
}
