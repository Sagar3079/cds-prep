"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import RandomTestUpsell from "@/components/RandomTestUpsell";
import AnswerExplanation from "@/components/AnswerExplanation";
import LeaderboardNote from "@/components/LeaderboardNote";
import PotterRider from "@/components/potter/PotterRider";
import QuestionCard from "@/components/QuestionCard";
import ScoreRing, { formatScore } from "@/components/ScoreRing";
import { MARKING, scoreAnswers } from "@/lib/daily";
import { SUBJECT_LABEL, toSubject } from "@/lib/subject";
import type { Question, QuestionPart, Subject } from "@/types";

const STORAGE_KEY = "cds-last-result";

/* ── the handoff payload ───────────────────────────────────────────────────── */

interface ReviewSet {
  date: string;
  mode: "daily" | "random";
  subject: Subject;
  timeTaken: number;
  questions: Question[];
  answers: (number | null)[];
  score: number;
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function finite(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function toParts(v: unknown): QuestionPart[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const parts: QuestionPart[] = [];
  for (const p of v) {
    if (!isRecord(p)) continue;
    if (typeof p.label !== "string" || typeof p.text !== "string") continue;
    parts.push({ label: p.label, text: p.text, fixed: p.fixed === true });
  }
  return parts.length > 0 ? parts : undefined;
}

function toQuestion(v: unknown): Question | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== "string" || typeof v.question !== "string") return null;
  if (!Array.isArray(v.options) || v.options.length === 0) return null;
  const options = v.options.filter((o): o is string => typeof o === "string");
  if (options.length !== v.options.length) return null;

  return {
    id: v.id,
    year: finite(v.year),
    session: finite(v.session),
    qnum: typeof v.qnum === "number" ? v.qnum : undefined,
    passage: typeof v.passage === "string" ? v.passage : null,
    question: v.question,
    parts: toParts(v.parts),
    target: typeof v.target === "string" ? v.target : undefined,
    subject: v.subject === "gk" ? "gk" : undefined,
    fixedOptions: v.fixedOptions === true,
    options,
    // `answer` is legitimately nullable in the bank; don't coerce it to a number.
    answer:
      typeof v.answer === "number" && Number.isInteger(v.answer)
        ? v.answer
        : null,
    answerSource: typeof v.answerSource === "string" ? v.answerSource : "",
    topic: typeof v.topic === "string" ? v.topic : undefined,
  };
}

/**
 * sessionStorage is not a trusted channel: the payload can be stale from an
 * older build, half-written, or hand-edited in devtools, and there is no error
 * boundary above this page. Anything that does not validate is treated as "no
 * result" rather than thrown at render.
 *
 * The counts are recomputed from the questions and answers with the same
 * `scoreAnswers` that wrote the attempt, so the hero can never contradict the
 * review list underneath it.
 */
function parseReviewSet(raw: unknown): ReviewSet | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) return null;

  const questions: Question[] = [];
  for (const q of raw.questions) {
    const parsed = toQuestion(q);
    if (!parsed) return null;
    questions.push(parsed);
  }

  const stored = Array.isArray(raw.answers) ? raw.answers : [];
  const answers = questions.map((q, i) => {
    const a = stored[i];
    return typeof a === "number" &&
      Number.isInteger(a) &&
      a >= 0 &&
      a < q.options.length
      ? a
      : null;
  });

  const marked = scoreAnswers(questions, answers);

  return {
    date: typeof raw.date === "string" ? raw.date : "",
    mode: raw.mode === "random" ? "random" : "daily",
    subject: toSubject(raw.subject),
    timeTaken: Math.max(
      0,
      Math.min(MARKING.durationSec, Math.round(finite(raw.timeTaken))),
    ),
    questions,
    answers,
    ...marked,
  };
}

/* ── formatting ────────────────────────────────────────────────────────────── */

