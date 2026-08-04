"use client";

import { useEffect, useState } from "react";

/**
 * The line under the card's call to action.
 *
 * It shows the REAL number of people who have signed up, read from
 * `/api/stats`, and it shows it only once that number is worth showing.
 * Below the threshold it says something true that needs no number at all.
 *
 * This exists instead of a hardcoded "join 60+ students". That number was
 * wrong when it was asked for — there were eight accounts — and a specific,
 * false claim on a page taking paid traffic is both a lie to a candidate
 * choosing where to spend money and a straightforward way to lose an ad
 * account. This version needs no maintenance and cannot go stale: the day the
 * real figure passes the threshold, the page starts saying it.
 *
 * Renders the no-number line during load and on any failure, so the slot never
 * flickers a placeholder and never blocks the button.
 */
export default function JoinLine() {
  const [n, setN] = useState<number | null>(null);
  const [at, setAt] = useState(50);

  useEffect(() => {
    let live = true;
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d) return;
        if (typeof d.students === "number") setN(d.students);
        if (typeof d.meaningfulAt === "number") setAt(d.meaningfulAt);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const show = n !== null && n >= at;

  return (
    <p className="joinline">
      {show ? (
        <>
          Join <b>{n.toLocaleString("en-IN")}+</b> students practising today —
          free
        </>
      ) : (
        <>
          <b>Free</b> — no account, no card, nothing to install
        </>
      )}
    </p>
  );
}
