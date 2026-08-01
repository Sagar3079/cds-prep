"use client";

import type { ReactNode } from "react";
import type { Question } from "@/types";

const LABELS = ["A", "B", "C", "D"] as const;

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

function wrapTarget(text: string, word: string): ReactNode {
  const idx = text.toLowerCase().indexOf(word.toLowerCase());
  if (idx < 0) return null;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="target-word">{text.slice(idx, idx + word.length)}</mark>
      {text.slice(idx + word.length)}
    </>
  );
}

/** Highlight the target word for synonyms/antonyms */
function highlightTargetWord(
  text: string,
  topic?: string,
  target?: string
): ReactNode {
  const isSynAnt = /synonym|antonym/i.test(topic || "");
  if (!isSynAnt) return null;

  if (target) {
    const wrapped = wrapTarget(text, target);
    if (wrapped) return wrapped;
  }

  // Pattern: "meaning to: WORD" / "opposite of: WORD" etc.
  const colonMatch = text.match(
    /((?:nearest in meaning to|opposite in meaning to|meaning of|opposite of|synonym of|antonym of)\s*[:\-]?\s*)([A-Z][A-Z'-]{2,})/i
  );
  if (colonMatch) {
    const idx = text.indexOf(colonMatch[0]);
    const before = text.slice(0, idx + colonMatch[1].length);
    const word = colonMatch[2];
    const after = text.slice(idx + colonMatch[0].length);
    return (
      <>
        {before}
        <mark className="target-word">{word}</mark>
        {after}
      </>
    );
  }

  // ALL-CAPS word
  const caps = text.match(/\b([A-Z]{3,})\b/);
  if (caps && !["CDS", "UPSC"].includes(caps[1])) {
    return wrapTarget(text, caps[1]);
  }

  // quoted word
  const quoted = text.match(/['"‘’]([A-Za-z][A-Za-z'-]+)['"‘’]/);
  if (quoted) {
    return wrapTarget(text, quoted[1]);
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
        className="inline-block min-w-[4.5rem] mx-1 border-b-2 border-lavender-500 align-baseline"
        aria-label="blank"
      />
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function formatQuestionText(
  text: string,
  topic?: string,
  target?: string
): ReactNode {
  const blanked = formatBlanks(text, topic);
  const highlighted = highlightTargetWord(blanked, topic, target);
  if (highlighted) return highlighted;
  return renderWithBlanks(blanked);
}

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
  const isSynAnt = /synonym|antonym/i.test(question.topic || "");
  const prompt = isSynAnt
    ? /antonym/i.test(question.topic || "")
      ? "Select the word opposite in meaning to the highlighted word"
      : "Select the word nearest in meaning to the highlighted word"
    : null;

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wide text-lavender-500">
          Question {index + 1} of {total}
        </span>
        <div className="flex gap-2 text-xs">
          {question.topic && (
            <span className="px-2 py-0.5 rounded-full bg-lavender-100 text-lavender-700">
              {question.topic}
            </span>
          )}
          {question.id.startsWith("cds") ? (
            <span className="px-2 py-0.5 rounded-full bg-lavender-50 text-lavender-600 border border-lavender-200">
              CDS-{question.session} {question.year}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-lavender-50 text-lavender-600 border border-lavender-200">
              Predicted
            </span>
          )}
        </div>
      </div>

      {prompt && (
        <p className="text-sm text-lavender-600 bg-lavender-50 rounded-lg px-3 py-2">
          {prompt}
        </p>
      )}

      {question.passage && (
        <div className="text-sm text-lavender-800/80 bg-lavender-50 border-l-4 border-lavender-400 pl-4 pr-3 py-3 rounded-r-lg max-h-48 overflow-y-auto leading-relaxed">
          {question.passage}
        </div>
      )}

      <p className="text-lg font-medium text-lavender-900 leading-snug">
        {formatQuestionText(question.question, question.topic, question.target)}
      </p>

      {question.parts && question.parts.length > 0 && (
        <div className="space-y-1.5">
          {question.parts.map((p) => (
            <div
              key={p.label}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border ${
                p.fixed
                  ? "bg-lavender-50/60 border-dashed border-lavender-300"
                  : "bg-white border-lavender-200"
              }`}
            >
              <span
                className={`flex-shrink-0 min-w-[2rem] h-6 px-1 rounded-md text-xs font-bold flex items-center justify-center ${
                  p.fixed
                    ? "bg-lavender-200 text-lavender-600"
                    : "bg-lavender-500 text-white"
                }`}
              >
                {p.label}
              </span>
              <span
                className={`text-[0.95rem] leading-snug pt-0.5 ${
                  p.fixed ? "text-lavender-500 italic" : "text-lavender-900"
                }`}
              >
                {p.text}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2.5">
        {question.options.map((option, i) => {
          let cls = "option-btn";
          if (showResult) {
            if (i === question.answer) cls += " correct";
            else if (selected === i && i !== question.answer) cls += " wrong";
          } else if (selected === i) {
            cls += " selected";
          }
          return (
            <button
              key={i}
              type="button"
              disabled={locked || showResult}
              className={cls}
              onClick={() => onSelect(i)}
            >
              <span className="flex-shrink-0 w-7 h-7 rounded-md bg-lavender-100 text-lavender-700 text-sm font-bold flex items-center justify-center">
                {LABELS[i]}
              </span>
              <span className="text-[0.95rem] leading-snug pt-0.5">{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
