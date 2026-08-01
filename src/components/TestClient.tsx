"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { Question } from "@/types";
import PotterCoach from "./potter/PotterCoach";
import QuestionCard from "./QuestionCard";
import Timer from "./Timer";
import {
  availableTopics,
  pickAdaptiveQuestions,
  pickDailyQuestions,
  pickRandomQuestions,
  MARKING,
  scoreAnswers,
} from "@/lib/daily";
import { getMastery, recordAttempt, topicWeights } from "@/lib/mastery";
import {
  getAskedIds,
  getAttemptsForDate,
  getLatestAttempt,
  markAsked,
  saveAttempt,
  todayKey,
  type Attempt,
  type AttemptMode,
} from "@/lib/storage";
import Link from "next/link";

const PROGRESS_VERSION = 1;

/** An in-progress run, mirrored to localStorage on every change. */
interface Progress {
  v: number;
  mode: AttemptMode;
  date: string;
  /**
   * Full question objects, not just ids: options are shuffled per run (and
   * `answer` is remapped with them), so ids alone cannot rebuild the quiz the
   * answers were recorded against.
   */
  quiz: Question[];
  answers: (number | null)[];
  idx: number;
  /** Wall-clock end of the run, epoch ms. */
  deadline: number;
  startedAt: number;
}

/** Daily and random runs persist separately so one cannot clobber the other. */
const progressKey = (mode: AttemptMode) => `cds-test-progress-${mode}`;

function loadProgress(mode: AttemptMode): Progress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(progressKey(mode));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Progress> | null;
    if (!p || p.v !== PROGRESS_VERSION || p.mode !== mode) return null;
    if (!Array.isArray(p.quiz) || p.quiz.length === 0) return null;
    if (!Array.isArray(p.answers) || p.answers.length !== p.quiz.length) {
      return null;
    }
    if (
      typeof p.date !== "string" ||
      typeof p.idx !== "number" ||
      typeof p.deadline !== "number" ||
      typeof p.startedAt !== "number"
    ) {
      return null;
    }
    return {
      v: p.v,
      mode,
      date: p.date,
      quiz: p.quiz,
      answers: p.answers,
      idx: p.idx,
      deadline: p.deadline,
      startedAt: p.startedAt,
    };
  } catch {
    return null;
  }
}

/** Never throws: a full/blocked store must not interrupt a running test. */
function saveProgress(p: Progress): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(progressKey(p.mode), JSON.stringify(p));
  } catch {
    /* quota or private mode — the run continues from memory */
  }
}

