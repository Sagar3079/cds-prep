"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSubject } from "@/components/SubjectSwitch";
import { CONFIDENCE_FLOOR, getMastery, weakestTopics, type TopicWeight } from "@/lib/mastery";
import {
  SUBJECT_SHORT,
  subjectOfMasteryKey,
  topicOfMasteryKey,
} from "@/lib/subject";
import type { Subject } from "@/types";

const TONE: Record<TopicWeight["reason"], { bar: string; text: string; word: string }> = {
  weak: { bar: "bg-err", text: "text-err-ink", word: "needs work" },
  shaky: { bar: "bg-streak", text: "text-streak-ink", word: "getting there" },
  solid: { bar: "bg-ok", text: "text-ok-ink", word: "solid" },
  new: { bar: "bg-accent", text: "text-accent-ink", word: "new" },
};

export default function TopicInsight({
  available,
}: {
  available: Subject[];
}) {
  const [topics, setTopics] = useState<TopicWeight[] | null>(null);
  // Shares the home screen's subject choice, so "Practice →" starts a set in
  // whichever subject the switcher above it is showing rather than always
  // English.
  const { subject } = useSubject(available);

  useEffect(() => {
    setTopics(weakestTopics(getMastery(), 3));
  }, []);

  // Until there is real evidence, showing a chart of nothing is worse than
  // showing the rule that will start applying.
  if (topics === null) return null;

  if (topics.length === 0) {
    return (
      <section className="card fade-up">
        <h2 className="text-[0.9375rem] font-bold text-ink">Practice adapts to you</h2>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
          {/* Explicit {" "} after the expression — the JSX transform here
              drops the space that separates an expression from the text
              after it (see app/test/page.tsx for the same trap), and this
              line rendered as "answered 4questions". */}
          Once you&apos;ve answered {CONFIDENCE_FLOOR}{" "}
          questions in a topic, a random set starts favouring the topics you
          get wrong and easing off the ones you have down. Today&apos;s test
          stays the same for everyone, so your score still compares.
        </p>
      </section>
    );
  }

  return (
    <section className="card fade-up" aria-labelledby="focus-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="focus-heading" className="text-[0.9375rem] font-bold text-ink">
          Where you&apos;re losing marks
        </h2>
        <Link
          href={
            subject === "english"
              ? "/test?mode=random"
              : `/test?mode=random&subject=${subject}`
          }
          className="text-[0.8125rem] font-bold text-accent-ink"
        >
          Practice →
        </Link>
      </div>

      <ul className="mt-3 space-y-2.5">
        {topics.map((t) => {
          const pct = Math.round((t.accuracy ?? 0) * 100);
          const tone = TONE[t.reason];
          // Mastery keys are namespaced by subject so the two banks cannot be
          // weighted against each other; the reader sees the topic, plus which
          // paper it came from when that is not obvious.
          const label = topicOfMasteryKey(t.topic);
          const from = subjectOfMasteryKey(t.topic);
          return (
            <li key={t.topic}>
              <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                <span className="min-w-0 truncate font-semibold capitalize text-ink">
                  {label}
                  {from !== "english" && (
                    <span className="ml-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted">
                      {SUBJECT_SHORT[from]}
                    </span>
                  )}
                </span>
                <span className={`shrink-0 font-bold tabular-nums ${tone.text}`}>
                  {pct}%
                  <span className="ml-1.5 font-medium text-muted">{tone.word}</span>
                </span>
              </div>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
                role="img"
                aria-label={`${label}: ${pct}% correct across ${t.seen} questions`}
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-[var(--ease)] ${tone.bar}`}
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        A random set now pulls harder from these. Today&apos;s test is the same for
        everyone, so it stays comparable.
      </p>
    </section>
  );
}
