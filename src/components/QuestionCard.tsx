"use client";

import { useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { Question, QuestionPart } from "@/types";

const LETTER_LABELS = ["A", "B", "C", "D"] as const;

/**
 * The one `answerSource` that traces to a key UPSC actually published (Series A,
 * `answer_keys/keys.json`) — 464 of the 803 questions.
 *
 * Everything else is hand-written or hand-transcribed. `verified` was typed from
 * the paper with no key to check it against; `verified-pyq-pattern` and
 * `predicted-cds-pattern` are constants stamped on every record in their sets and
 * record nothing about verification at all, despite one of them starting with the
 * word "verified". A hand-typed key is not a key: the old `verified-key` tier came
 * from `answer_keys/manual_keys.json`, which disagreed with the official key on
 * 20.6% of its entries, and twelve wrong answers shipped under the app's strongest
 * label before that was caught.
 *
 * So the line below is drawn in exactly one place — at the official key — and
 * everything on the other side of it gets the same, plain warning.
 */
const OFFICIAL_KEY_SOURCE = "official-key";

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

/** `S1`/`S6` are the sentences the paper gives you; `P`–`S` are the jumble. */
const SEGMENT_LABEL = /(?:^|\s)(S1|S6|[PQRS])\s*:\s*/g;

/**
 * Sentence-ordering questions arrive as one run-on paragraph:
 * `"S1 : Good memory is so common … S6 : She wheeled away … P : I have heard of
 * a father who … Q : A little later … The proper sequence should be"`.
 *
 * Six sentences in a single wall of text is unreadable on a phone, and the whole
 * task is comparing them against each other. Split them back onto their own
 * lines so they can be scanned — the paper prints them as a list, and this only
 * restores that.
 *
 * Returns null unless at least four labels are present, so an ordinary stem that
 * happens to contain "P :" is never chopped up. The trailing instruction ("The
 * proper sequence should be") is handed back separately as `tail`; it is the
 * actual question and belongs under the list, not inside the last segment.
 *
 * Note this cannot rescue the eleven `Ordering Of Words` questions whose labels
 * OCR'd into a run at the end of the text — `"… began to replace P Q R the
 * coarse woollens S"`. There the segment boundaries are gone, and inventing them
 * would mean guessing at where each fragment starts.
 */
function splitLabelledStem(
  stem: string,
): { parts: QuestionPart[]; tail: string } | null {
  const hits = [...stem.matchAll(SEGMENT_LABEL)];
  if (hits.length < 4) return null;

  const parts: QuestionPart[] = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const from = h.index + h[0].length;
    const to = i + 1 < hits.length ? hits[i + 1].index : stem.length;
    const text = stem.slice(from, to).trim();
    if (text) parts.push({ label: h[1], text, fixed: /^S[16]$/.test(h[1]) });
  }
  if (parts.length < 4) return null;

  // The instruction is glued to the end of the final segment.
  const last = parts[parts.length - 1];
  const cut = /\s*(The proper sequence should be.*)$/i.exec(last.text);
  let tail = "";
  if (cut) {
    tail = cut[1].trim();
    last.text = last.text.slice(0, cut.index).trim();
  }
  return { parts, tail };
}

/**
 * Locate `phrase` in `text` on whole-word boundaries; returns [start, end).
 *
 * Takes a phrase, not just a word: what a sentence-improvement item underlines
 * is usually several words ("are touring", "passed from"), and an idiom is
 * always more than one. Internal whitespace is matched loosely so a target
 * recorded with a single space still finds a stem that wrapped across a line.
 */