function clearProgress(mode: AttemptMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(progressKey(mode));
  } catch {
    /* ignore */
  }
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function mmss(total: number): string {
  const t = Math.max(0, total);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function ArrowLeftIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

/** Shown in place of /results when a storage write failed, so a score is never lost. */
interface FinalScore {
  score: number;
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  timeTaken: number;
  /** Attempt reached the history log. */
  persisted: boolean;
  /** Review payload reached sessionStorage, so /results can still render it. */
  handedOff: boolean;
}

export default function TestClient({
  questions,
  mode = "daily",
}: {
  questions: Question[];
  mode?: AttemptMode;
}) {
  const router = useRouter();
  // Resolved once per mount. Rendered only after `ready`, so a server/client
  // timezone difference can never produce a hydration mismatch.
  const [date] = useState(() => todayKey());
  const isRandom = mode === "random";

  const [quiz, setQuiz] = useState<Question[]>([]);
  const [ready, setReady] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [seconds, setSeconds] = useState<number>(MARKING.durationSec);
  /** Absolute end of the run (epoch ms). The clock is derived from this, never counted. */
  const [deadline, setDeadline] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalScore, setFinalScore] = useState<FinalScore | null>(null);
  const [alreadyDone, setAlreadyDone] = useState<Attempt | null>(null);
  const [runId, setRunId] = useState(0);
  const [focusNonce, setFocusNonce] = useState(0);
  /** Travel direction, so the question slides in from the side it came from. */
  const [dir, setDir] = useState<1 | -1>(1);

  const questionRef = useRef<HTMLElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepWorkingRef = useRef<HTMLButtonElement>(null);
  const wasConfirmOpen = useRef(false);
  const skipConfirmRestore = useRef(false);

  const buildQuiz = useCallback(() => {
    if (isRandom) {
      // Practice adapts to you: topics you get wrong come up more, topics you
      // have shown you can do come up less (damped, never dropped). The daily
      // set below deliberately does NOT do this — it has to stay identical for
      // every user on a given date.
      const mastery = getMastery();
      if (Object.keys(mastery).length === 0) {
        return pickRandomQuestions(questions, 10, undefined, getAskedIds());
      }
      const weights = Object.fromEntries(
        topicWeights(availableTopics(questions), mastery).map((t) => [
          t.topic,
          t.weight,
        ])
      );
      return pickAdaptiveQuestions(questions, 10, weights, getAskedIds());
    }
    return pickDailyQuestions(questions, date, 10, getAskedIds());
  }, [questions, date, isRandom]);

  /* ---------------------------------------------------------------- restore */

  useEffect(() => {
    // "Shuffle again" is an explicit request for a new run — never restore into it.
    const saved = runId === 0 ? loadProgress(mode) : null;
    const stale =
      saved !== null &&
      (saved.date !== date ||
        // already submitted: an attempt for this run was written after it began
        getAttemptsForDate(date, mode).some(
          (a) =>
            (a.savedAt ?? 0) >= saved.startedAt &&
            sameIds(
              a.questionIds,
              saved.quiz.map((q) => q.id)
            )
        ));

    if (saved && !stale) {
      setQuiz(saved.quiz);
      setAnswers(saved.answers);
      setIdx(Math.min(Math.max(0, saved.idx), saved.quiz.length - 1));
      setDeadline(saved.deadline);
      setStartedAt(saved.startedAt);
      setSeconds(Math.max(0, Math.ceil((saved.deadline - Date.now()) / 1000)));
      setStarted(true);
      setResumed(true);
      setSubmitted(false);
      setFinalScore(null);
      setReady(true);
      return;
    }

    clearProgress(mode);
    const q = buildQuiz();
    setQuiz(q);
    setAnswers(Array.from({ length: q.length }, () => null));
    setIdx(0);
    setSeconds(MARKING.durationSec);
    setDeadline(null);
    setStartedAt(null);
    setStarted(false);
    setResumed(false);
    setSubmitted(false);
    setFinalScore(null);
    setReady(true);
  }, [buildQuiz, runId, mode, date]);

  useEffect(() => {
    if (isRandom) return;
    setAlreadyDone(getLatestAttempt(date, "daily"));
  }, [date, isRandom]);

  /* ------------------------------------------------------------ persistence */

  useEffect(() => {
    if (!started || submitted) return;
    if (quiz.length === 0 || deadline === null || startedAt === null) return;
    saveProgress({
      v: PROGRESS_VERSION,
      mode,
      date,
      quiz,
      answers,
      idx,
      deadline,
      startedAt,
    });
  }, [started, submitted, quiz, answers, idx, deadline, startedAt, mode, date]);

  /* ----------------------------------------------------------------- submit */

  const finalize = useCallback(() => {
    if (submitted || quiz.length === 0) return;
    setConfirmOpen(false);

    const elapsed =
      startedAt === null ? 0 : Math.round((Date.now() - startedAt) / 1000);
    const timeTaken = Math.min(MARKING.durationSec, Math.max(0, elapsed));
    const result = scoreAnswers(quiz, answers);
    const attempt: Attempt = {
      date,
      mode,
      ...result,
      timeTaken,
      questionIds: quiz.map((q) => q.id),
      answers,
    };

    // saveAttempt/markAsked report failure instead of throwing, so a blocked or
    // full localStorage can no longer abort the submit before the score lands.
    const persisted = saveAttempt(attempt);
    if (!isRandom) markAsked(attempt.questionIds);
    // Feeds the per-topic weighting that shapes future practice sets. Also
    // non-throwing — a failure here must not cost the user their score.
    recordAttempt(quiz, answers);

    let handedOff = false;
    try {
      sessionStorage.setItem(
        "cds-last-result",
        JSON.stringify({ ...attempt, questions: quiz, mode })
      );
      handedOff = true;
    } catch {
      handedOff = false;
    }

    clearProgress(mode);
    setSubmitted(true);
    if (handedOff && persisted) {
      // replace, not push: a submitted test must not sit one Back press away.
      router.replace("/results");
    } else {
      // A write failed — deliver the score here instead of losing it silently.
      setFinalScore({ ...result, timeTaken, persisted, handedOff });
    }
  }, [submitted, quiz, answers, startedAt, date, mode, isRandom, router]);

  // Latest-value ref: the countdown reads the current submit without listing it
  // as a dependency, so selecting an answer no longer restarts the clock.
  const finalizeRef = useRef(finalize);
  useEffect(() => {
    finalizeRef.current = finalize;
  });

  /* ------------------------------------------------------------------ clock */

  useEffect(() => {
    if (!started || submitted || deadline === null) return;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining <= 0) {
        stopped = true;
        window.clearInterval(id);
        finalizeRef.current();
      }
    };
    // Derived from the wall clock, so a throttled or suspended tab cannot buy
    // time; the interval only decides how often the display refreshes.
    const id = window.setInterval(tick, 500);
    const reconcile = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("pageshow", reconcile);
    window.addEventListener("focus", reconcile);
    tick();
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("pageshow", reconcile);
      window.removeEventListener("focus", reconcile);
    };
  }, [started, submitted, deadline]);

  /* ------------------------------------------------------------------ focus */

  useEffect(() => {
    if (!started || submitted || !ready) return;
    questionRef.current?.focus({ preventScroll: true });
    // The panel scrolls, not the window — `main` is the scroll container.
    questionRef.current?.closest("main")?.scrollTo({ top: 0 });
  }, [idx, focusNonce, started, submitted, ready]);

  useEffect(() => {
    if (confirmOpen) {
      wasConfirmOpen.current = true;
      keepWorkingRef.current?.focus();
      return;
    }
    if (wasConfirmOpen.current && !skipConfirmRestore.current) {
      submitRef.current?.focus();
    }
    wasConfirmOpen.current = false;
    skipConfirmRestore.current = false;
  }, [confirmOpen]);

  /* The nav used to sit inside the scrolling page, so the timer card had to be
     offset by its measured height. The nav is now a fixed sibling above the
     scroll container, so the card sticks to the top of `main` at 0 and the
     ResizeObserver that measured it is gone. */

  /* --------------------------------------------------------------- derived */

  const blanks = answers.reduce<number[]>(
    (acc, a, i) => (a === null ? [...acc, i] : acc),
    []
  );
  const answered = answers.length - blanks.length;
  const penalty = Math.abs(MARKING.wrong);

  /* --------------------------------------------------------------- handlers */

  const goTo = (i: number) => {
    const next = Math.min(Math.max(0, i), quiz.length - 1);
    setDir(next < idx ? -1 : 1);
    setIdx(next);
    setFocusNonce((n) => n + 1);
  };

  const start = () => {
    const now = Date.now();
    setStartedAt(now);
    setDeadline(now + MARKING.durationSec * 1000);
    setSeconds(MARKING.durationSec);
    setStarted(true);
  };

  const requestSubmit = () => {
    if (submitted) return;
    if (blanks.length > 0) {
      setConfirmOpen(true);
      return;
    }
    finalize();
  };

  const reviewBlanks = () => {
    skipConfirmRestore.current = true;
    setConfirmOpen(false);
    goTo(blanks[0]);
  };

  const onDialogKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setConfirmOpen(false);
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled])"
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /* ---------------------------------------------------------------- renders */

  if (!ready) {
    return (
      <div className="shell">
        <div className="card text-center py-16 text-muted">Loading…</div>
      </div>
    );
  }

  if (finalScore) {
    return (
      <div className="shell">
        <div className="card text-center py-10 fade-up">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink mb-1">
            Test submitted
          </h1>
          <p className="text-5xl font-extrabold tracking-tight text-accent-ink my-3">
            {finalScore.score}
          </p>
          <p className="text-muted font-medium mb-4">
            {finalScore.correct} correct · {finalScore.wrong} wrong ·{" "}
            {finalScore.skipped} blank · out of {finalScore.total}
          </p>
          <p
            role="alert"
            className="text-sm text-left bg-streak-soft text-streak-ink rounded-xl px-3 py-2 mb-5"
          >
            {finalScore.persisted
              ? "Your browser blocked the review handoff, so the answer-by-answer review isn’t available for this attempt. The score is saved in your history."
              : "Your browser blocked storage, so this attempt could not be added to your history. Your score is above."}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/" className="btn-ghost">
              Home
            </Link>
            {finalScore.handedOff ? (
              <Link href="/results" className="btn-primary">
                See full review
              </Link>
            ) : (
              <Link href="/history" className="btn-primary">
                History
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (quiz.length === 0) {
    return (
      <div className="shell">
        <div className="card text-center py-16">
          <p className="text-ink font-semibold mb-3">No questions loaded yet</p>
          <Link href="/" className="btn-ghost">
            Back home
          </Link>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="shell">
        <div className="card text-center py-10 fade-up">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink mb-2">
            {isRandom ? "Random Quiz" : "Today's Test"}
          </h1>
          <p className="text-muted mb-3">
            {isRandom ? "New questions & shuffled options every time" : date}
          </p>
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            <span className="chip chip-blue">{quiz.length} QUESTIONS</span>
            <span className="chip">{MARKING.durationSec / 60} MINUTES</span>
            <span className="chip chip-amber">
              +{MARKING.correct} / −{penalty}
            </span>
          </div>
          {!isRandom && alreadyDone && (
            <p className="text-sm bg-accent-soft text-accent-ink rounded-xl px-3 py-2 mb-4">
              Previous score today: <strong>{alreadyDone.score}</strong> (
              {alreadyDone.correct}/{alreadyDone.total} correct)
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button type="button" className="btn-primary" onClick={start}>
              Begin test
            </button>
            {isRandom && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setRunId((n) => n + 1)}
              >
                Shuffle again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const q = quiz[idx];
  const onLast = idx === quiz.length - 1;

  return (
    <div className="shell space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-extrabold tracking-tight text-ink">
          {isRandom ? "Random Quiz" : "Today's Test"}
        </h1>
        <p className="text-xs text-muted">
          {isRandom ? "" : `${date} · `}+{MARKING.correct} / −{penalty}
        </p>
      </div>

      {resumed && (
        <p className="text-xs text-accent-ink bg-accent-soft rounded-xl px-3 py-2">
          Resumed the test you had in progress — the clock kept running.
        </p>
      )}

      {/* Ring, dots and the progress line ride together at the top of the run.
          `top-0` is correct rather than lucky: the scroll container is the
          panel's <main>, and the navbar sits outside it. */}
      <div className="card sticky top-0 z-40 flex flex-col items-center gap-3">
        <Timer seconds={seconds} total={MARKING.durationSec} />

        <div
          role="group"
          aria-label="Jump to question"
          className="flex flex-wrap justify-center items-center gap-[13px]"
        >
          {/* 11px dot, 24px hit area from .progress-dot::after — the 13px gap
              keeps neighbouring hit areas from overlapping (WCAG 2.5.8). */}
          {quiz.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-current={i === idx ? "step" : undefined}
              aria-label={`Question ${i + 1}, ${
                answers[i] !== null ? "answered" : "not answered"
              }`}
              className={`progress-dot p-0 ${i === idx ? "active" : ""} ${
                answers[i] !== null ? "answered" : ""
              }`}
            />
          ))}
        </div>

        <p className="text-sm text-muted text-center">
          Question {idx + 1} of {quiz.length} · {answered} answered
        </p>
      </div>

      <section
        ref={questionRef}
        tabIndex={-1}
        aria-labelledby="current-question"
      >
        <h2 id="current-question" className="sr-only">
          Question {idx + 1} of {quiz.length}
        </h2>
        {/* Keyed on idx so the slide replays on every move; `.back` flips it
            when travelling backwards. `relative isolate` anchors Potter to the
            question card's top edge. */}
        <div
          key={idx}
          className={`relative isolate q-in${dir < 0 ? " back" : ""}`}
        >
          <PotterCoach
            index={idx}
            total={quiz.length}
            answered={quiz.length - blanks.length}
            secondsLeft={seconds}
            justAnswered={answers[idx] !== null}
          />
          <QuestionCard
            question={q}
            index={idx}
            total={quiz.length}
            selected={answers[idx]}
            onSelect={(opt) => {
              setAnswers((prev) => {
                const next = [...prev];
                next[idx] = opt;
                return next;
              });
            }}
          />
        </div>
      </section>

      {/* Sticky, and Submit is in it on every question — not only the last. */}
      <div className="sticky bottom-0 z-40 -mx-1 px-1 pt-3 pb-3 border-t border-line bg-paper/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs mb-2.5">
          <span className="flex items-center gap-2">
            <span
              className={`font-bold ${
                blanks.length > 0 ? "text-streak-ink" : "text-ok-ink"
              }`}
            >
              {blanks.length > 0
                ? `${blanks.length} still blank`
                : `All ${quiz.length} answered`}
            </span>
            {/* Un-answering is a scoring decision, not an undo: a blank costs
                nothing where a wrong guess costs {penalty}. It lives here
                rather than in the button row, which is spoken for. */}
            {answers[idx] !== null && (
              <button
                type="button"
                className="text-muted hover:text-ink underline underline-offset-2 px-1.5 py-1.5 -my-1.5"
                aria-label={`Clear answer to question ${idx + 1}`}
                onClick={() => {
                  setAnswers((prev) => {
                    const next = [...prev];
                    next[idx] = null;
                    return next;
                  });
                }}
              >
                Clear
              </button>
            )}
          </span>
          <span className="text-muted">
            Blank scores {MARKING.skip} · wrong costs {penalty}
          </span>
        </div>

        {/* Three buttons at 360px: the icon-only Prev and the short labels keep
            the row near 260px against ~328px available. flex-wrap is the
            backstop if a wider font pushes it over. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost"
            disabled={idx === 0}
            aria-label="Previous question"
            title="Previous question"
            onClick={() => goTo(idx - 1)}
          >
            <ArrowLeftIcon />
          </button>
          <button
            type="button"
            className="btn-primary flex-1 whitespace-nowrap"
            disabled={onLast}
            aria-label="Next question"
            onClick={() => goTo(idx + 1)}
          >
            Next
          </button>
          <button
            ref={submitRef}
            type="button"
            className={`${onLast ? "btn-primary flex-1" : "btn-ghost"} whitespace-nowrap`}
            aria-label="Submit test"
            onClick={requestSubmit}
          >
            Submit
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-desc"
            onKeyDown={onDialogKeyDown}
            className="card sheet-pop w-full max-w-sm text-left"
          >
            <h2
              id="confirm-title"
              className="text-lg font-extrabold tracking-tight text-ink mb-2"
            >
              {blanks.length} question{blanks.length === 1 ? "" : "s"} still
              blank
            </h2>
            <p id="confirm-desc" className="text-sm text-muted mb-3">
              {/* The pills below carry this visually; the sentence keeps it in
                  the description a screen reader reads on open. */}
              <span className="sr-only">
                {blanks.length === 1
                  ? `Question ${blanks[0] + 1} is still blank. `
                  : `Questions ${blanks
                      .map((b) => b + 1)
                      .join(", ")} are still blank. `}
              </span>
              A blank scores {MARKING.skip}; a wrong answer costs {penalty} —
              only answer if you can rule out two options. You still have{" "}
              {mmss(seconds)} left.
            </p>
            <div aria-hidden="true" className="flex flex-wrap gap-1.5 mb-4">
              {blanks.map((b) => (
                <span
                  key={b}
                  className="min-w-7 h-7 px-1.5 grid place-items-center rounded-lg bg-streak-soft text-streak-ink text-xs font-extrabold"
                >
                  {b + 1}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <button
                ref={keepWorkingRef}
                type="button"
                className="btn-primary w-full"
                onClick={() => setConfirmOpen(false)}
              >
                Keep working
              </button>
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={reviewBlanks}
              >
                Go to first blank
              </button>
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={finalize}
              >
                Submit anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
