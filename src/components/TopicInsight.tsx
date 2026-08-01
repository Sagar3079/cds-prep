"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONFIDENCE_FLOOR, getMastery, weakestTopics, type TopicWeight } from "@/lib/mastery";

const TONE: Record<TopicWeight["reason"], { bar: string; text: string; word: string }> = {
  weak: { bar: "bg-err", text: "text-err-ink", word: "needs work" },
  shaky: { bar: "bg-streak", text: "text-streak-ink", word: "getting there" },
  solid: { bar: "bg-ok", text: "text-ok-ink", word: "solid" },
  new: { bar: "bg-accent", text: "text-accent-ink", word: "new" },
};

export default function TopicInsight() {
  const [topics, setTopics] = useState<TopicWeight[] | null>(null);

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
          Once you&apos;ve answered {CONFIDENCE_FLOOR} questions in a topic, a random
          set starts favouring the topics you get wrong and easing off the ones you
          have down. Today&apos;s test stays the same for everyone, so your score
          still compares.
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
          href="/test?mode=random"
          className="text-[0.8125rem] font-bold text-accent-ink"
        >
          Practice →
        </Link>
      </div>

      <ul className="mt-3 space-y-2.5">
        {topics.map((t) => {
          const pct = Math.round((t.accuracy ?? 0) * 100);
          const tone = TONE[t.reason];
          return (
            <li key={t.topic}>
              <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                <span className="truncate font-semibold text-ink">{t.topic}</span>
                <span className={`shrink-0 font-bold tabular-nums ${tone.text}`}>
                  {pct}%
                  <span className="ml-1.5 font-medium text-muted">{tone.word}</span>
                </span>
              </div>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
                role="img"
                aria-label={`${t.topic}: ${pct}% correct across ${t.seen} questions`}
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
