"use client";

import { useSyncExternalStore } from "react";

/**
 * Time left on today's set, counting down to midnight IST.
 *
 * Real urgency, not invented: the daily set genuinely rolls over at midnight
 * and today's is gone. No "offer ends soon" theatre — this is a clock on
 * something that actually expires, which is the only kind worth putting on a
 * page that takes paid traffic.
 *
 * IST regardless of where the visitor is, because the set rolls over on India's
 * calendar day and every candidate is sitting the Indian exam.
 */
function untilMidnightIST(): string {
  // `Intl` rather than a hardcoded +05:30, so this stays correct if the zone's
  // rules ever change.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const left = 86400 - (get("hour") * 3600 + get("minute") * 60 + get("second"));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`;
}

/**
 * A clock is an external, changing source of truth, so it is read with
 * `useSyncExternalStore` rather than a `setState` in an effect.
 *
 * The effect version works, but it sets state on mount purely to escape a
 * hydration mismatch — the server cannot know the time the client will render
 * at — and that is exactly the cascading-render pattern React now warns about.
 * This says what is actually happening: there is a value outside React, here is
 * how to subscribe to it, and here is what the server should render instead.
 *
 * The snapshot is cached in module scope because `getSnapshot` is called during
 * render and must return a value that is stable between ticks; computing the
 * time inside it would return something new every call and spin.
 */
const PLACEHOLDER = "--:--:--";
let snapshot = PLACEHOLDER;
let timer: number | null = null;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (timer === null) {
    // Seeded before the first interval fires, so the real time is on screen at
    // first paint rather than a second of placeholder.
    snapshot = untilMidnightIST();
    timer = window.setInterval(() => {
      const next = untilMidnightIST();
      if (next === snapshot) return;
      snapshot = next;
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export default function Countdown() {
  const left = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => PLACEHOLDER,
  );

  return (
    <span className="live">
      <i className="live-dot" aria-hidden="true" />
      Today&apos;s set closes in <b className="live-clock">{left}</b>
    </span>
  );
}
