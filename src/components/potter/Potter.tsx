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
  /** Flying on a broomstick instead of gripping a ledge. */
  riding?: boolean;
}

/**
 * Potter — the study companion. Chibi wizard: enormous head, tiny body, round
 * glasses, striped house scarf, wand.
 *
 * STICKER RULES — this is flat vector art, not a render. Every form is a solid
 * fill inside a thick dark outline (stroke 2.6–3.2 at this 120x140 viewBox); the
 * outlines are the style, so never thin them. Shading is limited to at most one
 * flat secondary tone per form — one darker hair wedge, one dark robe opening,
 * one dark band on the scarf tail. No gradients, no rim lights, no specular
 * sweeps, no soft cast shadows: they read as "3D toy" rather than "sticker".
 *
 * Consequently there are no <defs> at all. If a gradient, filter or clipPath is
 * ever reintroduced, its id MUST be namespaced per instance (a useRef random
 * suffix) — three Potters mount at once, SVG ids are document-global, and fixed
 * ids make every copy resolve to whichever one mounted first.
 *
 * The only tonal element that is not a fill is the contact shadow ellipse under
 * his hands: a flat low-opacity ellipse. It is load-bearing — without it he
 * floats — so it stays in the perched pose. It is dropped while `riding`,
 * because floating is the point there.
 *
 * LEDGE_Y = 74 of 140 is the line his hands grip; everything below is meant to
 * sit behind whatever he is perched on. LEDGE_RATIO is exported so the CSS can
 * offset him by exactly the hidden portion rather than a guessed pixel value.
 */
export const LEDGE_RATIO = 74 / 140;

/**
 * Idle beats. He plays one every 5–12s so he is never merely breathing.
 * `nudge` is him pushing his glasses back up his nose — the most characterful
 * of the four, so it gets two entries and comes up twice as often.
 */
type Gesture = "none" | "nudge" | "nod" | "glance" | "shiver";
const GESTURES: Gesture[] = ["nudge", "nudge", "nod", "glance", "shiver"];
const GESTURE_MS: Record<Gesture, number> = {
  none: 0,
  nudge: 900,
  nod: 800,
  glance: 1400,
  shiver: 700,
};

const OUTLINE = "#1b1720";
const HAIR = "#6d6733";
const HAIR_DARK = "#4c4722";
const SKIN = "#f6d8bf";
const SKIN_MID = "#e7bb9b";
const SKIN_DEEP = "#cf9a76";
const ROBE = "#26232c";
const ROBE_DEEP = "#141218";
const SCARF_R = "#b8323a";
const SCARF_R_D = "#8d2229";
const SCARF_G = "#e3b23c";
const LENS = "#e9f0fb";
const WOOD = "#8a5a2e";
const WOOD_DARK = "#5b3c22";
const BRISTLE = "#dda75a";
const BRISTLE_DARK = "#a9762e";

