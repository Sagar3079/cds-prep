"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import QuestionCard from "@/components/QuestionCard";
import type { Question } from "@/types";
import Link from "next/link";

interface LastResult {
  date: string;
  score: number;
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  timeTaken: number;
  answers: (number | null)[];
  questions: Question[];
}

export default function ResultsPage() {
  const [result, setResult] = useState<LastResult | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cds-last-result");
      if (raw) setResult(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  if (!result) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-lavender-700 mb-4">No results yet. Take today&apos;s test first.</p>
          <Link href="/test" className="btn-primary">
            Go to test
          </Link>
        </main>
      </div>
    );
  }

  const mins = Math.floor(result.timeTaken / 60);
  const secs = result.timeTaken % 60;
  // Accuracy must mean the same thing here as it does in getStats(): correct as a
  // share of what you actually answered. Skips are not wrong answers.
  const answered = result.correct + result.wrong;
  const accuracy = answered > 0 ? Math.round((result.correct / answered) * 100) : 0;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="card text-center">
          <p className="text-sm text-lavender-600 mb-1">{result.date}</p>
          <p className="text-5xl font-bold text-lavender-600 mb-2">{result.score}</p>
          <p className="text-lavender-700 font-medium mb-4">
            out of {result.total} ·{" "}
            {answered > 0
              ? `${accuracy}% accuracy on ${answered} answered`
              : "nothing answered"}
          </p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-green-50 py-3">
              <p className="text-xl font-bold text-green-700">{result.correct}</p>
              <p className="text-green-600">Correct</p>
            </div>
            <div className="rounded-xl bg-red-50 py-3">
              <p className="text-xl font-bold text-red-600">{result.wrong}</p>
              <p className="text-red-500">Wrong</p>
            </div>
            <div className="rounded-xl bg-lavender-50 py-3">
              <p className="text-xl font-bold text-lavender-600">{result.skipped}</p>
              <p className="text-lavender-500">Skipped</p>
            </div>
          </div>
          <p className="text-sm text-lavender-600 mt-4">
            Time taken: {mins}m {secs}s · Marking: +1 / −0.25
          </p>
          <div className="flex gap-3 justify-center mt-6">
            <Link href="/test" className="btn-ghost">
              Retake
            </Link>
            <Link href="/" className="btn-primary">
              Home
            </Link>
          </div>
        </div>

        <h2 className="text-lg font-bold text-lavender-900">Review</h2>
        {result.questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i}
            total={result.total}
            selected={result.answers[i]}
            onSelect={() => {}}
            showResult
          />
        ))}
      </main>
    </div>
  );
}
