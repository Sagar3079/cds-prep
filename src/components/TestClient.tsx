"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { Question, Subject } from "@/types";
import { clearRunStatus, reportRun } from "./LeaderboardNote";
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
  ensureSession,
  saveAttempt as saveAttemptToServer,
} from "@/lib/clientSession";
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
import { masteryKey, SUBJECT_LABEL } from "@/lib/subject";
import {
  onPotterVisibleChange,
  onThoughtsChange,
  potterVisible,
  thoughtsOn,
} from "@/lib/potterPrefs";
import Link from "next/link";

const PROGRESS_VERSION = 1;

/** An in-progress run, mirrored to localStorage on every change. */
interface Progress {
  v: number;
  mode: AttemptMode;
  subject: Subject;
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

/**
 * Daily and random runs persist separately so one cannot clobber the other, and
 * so do the subjects: a half-finished English daily and a half-finished GK daily
 * are two different runs on the same date, and one key for both would restore
 * the wrong ten questions into the wrong test.
 *
 * English keeps its original key so a run already in progress survives this
 * change rather than being thrown away mid-clock.
 */
const progressKey = (mode: AttemptMode, subject: Subject) =>
  subject === "english"
    ? `cds-test-progress-${mode}`
    : `cds-test-progress-${mode}-${subject}`;

function loadProgress(mode: AttemptMode, subject: Subject): Progress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(progressKey(mode, subject));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Progress> | null;
    if (!p || p.v !== PROGRESS_VERSION || p.mode !== mode) return null;
    // Absent on a run started before GK existed, and those are all english.
    if ((p.subject ?? "english") !== subject) return null;
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
      subject,
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
    localStorage.setItem(progressKey(p.mode, p.subject), JSON.stringify(p));
  } catch {
    /* quota or private mode — the run continues from memory */
  }
}

