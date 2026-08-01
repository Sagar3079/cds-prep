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
import QuestionCard from "./QuestionCard";
import Timer from "./Timer";
import {
  pickDailyQuestions,
  pickRandomQuestions,
  MARKING,
  scoreAnswers,
} from "@/lib/daily";
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
  const [navOffset, setNavOffset] = useState(0);
  const [focusNonce, setFocusNonce] = useState(0);

  const questionRef = useRef<HTMLElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepWorkingRef = useRef<HTMLButtonElement>(null);
  const wasConfirmOpen = useRef(false);
  const skipConfirmRestore = useRef(false);

  const buildQuiz = useCallback(() => {
    if (isRandom) {
      return pickRandomQuestions(questions, 10);
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
    window.scrollTo({ top: 0 });
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

  /* ----------------------------------------------- sticky offset under nav */

  useEffect(() => {
    const nav = document.querySelector("nav");
    if (!nav) return;
    const measure = () => setNavOffset(nav.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  /* --------------------------------------------------------------- derived */

  const blanks = answers.reduce<number[]>(
    (acc, a, i) => (a === null ? [...acc, i] : acc),
    []
  );
  const answered = answers.length - blanks.length;
  const penalty = Math.abs(MARKING.wrong);

  /* --------------------------------------------------------------- handlers */

  const goTo = (i: number) => {
    setIdx(Math.min(Math.max(0, i), quiz.length - 1));
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
      <div className="card text-center py-16 text-lavender-600">Loading…</div>
    );
  }

  if (finalScore) {
    return (
      <div className="card max-w-lg mx-auto text-center py-10">
        <h1 className="text-2xl font-bold text-lavender-900 mb-1">
          Test submitted
        </h1>
        <p className="text-5xl font-bold text-lavender-600 my-3">
          {finalScore.score}
        </p>
        <p className="text-lavender-700 font-medium mb-4">
          {finalScore.correct} correct · {finalScore.wrong} wrong ·{" "}
          {finalScore.skipped} blank · out of {finalScore.total}
        </p>
        <p
          role="alert"
          className="text-sm bg-lavender-100 text-lavender-700 rounded-lg px-3 py-2 mb-5"
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
    );
  }

  if (quiz.length === 0) {
    return (
      <div className="card text-center py-16">
        <p className="text-lavender-800 font-medium mb-2">No questions loaded yet</p>
        <Link href="/" className="btn-ghost">
          Back home
        </Link>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="card max-w-lg mx-auto text-center py-10">
        <h1 className="text-2xl font-bold text-lavender-900 mb-2">
          {isRandom ? "Random Quiz" : "Today's Test"}
        </h1>
        <p className="text-lavender-700/80 mb-1">
          {isRandom ? "New questions & shuffled options every time" : date}
        </p>
        <p className="text-sm text-lavender-600 mb-6">
          {quiz.length} questions · {MARKING.durationSec / 60} min · +
          {MARKING.correct} / −{penalty}
        </p>
        {!isRandom && alreadyDone && (
          <p className="text-sm bg-lavender-100 text-lavender-700 rounded-lg px-3 py-2 mb-4">
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
    );
  }

  const q = quiz[idx];

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-bold text-lavender-900">
          {isRandom ? "Random Quiz" : "Today's Test"}
        </h1>
        <p className="text-xs text-lavender-600">
          {isRandom ? "" : `${date} · `}+{MARKING.correct} / −{penalty}
        </p>
      </div>

      {resumed && (
        <p className="text-xs text-lavender-700 bg-lavender-100 rounded-lg px-3 py-2">
          Resumed the test you had in progress — the clock kept running.
        </p>
      )}

      {/* Offset is measured from the navbar, not guessed: a hardcoded value
          leaves a see-through gap the moment the navbar's height changes. */}
      <div
        style={{ top: navOffset }}
        className="flex items-center justify-between gap-4 sticky z-40 bg-lavender-50/95 backdrop-blur py-3 -mx-1 px-1"
      >
        <div
          role="group"
          aria-label="Jump to question"
          className="flex gap-0.5 flex-wrap"
        >
          {quiz.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-current={i === idx ? "step" : undefined}
              aria-label={`Question ${i + 1}, ${
                answers[i] !== null ? "answered" : "not answered"
              }`}
              className="w-6 h-6 flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-600"
            >
              <span
                aria-hidden="true"
                className={`progress-dot ${i === idx ? "active" : ""} ${
                  answers[i] !== null
                    ? "answered"
                    : "border border-lavender-400"
                }`}
              />
            </button>
          ))}
        </div>
        <Timer seconds={seconds} />
      </div>

      <section
        ref={questionRef}
        tabIndex={-1}
        aria-labelledby="current-question"
        className="rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2"
      >
        <h2 id="current-question" className="sr-only">
          Question {idx + 1} of {quiz.length}
        </h2>
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
      </section>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="btn-ghost"
          disabled={idx === 0}
          onClick={() => goTo(idx - 1)}
        >
          ← Prev
        </button>
        <button
          type="button"
          className="btn-ghost text-lavender-500"
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
        <button
          type="button"
          className="btn-primary"
          disabled={idx === quiz.length - 1}
          onClick={() => goTo(idx + 1)}
        >
          Next →
        </button>
      </div>

      {/* Submit is reachable from every question, not only the last one. */}
      <div className="card flex flex-col sm:flex-row items-center justify-between gap-3 py-4">
        <p className="text-sm text-lavender-700">
          <strong>{answered}</strong> of {quiz.length} answered
          {blanks.length > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-warn">
                {blanks.length} blank
              </span>
            </>
          )}
        </p>
        <button
          ref={submitRef}
          type="button"
          className="btn-primary"
          onClick={requestSubmit}
        >
          Submit test
        </button>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-lavender-900/40 backdrop-blur-sm"
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
            className="card w-full max-w-sm text-left"
          >
            <h2
              id="confirm-title"
              className="text-lg font-bold text-lavender-900 mb-2"
            >
              Submit with {blanks.length} unanswered?
            </h2>
            <p id="confirm-desc" className="text-sm text-lavender-700 mb-5">
              {blanks.length === 1
                ? `Question ${blanks[0] + 1} is still blank.`
                : `${blanks.length} questions are still blank: ${blanks
                    .map((b) => b + 1)
                    .join(", ")}.`}{" "}
              A blank scores {MARKING.skip}; a wrong answer costs {penalty}. You
              still have {mmss(seconds)} left.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                ref={keepWorkingRef}
                type="button"
                className="btn-ghost"
                onClick={() => setConfirmOpen(false)}
              >
                Keep working
              </button>
              <button type="button" className="btn-ghost" onClick={reviewBlanks}>
                Go to first blank
              </button>
              <button type="button" className="btn-primary" onClick={finalize}>
                Submit anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
