"use client";

import { useState } from "react";
import Link from "next/link";
import JoinLine from "./JoinLine";

/**
 * A real question from the bank, answerable right here.
 *
 * This is the page's whole conversion argument. Telling a candidate that the
 * marking is real converts worse than charging them 0.25 marks for a guess and
 * letting them feel it. Answering one question is also a micro-commitment: the
 * set is "1 of 10" from the moment they tap, and finishing something you have
 * started is a much easier ask than starting something you have not.
 *
 * The question, options and correct index are passed in from the server so this
 * is genuinely a record from `questions.json` — not a mock-up of one.
 */
export default function TryQuestion({
  stem,
  target,
  options,
  answer,
  paper,
}: {
  stem: string;
  /** The phrase the paper underlines. Highlighted, exactly as in the app. */
  target: string;
  options: string[];
  answer: number;
  paper: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const done = picked !== null;
  const right = picked === answer;

  const at = target ? stem.toLowerCase().indexOf(target.toLowerCase()) : -1;
  const before = at >= 0 ? stem.slice(0, at) : stem;
  const hit = at >= 0 ? stem.slice(at, at + target.length) : "";
  const after = at >= 0 ? stem.slice(at + target.length) : "";

  return (
    <div className={`try ${done ? "try--done" : ""}`}>
      <div className="try-top">
        <span className="try-tag">{paper}</span>
        <span className="try-rule">
          <b>+1</b> correct <i>/</i> <b>−0.25</b> wrong
        </span>
      </div>

      {/* What you are actually being asked to do.
          Without this the card was a flat statement with four options under
          it and no task — a visitor had to reverse-engineer the question from
          the answers. The app's own QuestionCard prints this instruction; the
          landing page was the one place showing a question without it. */}
      <p className="try-task">
        <span aria-hidden="true">▸</span> Improve the highlighted part
      </p>

      <p className="try-stem">
        {before}
        {hit && <mark>{hit}</mark>}
        {after}
      </p>

      <div className="try-opts" role="group" aria-label="Choose an answer">
        {options.map((o, i) => {
          const isAnswer = i === answer;
          const state = !done
            ? ""
            : isAnswer
              ? "is-right"
              : i === picked
                ? "is-wrong"
                : "is-dim";
          return (
            <button
              key={o}
              type="button"
              className={`try-opt ${state}`}
              disabled={done}
              onClick={() => setPicked(i)}
            >
              <span className="try-key">{String.fromCharCode(65 + i)}</span>
              <span className="try-text">{o}</span>
              {done && isAnswer && (
                <span className="try-mark try-mark--ok" aria-hidden="true">+1.00</span>
              )}
              {done && !isAnswer && i === picked && (
                <span className="try-mark try-mark--bad" aria-hidden="true">−0.25</span>
              )}
            </button>
          );
        })}
      </div>

      {/* The payoff. `aria-live` so a screen reader is told the outcome rather
          than only being shown it. */}
      <div className="try-out" aria-live="polite">
        {done ? (
          <>
            <p className="try-verdict">
              {/* Explicit spaces: JSX drops the leading space of a text node
                  that follows an element, so this rendered "Correct.That's". */}
              {right ? (
                <>
                  <b className="try-verdict-ok">Correct.</b>{" "}
                  That&apos;s 1 of 10 — and you&apos;re on the clock for the
                  other nine.
                </>
              ) : (
                <>
                  <b className="try-verdict-bad">Not this time.</b>{" "}
                  That guess would have cost you a quarter mark in the real
                  paper.
                </>
              )}
            </p>
            <Link href="/" className="btn btn--go try-cta">
              Finish today&apos;s set
              <span aria-hidden="true">→</span>
            </Link>
            <JoinLine />
          </>
        ) : (
          <p className="try-hint">Tap an answer — it&apos;s marked instantly.</p>
        )}
      </div>
    </div>
  );
}
