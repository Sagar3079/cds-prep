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
  /** Tapping him toggles his thoughts. Omit to render him inert. */
  onToggle?: () => void;
  thoughtsOn?: boolean;
}

/**
 * Potter — the study companion. A scruffy, bespectacled young wizard.
 *
 * Deliberately NOT the trademarked character: no lightning scar, no house
 * crest, no school branding. Round glasses, messy black hair and a striped
 * scarf carry the idea; the specific marks are Warner Bros. property and this
 * repo is public.
 *
 * ONE svg with fixed geometry. LEDGE_Y = 88 of 120 is the line his hands grip;
 * everything below is meant to sit behind whatever he is perched on, and
 * LEDGE_RATIO is exported so the CSS can offset him by exactly that amount
 * rather than a guessed pixel value.
 */
export const LEDGE_RATIO = 88 / 120;

const SKIN = "#f7d3ab";
const SHADE = "#e7b587";
const DEEP = "#d99f6f";
const HAIR = "#211c2b";
const HAIR_HI = "#443a5e";
const ROBE_DARK = "#1e2a52";

export default function Potter({
  mood = "idle",
  look = 0,
  lookY = 0,
  size = 100,
  className = "",
  onToggle,
  thoughtsOn = true,
}: PotterProps) {
  const [blink, setBlink] = useState(false);
  const [tapped, setTapped] = useState(false);
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
        1900 + Math.random() * 3400
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

  const handleTap = () => {
    if (!onToggle) return;
    setTapped(true);
    window.setTimeout(() => setTapped(false), 420);
    onToggle();
  };

  const art = (
    <svg viewBox="0 0 120 120" width="100%" height="100%" className="potter__svg">
      <defs>
        <linearGradient id="pt-robe" x1=".2" y1="0" x2=".85" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor={ROBE_DARK} />
        </linearGradient>
        <radialGradient id="pt-face" cx="40%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#fff1e0" />
          <stop offset="70%" stopColor={SKIN} />
          <stop offset="100%" stopColor={SHADE} />
        </radialGradient>
        <linearGradient id="pt-lens" x1="0" y1="0" x2=".6" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity=".55" />
          <stop offset="55%" stopColor="#cfe0ff" stopOpacity=".18" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity=".05" />
        </linearGradient>
      </defs>

      {/* ================= TORSO ================= */}
      <g className="potter__torso">
        <path d="M60 66c19 0 33 11 36 27l3 27H21l3-27c3-16 17-27 36-27Z" fill="url(#pt-robe)" />
        {/* robe opening + inner shadow, so it reads as cloth not a bib */}
        <path d="M60 74 48 120h24Z" fill={ROBE_DARK} opacity=".55" />
        <path d="M44 78c-4 12-6 26-6 42h-4c0-17 3-31 7-43Z" fill="#000" opacity=".13" />
        {/* collar */}
        <path d="M47 67c4 8 9 12 13 12s9-4 13-12l-6-4c-4 6-10 6-14 0Z" fill="#fdfdff" />
        {/* tie */}
        <path d="M60 79l-5 5 5 22 5-22Z" fill="#8c2f39" />
        <path d="M60 79l-5 5 5 4 5-4Z" fill="#a63a45" />
        {/* arms up onto the ledge */}
        <path d="M28 80c-8 4-11 10-10 18l2 9 17-3-3-16Z" fill={ROBE_DARK} />
        <path d="M92 80c8 4 11 10 10 18l-2 9-17-3 3-16Z" fill={ROBE_DARK} />
        {/* cuffs */}
        <path d="M20 92l16-3 1 6-16 3Z" fill="#fdfdff" opacity=".85" />
        <path d="M100 92l-16-3-1 6 16 3Z" fill="#fdfdff" opacity=".85" />
      </g>

      {/* ================= SCARF ================= */}
      <g className="potter__scarf">
        <path d="M40 63h40a7.5 7.5 0 0 1 0 15H40a7.5 7.5 0 0 1 0-15Z" fill="var(--streak)" />
        <g fill="#fff" opacity=".3">
          <rect x="46" y="64" width="4.5" height="13" />
          <rect x="58" y="64" width="4.5" height="13" />
          <rect x="70" y="64" width="4.5" height="13" />
        </g>
        <path d="M40 63h40a7.5 7.5 0 0 1 3 .6C81 66 72 67 60 67s-21-1-23-3.4a7.5 7.5 0 0 1 3-.6Z" fill="#fff" opacity=".18" />
        <g className="potter__tail">
          <path d="M75 74c9 6 13 14 13 24l-10 2c0-9-3-15-9-19Z" fill="var(--streak)" />
          {/* fringe */}
          <path d="M78 100l10-2 1 5-10 2Z" fill="var(--streak-ink)" opacity=".55" />
        </g>
      </g>

      {/* ================= HEAD ================= */}
      <g
        className="potter__head"
        style={{
          transform: `rotate(${lx * 5}deg) translateY(${ly * -1.6}px)`,
          transformOrigin: "60px 62px",
        }}
      >
        <ellipse cx="18" cy="43" rx="6.5" ry="8.5" fill={SHADE} />
        <ellipse cx="102" cy="43" rx="6.5" ry="8.5" fill={SHADE} />
        <path d="M16 41a4 4 0 0 1 4 4" stroke={DEEP} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M104 41a4 4 0 0 0-4 4" stroke={DEEP} strokeWidth="1.6" fill="none" strokeLinecap="round" />

        <rect x="20" y="6" width="80" height="66" rx="30" fill="url(#pt-face)" />
        {/* jaw + neck shadow give the head volume */}
        <path d="M25 52c6 15 20 23 35 23s29-8 35-23c-1 16-15 27-35 27S26 68 25 52Z" fill={SHADE} opacity=".45" />
        <path d="M47 70h26c-3 5-8 8-13 8s-10-3-13-8Z" fill={DEEP} opacity=".35" />

        {/* hair */}
        <path
          d="M20 37C16 15 33 1 60 1s44 14 40 36c-3-7-8-11-13-13l4-10-11 7-2-10-8 8-5-9-6 9-8-7-3 9-10-6 3 10c-6 2-11 7-14 14Z"
          fill={HAIR}
        />
        <path d="M77 6c11 5 17 14 17 25-3-10-10-19-21-22Z" fill={HAIR_HI} />
        <path d="M31 14c-6 6-9 14-9 22 1-10 4-17 11-23Z" fill={HAIR_HI} opacity=".7" />
        {/* loose strands over the brow */}
        <path d="M36 24c-4 4-5 10-4 15M48 20c-3 5-3 11-2 16" stroke={HAIR} strokeWidth="4.5" strokeLinecap="round" fill="none" />

        {/* brows */}
        <g style={{ transform: `translateY(${happy ? -3 : mood === "wince" ? 2.5 : 0}px)`, transition: "transform .4s var(--ease)" }}>
          <path
            d={mood === "thinking" ? "M31 32c5-5 12-5 17 0" : mood === "wince" ? "M31 29c5 2 12 3 17 5" : "M31 31c5-4 12-4 17 0"}
            stroke={HAIR} strokeWidth="3.6" fill="none" strokeLinecap="round"
          />
          <path
            d={mood === "thinking" ? "M72 32c5-5 12-5 17 0" : mood === "wince" ? "M72 34c5-2 12-3 17-5" : "M72 31c5-4 12-4 17 0"}
            stroke={HAIR} strokeWidth="3.6" fill="none" strokeLinecap="round"
          />
        </g>

        {/* glasses — the defining feature, so they get the most detail */}
        <g className="potter__specs">
          <circle cx="43" cy="46" r="14.5" fill="url(#pt-lens)" />
          <circle cx="77" cy="46" r="14.5" fill="url(#pt-lens)" />
          <circle cx="43" cy="46" r="14.5" fill="none" stroke={HAIR} strokeWidth="3.4" />
          <circle cx="77" cy="46" r="14.5" fill="none" stroke={HAIR} strokeWidth="3.4" />
          <circle cx="43" cy="46" r="11.5" fill="none" stroke="#000" strokeWidth="1" opacity=".18" />
          <circle cx="77" cy="46" r="11.5" fill="none" stroke="#000" strokeWidth="1" opacity=".18" />
          {/* bridge, wrapped over the nose */}
          <path d="M57.5 44c1.6-1.6 3.4-1.6 5 0" stroke={HAIR} strokeWidth="3.4" fill="none" strokeLinecap="round" />
          <path d="M28.5 44l-8-4M91.5 44l8-4" stroke={HAIR} strokeWidth="3.2" strokeLinecap="round" />
          {/* twin glints sell glass */}
          <path d="M35 39a11 11 0 0 1 9-5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" fill="none" opacity=".95" />
          <path d="M69 39a11 11 0 0 1 9-5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".6" />
        </g>

        {/* nose */}
        <path d="M60 48c-1.5 4-2.5 6-1 7.5 1 1 2 1 3 .3" stroke={DEEP} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* eyes */}
        <g style={{ transform: `translate(${lx * 3.6}px, ${ly * -2.6}px)`, transition: "transform .5s var(--ease)" }}>
          {shut ? (
            <>
              <path d="M37 47c4 4.5 8 4.5 12 0" stroke={HAIR} strokeWidth="3.4" fill="none" strokeLinecap="round" />
              <path d="M71 47c4 4.5 8 4.5 12 0" stroke={HAIR} strokeWidth="3.4" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <ellipse cx="43" cy="47" rx="6" ry="6.4" fill="#25412c" />
              <ellipse cx="77" cy="47" rx="6" ry="6.4" fill="#25412c" />
              <circle cx="43" cy="47" r="3.1" fill={HAIR} />
              <circle cx="77" cy="47" r="3.1" fill={HAIR} />
              <circle cx="45.2" cy="44.6" r="2.1" fill="#fff" />
              <circle cx="79.2" cy="44.6" r="2.1" fill="#fff" />
              <circle cx="40.6" cy="49.6" r="1" fill="#fff" opacity=".65" />
              <circle cx="74.6" cy="49.6" r="1" fill="#fff" opacity=".65" />
            </>
          )}
        </g>

        <path
          d={
            happy ? "M50 60c4 6.5 16 6.5 20 0"
            : mood === "wince" ? "M52 63c4-4 12-4 16 0"
            : mood === "thinking" ? "M54 61h12"
            : "M52 60c4 4 12 4 16 0"
          }
          stroke={HAIR} strokeWidth="3.4" fill="none" strokeLinecap="round"
        />
        {happy && <path d="M53 61c4 4 10 4 14 0Z" fill="#b8465a" opacity=".55" />}

        <g className="potter__cheeks">
          <ellipse cx="29" cy="57" rx="7.5" ry="4.2" fill="var(--streak)" opacity=".45" />
          <ellipse cx="91" cy="57" rx="7.5" ry="4.2" fill="var(--streak)" opacity=".45" />
        </g>
      </g>

      {/* ================= HANDS — last, gripping the ledge at y=88 ================= */}
      <g className="potter__hands">
        <g fill={SKIN}>
          <rect x="13" y="79" width="27" height="18" rx="8.5" />
          <rect x="80" y="79" width="27" height="18" rx="8.5" />
        </g>
        <g stroke={DEEP} strokeWidth="1.9" strokeLinecap="round" opacity=".9">
          <path d="M19 83.5v8M25.5 82.5v9M32 83.5v8" />
          <path d="M86 83.5v8M92.5 82.5v9M99 83.5v8" />
        </g>
        {/* thumbs tucked under the edge */}
        <rect x="34" y="88" width="9" height="7" rx="3.5" fill={SHADE} />
        <rect x="77" y="88" width="9" height="7" rx="3.5" fill={SHADE} />
      </g>

      {/* muted indicator — a small "shh" puff when his thoughts are off */}
      {!thoughtsOn && (
        <g className="potter__muted">
          <circle cx="99" cy="20" r="11" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="1.5" />
          <path d="M94 20h10" stroke="var(--muted)" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );

  const classes = `potter potter--${mood} ${tapped ? "potter--tapped" : ""} ${className}`;

  if (!onToggle) {
    return (
      <div className={classes} style={{ width: size, height: size }} aria-hidden="true">
        {art}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleTap}
      aria-pressed={thoughtsOn}
      aria-label={thoughtsOn ? "Mute Potter's thoughts" : "Let Potter think out loud"}
      className={`${classes} potter--tappable`}
      style={{ width: size, height: size }}
    >
      {art}
    </button>
  );
}
