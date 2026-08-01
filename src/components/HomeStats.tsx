"use client";

import { useEffect, useState } from "react";
import { getStats, hasAttemptOn, todayKey } from "@/lib/storage";
import Link from "next/link";

export default function HomeStats() {
  const [stats, setStats] = useState({
    testsTaken: 0,
    avgScore: 0,
    bestStreak: 0,
    currentStreak: 0,
    accuracy: 0,
  });
  const [doneToday, setDoneToday] = useState(false);

  useEffect(() => {
    setStats(getStats());
    setDoneToday(hasAttemptOn(todayKey(), "daily"));
  }, []);

  return (
    <>
      <section className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lavender-100 text-lavender-700 text-xs font-semibold mb-4">
          Official UPSC CDS English PYQs · Practice bank
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-lavender-900 mb-4 tracking-tight">
          Daily CDS English Practice
        </h1>
        <p className="text-lg text-lavender-700/80 mb-8 max-w-xl mx-auto">
          10 questions · 10-minute timer · +1 / −0.25 marking · shuffled options
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Link href="/test" className="btn-primary text-base">
            {doneToday ? "Retake Today's Test" : "Start Today's Test"}
            <span aria-hidden>→</span>
          </Link>
          <Link href="/test?mode=random" className="btn-ghost text-base">
            Random Quiz
          </Link>
        </div>
        {doneToday && (
          <p className="mt-3 text-sm text-lavender-600">
            Daily set done — try a <Link href="/test?mode=random" className="underline font-semibold">random quiz</Link> for fresh questions.
          </p>
        )}
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {[
          { label: "Tests Taken", value: stats.testsTaken },
          { label: "Avg Score", value: stats.avgScore },
          { label: "Accuracy", value: `${stats.accuracy}%` },
          {
            label: stats.currentStreak > 0 ? "Current Streak" : "Best Streak",
            value: `${stats.currentStreak > 0 ? stats.currentStreak : stats.bestStreak}d`,
          },
        ].map((s) => (
          <div key={s.label} className="card text-center py-5">
            <p className="text-3xl font-bold text-lavender-600">{s.value}</p>
            <p className="text-sm text-lavender-700/70 mt-1">{s.label}</p>
          </div>
        ))}
      </section>
    </>
  );
}
