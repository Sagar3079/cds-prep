"use client";

import { useEffect, useState } from "react";

/**
 * Seconds-remaining marks that get a discrete, polite announcement.
 * The ticking value itself is never in a live region — role="timer" has an
 * implicit aria-live of "off", so screen readers stay quiet between marks.
 */
const ANNOUNCE_AT = [300, 120, 60, 30, 0];

/**
 * Ring geometry. r=66 inside a 150px box leaves the 11px stroke clear of the
 * edge; the dash array is the full circumference so `stroke-dashoffset` alone
 * drives the sweep.
 */
const BOX = 150;
const RADIUS = 66;
const STROKE = 11;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Ring turns `streak` under two minutes and `err` under one. */
const WARN_AT = 120;
const CRIT_AT = 60;

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
 * The countdown ring.
 *
 * `total` comes from the caller (which reads `MARKING.durationSec`) so the run
 * length is never restated here. Nothing about the ring is animated from JS:
 * the colour change and the critical pulse are `.ring-prog` / `.ring-wrap.crit`
 * in globals.css, which sit behind that file's global
 * `prefers-reduced-motion` guard — so no motion query is needed in this
 * component.
 */
export default function Timer({
  seconds,
  total,
}: {
  seconds: number;
  total: number;
}) {
  const left = Math.max(0, seconds);
  const mins = Math.floor(left / 60);
  const secs = left % 60;

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

  const frac = total > 0 ? Math.min(1, Math.max(0, left / total)) : 0;
  const urgency = left <= CRIT_AT ? " crit" : left <= WARN_AT ? " warn" : "";

  return (
    <>
      <div className={`ring-wrap${urgency}`}>
        <svg
          width={BOX}
          height={BOX}
          viewBox={`0 0 ${BOX} ${BOX}`}
          aria-hidden="true"
        >
          <circle
            className="ring-track"
            cx={BOX / 2}
            cy={BOX / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
          />
          <circle
            className="ring-prog"
            cx={BOX / 2}
            cy={BOX / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - frac)}
          />
        </svg>
        <div className="ring-face">
          <div className="ring-time" role="timer" aria-label={spokenTime(left)}>
            <span aria-hidden="true">
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </span>
          </div>
          <div className="ring-lab">REMAINING</div>
        </div>
      </div>
      {/* Separate from the digits on purpose: only the discrete marks above are
          ever spoken, so the reader is not interrupted every second. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {note}
      </p>
    </>
  );
}