function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Client-only (rendered after the mount read), so locale formatting is safe. */
function formatDay(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** One line, and it has to stay true for a score below zero. */
function verdictFor(score: number, total: number): string {
  if (score < 0) return "The penalties outran the marks this time.";
  const ratio = total > 0 ? score / total : 0;
  if (ratio >= 0.7) return "Strong set.";
  if (ratio >= 0.4) return "Solid effort.";
  return "Worth another look.";
}

/* ── confetti ──────────────────────────────────────────────────────────────── */

const CONFETTI_TOKENS = [
  "--accent",
  "--streak",
  "--ok",
  "--accent-ink",
  "--streak-soft",
];
const CONFETTI_FALLBACK = [
  "#2f6bff",
  "#ff8a3d",
  "#16a34a",
  "#9db9ff",
  "#ffc49b",
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
}

function confettiColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  const picked = CONFETTI_TOKENS.map((t) =>
    style.getPropertyValue(t).trim(),
  ).filter((c) => c.length > 0);
  return picked.length > 0 ? picked : CONFETTI_FALLBACK;
}

/**
 * Hand-rolled canvas particles — no library. Sits over the hero card and never
 * takes a pointer event.
 *
 * The `prefers-reduced-motion` guard in globals.css only reaches CSS animations,
 * so a JS-driven animation has to check `matchMedia` itself.
 */
function ConfettiBurst({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);

    const colors = confettiColors();
    const particles: Particle[] = Array.from({ length: 110 }, () => ({
      x: width / 2 + (Math.random() - 0.5) * Math.min(120, width * 0.5),
      y: height * 0.32,
      vx: (Math.random() - 0.5) * 7,
      vy: -Math.random() * 9 - 3,
      size: 4 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
    }));

    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      let alive = false;
      for (const p of particles) {
        p.vy += 0.26;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= 0.008;
        if (p.life <= 0 || p.y > height + 40) continue;
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
        ctx.restore();
      }
      if (alive) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(frame);
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    />
  );
}

/* ── page ──────────────────────────────────────────────────────────────────── */

type ReadState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; data: ReviewSet };