function findWord(text: string, word: string): [number, number] | null {
  const pattern = escapeRegExp(word.trim()).replace(/\\?\s+/g, "\\s+");
  const m = new RegExp(`(^|[^A-Za-z])(${pattern})(?![A-Za-z])`, "i").exec(text);
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
/**
 * A phrase the paper itself put in quotes.
 *
 * This is the marker an idiom, a phrasal verb or a "what does X mean" item is
 * printed with, and it is not a guess: the quotation marks are in the source
 * paper, so the span they enclose is exactly the span being tested. Bounded at
 * 60 characters so a quoted *sentence* inside a comprehension item cannot be
 * mistaken for a quoted term.
 */
const QUOTED_PHRASE = /['"‘“]([A-Za-z][A-Za-z' ‐-―-]{1,58}[A-Za-z.])['"’”]/;
const NOT_TARGETS = ["CDS", "UPSC"];

/**
 * Range of the word or phrase an item is testing.
 *
 * `question.target` is the authoritative source and is tried first for every
 * topic. It used to be consulted only for synonyms and antonyms, which is why
 * a sentence-improvement item never highlighted the part you are asked to
 * improve, and an idiom never highlighted the idiom — the data was there and
 * the render threw it away.
 *
 * The fallbacks after it are ordered by how much they are guessing. A quoted
 * phrase is printed in the paper and is as good as `target`; the capitals
 * heuristics only apply to synonym/antonym items, where a word in capitals IS
 * the convention. Nothing here infers a target from sentence structure — an
 * unhighlighted stem is recoverable, a confidently highlighted *wrong* word is
 * not, and that trade was already settled once.
 */
function findTargetRange(
  text: string,
  target?: string,
  synAnt = false,
): [number, number] | null {
  if (target) {
    const range = findWord(text, target);
    if (range) return range;
  }

  const quoted = QUOTED_PHRASE.exec(text);
  if (quoted) {
    const range = findWord(text, quoted[1]);
    if (range) return range;
  }

  if (!synAnt) return null;

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
  // Every topic, not just synonyms and antonyms: an improvement item has a
  // part to improve and an idiom has an idiom, and both were being rendered
  // flat because the highlight was gated on the topic rather than on whether
  // there was anything to highlight.
  const targetRange = findTargetRange(stem, question.target, isSynAnt);

  // A stem carrying its own `S1 :`/`P :` labels is a sentence-ordering question
  // whose parts were never split out into `parts`. Recover them for display, so
  // six sentences are six lines instead of one paragraph.
  const split = question.parts?.length ? null : splitLabelledStem(stem);
  const parts = question.parts?.length ? question.parts : split?.parts;

  // An item whose options include some spelling of "No improvement" is asking
  // you to improve one part of the sentence. Read off the options rather than
  // the topic label: 29 of these ship filed under "General" or "Comprehension",
  // and the instruction has to be right for all of them, not for the ones that
  // happen to be catalogued correctly.
  const isImprovement = question.options.some((o) =>
    /^\s*no\s*improvement\s*$/i.test(o),
  );

  // Never promise a highlight we did not render.
  // Kept short deliberately. "Select the word nearest in meaning to the
  // highlighted word" wrapped to two lines at 360px, and those two lines were
  // enough to push the fourth option under the fold on a timed screen. The
  // highlight already says which word; the instruction only has to say what to
  // do with it.
  const prompt = isSynAnt
    ? targetRange
      ? isAntonym
        ? "Pick the opposite of the highlighted word"
        : "Pick the closest meaning to the highlighted word"
      : isAntonym
        ? "Pick the option most nearly opposite in meaning"
        : "Pick the option closest in meaning"
    : isImprovement
      ? targetRange
        ? "Choose the best replacement for the highlighted part"
        : "Choose the best version of the sentence, or “No improvement”"
      : null;

  const stemNode: ReactNode = targetRange ? (
    <>
      {renderWithBlanks(stem.slice(0, targetRange[0]))}
      <mark className="target-word">
        {stem.slice(targetRange[0], targetRange[1])}
      </mark>
      {renderWithBlanks(stem.slice(targetRange[1]))}
    </>
  ) : (
    renderWithBlanks(stem)
  );

  const labels = hasFixedOptions(question)
    ? (stemOptionLabels(question.question, question.options) ?? LETTER_LABELS)
    : LETTER_LABELS;

  // Only `cds*` records come from a real paper; `year`/`session` on the
  // hand-written ones are placeholders, so no paper is claimed for them.
  const fromPaper = question.id.startsWith("cds");

  // Review screen only, and only for the questions that need it. During a run
  // it would be noise — nobody is weighing whether to trust an answer they have
  // not seen yet — and on an `official-key` item there is nothing to warn about,
  // so the common case (464 of 803) stays completely clean.
  const flagProvenance =
    showResult && question.answerSource !== OFFICIAL_KEY_SOURCE;

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

  const partsBlock = parts && parts.length > 0 && (
    <div className="space-y-1.5">
      {parts.map((p) => (
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
              p.fixed ? "bg-surface-2 text-muted" : "bg-accent-soft text-accent-ink"
            }`}
          >
            {p.label}
          </span>
          <span
            className={`min-w-0 text-[0.875rem] leading-snug pt-0.5 ${
              p.fixed ? "text-muted italic" : "text-ink"
            }`}
          >
            {p.text}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="card space-y-4">
      {/* A plain div, not <header>: outside a sectioning ancestor a <header>
          becomes a banner landmark, and the results page stacks ten cards. */}
      <div className="space-y-2.5">
        {/* Hidden on a phone DURING a test only: the timer row directly above
            already reads "Question 1 of 10 · 0 answered", so this repeats it a
            few pixels lower and costs a line the options need. On the review
            screen there is no timer row, so it stays — that is the only place
            the number is actually load-bearing. */}
        <p
          className={`text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted ${
            showResult ? "" : "q-index--during-test"
          }`}
        >
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
          {/* The provenance chip ("Official UPSC key" / "Unverified practice
              item") used to sit here and was removed on request: it took a
              whole row on a phone and it is grading the bank, not the learner.
              It has not come back as a chip. What replaced it is one muted line
              under the answer on the review screen, and only for items that are
              not from an official key — see `flagProvenance` below. */}
        </div>
      </div>

      {question.passage && (
        <div
          role="region"
          aria-label="Reading passage"
          // `role="region"` is a landmark, not an interactive role, so
          // jsx-a11y reads this tabIndex as misplaced — but this box scrolls
          // (`overflow-y-auto`) and is the WCAG-recommended way to make a
          // scrollable content region keyboard-operable (arrow/Page keys),
          // which needs it to be focusable.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          className={`text-sm text-ink bg-surface border border-line px-4 py-3 rounded-xl max-h-48 overflow-y-auto leading-relaxed ${FOCUS_RING}`}
        >
          {question.passage}
        </div>
      )}

      {/* When the parts were recovered from the stem, they read BEFORE the
          instruction, the way the paper prints them: the sentences, then "The
          proper sequence should be", then the options. A question that already
          carried `parts` keeps its original order. Done by placing the block
          rather than with flex `order`, which would have jumped it past the
          options to the very bottom of the card. */}
      {split && partsBlock}

      <div className="space-y-1.5">
        {prompt && (
          <p className="text-[0.8125rem] text-muted leading-snug">{prompt}</p>
        )}
        <p
          id={stemId}
          className={`font-medium text-ink text-pretty ${
            split
              ? "text-[0.9375rem] leading-snug"
              : "text-[1.125rem] leading-[1.4]"
          }`}
        >
          {split ? split.tail || "Put the parts in the correct order." : stemNode}
        </p>
      </div>

      {!split && partsBlock}

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
                <span className="flex-1 min-w-0 text-[0.9375rem] leading-[1.35] break-words">
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

      {/* Deliberately a line of text, not a box, a chip or a row: the boxed
          version of this pushed the explanation below the fold on every one of
          ten cards. It sits directly under the answers because that is where
          someone decides whether to believe one. */}
      {flagProvenance && (
        <p className="text-[0.75rem] leading-relaxed text-muted">
          Practice item — not from an official answer key.
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
              <span className="grow shrink basis-40 min-w-0 text-[0.9375rem] leading-[1.35] break-words text-ink">
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