export default function Potter({
  mood = "idle",
  look = 0,
  lookY = 0,
  size = 110,
  className = "",
  onToggle,
  thoughtsOn = true,
  riding = false,
}: PotterProps) {
  const [blink, setBlink] = useState(false);
  const [tapped, setTapped] = useState(false);
  /** Small idle beats. Stillness is what reads as dead, so he is never fully still. */
  const [gesture, setGesture] = useState<Gesture>("none");
  /** Eye drift between blinks — a fixed stare is the single deadest thing a face can do. */
  const [drift, setDrift] = useState({ x: 0, y: 0 });

  // Every timeout registers here so unmount can clear it. Ids are removed as
  // they fire — an append-only list grows by thousands on a page left open.
  const timers = useRef<Set<number>>(new Set());
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  };

  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout);
      timers.current.clear();
    },
    []
  );

  // Blinks. Irregular, and occasionally a double — a metronome reads as a machine.
  useEffect(() => {
    let dead = false;
    const loop = () => {
      if (dead) return;
      later(
        () => {
          if (dead) return;
          setBlink(true);
          later(() => setBlink(false), 95);
          if (Math.random() < 0.22) {
            later(() => setBlink(true), 230);
            later(() => setBlink(false), 325);
          }
          loop();
        },
        1700 + Math.random() * 3200
      );
    };
    loop();
    return () => {
      dead = true;
    };
  }, []);

  // Saccades: eyes flick somewhere and hold, rather than tracking smoothly.
  useEffect(() => {
    let dead = false;
    const loop = () => {
      if (dead) return;
      later(
        () => {
          if (dead) return;
          setDrift({ x: (Math.random() - 0.5) * 0.7, y: (Math.random() - 0.5) * 0.5 });
          // settle back to centre before the next flick, so he isn't cross-eyed
          later(() => setDrift({ x: 0, y: 0 }), 900 + Math.random() * 1200);
          loop();
        },
        2400 + Math.random() * 3800
      );
    };
    loop();
    return () => {
      dead = true;
    };
  }, []);

  // Idle gestures. Suppressed while riding — he is busy flying.
  useEffect(() => {
    if (riding) return;
    let dead = false;
    const loop = () => {
      if (dead) return;
      later(
        () => {
          if (dead) return;
          const g = GESTURES[Math.floor(Math.random() * GESTURES.length)];
          setGesture(g);
          later(() => setGesture("none"), GESTURE_MS[g]);
          loop();
        },
        5200 + Math.random() * 6500
      );
    };
    loop();
    return () => {
      dead = true;
    };
  }, [riding]);

  const lx = Math.max(-1, Math.min(1, look + drift.x));
  const ly = Math.max(-1, Math.min(1, lookY + drift.y));
  const shut = blink || mood === "cheer";
  const happy = mood === "excited" || mood === "cheer" || mood === "impressed";

  const handleTap = () => {
    if (!onToggle) return;
    setTapped(true);
    later(() => setTapped(false), 420);
    onToggle();
  };

  // The broom's bristles are drawn on the right, so the art reads as travelling
  // LEFT. On the rightward half of the review weave that means flying
  // backwards. Mirror the whole figure when he is heading right.
  //
  // Reads `look`, NOT the drifted `lx`: eye saccades add up to +-0.35 of noise,
  // which at the edges of the weave is enough to decide the sign on its own and
  // spin him 180 degrees while hovering.
  //
  // Bare scale(-1,1) — the CSS gives this group transform-origin: 60px 70px, so
  // the usual translate(w,0) scale(-1,1) idiom (which assumes origin 0 0) would
  // compose to a mirror about x=120 and shift him a whole viewBox to the right.
  //
  // Done as an SVG group rather than a CSS transform on `.potter__svg`: that
  // element already carries the breathing/mood keyframes, and a CSS transform
  // would be overwritten by them.
  const facingRight = riding && look > 0.05;

  const art = (
    <svg viewBox="0 0 120 140" width="100%" height="100%" className="potter__svg">
      <g
        className="potter__facing"
        transform={facingRight ? "scale(-1,1)" : undefined}
      >
      {/* ============== WAND, held out to the side ==============
          Both hands are on the broom when riding, so the wand is put away. */}
      {!riding && (
        <g className="potter__wand">
          <g transform="rotate(-28 26 74)">
            <rect x="-4" y="70" width="40" height="6" rx="3" fill={WOOD} stroke={OUTLINE} strokeWidth="2.4" />
            <rect x="26" y="69" width="11" height="8" rx="3.5" fill={WOOD_DARK} stroke={OUTLINE} strokeWidth="2.4" />
            <circle cx="-3" cy="73" r="2.4" fill="#e9d9c2" />
          </g>
          {/* a faint spark at the tip */}
          <circle className="potter__spark" cx="6" cy="59" r="3" fill="var(--streak)" />
        </g>
      )}

      {/* ============== BODY ============== */}
      <g className="potter__torso">
        {riding ? (
          <>
            {/* legs hanging off the broom — drawn first so the robe hem cuts
                across them and reads as cloth in front of the legs */}
            <g stroke={OUTLINE} strokeWidth="2.6">
              <rect x="44" y="104" width="11" height="18" rx="4" fill="#6d6b78" />
              <rect x="64" y="106" width="11" height="18" rx="4" fill="#5f5d6a" />
              <rect x="40" y="118" width="17" height="9" rx="4" fill="#221f28" />
              <rect x="61" y="120" width="17" height="9" rx="4" fill="#1b1820" />
            </g>

            {/* seated robe: shorter and wider than the standing one, hem draping
                over the broom */}
            <path
              d="M60 64c15 0 26 9 29 22l4 26H27l4-26c3-13 14-22 29-22Z"
              fill={ROBE}
              stroke={OUTLINE}
              strokeWidth="2.8"
            />
            <path d="M60 70 52 112h16Z" fill={ROBE_DEEP} />

            {/* arms reaching down to the handle. Drawn as a dark stroke with a
                narrower robe-coloured stroke over it — an outlined limb without
                a second path to keep in sync. Both outlines go down first so the
                arms cannot cut into each other. */}
            <g className="potter__arms" fill="none" strokeLinecap="round">
              <path d="M33 72C24 80 26 91 39 97" stroke={OUTLINE} strokeWidth="14" />
              <path d="M87 72C96 80 94 93 80 100" stroke={OUTLINE} strokeWidth="14" />
              <path d="M33 72C24 80 26 91 39 97" stroke={ROBE} strokeWidth="8.8" />
              <path d="M87 72C96 80 94 93 80 100" stroke={ROBE} strokeWidth="8.8" />
            </g>
          </>
        ) : (
          <>
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
              fill={ROBE}
              stroke={OUTLINE}
              strokeWidth="2.8"
            />
            {/* the opening down the front — the robe's one flat secondary tone */}
            <path d="M60 70 50 129h20Z" fill={ROBE_DEEP} />

            {/* arms up onto the ledge */}
            <path d="M29 72c-9 4-13 12-11 21l3 12 19-4-4-19Z" fill={ROBE} stroke={OUTLINE} strokeWidth="2.6" />
            <path d="M91 72c9 4 13 12 11 21l-3 12-19-4 4-19Z" fill={ROBE} stroke={OUTLINE} strokeWidth="2.6" />
          </>
        )}
      </g>

      {/* ============== BROOM ==============
          Behind him and in front of the robe hem, so the handle passes across
          his lap the way a stick you are sitting on does. Tilted nose-up. */}
      {riding && (
        <g className="potter__broom" transform="rotate(6 60 100)">
          <rect x="2" y="96.5" width="88" height="7" rx="3.5" fill={WOOD} stroke={OUTLINE} strokeWidth="2.8" />
          <path
            d="M95 93C105 84.5 112 83 115 86c1.4 1.4 1.4 26.6 0 28-3 3-10 1.5-20-7Z"
            fill={BRISTLE}
            stroke={OUTLINE}
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
          <g stroke={BRISTLE_DARK} strokeWidth="2" strokeLinecap="round" fill="none">
            <path d="M99.5 96.5C105 94 110 93.2 112.5 93.4" />
            <path d="M99.5 100.4C105 99.4 110 99.4 112.5 100.2" />
            <path d="M99.5 104.2C105 105.6 110 106.8 112.5 107.4" />
          </g>
          {/* the binding where the straw meets the shaft */}
          <rect x="86" y="91" width="10" height="18" rx="4" fill={WOOD_DARK} stroke={OUTLINE} strokeWidth="2.6" />
        </g>
      )}

      {/* ============== SCARF ============== */}
      <g className="potter__scarf" stroke={OUTLINE} strokeWidth="2.6">
        <path d="M37 58h46a8 8 0 0 1 0 16H37a8 8 0 0 1 0-16Z" fill={SCARF_R} />
        <g stroke="none">
          <rect x="44" y="59" width="6" height="14" fill={SCARF_G} />
          <rect x="57" y="59" width="6" height="14" fill={SCARF_G} />
          <rect x="70" y="59" width="6" height="14" fill={SCARF_G} />
        </g>
        {/* the wrapper takes the riding tilt: the tail itself is animated from
            CSS, and a CSS transform would win over an attribute on that node */}
        <g transform={riding ? "rotate(-28 78 72)" : undefined}>
          <g className="potter__tail">
            <path d="M78 70c10 7 15 17 15 29l-12 2c0-11-4-19-11-24Z" fill={SCARF_R} />
            <g stroke="none">
              <path d="M84 82c3 4 5 9 5 15l-7 1c0-6-2-11-5-14Z" fill={SCARF_G} />
              <path d="M81 99l12-2 1 6-12 2Z" fill={SCARF_R_D} />
            </g>
          </g>
        </g>
      </g>

      {/* ============== HEAD ============== */}
      {/* Two nested groups on purpose. A CSS animation beats the style
          attribute in the cascade, so an infinite idle bob on the SAME element
          silently overrides the inline look transform — that is why his head
          never turned. The bob owns the outer group; the turn owns the inner. */}
      <g className="potter__head-bob">
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

        {/* face — one solid fill, no modelling */}
        <rect x="17" y="4" width="86" height="62" rx="29" fill={SKIN} stroke={OUTLINE} strokeWidth="2.8" />

        {/* hair: big rounded mop with a spiky fringe. Grouped so it can carry
            its own slow sway — hair with weight is most of what separates a
            living character from a decal. */}
        <g className="potter__hair">
          <path
            d="M14 40C10 15 29 1 60 1s50 14 46 39c-2-11-7-19-13-23l2-8-9 5-3-8-7 6-5-7-6 7-7-6-3 8-9-5 2 8c-6 4-11 12-13 23Z"
            fill={HAIR}
            stroke={OUTLINE}
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
          {/* the head's single flat shadow tone: the far side of the mop */}
          <path d="M83 8c9 5 15 14 16 26-3-12-8-20-18-23Z" fill={HAIR_DARK} />
        </g>

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
          <circle cx="42" cy="44" r="15" fill={LENS} stroke={OUTLINE} strokeWidth="3.2" />
          <circle cx="78" cy="44" r="15" fill={LENS} stroke={OUTLINE} strokeWidth="3.2" />
          <path d="M57 42c2-2 4-2 6 0" stroke={OUTLINE} strokeWidth="3.2" fill="none" strokeLinecap="round" />
          <path d="M27 42l-9-4M93 42l9-4" stroke={OUTLINE} strokeWidth="3" strokeLinecap="round" />

          {/* Eyes. The transition is on the class, not inline: real saccades
              snap to a target and hold, so this uses a fast snappy curve rather
              than the slow glide the rest of him uses. */}
          <g
            className="potter__eyes"
            style={{ transform: `translate(${lx * 3.4}px, ${ly * -2.4}px)` }}
          >
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
              </>
            )}
          </g>
          {/* one crisp glint per lens, drawn last */}
          <path d="M33 37a12 12 0 0 1 9-6" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" />
          <path d="M69 37a12 12 0 0 1 9-6" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" />
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
        {happy && <path d="M53 60c4 4 10 4 14 0Z" fill="#b8465a" />}

        <g className="potter__cheeks">
          <ellipse cx="26" cy="55" rx="7.5" ry="4.2" fill="#f0a3a6" />
          <ellipse cx="94" cy="55" rx="7.5" ry="4.2" fill="#f0a3a6" />
        </g>
      </g>

      </g>

      {/* ============== HANDS ==============
          On the broom handle when riding (same tilt as the broom), otherwise
          gripping the ledge at y=74. Drawn last so they sit over the handle. */}
      {riding ? (
        <g className="potter__hands" transform="rotate(6 60 100)" stroke={OUTLINE} strokeWidth="2.6">
          <rect x="33" y="92" width="17" height="14" rx="6.5" fill={SKIN} />
          <rect x="69" y="92" width="17" height="14" rx="6.5" fill={SKIN} />
          <g stroke={SKIN_DEEP} strokeWidth="1.8" strokeLinecap="round">
            <path d="M38 96.5v5M42.5 95.5v7M47 96.5v5" />
            <path d="M74 96.5v5M78.5 95.5v7M83 96.5v5" />
          </g>
        </g>
      ) : (
        <g className="potter__hands" stroke={OUTLINE} strokeWidth="2.6">
          <rect x="12" y="66" width="26" height="17" rx="8" fill={SKIN} />
          <rect x="82" y="66" width="26" height="17" rx="8" fill={SKIN} />
          <g stroke={SKIN_DEEP} strokeWidth="1.8" strokeLinecap="round">
            <path d="M18 70.5v8M24 69.5v9M30 70.5v8" />
            <path d="M88 70.5v8M94 69.5v9M100 70.5v8" />
          </g>
        </g>
      )}

      {/* flat contact shadow beneath the hands — he floats without it, but a
          rider is meant to float, so it only exists in the perched pose */}
      {!riding && <ellipse cx="60" cy="84" rx="48" ry="6" fill="#0d1024" opacity=".16" />}

      </g>

      {!thoughtsOn && (
        <g className="potter__muted">
          <circle cx="102" cy="14" r="11" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="1.5" />
          <path d="M97 14h10" stroke="var(--muted)" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );

  const classes = [
    "potter",
    `potter--${mood}`,
    riding && "potter--riding",
    tapped && "potter--tapped",
    gesture !== "none" && `potter--${gesture}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

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
      // A stable NAME plus a state, not a name that renames itself. With both
      // flipping, a screen reader announced "Mute Potter's thoughts, pressed",
      // which reads as though muting were already active.
      aria-pressed={thoughtsOn}
      aria-label="Potter's thoughts"
      className={`${classes} potter--tappable`}
      style={{ width: size * 0.86, height: size }}
    >
      {art}
    </button>
  );
}
