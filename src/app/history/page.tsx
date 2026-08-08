"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatScore, SCORE_TEXT, scoreTone } from "@/components/ScoreRing";
import { dateKey, getAttempts, todayKey, type Attempt } from "@/lib/storage";

/** Twelve weeks of Mondays-to-Sundays fits the column at 360px. */
const CALENDAR_WEEKS = 12;
const CALENDAR_DAYS = CALENDAR_WEEKS * 7;

interface CalendarDay {
  key: string;
  attempts: number;
  best: number;
  total: number;
  isToday: boolean;
  isFuture: boolean;
}

function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Rendered only after the mount read, so locale formatting cannot mismatch. */
function formatDay(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    // Only when it is not this year, so the common row stays short.
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/**
 * Calendar days are local, never UTC — the grid is built from `dateKey()` for
 * exactly the reason storage.ts is: an IST user before 05:30 would otherwise
 * light up yesterday's cell.
 */
function buildCalendar(attempts: Attempt[]): CalendarDay[] {
  const byDay = new Map<
    string,
    { attempts: number; best: number; total: number }
  >();
  for (const a of attempts) {
    const day = a.date.slice(0, 10);
    const seen = byDay.get(day);
    if (!seen) {
      byDay.set(day, { attempts: 1, best: a.score, total: a.total });
    } else {
      byDay.set(day, {
        attempts: seen.attempts + 1,
        best: Math.max(seen.best, a.score),
        total: a.score > seen.best ? a.total : seen.total,
      });
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayId = todayKey();
  // Monday-first weeks; the grid ends with the Sunday of the current week.
  const weekday = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(start.getDate() + (6 - weekday) - (CALENDAR_DAYS - 1));

  return Array.from({ length: CALENDAR_DAYS }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dateKey(d);
    const hit = byDay.get(key);
    return {
      key,
      attempts: hit?.attempts ?? 0,
      best: hit?.best ?? 0,
      total: hit?.total ?? 0,
      isToday: key === todayId,
      isFuture: d.getTime() > today.getTime(),
    };
  });
}

function cellClass(day: CalendarDay): string {
  if (day.attempts === 0) {
    return day.isFuture ? "bg-surface-2/40" : "bg-surface-2";
  }
  const ratio = day.total > 0 ? day.best / day.total : 0;
  if (ratio >= 0.7) return "bg-accent";
  if (ratio >= 0.4) return "bg-accent/70";
  return "bg-accent/40";
}

function cellTitle(day: CalendarDay): string {
  if (day.attempts === 0) return `${day.key} — no practice`;
  const plural = day.attempts === 1 ? "attempt" : "attempts";
  return `${day.key} — ${day.attempts} ${plural}, best ${formatScore(day.best)}`;
}

export default function HistoryPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  // Distinguishes "not read yet" from "nothing saved", so the empty state
  // cannot flash before the effect resolves.
  const [loaded, setLoaded] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    // Sorted by savedAt: `date + score` collided on same-day retakes and dropped
    // rows out of the list entirely.
    setAttempts(
      getAttempts().sort(
        (a, b) =>
          (b.savedAt ?? 0) - (a.savedAt ?? 0) || (a.date < b.date ? 1 : -1),
      ),
    );
    setLoaded(true);
  }, []);

  const calendar = useMemo(() => buildCalendar(attempts), [attempts]);
  const practised = calendar.filter((d) => d.attempts > 0).length;

  return (
    <div className="space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          History
        </h1>
        {loaded && attempts.length > 0 && (
          <p className="text-sm text-muted">
            {attempts.length} {attempts.length === 1 ? "attempt" : "attempts"}
          </p>
        )}
      </div>

      {!loaded ? (
        <>
          <p role="status" className="sr-only">
            Loading your history…
          </p>
          <div className="space-y-3" aria-hidden="true">
            <div className="card h-24" />
            <div className="card h-24" />
            <div className="card h-24" />
          </div>
        </>
      ) : attempts.length === 0 ? (
        <div className="card card-empty fade-up flex flex-col items-center gap-4 text-center">
          <p className="text-lg font-bold tracking-tight text-ink">
            No tests taken yet
          </p>
          <p className="max-w-[26ch] text-sm leading-relaxed text-muted">
            Every attempt you finish is saved in this browser, and the calendar
            fills in as you go.
          </p>
          <Link href="/test" className="btn-primary">
            Start today&apos;s test
          </Link>
        </div>
      ) : (
        <>
          <section className="card fade-up space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-[0.9375rem] font-bold text-ink">
                Practice calendar
              </h2>
              <p className="text-[0.8125rem] text-muted">
                {practised} of the last {CALENDAR_DAYS} days
              </p>
            </div>

            {/* Eighty-four cells would be eighty-four announcements; the count
                  above says the same thing in one. */}
            <div
              aria-hidden="true"
              /* auto-cols-fr is load-bearing: the columns are implicit under
                   grid-flow-col, and `auto` would size these empty cells to
                   zero. Rows are `auto` so each one takes the square height
                   that the 1fr column width gives it. */
              className="grid grid-flow-col auto-cols-fr grid-rows-[repeat(7,auto)] gap-[3px]"
            >
              {calendar.map((day) => (
                <span
                  key={day.key}
                  title={cellTitle(day)}
                  className={`aspect-square rounded-[3px] ${cellClass(day)} ${
                    day.isToday ? "ring-2 ring-streak" : ""
                  }`}
                />
              ))}
            </div>

            <div
              aria-hidden="true"
              className="flex items-center justify-end gap-1.5 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-muted"
            >
              <span>lower</span>
              <span className="h-2.5 w-2.5 rounded-[3px] bg-accent/40" />
              <span className="h-2.5 w-2.5 rounded-[3px] bg-accent/70" />
              <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" />
              <span>higher</span>
            </div>
          </section>

          <ol className="space-y-3">
            {attempts.map((a, i) => {
              const tone = scoreTone(a.score, a.total);
              const retake = (a.attemptNo ?? 1) > 1;
              return (
                <li
                  // savedAt, never date+score: two retakes on one day share
                  // both of those and React collapsed them into one row.
                  key={
                    a.savedAt ??
                    `${a.date}-${a.mode ?? "daily"}-${a.attemptNo ?? i}`
                  }
                  className="card fade-up flex items-center gap-3"
                  /* animation-delay cannot come from a Tailwind utility here:
                       the unlayered `.fade-up` shorthand would reset it. */
                  style={
                    reducedMotion
                      ? undefined
                      : { animationDelay: `${Math.min(i, 7) * 40}ms` }
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate font-bold text-ink">
                        {formatDay(a.date)}
                      </p>
                      {/* Only GK is labelled: every row written before GK
                          existed is English and carries no subject, so
                          stamping the default would chip every legacy row. */}
                      {a.subject === "gk" && (
                        <span className="chip chip-blue">GK</span>
                      )}
                      {a.mode === "random" && (
                        <span className="chip chip-blue">RANDOM</span>
                      )}
                      {retake && (
                        <span className="chip">ATTEMPT {a.attemptNo}</span>
                      )}
                    </div>
                    <p className="mt-1 text-[0.8125rem] text-muted">
                      <span className="font-semibold text-ok-ink">
                        {a.correct}
                      </span>{" "}
                      correct ·{" "}
                      <span className="font-semibold text-err-ink">
                        {a.wrong}
                      </span>{" "}
                      wrong · {a.skipped} blank · {mmss(a.timeTaken)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-2xl font-extrabold tracking-tight ${SCORE_TEXT[tone]}`}
                    >
                      {formatScore(a.score)}
                    </p>
                    <p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-muted">
                      {/* "out of 10" is nonsense for a negative net score. */}
                      {a.score < 0 ? "net" : `of ${a.total}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="flex justify-center pt-1">
            <Link href="/test" className="btn-primary">
              Take another test
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
