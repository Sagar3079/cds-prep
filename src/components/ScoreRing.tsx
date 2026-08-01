"use client";

import { useEffect, useState } from "react";

const RADIUS = 66;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Kept in step with the `duration-[1100ms]` sweep on the progress circle. */
const COUNT_MS = 900;

export type ScoreTone = "ok" | "accent" | "streak" | "err";

/** Ring stroke. A fill, so the raw `streak` token is allowed here. */
const RING_STROKE: Record<ScoreTone, string> = {
  ok: "stroke-ok",
  accent: "stroke-accent",
  streak: "stroke-streak",
  err: "stroke-err",
};

/**
 * Text colours. Never the raw `accent` (4.0:1) or `streak` (2.3:1) fills —
 * only the -ink pairs clear AA, so a numeral always uses this map.
 */
export const SCORE_TEXT: Record<ScoreTone, string> = {
  ok: "text-ok-ink",
  accent: "text-accent-ink",
  streak: "text-streak-ink",
  err: "text-err-ink",
};

/**
 * Marking is in quarter marks (+1 / −0.25), so two decimals is exact for every
 * reachable score and the column never goes ragged — 6 and 5.75 used to render
 * as "6" next to "5.75".
 */
export function formatScore(score: number): string {
  return score.toFixed(2);
}

/** Score can be negative (−2.5 … 10), which is its own tone, not "0%". */
export function scoreTone(score: number, total: number): ScoreTone {
  if (score < 0) return "err";
  const ratio = total > 0 ? score / total : 0;
  if (ratio >= 0.7) return "ok";
  if (ratio >= 0.4) return "accent";
  return "streak";
}

export default function ScoreRing({
  score,
  total,
  caption,
  label,
  reducedMotion,
}: {
  /** Net score. May be fractional and may be below zero. */
  score: number;
  /** Questions in the set — the ring's full sweep. */
  total: number;
  /** Small-caps line under the numeral, e.g. "OUT OF 10" or "NET SCORE". */
  caption: string;
  /** The ring is a single labelled image; the counting numeral is not announced. */
  label: string;
  /** Paint the final state immediately instead of animating into it. */
  reducedMotion: boolean;
}) {
  const tone = scoreTone(score, total);
  // A negative score fills nothing rather than wrapping round to a full ring.
  const fraction =
    total > 0 ? Math.min(1, Math.max(0, score / total)) : 0;
  const filled = CIRCUMFERENCE * (1 - fraction);

  const [shown, setShown] = useState(() => (reducedMotion ? score : 0));
  const [offset, setOffset] = useState(() =>
    reducedMotion ? filled : CIRCUMFERENCE
  );

  useEffect(() => {
    if (reducedMotion) {
      setShown(score);
      setOffset(filled);
      return;
    }

    // One frame at the empty offset first, or there is nothing to transition from.
    const sweep = requestAnimationFrame(() => setOffset(filled));

    const start = performance.now();
    let count = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setShown(score * eased);
      if (p < 1) count = requestAnimationFrame(step);
    };
    count = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(sweep);
      cancelAnimationFrame(count);
    };
  }, [score, filled, reducedMotion]);

  return (
    <div className="ring-wrap" role="img" aria-label={label}>
      <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">
        <circle
          className="ring-track"
          cx="75"
          cy="75"
          r={RADIUS}
          fill="none"
          strokeWidth="11"
        />
        <circle
          className={`${RING_STROKE[tone]} transition-[stroke-dashoffset] duration-[1100ms] ease-[var(--ease)]`}
          cx="75"
          cy="75"
          r={RADIUS}
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-face">
        <div className={`ring-time ${SCORE_TEXT[tone]}`}>{formatScore(shown)}</div>
        <div className="ring-lab uppercase">{caption}</div>
      </div>
    </div>
  );
}
