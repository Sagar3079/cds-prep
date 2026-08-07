import type { Metadata } from "next";

/**
 * The landing surface for every search that matters. The title leads with what
 * a candidate types ("CDS practice") and what makes this different (free,
 * daily, real papers) rather than with the brand, which nobody is searching
 * for yet.
 */
export const metadata: Metadata = {
  // Overrides the layout template deliberately: the home page should not read
  // "CDS Prep · CDS Prep".
  title: {
    absolute: "CDS Prep — free daily CDS practice from past UPSC papers",
  },
  description:
    "A free ten-question CDS test every day in English and General Knowledge, drawn from real UPSC previous-year papers and marked +1 / −0.25 on a ten-minute clock. No account needed.",
  alternates: { canonical: "/" },
};

import HomeStats, {
  HomeDate,
  HomeSetChip,
  HomeStartActions,
  type CycleDays,
} from "@/components/HomeStats";
import PotterPerch from "@/components/potter/PotterPerch";
import TopicInsight from "@/components/TopicInsight";
import { bankFor, bankSize, isSubjectReady, readySubjects, PER_TEST } from "@/lib/bank";
import { MARKING, dailyCycleDays } from "@/lib/daily";

const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function Home() {
  const questions = bankFor("english");
  // Every subject with a bank big enough to run a test. GK is simply absent
  // from the home screen until its bank arrives — see `isSubjectReady`.
  const available = readySubjects();
  const cycleDays: CycleDays = {
    english: dailyCycleDays(bankFor("english"), PER_TEST),
    gk: dailyCycleDays(bankFor("gk"), PER_TEST),
  };
  const gkReady = isSubjectReady("gk");
  const gkTotal = bankSize("gk");
  const gkOfficial = bankFor("gk").filter(
    (q) => q.answerSource === "official-key",
  ).length;
  // Counted from the bank, not claimed: the previous copy hardcoded "110
  // questions from real papers (2015–2018)" and went stale as papers landed —
  // the bank now carries 486 transcribed items spanning 2015–2025. Only ids
  // starting `cds` come from a real paper; `year`/`session` on the rest are
  // placeholders (see CLAUDE.md), so the id prefix is the honest signal.
  const enFromPapers = questions.filter((q) => q.id.startsWith("cds")).length;
  const enOfficial = questions.filter(
    (q) => q.answerSource === "official-key",
  ).length;
  const minutes = Math.round(MARKING.durationSec / 60);

  return (
    <div className="flex-1 px-4 py-6">
      <div className="stagger flex flex-col gap-3.5">
        <header>
          <HomeDate />
          {/* The right side of this row belongs to Potter's thought bubble.
              He perches on the card below, but the bubble opens beside his
              HEAD, which is level with this heading — so an unreserved heading
              runs straight under it and reads "Ready for tod…". It cannot be
              solved by lifting the bubble over the heading instead: the drag
              wrapper carries a transform, which makes a stacking context the
              bubble cannot escape. Reserving the space is what is left, and it
              costs a heading that was already short a line wrap. */}
          <h1 className="mt-0.5 pr-[268px] text-[1.6875rem] leading-tight font-extrabold tracking-[-0.025em] text-ink text-balance">
            Ready for today?
          </h1>
        </header>

        {/* Potter is a PRECEDING SIBLING of the card, not a child. A child
            cannot be occluded by its own parent — the parent's background
            paints beneath its children. As an earlier sibling in the same
            stacking context, the card (z-10) genuinely covers his lower half. */}
        <div className="relative">
          <PotterPerch />

          <section
            aria-labelledby="today-heading"
            className="card relative z-10 flex flex-col items-center gap-4 text-center"
          >
            <HomeSetChip available={available} cycleDays={cycleDays} />

            {/* decorative preview of the test clock — the live one lives on /test */}
            <div className="ring-wrap" aria-hidden="true">
              <svg width="150" height="150" viewBox="0 0 150 150">
                <circle
                  className="ring-track"
                  cx="75"
                  cy="75"
                  r="66"
                  fill="none"
                  strokeWidth="11"
                />
              </svg>
              <div className="ring-face">
                <div className="ring-time">{mmss(MARKING.durationSec)}</div>
                <div className="ring-lab">MINUTES</div>
              </div>
            </div>

            <div>
              <h2 id="today-heading" className="font-bold text-ink">
                {PER_TEST} questions · {minutes} minutes
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                +{MARKING.correct} correct · −{Math.abs(MARKING.wrong)} wrong ·{" "}
                {MARKING.skip} blank
              </p>
            </div>

            <HomeStartActions available={available} />
          </section>
        </div>

        <HomeStats />

        <TopicInsight available={available} />

        <section className="card" aria-labelledby="bank-heading">
          <h2 id="bank-heading" className="text-[0.9375rem] font-bold text-ink">
            About the question bank
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            English: {questions.length} questions — mostly Synonyms, Antonyms,
            Comprehension, Idioms and Phrases and Spotting Errors.{" "}
            {enFromPapers} are transcribed from real CDS papers and{" "}
            {enOfficial} of those carry the official UPSC key; the rest are
            hand-written practice items, so treat any unkeyed answer as
            practice rather than authority.
          </p>
          {gkReady && (
            // Stated separately because the provenance is genuinely different,
            // and flattening the two into one number would borrow the GK bank's
            // authority for the hand-written English items. Counted rather than
            // claimed: `answerSource` is the only honest signal, so the sentence
            // is built from it instead of from what the bank is supposed to be.
            <p className="mt-2 text-sm leading-relaxed text-muted">
              General Knowledge: {gkTotal} questions
              {gkOfficial === gkTotal
                ? ", every one answered from the key UPSC published for that paper."
                : `, ${gkOfficial} of them answered from an official UPSC key and the rest not.`}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
