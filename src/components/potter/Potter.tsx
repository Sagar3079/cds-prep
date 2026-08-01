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
  /** -1 (hard left) … 1 (hard right). Drives the eyes and a slight head turn. */
  look?: number;
  /** Rendered height in px. Everything scales from this. */
  size?: number;
  className?: string;
}

/**
 * Potter — the study companion.
 *
 * Not WebGL. The depth is real CSS 3D: each layer sits at its own translateZ
 * inside a `preserve-3d` scene, so the head parallaxes against the body as he
 * turns instead of sliding flat. That reads as dimensional at this size and
 * costs a few kB rather than the several hundred a renderer would.
 */
export default function Potter({
  mood = "idle",
  look = 0,
  size = 96,
  className = "",
}: PotterProps) {
  const [blink, setBlink] = useState(false);
  const timer = useRef<number | null>(null);

  // Irregular blinking. A fixed interval reads as a machine.
  useEffect(() => {
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      timer.current = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 110);
        schedule();
      }, 2200 + Math.random() * 3800);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const l = Math.max(-1, Math.min(1, look));
  const eyeX = l * 3.4;
  const headTurn = l * 13;
  const browLift = mood === "excited" || mood === "impressed" ? -3.2 : mood === "wince" ? 1.6 : 0;
  const shut = blink || mood === "cheer";

  return (
    <div
      className={`potter potter--${mood} ${className}`}
      style={{ width: size * 0.86, height: size, perspective: `${size * 4}px` }}
      aria-hidden="true"
    >
      <div className="potter__scene">
        {/* ---- body, furthest back ---- */}
        <div className="potter__layer potter__body">
          <svg viewBox="0 0 86 58" width="100%" height="100%">
            <defs>
              <linearGradient id="pt-robe" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="var(--accent-ink)" />
              </linearGradient>
            </defs>
            <path
              d="M43 2c14 0 25 9 27 22l3 24a6 6 0 0 1-6 7H19a6 6 0 0 1-6-7l3-24C18 11 29 2 43 2Z"
              fill="url(#pt-robe)"
            />
            {/* collar */}
            <path d="M31 6c4 6 8 9 12 9s8-3 12-9c-3-2-7-3-12-3s-9 1-12 3Z" fill="var(--paper)" opacity=".92" />
          </svg>
        </div>

        {/* ---- scarf: sways on its own, one beat behind the body ---- */}
        <div className="potter__layer potter__scarf">
          <svg viewBox="0 0 60 46" width="100%" height="100%">
            <path d="M8 6h44a5 5 0 0 1 0 10H8A5 5 0 0 1 8 6Z" fill="var(--streak)" />
            <path
              d="M40 15c5 6 8 14 7 23a4 4 0 0 1-8-1c1-7-1-13-5-18Z"
              fill="var(--streak)"
            />
            <path d="M12 8h5v6h-5zM24 8h5v6h-5zM36 8h5v6h-5z" fill="var(--streak-soft)" opacity=".55" />
          </svg>
        </div>

        {/* ---- hands gripping the ledge, only when peeking ---- */}
        <div className="potter__layer potter__hands">
          <svg viewBox="0 0 96 20" width="100%" height="100%">
            <rect x="6" y="2" width="20" height="13" rx="6.5" fill="var(--accent-ink)" />
            <rect x="70" y="2" width="20" height="13" rx="6.5" fill="var(--accent-ink)" />
          </svg>
        </div>

        {/* ---- head, closest to camera ---- */}
        <div
          className="potter__layer potter__head"
          style={{ transform: `translateZ(18px) rotateY(${headTurn}deg)` }}
        >
          <svg viewBox="0 0 76 72" width="100%" height="100%">
            <defs>
              <radialGradient id="pt-skin" cx="38%" cy="30%" r="78%">
                <stop offset="0%" stopColor="#ffe4c9" />
                <stop offset="100%" stopColor="#f0c49b" />
              </radialGradient>
            </defs>

            {/* ears */}
            <ellipse cx="6" cy="42" rx="5" ry="7" fill="#f0c49b" />
            <ellipse cx="70" cy="42" rx="5" ry="7" fill="#f0c49b" />

            {/* face */}
            <rect x="7" y="8" width="62" height="60" rx="26" fill="url(#pt-skin)" />

            {/* hair — a scruffy sweep, not a helmet */}
            <path
              d="M9 32c-1-16 11-27 29-27s30 11 29 27c-3-6-9-9-13-7-3-6-11-9-19-7-6 1-10 5-11 9-5-1-11 1-15 5Z"
              fill="#2f2a3d"
            />
            <path d="M50 9c7 3 12 9 13 17-4-7-10-12-18-14Z" fill="#413a55" />

            {/* round glasses — the reason he is called Potter */}
            <g className="potter__specs">
              <circle cx="26" cy="41" r="12" fill="var(--paper)" opacity=".34" />
              <circle cx="52" cy="41" r="12" fill="var(--paper)" opacity=".34" />
              <circle cx="26" cy="41" r="12" fill="none" stroke="#2f2a3d" strokeWidth="2.6" />
              <circle cx="52" cy="41" r="12" fill="none" stroke="#2f2a3d" strokeWidth="2.6" />
              <path d="M38 41h2" stroke="#2f2a3d" strokeWidth="2.6" strokeLinecap="round" />
              <path d="M14 39l-6-3M62 39l6-3" stroke="#2f2a3d" strokeWidth="2.4" strokeLinecap="round" />
            </g>

            {/* eyes */}
            <g style={{ transform: `translateX(${eyeX}px)`, transition: "transform .5s var(--ease)" }}>
              {shut ? (
                <>
                  <path d="M21 41c3 3 7 3 10 0" stroke="#2f2a3d" strokeWidth="2.6" fill="none" strokeLinecap="round" />
                  <path d="M47 41c3 3 7 3 10 0" stroke="#2f2a3d" strokeWidth="2.6" fill="none" strokeLinecap="round" />
                </>
              ) : (
                <>
                  <circle cx="26" cy="41" r="4.4" fill="#2f2a3d" />
                  <circle cx="52" cy="41" r="4.4" fill="#2f2a3d" />
                  <circle cx="27.6" cy="39.4" r="1.5" fill="#fff" />
                  <circle cx="53.6" cy="39.4" r="1.5" fill="#fff" />
                </>
              )}
            </g>

            {/* brows carry most of the expression */}
            <g style={{ transform: `translateY(${browLift}px)`, transition: "transform .4s var(--ease)" }}>
              <path
                d={mood === "thinking" ? "M18 27c4-4 10-4 14-1" : "M18 26c4-3 10-3 14 0"}
                stroke="#2f2a3d"
                strokeWidth="2.6"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d={mood === "thinking" ? "M46 26c4-3 10-3 14 1" : "M46 26c4-3 10-3 14 0"}
                stroke="#2f2a3d"
                strokeWidth="2.6"
                fill="none"
                strokeLinecap="round"
              />
            </g>

            {/* mouth */}
            <path
              d={
                mood === "excited" || mood === "cheer"
                  ? "M30 53c3 5 13 5 16 0"
                  : mood === "wince"
                    ? "M31 55c3-3 11-3 14 0"
                    : mood === "thinking"
                      ? "M33 54h10"
                      : "M32 53c3 3 9 3 12 0"
              }
              stroke="#2f2a3d"
              strokeWidth="2.6"
              fill="none"
              strokeLinecap="round"
            />

            {/* cheeks warm up when he is pleased */}
            <g className="potter__cheeks">
              <ellipse cx="16" cy="50" rx="5" ry="3.2" fill="var(--streak)" opacity=".5" />
              <ellipse cx="60" cy="50" rx="5" ry="3.2" fill="var(--streak)" opacity=".5" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
