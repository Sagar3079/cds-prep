"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { getAttempts, type Attempt } from "@/lib/storage";
import Link from "next/link";

export default function HistoryPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  useEffect(() => {
    setAttempts(
      getAttempts().sort(
        (a, b) =>
          (b.savedAt ?? 0) - (a.savedAt ?? 0) || (a.date < b.date ? 1 : -1)
      )
    );
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-lavender-900 mb-6">History</h1>
        {attempts.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-lavender-700 mb-4">No tests taken yet.</p>
            <Link href="/test" className="btn-primary">
              Start today&apos;s test
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {attempts.map((a, i) => (
              <div
                key={a.savedAt ?? `${a.date}-${a.mode ?? "daily"}-${a.attemptNo ?? i}`}
                className="card flex items-center justify-between gap-4 py-4"
              >
                <div>
                  <p className="font-semibold text-lavender-900">
                    {a.date}
                    {a.mode === "random" && (
                      <span className="ml-2 text-xs font-medium text-lavender-600">
                        random
                      </span>
                    )}
                    {(a.attemptNo ?? 1) > 1 && (
                      <span className="ml-2 text-xs font-medium text-lavender-600">
                        attempt {a.attemptNo}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-lavender-600">
                    {a.correct} correct · {a.wrong} wrong · {a.skipped} skip ·{" "}
                    {Math.floor(a.timeTaken / 60)}m {a.timeTaken % 60}s
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-lavender-600">{a.score}</p>
                  <p className="text-xs text-lavender-500">/ {a.total}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