function clearProgress(mode: AttemptMode, subject: Subject): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(progressKey(mode, subject));
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
  subject = "english",
}: {
  /** One subject's bank, never a mix — see the note at the top of `bank.ts`. */
  questions: Question[];
  mode?: AttemptMode;
  subject?: Subject;
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
  /** Set when the server refuses a random run, cleared by navigating away. */
  const [gate, setGate] = useState<{
    reason: "signed-out" | "used-up" | "no-cookies";
    message: string;
  } | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalScore, setFinalScore] = useState<FinalScore | null>(null);
  const [alreadyDone, setAlreadyDone] = useState<Attempt | null>(null);
  const [runId, setRunId] = useState(0);
  const [focusNonce, setFocusNonce] = useState(0);
  /** Travel direction, so the question slides in from the side it came from. */
  const [dir, setDir] = useState<1 | -1>(1);
  /** When a selection was last made, so Potter reacts to the act, not the state. */
  const [lastPick, setLastPick] = useState<{ idx: number; at: number } | null>(
    null,
  );
  /**
   * Whether to hold open the band the companion's thought bubble needs.
   *
   * Starts true so the server HTML and the first client render agree — the
   * preference lives in localStorage, which the server cannot read — and is
   * corrected on mount. Reserving the band and then dropping it is the right
   * way round: the alternative reflows the question DOWN a moment after paint.
   */
  const [coachRoom, setCoachRoom] = useState(true);
  useEffect(() => {
    // Narrow phones do not open the bubble during a run at all — see the
    // `.run-page .potter-thought` rule in globals.css — so they must not
    // reserve the band for it either. 620px matches that rule; keep them
    // together or the band comes back with nothing in it.
    const narrow = window.matchMedia("(max-width: 620px)");
    const sync = () =>
      setCoachRoom(potterVisible() && thoughtsOn() && !narrow.matches);
    sync();
    const a = onPotterVisibleChange(sync);
    const b = onThoughtsChange(sync);
    narrow.addEventListener("change", sync);
    return () => {
      a();
      b();
      narrow.removeEventListener("change", sync);
    };
  }, []);

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
      // `availableTopics` reads THIS subject's bank, and the weights are looked
      // up under this subject's namespace in the shared mastery record — so a
      // weak "Polity" cannot pull an English set around, and vice versa. The
      // map is keyed by the plain topic because `pickAdaptiveQuestions` sees
      // one subject's pool at a time and reads `q.topic` directly. Questions
      // with no topic (much of the GK bank, deliberately) simply miss the map
      // and are drawn at the baseline weight.
      const topics = availableTopics(questions);
      const weighted = topicWeights(
        topics.map((t) => masteryKey(subject, t)),
        mastery,
      );
      const weights = Object.fromEntries(
        topics.map((t, i) => [t, weighted[i].weight]),
      );
      return pickAdaptiveQuestions(questions, 10, weights, getAskedIds());
    }
    return pickDailyQuestions(questions, date, 10, getAskedIds());
  }, [questions, date, isRandom, subject]);

  /* ---------------------------------------------------------------- restore */

  useEffect(() => {
    // "Shuffle again" is an explicit request for a new run — never restore into it.
    const saved = runId === 0 ? loadProgress(mode, subject) : null;
    const stale =
      saved !== null &&
      (saved.date !== date ||
        // already submitted: an attempt for this run was written after it began
        getAttemptsForDate(date, mode, subject).some(
          (a) =>
            (a.savedAt ?? 0) >= saved.startedAt &&
            sameIds(
              a.questionIds,
              saved.quiz.map((q) => q.id),
            ),
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

    clearProgress(mode, subject);
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
  }, [buildQuiz, runId, mode, date, subject]);

  useEffect(() => {
    if (isRandom) return;
    setAlreadyDone(getLatestAttempt(date, "daily", subject));
  }, [date, isRandom, subject]);

  /* ------------------------------------------------------------ persistence */

  useEffect(() => {
    if (!started || submitted) return;
    if (quiz.length === 0 || deadline === null || startedAt === null) return;
    saveProgress({
      v: PROGRESS_VERSION,
      mode,
      subject,
      date,
      quiz,
      answers,
      idx,
      deadline,
      startedAt,
    });
  }, [
    started,
    submitted,
    quiz,
    answers,
    idx,
    deadline,
    startedAt,
    mode,
    subject,
    date,
  ]);

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
      subject,
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
        JSON.stringify({ ...attempt, questions: quiz, mode, subject }),
      );
      handedOff = true;
    } catch {
      handedOff = false;
    }

    // Everything above this line is the actual result: marked, saved, handed
    // off. The leaderboard comes after it and only after it, does not block the
    // redirect, and cannot reject — see `reportRun`. Daily only: the board is
    // "today's daily test, first attempt", so a random set would both
    // misrepresent it and spend the account's one entry for the day. The
    // subject decides which of the two boards it lands on. A random run
    // clears the stored status instead: leaving the previous daily run's
    // note in sessionStorage let the random set's results page claim that
    // run's leaderboard outcome as its own.
    if (!isRandom) reportRun(quiz, answers, timeTaken, subject);
    else clearRunStatus();

    /**
     * The server's copy of this attempt — history and admin analytics, not the
     * leaderboard, which `reportRun` above owns and which is daily-only.
     *
     * Both modes, unlike the board: the point of recording a random set is that
     * a person's practice history should not end at the browser they took it
     * in. Fire-and-forget with `keepalive`, because the redirect two lines down
     * unmounts this component. A caller with no session — the daily test works
     * with cookies blocked — is answered with `saved: false` rather than an
     * error, and nothing here needs to know either way.
     */
    saveAttemptToServer({
      subject,
      mode: isRandom ? "random" : "daily",
      correct: result.correct,
      wrong: result.wrong,
      blank: result.skipped,
      total: result.total,
    });

    clearProgress(mode, subject);
    setSubmitted(true);
    if (handedOff && persisted) {
      // replace, not push: a submitted test must not sit one Back press away.
      router.replace("/results");
    } else {
      // A write failed — deliver the score here instead of losing it silently.
      setFinalScore({ ...result, timeTaken, persisted, handedOff });
    }
  }, [submitted, quiz, answers, startedAt, date, mode, subject, isRandom, router]);

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

  // True only briefly after an actual selection on THIS question.
  // `answers[idx] !== null` meant "is answered", so returning to an answered
  // question fired the speed-praise and streak lines when nothing was clicked.
  // Deliberately impure: this has to read the wall clock at render time to
  // decide whether "just answered" feedback is still within its window —
  // there is no pure derivation of "has less than 2500ms elapsed" from props
  // or state alone.
  const justAnswered =
    lastPick !== null &&
    lastPick.idx === idx &&
    // eslint-disable-next-line react-hooks/purity
    Date.now() - lastPick.at < 2500;

  const blanks = answers.reduce<number[]>(
    (acc, a, i) => (a === null ? [...acc, i] : acc),
    [],
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

  const beginRun = () => {
    const now = Date.now();
    setStartedAt(now);
    setDeadline(now + MARKING.durationSec * 1000);
    setSeconds(MARKING.durationSec);
    setStarted(true);
  };

  /**
   * Spend one of the day's free random tests, then begin.
   *
   * Only random runs ask: the daily test is free forever and must never depend
   * on a server being reachable to start. The allowance is counted here, as the
   * run BEGINS, rather than when the page rendered — opening a page and
   * changing your mind should not cost anybody a test.
   *
   * A network failure starts the run anyway. The server has the real count and
   * will refuse the next one; blocking a person from practising because our
   * store was briefly unreachable is the worse of the two errors, and it is the
   * same trade `kv.ts` and the throttles already make everywhere else.
   */
  const start = () => {
    if (!isRandom) {
      /**
       * The daily test does not wait for this and does not care if it fails.
       * A session is what lets the score reach the server and the name reach
       * the leaderboard, and both are worth having — but neither is worth
       * standing between somebody and a test they came here to take. With
       * cookies blocked this quietly does nothing and the test runs anyway.
       */
      void ensureSession();
      beginRun();
      return;
    }
    setGateBusy(true);
    // Clear last time's refusal before asking again: signing in or buying a
    // plan in another tab is exactly how somebody gets past this, and leaving
    // "Sign in to take random tests" on screen while we re-check reads as
    // though the answer is already no.
    setGate(null);
    void (async () => {
      try {
        /**
         * Random mode is metered, and metering needs somebody to meter. Unlike
         * the daily test this cannot degrade: with no session there is no
         * account to count against, and every refresh would hand out a fresh
         * free allowance. So a browser that will not keep a cookie is told
         * plainly rather than being let through to an allowance that resets
         * itself.
         */
        const hasSession = await ensureSession();
        if (!hasSession) {
          setGateBusy(false);
          setGate({
            reason: "no-cookies",
            message:
              "Random tests need cookies switched on — that's how your free tests each day are counted. The daily test works without them.",
          });
          return;
        }

        const res = await fetch("/api/random/start", { method: "POST" });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            reason?: string;
            error?: string;
          };
          setGateBusy(false);
          setGate({
            reason: data.reason === "signed-out" ? "signed-out" : "used-up",
            message: data.error ?? "You've used today's free random tests.",
          });
          return;
        }
      } catch {
        // Unreachable — see the note above. Fall through and start.
      }
      setGateBusy(false);
      beginRun();
    })();
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
      "button:not([disabled])",
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
        <div className="card card-empty text-center text-muted">Loading…</div>
      </div>
    );
  }

  if (finalScore) {
    return (
      <div className="shell">
        <div className="card card-empty text-center fade-up">
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
        <div className="card card-empty text-center">
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
        <div className="card card-empty text-center fade-up">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink mb-2">
            {isRandom ? "Random Quiz" : "Today's Test"}
          </h1>
          {/* The subject is named here rather than in the run header: the
              header row is measured by scripts/visual-check.mjs at 360px and
              already sits close to wrapping, and a wrapped header is what
              pushed an option below the fold last time. */}
          <p className="text-muted mb-3">
            {SUBJECT_LABEL[subject]}
            {isRandom
              ? " · new questions & shuffled options every time"
              : ` · ${date}`}
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
          {gate && (
            <div className="mb-4 rounded-xl bg-accent-soft px-3 py-2.5 text-left">
              <p className="text-sm leading-relaxed text-accent-ink">
                {gate.message}
              </p>
              {/*
                No link when cookies are the problem: the fix is in the
                browser's own settings and there is nowhere on this site to send
                somebody for it. Offering "see plans" to a person who cannot
                hold a session would sell them something they could not then be
                given.

                "signed-out" no longer means what it did — an account now
                arrives by taking a test rather than by signing up — so the only
                way to reach it is a session that vanished between the check
                above and the server's own. Pricing is the honest destination
                for both that and a used-up allowance.
              */}
              {gate.reason !== "no-cookies" && (
                <p className="mt-2">
                  <Link
                    href="/pricing"
                    className="text-sm font-bold text-accent-ink underline"
                  >
                    See plans for unlimited random tests
                  </Link>
                </p>
              )}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              className="btn-primary"
              onClick={start}
              disabled={gateBusy}
              aria-busy={gateBusy}
            >
              {gateBusy ? "Checking…" : "Begin test"}
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
      {/* Potter perches on the timer card below and his bubble opens beside his
          head, level with this row — measured, it sat straight on top of both
          the title and the date, at every width. Reserving horizontal space
          does not help here: the bubble opens LEFTWARD and reached x=8 on a
          390px screen, i.e. across the whole row. He cannot be lifted over the
          text either, because his drag wrapper carries a transform and traps
          the bubble in its own stacking context. So the row claims a band of
          its own and everything below it starts under the bubble.

          `mb`, not `mt` on the block below: the shell uses `space-y-4`, which
          sets margin-TOP on every later sibling, and two margin-top utilities
          on one element is a specificity coin-toss.

          Conditional, because the band is FOR the bubble. It was unconditional,
          so turning the companion off in Settings still cost 80px of a 737px
          phone — an eighth of the screen held open for something that had been
          switched off, which on a 360px device is the difference between the
          fourth option being on screen and under the fold. */}
      {/* `data-run-title` so the short-phone rule in globals.css can reclaim
          this row by name. Selecting it positionally (`> div:first-of-type`)
          also matched the PRE-run screen's card and hid the "Begin test"
          button — the visual suite caught it immediately. */}
      <div
        data-run-title
        className={`flex items-baseline justify-between gap-3 flex-wrap ${
          coachRoom ? "mb-20" : "mb-2"
        }`}
      >
        <h1 className="text-lg font-extrabold tracking-tight text-ink">
          {isRandom ? "Random Quiz" : "Today's Test"}
        </h1>
        {/* Hidden on phones: the mascot perches at the right end of this row
            and his box overlaps this text — measured 32.6px of overlap at
            360px, enough to put his hand over the "20" of the date. The
            marking is restated in the action bar at the bottom of the run, so
            nothing here is the only copy of anything except the date. */}
        <p className="hidden min-[621px]:block text-xs text-muted">
          {isRandom ? "" : `${date} · `}+{MARKING.correct} / −{penalty}
        </p>
      </div>

      {resumed && (
        <p className="text-xs text-accent-ink bg-accent-soft rounded-xl px-3 py-2">
          Resumed the test you had in progress — the clock kept running.
        </p>
      )}

      {/* Potter and the timer card share ONE relative box, so his `bottom:
          calc(100% - …)` resolves against the card's height. In his own wrapper
          that box was 0px tall and space-y pushed the card 16px lower again,
          leaving him gripping thin air. The card is z-40 and he is not, so it
          covers his lower half. */}
      {/* STICKY LIVES HERE, not on the card. Potter is positioned against this
          box, so sticking the card alone pinned the card to the panel edge and
          let him carry on scrolling up and out of it — the scroller sheared
          24.2px off his head while the seat he was sitting on stayed put. The
          pair has to stick as one, and the offset is his exposed height so
          there is always room for him above the card.

          `sticky` replaces `relative` rather than joining it: both set
          `position`, and a sticky box is just as good a containing block for
          his absolute positioning. */}
      {/* NOT sticky. It was, so the countdown stayed on screen — but the run
          header is opaque and the question scrolls underneath it, so on any
          question long enough to need scrolling (all of GK: "Consider the
          following statements... 1... 2... 3...") the first line of the stem
          slid under the card and simply vanished. A timer you can scroll back
          to costs less than a question you cannot read. The English test fits
          on one screen anyway, so the clock is visible for the whole run there. */}
      <div className="relative z-40">
        <PotterCoach
          index={idx}
          total={quiz.length}
          answered={quiz.length - blanks.length}
          secondsLeft={seconds}
          // "was JUST answered", not "is answered" — see justAnswered below.
          justAnswered={justAnswered}
        />

        {/* Ring, dots and the progress line ride together at the top of the run.
            `top-0` is correct rather than lucky: the scroll container is the
            panel's <main>, and the navbar sits outside it. */}
        {/* `run-head` turns this stack on its side below 620px — see globals.css.
            Stacked, the ring alone is 150px and the run header ate 235px of an
            844px phone, which pushed the options off the bottom and forced a
            scroll between reading the question and answering it. */}
        {/* `relative z-10` is what hides his lower half. `.potter-perch` sits at
            z-index 0 as an earlier sibling, so the card must have its own
            stacking context to paint over him — without it his legs cover the
            progress dots, which are buttons you can press. */}
        <div className="card run-head relative z-10 flex flex-col items-center gap-3">
          <Timer seconds={seconds} total={MARKING.durationSec} />

          <div className="run-head__meta flex flex-col items-center gap-3">
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

          <p className="run-head__count text-sm text-muted text-center">
            Question {idx + 1} of {quiz.length} · {answered} answered
          </p>
          </div>
        </div>
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
            when travelling backwards.
            Potter is a preceding SIBLING of the question, and the question is
            lifted to z-10 — a child can never be occluded by its own parent,
            because the parent's background paints beneath its children. */}
        <div key={idx} className={`q-in${dir < 0 ? " back" : ""}`}>
          <div>
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
                setLastPick({ idx, at: Date.now() });
              }}
            />
          </div>
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
        // The backdrop is a dismiss convenience for mouse/touch only — every
        // keyboard path (Escape, focus trap) is handled by the dialog itself
        // below via `onDialogKeyDown`, so the backdrop needs no key handler
        // of its own.
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          {/* `onKeyDown` here is the Escape/Tab-trap handler for the whole
              dialog, not a control the user tabs to directly — `alertdialog`
              isn't in jsx-a11y's interactive-role list, but this is the
              standard modal keyboard-trap pattern, not a stray listener. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
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
