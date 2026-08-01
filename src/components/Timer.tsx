"use client";

import { useEffect, useState } from "react";

/**
 * Seconds-remaining marks that get a discrete, polite announcement.
 * The ticking value itself is never in a live region — role="timer" has an
 * implicit aria-live of "off", so screen readers stay quiet between marks.
 */
const ANNOUNCE_AT = [300, 120, 60, 30, 0];

function announcementFor(mark: number): string {
  if (mark === 0) return "Time is up. Your test is being submitted.";
  if (mark >= 60) {
    const m = mark / 60;
    return `${m} minute${m === 1 ? "" : "s"} remaining.`;
  }
  return `${mark} seconds remaining.`;
}

function spokenTime(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  const mPart = `${m} minute${m === 1 ? "" : "s"}`;
  const sPart = `${s} second${s === 1 ? "" : "s"}`;
  return `Time remaining: ${m > 0 ? `${mPart} ${sPart}` : sPart}`;
}

/**
 * `.timer-urgent` (globals.css) runs `pulse 1s infinite` unconditionally, and a
 * plain class in an unlayered stylesheet cannot be overridden by a Tailwind
 * `motion-reduce:` utility, so the guard has to happen here: when the user asks
 * for reduced motion we swap the animated class for a static red.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export default function Timer({ seconds }: { seconds: number }) {
  const left = Math.max(0, seconds);
  const mins = Math.floor(left / 60);
  const secs = left % 60;
  const urgent = left <= 60;
  const reducedMotion = usePrefersReducedMotion();

  const [note, setNote] = useState("");
  // Mounting mid-run (a restored attempt) must not replay warnings already passed.
  const [announced] = useState(
    () => new Set(ANNOUNCE_AT.filter((mark) => left <= mark))
  );

  useEffect(() => {
    const due = ANNOUNCE_AT.filter(
      (mark) => left <= mark && !announced.has(mark)
    );
    if (due.length === 0) return;
    due.forEach((mark) => announced.add(mark));
    // A backgrounded tab can cross several marks at once — announce the most urgent.
    setNote(announcementFor(Math.min(...due)));
  }, [left, announced]);

  return (
    <div className="flex items-center gap-2">
      <span
        role="timer"
        aria-label={spokenTime(left)}
        className={`text-xl font-bold tabular-nums tracking-wider ${
          urgent
            ? reducedMotion
              ? "text-danger"
              : "timer-urgent"
            : "text-lavender-700"
        }`}
      >
        <span aria-hidden="true">
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </span>
      </span>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {note}
      </p>
    </div>
  );
}
