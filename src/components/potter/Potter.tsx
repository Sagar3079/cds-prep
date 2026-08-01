"use client";

import { useEffect, useRef, useState } from "react";

export type Mood =
  | "idle"
  | "peek"
  | "thinking"
  | "excited"
  | "impressed"
  | "wince"
  | "cheer";

export interface PotterProps {
  mood?: Mood;
  /** -1 (hard left) … 1 (hard right) */
  look?: number;
  /** -1 (down) … 1 (up). Peeking over a ledge means looking DOWN into it. */
  lookY?: number;
  /** Rendered height in px. Everything scales from this. */
  size?: number;
  className?: string;
}

/**
 * Potter — the study companion. A bespectacled, scruffy-haired student who
 * leans over the edge of whatever you are working on.
 *
 * Deliberately not the trademarked character: round glasses, messy hair and a
 * house scarf carry the idea without copying the specific mark (no scar).
 *
 * Depth is real CSS 3D — each layer sits at its own translateZ inside a
 * preserve-3d scene, so the head parallaxes against the body as he turns.
 */
export default function Potter({
  mood = "idle",
  look = 0,
  lookY = 0,
  size = 96,
  className = "",
}: PotterProps) {
  const [blink, setBlink] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      timer.current = window.setTimeout(
        () => {
          setBlink(true);
          window.setTimeout(() => setBlink(false), 105);
          schedule();
        },
        2000 + Math.random() * 3600
      );
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const lx = Math.max(-1, Math.min(1, look));
  const ly = Math.max(-1, Math.min(1, lookY));
  const shut = blink || mood === "cheer";
  const happy = mood === "excited" || mood === "cheer" || mood === "impressed";

  // Chibi proportions: the head is most of him. Small heads read as adult and
  // stop being charming at this size.
  return (
    <div
      className={`potter potter--${mood} ${className}`}
      style={{ width: size * 0.92, height: size, perspective: `${size * 3.4}px` }}
      aria-hidden="true"
    >
      <div className="potter__scene">
        {/* ---------- body ---------- */}
        <div className="potter__layer potter__body">
          <svg viewBox="0 0 92 46" width="100%" height="100%">
            <defs>
              <linearGradient id="pt-robe" x1=".2" y1="0" x2=".8" y2="1">
                <stop offset="0%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="var(--accent-ink)" />
              </linearGradient>
            </defs>
            {/* shoulders */}
            <path d="M46 0c17 0 30 10 32 25l2 21H12l2-21C16 10 29 0 46 0Z" fill="url(#pt-robe)" />
            {/* open collar + shirt */}
            <path d="M36 2c3 8 7 12 10 12s7-4 10-12l-4-2c-4 6-8 6-12 0l-4 2Z" fill="var(--paper)" opacity=".95" />
            {/* arms reaching forward onto the ledge */}
            <rect x="4" y="24" width="18" height="22" rx="9" fill="var(--accent-ink)" />
            <rect x="70" y="24" width="18" height="22" rx="9" fill="var(--accent-ink)" />
          </svg>
        </div>

        {/* ---------- scarf ---------- */}
        <div className="potter__layer potter__scarf">
          <svg viewBox="0 0 64 44" width="100%" height="100%">
            <path d="M6 4h52a6 6 0 0 1 0 12H6A6 6 0 0 1 6 4Z" fill="var(--streak)" />
            <path d="M44 15c6 6 9 15 8 25a4.5 4.5 0 0 1-9-.6c.8-8-1-14-5-19Z" fill="var(--streak)" />
            <g fill="var(--streak-soft)" opacity=".6">
              <rect x="12" y="6" width="4" height="8" />
              <rect x="24" y="6" width="4" height="8" />
              <rect x="36" y="6" width="4" height="8" />
              <rect x="48" y="6" width="4" height="8" />
            </g>
          </svg>
        </div>

        {/* ---------- hands gripping the ledge ---------- */}
        <div className="potter__layer potter__hands">
          <svg viewBox="0 0 100 18" width="100%" height="100%">
            <g fill="#f6cda6">
              <rect x="2" y="0" width="22" height="15" rx="7" />
              <rect x="76" y="0" width="22" height="15" rx="7" />
            </g>
            {/* knuckle creases, so they read as hands not mittens */}
            <g stroke="#dda87c" strokeWidth="1.4" strokeLinecap="round" opacity=".8">
              <path d="M8 4v5M13 3.5v6M18 4v5" />
              <path d="M82 4v5M87 3.5v6M92 4v5" />
            </g>
          </svg>
        </div>

        {/* ---------- head ---------- */}
        <div
          className="potter__layer potter__head"
          style={{ transform: `translateZ(20px) rotateY(${lx * 14}deg) rotateX(${ly * -8}deg)` }}
        >
          <svg viewBox="0 0 92 88" width="100%" height="100%">
            <defs>
              <radialGradient id="pt-skin" cx="40%" cy="34%" r="72%">
                <stop offset="0%" stopColor="#ffe7cf" />
                <stop offset="100%" stopColor="#f3c79e" />
              </radialGradient>
            </defs>

            <ellipse cx="10" cy="52" rx="6" ry="8.5" fill="#f0c096" />
            <ellipse cx="82" cy="52" rx="6" ry="8.5" fill="#f0c096" />

            {/* face — wide and round */}
            <rect x="11" y="12" width="70" height="68" rx="30" fill="url(#pt-skin)" />

            {/* hair: a scruffy silhouette with real spikes, not a dome */}
            <path
              d="M12 40C9 21 23 6 46 6s37 15 34 34c-2-5-5-9-9-11l3-8-9 6-2-9-6 7-4-8-5 8-6-6-3 8-8-5 2 8c-4 2-8 6-11 12Z"
              fill="#26212f"
            />
            <path d="M60 11c9 4 14 12 14 22-3-9-8-16-17-19Z" fill="#3b3350" />
            {/* a couple of loose strands over the brow */}
            <path d="M30 22c-3 4-4 9-3 13M40 18c-2 5-2 10-1 14" stroke="#26212f" strokeWidth="3" strokeLinecap="round" fill="none" />

            {/* brows */}
            <g style={{ transform: `translateY(${happy ? -3.4 : mood === "wince" ? 2 : 0}px)`, transition: "transform .4s var(--ease)" }}>
              <path
                d={mood === "thinking" ? "M22 36c5-5 12-5 17-1" : mood === "wince" ? "M22 33c5 2 12 2 17 4" : "M22 35c5-4 12-4 17 0"}
                stroke="#26212f" strokeWidth="3.2" fill="none" strokeLinecap="round"
              />
              <path
                d={mood === "thinking" ? "M53 35c5-4 12-4 17 1" : mood === "wince" ? "M53 37c5-2 12-2 17-4" : "M53 35c5-4 12-4 17 0"}
                stroke="#26212f" strokeWidth="3.2" fill="none" strokeLinecap="round"
              />
            </g>

            {/* round glasses */}
            <g>
              <circle cx="31" cy="52" r="14" fill="#ffffff" opacity=".32" />
              <circle cx="61" cy="52" r="14" fill="#ffffff" opacity=".32" />
              <circle cx="31" cy="52" r="14" fill="none" stroke="#26212f" strokeWidth="3" />
              <circle cx="61" cy="52" r="14" fill="none" stroke="#26212f" strokeWidth="3" />
              <path d="M45 52h2" stroke="#26212f" strokeWidth="3" strokeLinecap="round" />
              <path d="M17 49l-6-3M75 49l6-3" stroke="#26212f" strokeWidth="2.8" strokeLinecap="round" />
              {/* lens glint */}
              <path d="M24 45a9 9 0 0 1 7-4" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".85" fill="none" />
            </g>

            {/* eyes — they sit low and look where he is looking */}
            <g
              style={{
                transform: `translate(${lx * 4}px, ${ly * -3.5}px)`,
                transition: "transform .55s var(--ease)",
              }}
            >
              {shut ? (
                <>
                  <path d="M25 53c3.5 4 9 4 12 0" stroke="#26212f" strokeWidth="3" fill="none" strokeLinecap="round" />
                  <path d="M55 53c3.5 4 9 4 12 0" stroke="#26212f" strokeWidth="3" fill="none" strokeLinecap="round" />
                </>
              ) : (
                <>
                  <circle cx="31" cy="53" r="5.4" fill="#26212f" />
                  <circle cx="61" cy="53" r="5.4" fill="#26212f" />
                  <circle cx="33" cy="51" r="1.9" fill="#fff" />
                  <circle cx="63" cy="51" r="1.9" fill="#fff" />
                </>
              )}
            </g>

            <path
              d={
                happy
                  ? "M36 67c4 6 16 6 20 0"
                  : mood === "wince"
                    ? "M38 70c4-4 12-4 16 0"
                    : mood === "thinking"
                      ? "M40 68h12"
                      : "M38 67c4 4 12 4 16 0"
              }
              stroke="#26212f" strokeWidth="3" fill="none" strokeLinecap="round"
            />

            <g className="potter__cheeks">
              <ellipse cx="19" cy="63" rx="6" ry="3.8" fill="var(--streak)" opacity=".5" />
              <ellipse cx="73" cy="63" rx="6" ry="3.8" fill="var(--streak)" opacity=".5" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
