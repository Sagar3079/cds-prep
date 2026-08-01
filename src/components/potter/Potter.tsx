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
 * Potter — the study companion. Chibi wizard: enormous head, tiny body, round
 * glasses, striped house scarf, wand.
 *
 * Flat sticker art rendered with depth rather than as flat fills — every form
 * carries a radial or linear gradient, a contact shadow and a rim light, so it
 * reads as a moulded vinyl figure instead of a decal.
 *
 * LEDGE_Y = 74 of 140 is the line his hands grip; everything below is meant to
 * sit behind whatever he is perched on. LEDGE_RATIO is exported so the CSS can
 * offset him by exactly the hidden portion rather than a guessed pixel value.
 */
export const LEDGE_RATIO = 74 / 140;

const OUTLINE = "#1b1720";
const HAIR = "#6d6733";
const HAIR_DARK = "#4c4722";
const HAIR_LIT = "#8f8848";
const SKIN = "#f6d8bf";
const SKIN_MID = "#e7bb9b";
const SKIN_DEEP = "#cf9a76";
const ROBE = "#26232c";
const ROBE_LIT = "#3b3743";
const SCARF_R = "#b8323a";
const SCARF_R_D = "#8d2229";
const SCARF_G = "#e3b23c";

export default function Potter({
  mood = "idle",
  look = 0,
  lookY = 0,
  size = 110,
  className = "",
  onToggle,
  thoughtsOn = true,
}: PotterProps) {
  const [blink, setBlink] = useState(false);
  const [tapped, setTapped] = useState(false);
  const t = useRef<number | null>(null);
  const uid = useRef(`p${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    let dead = false;
    const loop = () => {
      if (dead) return;
      t.current = window.setTimeout(
        () => {
          setBlink(true);
          window.setTimeout(() => setBlink(false), 105);
          loop();
        },
        1900 + Math.random() * 3300
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
  const u = uid.current;

  const handleTap = () => {
    if (!onToggle) return;
    setTapped(true);
    window.setTimeout(() => setTapped(false), 420);
    onToggle();
  };

  const art = (
    <svg viewBox="0 0 120 140" width="100%" height="100%" className="potter__svg">
      <defs>
        <radialGradient id={`${u}-face`} cx="38%" cy="30%" r="76%">
          <stop offset="0%" stopColor="#fff0e2" />
          <stop offset="62%" stopColor={SKIN} />
          <stop offset="100%" stopColor={SKIN_MID} />
        </radialGradient>
        <linearGradient id={`${u}-hair`} x1=".25" y1="0" x2=".8" y2="1">
          <stop offset="0%" stopColor={HAIR_LIT} />
          <stop offset="45%" stopColor={HAIR} />
          <stop offset="100%" stopColor={HAIR_DARK} />
        </linearGradient>
        <linearGradient id={`${u}-robe`} x1=".2" y1="0" x2=".85" y2="1">
          <stop offset="0%" stopColor={ROBE_LIT} />
          <stop offset="100%" stopColor={ROBE} />
        </linearGradient>
        <linearGradient id={`${u}-lens`} x1=".1" y1="0" x2=".8" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="48%" stopColor="#f2f6ff" />
          <stop offset="100%" stopColor="#d9e4f5" />
        </linearGradient>
        <linearGradient id={`${u}-wand`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a8794b" />
          <stop offset="55%" stopColor="#6f4a2a" />
          <stop offset="100%" stopColor="#4a301a" />
        </linearGradient>
        {/* contact shadow that sells the figure sitting on something */}
        <radialGradient id={`${u}-shadow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0d1024" stopOpacity=".34" />
          <stop offset="100%" stopColor="#0d1024" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ============== WAND, held out to the side ============== */}
      <g className="potter__wand">
        <g transform="rotate(-28 26 74)">
          <rect x="-4" y="70" width="40" height="6" rx="3" fill={`url(#${u}-wand)`} stroke={OUTLINE} strokeWidth="2.4" />
          <rect x="26" y="69" width="11" height="8" rx="3.5" fill="#5b3c22" stroke={OUTLINE} strokeWidth="2.4" />
          <circle cx="-3" cy="73" r="2.4" fill="#e9d9c2" opacity=".9" />
        </g>
        {/* a faint spark at the tip */}
        <circle className="potter__spark" cx="6" cy="59" r="3" fill="var(--streak)" opacity=".85" />
      </g>

      {/* ============== BODY ============== */}
      <g className="potter__torso">
        {/* legs + shoes, visible only when he is not perched */}
        <g stroke={OUTLINE} strokeWidth="2.6">
          <rect x="45" y="112" width="11" height="17" rx="4" fill="#6d6b78" />
          <rect x="64" y="112" width="11" height="17" rx="4" fill="#5f5d6a" />
          <rect x="41" y="126" width="17" height="9" rx="4" fill="#221f28" />
          <rect x="62" y="126" width="17" height="9" rx="4" fill="#1b1820" />
        </g>

        {/* robe */}
        <path
          d="M60 64c17 0 28 9 31 24l4 41H25l4-41c3-15 14-24 31-24Z"
          fill={`url(#${u}-robe)`}
          stroke={OUTLINE}
          strokeWidth="2.8"
        />
        {/* opening, and the shadow inside it */}
        <path d="M60 70 50 129h20Z" fill="#141218" opacity=".85" />
        <path d="M42 78c-4 14-6 31-6 51h-5c0-21 3-38 8-53Z" fill="#000" opacity=".22" />
        {/* rim light down the left edge — the main 3D cue on the cloth */}
        <path d="M35 88c-2 12-3 26-3 41h3c0-15 1-29 3-41Z" fill="#8e93b5" opacity=".3" />

        {/* arms up onto the ledge */}
        <path d="M29 72c-9 4-13 12-11 21l3 12 19-4-4-19Z" fill={`url(#${u}-robe)`} stroke={OUTLINE} strokeWidth="2.6" />
        <path d="M91 72c9 4 13 12 11 21l-3 12-19-4 4-19Z" fill={`url(#${u}-robe)`} stroke={OUTLINE} strokeWidth="2.6" />
      </g>

      {/* ============== SCARF ============== */}
      <g className="potter__scarf" stroke={OUTLINE} strokeWidth="2.6">
        <path d="M37 58h46a8 8 0 0 1 0 16H37a8 8 0 0 1 0-16Z" fill={SCARF_R} />
        <g stroke="none">
          <rect x="44" y="59" width="6" height="14" fill={SCARF_G} />
          <rect x="57" y="59" width="6" height="14" fill={SCARF_G} />
          <rect x="70" y="59" width="6" height="14" fill={SCARF_G} />
          {/* top highlight + bottom shade give the wool volume */}
          <path d="M37 58h46a8 8 0 0 1 4 1.2C83 62 72 63 60 63s-23-1-27-3.8A8 8 0 0 1 37 58Z" fill="#fff" opacity=".22" />
          <path d="M33 70c5 3 16 4 27 4s22-1 27-4a8 8 0 0 1-4 4H37a8 8 0 0 1-4-4Z" fill={SCARF_R_D} opacity=".8" />
        </g>
        <g className="potter__tail">
          <path d="M78 70c10 7 15 17 15 29l-12 2c0-11-4-19-11-24Z" fill={SCARF_R} />
          <g stroke="none">
            <path d="M84 82c3 4 5 9 5 15l-7 1c0-6-2-11-5-14Z" fill={SCARF_G} />
            <path d="M81 99l12-2 1 6-12 2Z" fill={SCARF_R_D} />
          </g>
        </g>
      </g>

      {/* ============== HEAD ============== */}
      <g
        className="potter__head"
        style={{
          transform: `rotate(${lx * 4.5}deg) translateY(${ly * -1.6}px)`,
          transformOrigin: "60px 56px",
        }}
      >
        {/* ears tucked under the hair */}
        <ellipse cx="17" cy="40" rx="6" ry="8" fill={SKIN_MID} stroke={OUTLINE} strokeWidth="2.4" />
        <ellipse cx="103" cy="40" rx="6" ry="8" fill={SKIN_MID} stroke={OUTLINE} strokeWidth="2.4" />

        {/* face */}
        <rect x="17" y="4" width="86" height="62" rx="29" fill={`url(#${u}-face)`} stroke={OUTLINE} strokeWidth="2.8" />
        {/* shadow cast by the hair onto the forehead — the strongest depth cue */}
        <path d="M20 26c8-6 20-9 40-9s32 3 40 9c-3-10-8-16-14-19H34c-6 3-11 9-14 19Z" fill={SKIN_DEEP} opacity=".38" />
        {/* jaw shading */}
        <path d="M22 44c6 14 21 22 38 22s32-8 38-22c-2 15-16 25-38 25S24 59 22 44Z" fill={SKIN_MID} opacity=".5" />

        {/* hair: big rounded mop with a spiky fringe */}
        <path
          d="M14 40C10 15 29 1 60 1s50 14 46 39c-2-11-7-19-13-23l2-8-9 5-3-8-7 6-5-7-6 7-7-6-3 8-9-5 2 8c-6 4-11 12-13 23Z"
          fill={`url(#${u}-hair)`}
          stroke={OUTLINE}
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
        {/* specular sweep across the top of the hair */}
        <path d="M32 14c8-7 18-10 30-10-11 2-20 6-26 13Z" fill="#fff" opacity=".28" />
        <path d="M84 9c8 5 13 14 14 25-3-11-8-19-17-23Z" fill={HAIR_DARK} opacity=".6" />
        {/* loose strands */}
        <path d="M38 20c-4 5-6 11-5 17M52 15c-3 6-4 12-3 18" stroke={HAIR_DARK} strokeWidth="3.4" strokeLinecap="round" fill="none" opacity=".75" />

        {/* the scar */}
        <path d="M40 22l4-5-2 6 4-4" stroke="#b8543f" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* brows */}
        <g style={{ transform: `translateY(${happy ? -2.6 : mood === "wince" ? 2.4 : 0}px)`, transition: "transform .4s var(--ease)" }}>
          <path
            d={mood === "thinking" ? "M30 33c5-5 12-5 16 0" : mood === "wince" ? "M30 31c5 2 11 3 16 5" : "M30 32c5-4 11-4 16 0"}
            stroke={HAIR_DARK} strokeWidth="3.4" fill="none" strokeLinecap="round"
          />
          <path
            d={mood === "thinking" ? "M74 33c5-5 12-5 16 0" : mood === "wince" ? "M74 36c5-2 11-3 16-5" : "M74 32c5-4 11-4 16 0"}
            stroke={HAIR_DARK} strokeWidth="3.4" fill="none" strokeLinecap="round"
          />
        </g>

        {/* glasses — big, round, the signature */}
        <g className="potter__specs">
          <circle cx="42" cy="44" r="15" fill={`url(#${u}-lens)`} stroke={OUTLINE} strokeWidth="3.2" />
          <circle cx="78" cy="44" r="15" fill={`url(#${u}-lens)`} stroke={OUTLINE} strokeWidth="3.2" />
          <path d="M57 42c2-2 4-2 6 0" stroke={OUTLINE} strokeWidth="3.2" fill="none" strokeLinecap="round" />
          <path d="M27 42l-9-4M93 42l9-4" stroke={OUTLINE} strokeWidth="3" strokeLinecap="round" />

          {/* eyes, inside the lenses */}
          <g style={{ transform: `translate(${lx * 3.4}px, ${ly * -2.4}px)`, transition: "transform .5s var(--ease)" }}>
            {shut ? (
              <>
                <path d="M36 45c4 5 8 5 12 0" stroke={OUTLINE} strokeWidth="3.2" fill="none" strokeLinecap="round" />
                <path d="M72 45c4 5 8 5 12 0" stroke={OUTLINE} strokeWidth="3.2" fill="none" strokeLinecap="round" />
              </>
            ) : (
              <>
                <ellipse cx="42" cy="45" rx="7" ry="7.6" fill="#2c5138" />
                <ellipse cx="78" cy="45" rx="7" ry="7.6" fill="#2c5138" />
                <circle cx="42" cy="45" r="4" fill={OUTLINE} />
                <circle cx="78" cy="45" r="4" fill={OUTLINE} />
                <circle cx="44.6" cy="42" r="2.6" fill="#fff" />
                <circle cx="80.6" cy="42" r="2.6" fill="#fff" />
                <circle cx="39.4" cy="48" r="1.3" fill="#fff" opacity=".7" />
                <circle cx="75.4" cy="48" r="1.3" fill="#fff" opacity=".7" />
              </>
            )}
          </g>
          {/* glass glints last, over everything */}
          <path d="M33 37a12 12 0 0 1 9-6" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" opacity=".95" />
          <path d="M69 37a12 12 0 0 1 9-6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" opacity=".55" />
        </g>

        {/* nose + mouth */}
        <path d="M60 48c-1 3-1.6 5-.4 6.2.9.9 2 .8 2.9 0" stroke={SKIN_DEEP} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path
          d={
            happy ? "M51 59c4 6.5 14 6.5 18 0"
            : mood === "wince" ? "M52 62c4-4 12-4 16 0"
            : mood === "thinking" ? "M54 60h12"
            : "M52 59c4 4.5 12 4.5 16 0"
          }
          stroke={OUTLINE} strokeWidth="3" fill="none" strokeLinecap="round"
        />
        {happy && <path d="M53 60c4 4 10 4 14 0Z" fill="#b8465a" opacity=".6" />}

        <g className="potter__cheeks">
          <ellipse cx="26" cy="55" rx="7.5" ry="4.2" fill="#e8848a" opacity=".55" />
          <ellipse cx="94" cy="55" rx="7.5" ry="4.2" fill="#e8848a" opacity=".55" />
        </g>
      </g>

      {/* ============== HANDS gripping the ledge at y=74 ============== */}
      <g className="potter__hands" stroke={OUTLINE} strokeWidth="2.6">
        <rect x="12" y="66" width="26" height="17" rx="8" fill={SKIN} />
        <rect x="82" y="66" width="26" height="17" rx="8" fill={SKIN} />
        <g stroke={SKIN_DEEP} strokeWidth="1.8" strokeLinecap="round">
          <path d="M18 70.5v8M24 69.5v9M30 70.5v8" />
          <path d="M88 70.5v8M94 69.5v9M100 70.5v8" />
        </g>
      </g>

      {/* contact shadow beneath the hands */}
      <ellipse cx="60" cy="84" rx="52" ry="7" fill={`url(#${u}-shadow)`} />

      {!thoughtsOn && (
        <g className="potter__muted">
          <circle cx="102" cy="14" r="11" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="1.5" />
          <path d="M97 14h10" stroke="var(--muted)" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );

  const classes = `potter potter--${mood} ${tapped ? "potter--tapped" : ""} ${className}`;

  if (!onToggle) {
    return (
      <div className={classes} style={{ width: size * 0.86, height: size }} aria-hidden="true">
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
      style={{ width: size * 0.86, height: size }}
    >
      {art}
    </button>
  );
}