export default function ResultsPage() {
  // Three states, not two: `result === null` used to mean both "not read yet"
  // and "nothing to show", so the empty state flashed for a frame on every
  // submit before the effect had run.
  const [state, setState] = useState<ReadState>({ status: "loading" });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [onlyMissed, setOnlyMissed] = useState(false);
  /**
   * Open the band between review cards that Potter perches in, and only while
   * he is actually there — hidden in Settings, or on a narrow / reduced-motion
   * viewport, the list goes back to its normal 14px rhythm.
   */
  const [riderOn, setRiderOn] = useState(false);

  useEffect(() => {
    setReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    let parsed: ReviewSet | null = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      parsed = raw === null ? null : parseReviewSet(JSON.parse(raw) as unknown);
    } catch {
      parsed = null;
    }
    setState(parsed ? { status: "ready", data: parsed } : { status: "empty" });
  }, []);

  const data = state.status === "ready" ? state.data : null;

  // "Missed" is everything you did not get right — wrong answers and blanks
  // both belong in a revision list.
  const missed = useMemo(() => {
    if (!data) return new Set<number>();
    const out = new Set<number>();
    data.questions.forEach((q, i) => {
      if (data.answers[i] !== q.answer) out.add(i);
    });
    return out;
  }, [data]);

  const visible = useMemo(() => {
    if (!data) return [];
    const all = data.questions.map((q, i) => ({ q, i }));
    return onlyMissed ? all.filter(({ i }) => missed.has(i)) : all;
  }, [data, onlyMissed, missed]);

  if (state.status === "loading") {
    return (
      <div className="px-4 py-6">
        <p role="status" className="sr-only">
          Loading your results…
        </p>
        <div
          className="card flex flex-col items-center gap-4"
          aria-hidden="true"
        >
          <div className="h-3 w-48 max-w-full rounded-full bg-surface-2" />
          <div className="h-[150px] w-[150px] rounded-full border-[11px] border-surface-2" />
          <div className="h-4 w-32 rounded-full bg-surface-2" />
          <div className="grid w-full grid-cols-3 gap-2.5">
            <div className="h-16 rounded-xl bg-surface-2" />
            <div className="h-16 rounded-xl bg-surface-2" />
            <div className="h-16 rounded-xl bg-surface-2" />
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="px-4 py-6">
        <div className="card fade-up flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-lg font-bold tracking-tight text-ink">
            No results yet
          </p>
          <p className="max-w-[26ch] text-sm leading-relaxed text-muted">
            Your last review lives in this tab only. Take today&apos;s test and
            it will appear here.
          </p>
          <Link href="/test" className="btn-primary">
            Go to test
          </Link>
        </div>
      </div>
    );
  }

  const set = state.data;
  const answered = set.correct + set.wrong;
  // Accuracy is correct as a share of what was actually answered — the same
  // definition getStats() uses on the home page. correct/total is a different
  // number and must not be labelled "accuracy" alongside it.
  const accuracy =
    answered > 0 ? Math.round((set.correct / answered) * 100) : 0;
  const timedOut = set.timeTaken >= MARKING.durationSec;
  const negative = set.score < 0;
  const celebrate = set.total > 0 && set.score >= set.total * 0.7;
  const day = formatDay(set.date);
  const headline = negative
    ? `Net score ${formatScore(set.score)} — the penalties outweighed the marks earned.`
    : `Scored ${formatScore(set.score)} out of ${set.total}.`;

  // Where a "Retake" goes, and where the upsell's random set goes: back into the
  // subject that was just reviewed, not silently into English.
  const retakeHref =
    set.subject === "english" ? "/test" : `/test?subject=${set.subject}`;

  const meta = [
    SUBJECT_LABEL[set.subject],
    set.mode === "random" ? "Random set" : "Daily set",
    day,
    timedOut ? "Time expired" : "Submitted",
    `${mmss(set.timeTaken)} taken`,
  ].filter((part) => part.length > 0);

  return (
    <div className="space-y-4 px-4 py-6">
      <h1 className="sr-only">Your results</h1>

      <div className="relative">
        <ConfettiBurst active={celebrate} />
        <section className="card stagger flex flex-col items-center gap-3.5 text-center">
          <p className="text-[0.6875rem] font-bold uppercase leading-relaxed tracking-[0.12em] text-muted">
            {meta.join(" · ")}
          </p>

          <ScoreRing
            score={set.score}
            total={set.total}
            caption={negative ? "net score" : `out of ${set.total}`}
            label={headline}
            reducedMotion={reducedMotion}
          />

          <div>
            <p className="text-[1.0625rem] font-extrabold tracking-tight text-ink">
              {verdictFor(set.score, set.total)}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {answered > 0
                ? `${accuracy}% accuracy on ${answered} answered`
                : "Nothing answered — every question scored 0"}
            </p>
          </div>

          <div className="grid w-full grid-cols-3 gap-2.5">
            <div className="rounded-xl bg-ok-soft px-1 py-3">
              <p className="text-xl font-extrabold text-ok-ink">
                {set.correct}
              </p>
              <p className="text-[0.6875rem] font-semibold text-muted">
                correct
              </p>
            </div>
            <div className="rounded-xl bg-err-soft px-1 py-3">
              <p className="text-xl font-extrabold text-err-ink">{set.wrong}</p>
              <p className="text-[0.6875rem] font-semibold text-muted">wrong</p>
            </div>
            <div className="rounded-xl bg-surface-2 px-1 py-3">
              <p className="text-xl font-extrabold text-ink">{set.skipped}</p>
              <p className="text-[0.6875rem] font-semibold text-muted">blank</p>
            </div>
          </div>
        </section>
      </div>

      <p role="status" className="sr-only">
        {`${headline} ${set.correct} correct, ${set.wrong} wrong, ${set.skipped} blank.`}
      </p>

      <p className="text-center text-xs text-muted">
        +{MARKING.correct} correct · −{Math.abs(MARKING.wrong)} wrong ·{" "}
        {MARKING.skip} blank
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <Link href={retakeHref} className="btn-ghost">
          Retake
        </Link>
        <Link href="/" className="btn-primary">
          Home
        </Link>
      </div>

      {/* What the leaderboard did with this run, if anything. Renders nothing
          while the POST is in flight, nothing for a random set, and nothing at
          all if the request never happened — the score above does not depend on
          it in any way. */}
      <LeaderboardNote />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h2 className="text-lg font-extrabold tracking-tight text-ink">
          Review
        </h2>
        <div
          role="group"
          aria-label="Filter the review"
          className="flex flex-wrap gap-2"
        >
          <FilterPill active={!onlyMissed} onClick={() => setOnlyMissed(false)}>
            All {set.total}
          </FilterPill>
          <FilterPill
            active={onlyMissed}
            disabled={missed.size === 0}
            title={
              missed.size === 0
                ? "Nothing to review — you got every question right"
                : `Show only the ${missed.size} you answered wrong or left blank`
            }
            onClick={() => setOnlyMissed(true)}
          >
            {/* Not "mistakes": this set includes blanks, and under −0.25
                  marking leaving a question blank is often the right call.
                  Labelling it a mistake contradicts the strategy the rest of
                  the app teaches. */}
            Wrong or blank · {missed.size}
          </FilterPill>
        </div>
      </div>

      {/* Potter is a SIBLING of the list, not a child: <ol> may only contain
          <li>, and a stray <div> breaks the list role mapping and puts his
          button ahead of question 1 in the reading order. The wrapper is what
          he measures against. */}
      <div className="relative">
        <PotterRider
          containerSelector=".panel-body > main"
          itemSelector="[data-review-card]"
          items={visible.map(({ q, i }) => ({
            id: q.id,
            chosen: set.answers[i],
            correct: set.answers[i] === q.answer,
            skipped: set.answers[i] === null,
          }))}
          onActiveChange={setRiderOn}
        />

        {/* The row rhythm is owned by `.review-list` in globals.css, not by a
            `space-y-*` utility: the gap has to change with `data-rider`, and an
            unlayered component class beats a Tailwind utility anyway. */}
        <ol className="review-list" data-rider={riderOn ? "on" : "off"}>
          {visible.map(({ q, i }, position) => (
            <li
              key={`${onlyMissed ? "missed" : "all"}-${i}-${q.id}`}
              data-review-card=""
              className="fade-up"
              /* animation-delay cannot come from a Tailwind utility here: the
                 unlayered `.fade-up` shorthand in globals.css would reset it. */
              style={
                reducedMotion
                  ? undefined
                  : { animationDelay: `${Math.min(position, 9) * 45}ms` }
              }
            >
              <QuestionCard
                question={q}
                index={i}
                total={set.total}
                selected={set.answers[i]}
                onSelect={() => {}}
                showResult
              />
              <AnswerExplanation id={q.id} chosen={set.answers[i]} />
            </li>
          ))}
        </ol>
      </div>

      <RandomTestUpsell />

      <div className="flex justify-center pt-1">
        <Link href="/" className="btn-ghost">
          Back to home
        </Link>
      </div>
    </div>
  );
}

/**
 * Selection is not carried by colour alone — the dot appears, the border
 * changes, and `aria-pressed` says it outright.
 */
function FilterPill({
  active,
  disabled = false,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
        active
          ? "border-accent bg-accent-soft text-accent-ink"
          : "border-line bg-paper text-muted hover:text-ink"
      } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
    >
      {active && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-accent"
        />
      )}
      {children}
    </button>
  );
}
