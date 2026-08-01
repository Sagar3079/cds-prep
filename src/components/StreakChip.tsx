"use client";

import { useEffect, useState } from "react";
import { getStats } from "@/lib/storage";

export default function StreakChip() {
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    const s = getStats();
    setDays(s.currentStreak > 0 ? s.currentStreak : s.bestStreak);
  }, []);

  if (days === null || days === 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full bg-streak-soft text-streak-ink text-xs font-bold">
      <svg className="flame" width="14" height="16" viewBox="0 0 16 18" fill="currentColor" aria-hidden>
        <path d="M8 0s.6 2.7-1.2 4.6C5 6.5 3 7.6 3 10.6A5 5 0 0 0 8 18a5 5 0 0 0 5-5.2c0-2.3-1.3-3.4-2-4.7-.3.9-1 1.5-1.6 1.7.4-1.6.5-4.6-1.4-6.4C8.6 2.4 8 0 8 0Z" />
      </svg>
      {days} day{days === 1 ? "" : "s"}
      <span className="sr-only"> streak</span>
    </span>
  );
}
