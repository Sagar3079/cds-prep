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
  /** -1 (left) … 1 (right) */
  look?: number;
  /** -1 (down) … 1 (up) */
  lookY?: number;
  size?: number;
  className?: string;
}

/**
 * Potter — the study companion.
 *
 * ONE svg, not stacked layers. The previous version positioned four absolute
 * layers independently, which made it impossible to reason about where his
 * hands were relative to the card edge — they drifted and read as loose blobs.
 *
 * The geometry is now fixed and documented:
 *
 *   viewBox is 120 wide x 120 tall
 *   LEDGE_Y = 88  — the line his hands grip; everything below is meant to be
 *                   hidden behind whatever he is perched on
 *
 * `LEDGE_RATIO` is exported so the CSS placement can offset him by exactly the
 * hidden portion instead of guessing a pixel value.
 */
export const LEDGE_RATIO = 88 / 120; // 0.733 of his height sits above the ledge

const SKIN = "#f7d3ab";
const SKIN_SHADE = "#e8b98a";
const HAIR = "#241f2e";
const HAIR_HI = "#3d3553";

export default function Potter({
  mood = "idle",
  look = 0,
  lookY = 0,
  size = 100,
  className = "",
}: PotterProps) {
  const [blink, setBlink] = useState(false);
  const t = useRef<number | null>(null);

  useEffect(() => {
    let dead = false;
    const loop = () => {
      if (dead) return;
      t.current = window.setTimeout(
        () => {
          setBlink(true);
          window.setTimeout(() => setBlink(false), 100);
          loop();
        },
        2000 + Math.random() * 3400
      );
    };
    loop();
    return () => {
      dead = true;
      if (t.current !== null) window.clearTimeout(t.current);
    };
  }, []);

  const lx = Math.max(-1, Math.min(1, look));
  const ly = Math.max(-1, Math.min(1, lookY));
  const shut = blink || mood === "cheer";
  const happy = mood === "excited" || mood === "cheer" || mood === "impressed";

  const pupil = { x: lx * 3.6, y: ly * -2.6 };
  const headTilt = lx * 5;

  return (
    <div
      className={`potter potter--${mood} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 120" width="100%" height="100%" className="potter__svg">
        <defs>
          <linearGradient id="pt-robe" x1=".25" y1="0" x2=".8" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-ink)" />
          </linearGradient>
          <radialGradient id="pt-face" cx="42%" cy="34%" r="70%">
            <stop offset="0%" stopColor="#ffeeda" />
            <stop offset="100%" stopColor={SKIN} />
          </radialGradient>
        </defs>

        {/* ================= BODY (behind everything) ================= */}
        <g className="potter__torso">
          {/* shoulders, running past the ledge so nothing floats */}
          <path
            d="M60 66c19 0 33 11 36 27l3 27H21l3-27c3-16 17-27 36-27Z"
            fill="url(#pt-robe)"
          />
          {/* arms reaching up onto the ledge */}
          <path d="M28 80c-7 3-10 9-9 16l2 10 16-3-3-15Z" fill="var(--accent-ink)" />
          <path d="M92 80c7 3 10 9 9 16l-2 10-16-3 3-15Z" fill="var(--accent-ink)" />
          {/* collar */}
          <path d="M48 68c4 7 8 10 12 10s8-3 12-10l-5-3c-4 5-10 5-14 0Z" fill="#fff" opacity=".9" />
        </g>

        {/* ================= SCARF — small, at the neck ================= */}
        <g className="potter__scarf">
          <path d="M40 64h40a7 7 0 0 1 0 14H40a7 7 0 0 1 0-14Z" fill="var(--streak)" />
          <g fill="#fff" opacity=".28">
            <rect x="47" y="65" width="4" height="12" />
            <rect x="58" y="65" width="4" height="12" />
            <rect x="69" y="65" width="4" height="12" />
          </g>
          {/* the tail flicks — it is the only thing that moves on its own */}
          <path className="potter__tail" d="M74 74c8 5 12 13 12 22l-9 2c0-8-3-14-8-18Z" fill="var(--streak)" />
        </g>

        {/* ================= HEAD ================= */}
        <g
          className="potter__head"
          style={{
            transform: `rotate(${headTilt}deg) translateY(${ly * -1.5}px)`,
            transformOrigin: "60px 62px",
          }}
        >
          {/* ears */}
          <ellipse cx="19" cy="42" rx="6" ry="8" fill={SKIN_SHADE} />
          <ellipse cx="101" cy="42" rx="6" ry="8" fill={SKIN_SHADE} />

          {/* face */}
          <rect x="20" y="6" width="80" height="66" rx="30" fill="url(#pt-face)" />
          {/* jaw shading, so the head reads round rather than flat */}
          <path d="M24 50c6 14 20 22 36 22s30-8 36-22c-2 14-16 24-36 24S26 64 24 50Z" fill={SKIN_SHADE} opacity=".4" />

          {/* hair: silhouette + spikes */}
          <path
            d="M20 36C17 16 33 2 60 2s43 14 40 34c-3-6-7-10-12-12l3-9-10 6-2-9-7 7-5-8-5 8-7-6-3 8-9-5 2 9c-5 2-10 6-13 13Z"
            fill={HAIR}
          />
          <path d="M76 7c10 4 16 13 16 23-3-9-9-17-19-20Z" fill={HAIR_HI} />
          <path d="M35 22c-3 4-4 9-3 13" stroke={HAIR} strokeWidth="4" strokeLinecap="round" fill="none" />

          {/* brows */}
          <g
            style={{
              transform: `translateY(${happy ? -3 : mood === "wince" ? 2.5 : 0}px)`,
              transition: "transform .4s var(--ease)",
            }}
          >
            <path
              d={mood === "thinking" ? "M31 32c5-5 12-5 17 0" : mood === "wince" ? "M31 29c5 2 12 3 17 5" : "M31 31c5-4 12-4 17 0"}
              stroke={HAIR} strokeWidth="3.4" fill="none" strokeLinecap="round"
            />
            <path
              d={mood === "thinking" ? "M72 32c5-5 12-5 17 0" : mood === "wince" ? "M72 34c5-2 12-3 17-5" : "M72 31c5-4 12-4 17 0"}
              stroke={HAIR} strokeWidth="3.4" fill="none" strokeLinecap="round"
            />
          </g>

          {/* glasses */}
          <g>
            <circle cx="43" cy="46" r="14" fill="#fff" opacity=".38" />
            <circle cx="77" cy="46" r="14" fill="#fff" opacity=".38" />
            <circle cx="43" cy="46" r="14" fill="none" stroke={HAIR} strokeWidth="3.2" />
            <circle cx="77" cy="46" r="14" fill="none" stroke={HAIR} strokeWidth="3.2" />
            <path d="M57 46h6" stroke={HAIR} strokeWidth="3.2" strokeLinecap="round" />
            <path d="M29 44l-7-3M91 44l7-3" stroke={HAIR} strokeWidth="3" strokeLinecap="round" />
            <path d="M36 39a10 10 0 0 1 8-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".9" />
          </g>

          {/* eyes */}
          <g style={{ transform: `translate(${pupil.x}px, ${pupil.y}px)`, transition: "transform .5s var(--ease)" }}>
            {shut ? (
              <>
                <path d="M37 47c4 4 8 4 12 0" stroke={HAIR} strokeWidth="3.2" fill="none" strokeLinecap="round" />
                <path d="M71 47c4 4 8 4 12 0" stroke={HAIR} strokeWidth="3.2" fill="none" strokeLinecap="round" />
              </>
            ) : (
              <>
                <circle cx="43" cy="47" r="5.6" fill={HAIR} />
                <circle cx="77" cy="47" r="5.6" fill={HAIR} />
                <circle cx="45" cy="45" r="2" fill="#fff" />
                <circle cx="79" cy="45" r="2" fill="#fff" />
              </>
            )}
          </g>

          <path
            d={
              happy ? "M50 60c4 6 16 6 20 0"
              : mood === "wince" ? "M52 63c4-4 12-4 16 0"
              : mood === "thinking" ? "M54 61h12"
              : "M52 60c4 4 12 4 16 0"
            }
            stroke={HAIR} strokeWidth="3.2" fill="none" strokeLinecap="round"
          />

          <g className="potter__cheeks">
            <ellipse cx="29" cy="57" rx="7" ry="4" fill="var(--streak)" opacity=".45" />
            <ellipse cx="91" cy="57" rx="7" ry="4" fill="var(--streak)" opacity=".45" />
          </g>
        </g>

        {/* ============ HANDS — drawn LAST, gripping the ledge at y=88 ============ */}
        <g className="potter__hands">
          <g fill={SKIN}>
            <rect x="14" y="80" width="26" height="17" rx="8" />
            <rect x="80" y="80" width="26" height="17" rx="8" />
          </g>
          {/* fingers curling over the edge */}
          <g stroke={SKIN_SHADE} strokeWidth="1.8" strokeLinecap="round" opacity=".9">
            <path d="M20 84v7M26 83v8M32 84v7" />
            <path d="M86 84v7M92 83v8M98 84v7" />
          </g>
        </g>
      </svg>
    </div>
  );
}
