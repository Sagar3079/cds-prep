"use client";

/**
 * The home screen's client islands. Everything here needs either `localStorage`
 * or the *browser's* clock — the local calendar day cannot be resolved on the
 * server (a prerender bakes in build-time UTC, which is yesterday for IST users).
 * Nothing reads storage during render: state starts at a constant that matches
 * what the server emitted, and the real values arrive in an effect after mount.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Attempt } from "@/lib/storage";
import {
  dateKey,
  getAttempts,
  getStats,
  hasAttemptOn,
  todayKey,
} from "@/lib/storage";

const DAY_MS = 86400000;

/* ── greeting ─────────────────────────────────────────────── */

export function HomeDate() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    setLabel(
      new Date()
        .toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
        .toUpperCase()
    );
  }, []);

  // nbsp holds the line's height so the heading below doesn't jump on hydration
  return (
    <p className="text-xs font-bold tracking-[0.07em] text-muted">
      {label || " "}
    </p>
  );
}

/* ── today's set number ───────────────────────────────────── */

/**
 * Mirrors the window maths in `pickDailyQuestions`: the bank is one canonical
 * order cut into `cycleDays` sets, and the local calendar day picks which slice
 * is today's. Display only — nothing here feeds back into question selection.
 */
function setNumber(key: string, cycleDays: number): number {
  const [y, m, d] = key.split("-").map(Number);
  const idx = Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  return (((idx % cycleDays) + cycleDays) % cycleDays) + 1;
}

export function HomeSetChip({ cycleDays }: { cycleDays: number }) {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    setN(setNumber(todayKey(), cycleDays));
  }, [cycleDays]);

  return <span className="chip chip-blue">SET {n ?? "—"}</span>;
}

/* ── start / retake ───────────────────────────────────────── */

export function HomeStartActions() {
  const [doneToday, setDoneToday] = useState(false);

  useEffect(() => {
    setDoneToday(hasAttemptOn(todayKey(), "daily"));
  }, []);

  return (
    <div className="flex w-full flex-col gap-2.5">
      <Link href="/test" className="btn-primary w-full">
        {doneToday ? "Retake today's test" : "Start today's test"}
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </Link>

      <Link href="/test?mode=random" className="btn-ghost w-full">
        Random set
      </Link>

      {doneToday && (
        <p className="text-xs leading-relaxed text-muted">
          Today&apos;s set is done. A retake is saved as a new attempt, so your
          first score stays in your history.
        </p>
      )}
    </div>
  );
}

/* ── stats + week strip ───────────────────────────────────── */

const WEEK_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

interface WeekDay {
  key: string;
  label: string;
  practised: boolean;
  isToday: boolean;
}

/** Constant, so the first client render matches the server HTML exactly. */
const BLANK_WEEK: WeekDay[] = WEEK_LETTERS.map((_, i) => ({
  key: `slot-${i}`,
  label: "",
  practised: false,
  isToday: false,
}));

/**
 * Monday-anchored week around today. Attempt dates are already LOCAL day keys
 * written by `dateKey` (random-mode rows carry a "-r<ts>" suffix, hence the
 * slice), and every day here is rebuilt with `dateKey` — never `toISOString`.
 */
function buildWeek(attempts: Attempt[]): WeekDay[] {
  const practised = new Set(attempts.map((a) => a.date.slice(0, 10)));
  const now = new Date();
  const sinceMonday = (now.getDay() + 6) % 7;
  const today = todayKey();

  return WEEK_LETTERS.map((_, i) => {
    const d = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - sinceMonday + i
    );
    const key = dateKey(d);
    return {
      key,
      label: d.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
      practised: practised.has(key),
      isToday: key === today,
    };
  });
}

/** streak is a fill/ring only — the label beside it uses streak-ink. */
function tileClass(day: WeekDay): string {
  if (day.isToday) {
    return day.practised
      ? "bg-streak ring-4 ring-streak-soft"
      : "bg-streak-soft ring-2 ring-streak";
  }
  return day.practised ? "bg-accent" : "bg-surface-2";
}

export default function HomeStats() {
  const [stats, setStats] = useState({
    testsTaken: 0,
    avgScore: 0,
    bestStreak: 0,
    currentStreak: 0,
    accuracy: 0,
  });
  const [week, setWeek] = useState<WeekDay[]>(BLANK_WEEK);

  useEffect(() => {
    setStats(getStats());
    setWeek(buildWeek(getAttempts()));
  }, []);

  const practisedDays = week.filter((d) => d.practised).length;

  // unchanged rule: show the live run, fall back to the best one on record
  const streakLine =
    stats.currentStreak > 0
      ? `${stats.currentStreak}-day streak`
      : stats.bestStreak > 0
        ? `Best run: ${stats.bestStreak} days`
        : "No streak yet";

  return (
    <>
      <section className="grid grid-cols-3 gap-2.5" aria-label="Your progress">
        {[
          { label: "avg score", value: String(stats.avgScore), tone: "text-ink" },
          {
            label: "accuracy",
            value: `${stats.accuracy}%`,
            tone: stats.testsTaken > 0 ? "text-ok-ink" : "text-ink",
          },
          { label: "tests", value: String(stats.testsTaken), tone: "text-ink" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-line bg-paper px-2 py-3.5 text-center"
          >
            <p
              className={`text-[1.375rem] font-extrabold tracking-[-0.02em] ${s.tone}`}
            >
              {s.value}
            </p>
            <p className="mt-0.5 text-[0.6875rem] text-muted">{s.label}</p>
          </div>
        ))}
      </section>

      <section className="card" aria-labelledby="week-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="week-heading" className="text-[0.9375rem] font-bold text-ink">
            This week
          </h2>
          <span className="text-[0.8125rem] text-muted">
            {practisedDays} of 7 days
          </span>
        </div>

        <ul className="mt-3 grid grid-cols-7 gap-2">
          {week.map((d, i) => (
            <li key={d.key} className="flex flex-col items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`block aspect-square w-full max-w-[2.375rem] rounded-xl ${tileClass(d)}`}
              />
              <span
                aria-hidden="true"
                className="text-[0.6875rem] font-semibold text-muted"
              >
                {WEEK_LETTERS[i]}
              </span>
              <span className="sr-only">
                {d.label || WEEK_LETTERS[i]}
                {d.isToday ? " (today)" : ""}
                {d.practised ? ": practised" : ": no practice"}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-streak-ink">
            <svg
              className="flame text-streak"
              width="12"
              height="14"
              viewBox="0 0 16 18"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0s.6 2.7-1.2 4.6C5 6.5 3 7.6 3 10.6A5 5 0 0 0 8 18a5 5 0 0 0 5-5.2c0-2.3-1.3-3.4-2-4.7-.3.9-1 1.5-1.6 1.7.4-1.6.5-4.6-1.4-6.4C8.6 2.4 8 0 8 0Z" />
            </svg>
            {streakLine}
          </span>
          <Link
            href="/history"
            className="text-xs font-bold text-accent-ink hover:underline"
          >
            Full history →
          </Link>
        </div>
      </section>
    </>
  );
}
