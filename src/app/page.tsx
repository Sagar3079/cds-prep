import Navbar from "@/components/Navbar";
import HomeStats, {
  HomeDate,
  HomeSetChip,
  HomeStartActions,
} from "@/components/HomeStats";
import { MARKING, dailyCycleDays } from "@/lib/daily";
import questionsData from "@/data/questions.json";
import type { Question } from "@/types";

/** Matches the count TestClient asks pickDailyQuestions / pickRandomQuestions for. */
const PER_TEST = 10;

const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function Home() {
  const questions = questionsData as Question[];
  const cycleDays = dailyCycleDays(questions, PER_TEST);
  const minutes = Math.round(MARKING.durationSec / 60);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="shell flex-1 px-4 py-6">
        <div className="stagger flex flex-col gap-3.5">
          <header>
            <HomeDate />
            <h1 className="mt-0.5 text-[1.6875rem] leading-tight font-extrabold tracking-[-0.025em] text-ink text-balance">
              Ready for today?
            </h1>
          </header>

          <section
            aria-labelledby="today-heading"
            className="card flex flex-col items-center gap-4 text-center"
          >
            <HomeSetChip cycleDays={cycleDays} />

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

            <HomeStartActions />
          </section>

          <HomeStats />

          <section className="card" aria-labelledby="bank-heading">
            <h2 id="bank-heading" className="text-[0.9375rem] font-bold text-ink">
              About the question bank
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {questions.length} questions — mostly Synonyms, Antonyms,
              Comprehension, Idioms and Phrases and Spotting Errors. Only 110 are
              transcribed from real CDS-1 papers (2015–2018); the rest are
              hand-written practice items whose year and session labels are
              placeholders, so treat any single answer as practice rather than an
              official key.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
