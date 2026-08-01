"use client";

import { useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { Question } from "@/types";

const LETTER_LABELS = ["A", "B", "C", "D"] as const;

/**
 * `fixedOptions` marks a question whose option order carries meaning — the stem
 * labels its own fragments "(a) … / (b) …", or an option refers to another option
 * ("Both A and B", "None of the above"). Shuffling those makes the card
 * self-contradictory. Declared here rather than on `Question` because
 * `src/types.ts` is owned elsewhere; this intersection stays correct once the
 * field lands there.
 */
type FixedOptionQuestion = Question & { fixedOptions?: boolean };

function hasFixedOptions(q: Question): boolean {
  return (q as FixedOptionQuestion).fixedOptions === true;
}

/* ── answer provenance ─────────────────────────────────────────────────────── */

type TrustTier = "keyed" | "transcribed" | "unverified";

interface Trust {
  tier: TrustTier;
  label: string;
  detail: string;
}

/**
 * `answerSource` is the only honest signal of how far an answer can be trusted.
 * The names are misleading — three of the four begin with "verified" but only
 * `verified-key` was ever checked against an external key, and the two "pattern"
 * tiers are fixed strings stamped on every hand-written item. Say so plainly:
 * a learner reviewing a wrong answer has to know whether the key is worth
 * arguing with.
 */
const ANSWER_TRUST: Record<string, Trust> = {
  "verified-key": {
    tier: "keyed",
    label: "Matched to answer key",
    detail:
      "Checked against the published CDS-1 2018 answer key — the only external key behind any answer in this bank.",
  },
  verified: {
    tier: "transcribed",
    label: "Transcribed by hand",
    detail:
      "Typed by hand from the paper, without an answer key. The transcriber recorded doubts about some of these, so treat the answer as likely rather than settled.",
  },
  "verified-pyq-pattern": {
    tier: "unverified",
    label: "Unverified practice item",
    detail:
      "Written by hand in the CDS pattern and never checked against any answer key. Despite its name, this label is stamped on every item in that set — it records nothing about verification.",
  },
  "predicted-cds-pattern": {
    tier: "unverified",
    label: "Unverified practice item",
    detail:
      "Written by hand in the CDS pattern and never checked against any answer key. Nothing about this answer has been confirmed against a source.",
  },
};

const UNKNOWN_TRUST: Trust = {
  tier: "unverified",
  label: "Provenance unknown",
  detail: "This item carries no recognised provenance label. Treat the answer as unverified.",
};

/**
 * Tier is carried by the wording first and by the border style second — solid
 * for the two tiers that trace back to a paper, dashed for the ones that record
 * nothing about verification. Colour only reinforces; it never carries the
 * distinction on its own.
 */
const TRUST_STYLES: Record<TrustTier, string> = {
  keyed: "chip-green border border-ok",
  transcribed: "border border-streak-ink",
  unverified: "chip-amber",
};

/* ── stem formatting ───────────────────────────────────────────────────────── */

function formatBlanks(text: string, topic?: string): string {
  let t = text
    .replace(/_{2,}/g, "______")
    .replace(/\.{4,}/g, "______")
    .replace(/…+/g, "______");
  if (/blank|fill in|cloze/i.test(topic || "") && !/______/.test(t)) {
    t = t.replace(/[.?]?\s*$/, " ______");
  }
  return t;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Locate `word` as a whole word in `text`; returns its [start, end) or null. */
function findWord(text: string, word: string): [number, number] | null {
  const m = new RegExp(
    `(^|[^A-Za-z])(${escapeRegExp(word)})(?![A-Za-z])`,
    "i"
  ).exec(text);
  if (!m) return null;
  const start = m.index + m[1].length;
  return [start, start + m[2].length];
}

/** Lead-in phrases of the "Choose the word nearest in meaning to: ABATE" form. */
const TARGET_LEAD_IN =
  /(?:nearest in meaning to|opposite in meaning to|nearest meaning of|meaning of|opposite of|synonym of|antonym of)\s*[:-]?\s*/i;
/** Case-sensitive on purpose — the lead-in is matched case-insensitively above,
 *  but the tested word is identified by being in capitals. */
const CAPS_AFTER_LEAD_IN = /^([A-Z][A-Z'’-]{2,})/;
const CAPS_ANYWHERE = /\b([A-Z]{3,})\b/;
const QUOTED_WORD = /['"‘’]([A-Za-z][A-Za-z'-]+)['"‘’]/;
const NOT_TARGETS = ["CDS", "UPSC"];

/**
 * Range of the word a synonym/antonym item is testing. `question.target` is the
 * authoritative source; the fallbacks below only exist for records that predate
 * it and are deliberately allowed to fail — an unhighlighted stem is recoverable,
 * a confidently highlighted *wrong* word is not.
 */
function findTargetRange(text: string, target?: string): [number, number] | null {
  if (target) {
    const range = findWord(text, target);
    if (range) return range;
  }

  const lead = TARGET_LEAD_IN.exec(text);
  if (lead) {
    const at = lead.index + lead[0].length;
    const caps = CAPS_AFTER_LEAD_IN.exec(text.slice(at));
    if (caps) return [at, at + caps[1].length];
  }

  const caps = CAPS_ANYWHERE.exec(text);
  if (caps && !NOT_TARGETS.includes(caps[1])) {
    return [caps.index, caps.index + caps[1].length];
  }

  const quoted = QUOTED_WORD.exec(text);
  if (quoted) return findWord(text, quoted[1]);

  return null;
}

function renderWithBlanks(text: string): ReactNode {
  const parts = text.split(/(______)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part === "______" ? (
      <span
        key={i}
        className="inline-flex justify-center min-w-[4.5rem] mx-1 border-b-2 border-accent align-baseline"
      >
        <span className="sr-only">blank</span>
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/* ── option labelling ──────────────────────────────────────────────────────── */

const STEM_PART = /\(\s*([a-d])\s*\)\s*(.+)$/;

function normaliseFragment(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/\.$/, "").trim().toLowerCase();
}

/**
 * "Find the error: (a) Two thirds of the book / (b) were / (c) rubbish. /
 * (d) No error" numbers its own fragments and the options repeat them, so a
 * rendered label of A–D contradicts the stem. Recover the stem's own labels and
 * use those. All-or-nothing: a partial match falls back to A–D rather than
 * mislabelling one option.
 */
function stemOptionLabels(stem: string, options: string[]): string[] | null {
  const byFragment = new Map<string, string>();
  for (const segment of stem.split("/")) {
    const m = STEM_PART.exec(segment);
    if (m) byFragment.set(normaliseFragment(m[2]), `(${m[1]})`);
  }
  if (byFragment.size !== options.length) return null;
  const labels = options.map((o) => byFragment.get(normaliseFragment(o)));
  if (labels.some((l) => l === undefined)) return null;
  if (new Set(labels).size !== labels.length) return null;
  return labels as string[];
}

/* ── icons ─────────────────────────────────────────────────────────────────── */

/** The selection tick that lands in a chosen option. */
function TickIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-[1.125rem] h-[1.125rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M7.6 14.6 3.4 10.4l1.5-1.5 2.7 2.7 7.5-7.5 1.5 1.5z" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="m10 8.6 4.2-4.2 1.4 1.4-4.2 4.2 4.2 4.2-1.4 1.4-4.2-4.2-4.2 4.2-1.4-1.4L8.6 10 4.4 5.8l1.4-1.4z" />
    </svg>
  );
}

/* ── component ─────────────────────────────────────────────────────────────── */

/**
 * Review rows repeat `.option-btn`'s geometry and its correct/wrong tones, but
 * deliberately not the class itself: `.option-btn:hover` outranks
 * `.option-btn.correct`, so a mouse passing over a finished paper would lift the
 * row and repaint its green border blue. Nothing here is clickable, so the badge
 * stays neutral too and the verdict is carried by the icon and the words.
 */
const REVIEW_ROW =
  "flex flex-wrap items-start gap-x-3 gap-y-1.5 w-full text-left rounded-[0.875rem] border-2 px-[0.9375rem] py-[0.8875rem]";
/** The verdict rides beside the option text while both fit, and drops onto its
 *  own line below ~400px rather than squeezing the text into a sliver. The
 *  `basis-40` on the text child is what decides that: flex line-breaking reads
 *  hypothetical main size, and `min-w-0` alone reports zero and never wraps. */
const REVIEW_STATUS =
  "ml-auto shrink-0 flex items-center gap-1 text-xs font-semibold";
/** `globals.css` already paints a 3px accent ring on `:focus-visible`; this
 *  restates it on the elements that must never lose it. */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export default function QuestionCard({
  question,
  index,
  total,
  selected,
  onSelect,
  locked = false,
  showResult = false,
}: {
  question: Question;
  index: number;
  total: number;
  selected: number | null;
  onSelect: (index: number) => void;
  locked?: boolean;
  showResult?: boolean;
}) {
  const uid = useId();
  const stemId = `${uid}-stem`;
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const isSynAnt = /synonym|antonym/i.test(question.topic || "");
  const isAntonym = /antonym/i.test(question.topic || "");

  const stem = formatBlanks(question.question, question.topic);
  const targetRange = isSynAnt ? findTargetRange(stem, question.target) : null;

  // Never promise a highlight we did not render.
  const prompt = !isSynAnt
    ? null
    : targetRange
      ? isAntonym
        ? "Select the word opposite in meaning to the highlighted word"
        : "Select the word nearest in meaning to the highlighted word"
      : isAntonym
        ? "Select the option most nearly opposite in meaning"
        : "Select the option closest in meaning";

  const stemNode: ReactNode = targetRange ? (
    <>
      {stem.slice(0, targetRange[0])}
      <mark className="target-word">
        {stem.slice(targetRange[0], targetRange[1])}
      </mark>
      {stem.slice(targetRange[1])}
    </>
  ) : (
    renderWithBlanks(stem)
  );

  const labels = hasFixedOptions(question)
    ? (stemOptionLabels(question.question, question.options) ?? LETTER_LABELS)
    : LETTER_LABELS;

  const trust = ANSWER_TRUST[question.answerSource] ?? UNKNOWN_TRUST;
  // Only `cds*` records come from a real paper; `year`/`session` on the
  // hand-written ones are placeholders, so no paper is claimed for them.
  const fromPaper = question.id.startsWith("cds");

  const rovingIndex = selected ?? 0;

  const moveTo = (to: number) => {
    onSelect(to);
    optionRefs.current[to]?.focus();
  };

  const onOptionKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (locked) return;
    const n = question.options.length;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        moveTo((i + 1) % n);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        moveTo((i - 1 + n) % n);
        break;
      case "Home":
        e.preventDefault();
        moveTo(0);
        break;
      case "End":
        e.preventDefault();
        moveTo(n - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="card space-y-4">
      {/* A plain div, not <header>: outside a sectioning ancestor a <header>
          becomes a banner landmark, and the results page stacks ten cards. */}
      <div className="space-y-2.5">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted">
          Question {index + 1} of {total}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {question.topic && (
            <span className="chip chip-blue uppercase">{question.topic}</span>
          )}
          {fromPaper && (
            <span className="chip uppercase">
              CDS-{question.session} {question.year}
            </span>
          )}
          <span
            className={`chip uppercase ${TRUST_STYLES[trust.tier]}`}
            title={trust.detail}
          >
            {trust.label}
          </span>
        </div>
      </div>

      {question.passage && (
        <div
          role="region"
          aria-label="Reading passage"
          tabIndex={0}
          className={`text-sm text-ink bg-surface border border-line px-4 py-3 rounded-xl max-h-48 overflow-y-auto leading-relaxed ${FOCUS_RING}`}
        >
          {question.passage}
        </div>
      )}

      <div className="space-y-1.5">
        {prompt && <p className="text-sm text-muted leading-snug">{prompt}</p>}
        <p
          id={stemId}
          className="text-[1.3125rem] font-medium text-ink leading-[1.45] text-pretty"
        >
          {stemNode}
        </p>
      </div>

      {question.parts && question.parts.length > 0 && (
        <div className="space-y-1.5">
          {question.parts.map((p) => (
            <div
              key={p.label}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border ${
                p.fixed
                  ? "bg-surface border-dashed border-line"
                  : "bg-paper border-line"
              }`}
            >
              <span
                className={`shrink-0 min-w-[2rem] h-6 px-1 rounded-md text-xs font-bold flex items-center justify-center ${
                  p.fixed
                    ? "bg-surface-2 text-muted"
                    : "bg-accent-soft text-accent-ink"
                }`}
              >
                {p.label}
              </span>
              <span
                className={`min-w-0 text-[0.95rem] leading-snug pt-0.5 ${
                  p.fixed ? "text-muted italic" : "text-ink"
                }`}
              >
                {p.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {showResult ? (
        <ReviewOptions
          options={question.options}
          labels={labels}
          answer={question.answer}
          selected={selected}
        />
      ) : (
        <div role="radiogroup" aria-labelledby={stemId} className="space-y-2.5">
          {question.options.map((option, i) => {
            const isSelected = selected === i;
            return (
              <button
                key={i}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-disabled={locked || undefined}
                tabIndex={i === rovingIndex ? 0 : -1}
                className={`option-btn group ${FOCUS_RING}`}
                onClick={() => {
                  if (!locked) onSelect(i);
                }}
                onKeyDown={(e) => onOptionKeyDown(e, i)}
              >
                <span className="opt-badge">{labels[i]}</span>
                <span className="flex-1 min-w-0 text-base leading-[1.35] break-words">
                  {option}
                </span>
                {/* The tick holds its space at all times, so selecting an option
                    tints and ticks it without reflowing the text beside it. */}
                <span
                  aria-hidden="true"
                  className="shrink-0 text-accent-ink opacity-0 scale-50 transition duration-200 group-aria-checked:opacity-100 group-aria-checked:scale-100"
                >
                  <TickIcon />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {showResult && (
        <p className="text-xs leading-relaxed text-muted bg-surface border border-line rounded-xl px-3 py-2">
          <strong className="font-semibold text-ink">{trust.label}.</strong>{" "}
          {trust.detail}
        </p>
      )}
    </div>
  );
}

/**
 * Read-only review. Deliberately not buttons: `disabled` buttons drop out of the
 * tab order and are announced as unavailable, which is wrong for content whose
 * whole purpose is to be read after the fact. Correct/wrong is carried by an icon
 * and a word, not by border colour alone.
 */
function ReviewOptions({
  options,
  labels,
  answer,
  selected,
}: {
  options: string[];
  labels: readonly string[];
  answer: number | null;
  selected: number | null;
}) {
  return (
    <>
      <ul className="space-y-2.5">
        {options.map((option, i) => {
          const isCorrect = i === answer;
          const isChosen = selected === i;

          let tone = "border-line bg-paper";
          let status: ReactNode = null;
          if (isCorrect) {
            tone = "border-ok bg-ok-soft";
            status = (
              <span className={`${REVIEW_STATUS} text-ok-ink`}>
                <CheckIcon />
                {isChosen ? "Correct — your answer" : "Correct answer"}
              </span>
            );
          } else if (isChosen) {
            tone = "border-err bg-err-soft";
            status = (
              <span className={`${REVIEW_STATUS} text-err-ink`}>
                <CrossIcon />
                Your answer — incorrect
              </span>
            );
          }

          return (
            <li key={i} className={`${REVIEW_ROW} ${tone}`}>
              <span className="opt-badge">{labels[i]}</span>
              <span className="grow shrink basis-40 min-w-0 text-base leading-[1.35] break-words text-ink">
                {option}
              </span>
              {status}
            </li>
          );
        })}
      </ul>
      {selected === null && (
        <p className="text-xs font-medium text-muted">
          You did not answer this question.
        </p>
      )}
    </>
  );
}
