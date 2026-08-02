"use client";

import { useEffect, useRef, useState } from "react";
import type { Mood } from "./Potter";

/**
 * Moods are Potter's, imported rather than redeclared. Every caller
 * (`src/lib/potter.ts`, the coach, the rider) picks a mood without knowing
 * which character will draw it, so a second copy of the union here would drift
 * the first time one of them gained a mood and only one file heard about it.
 * `import type` is erased at compile time, so this costs no runtime coupling.
 */
export type { Mood };

export interface KuromiProps {
  mood?: Mood;
  /** -1 (left) … 1 (right) */
  look?: number;
  /** -1 (down) … 1 (up) */
  lookY?: number;
  size?: number;
  className?: string;
  /** Tapping her toggles her thoughts. Omit to render her inert. */
  onToggle?: () => void;
  thoughtsOn?: boolean;
  /** Flying on a broomstick instead of gripping a ledge. */
  riding?: boolean;
}

/**
 * Kuromi — the second study companion, a drop-in swap for `Potter`. Same
 * props, same exported geometry constants, same class hooks, so `PotterPerch`,
 * `PotterCoach` and `PotterRider` can render either one without knowing which.
 *
 * Chibi imp: enormous round white head under a dark jester hood, two long
 * floppy hood points ending in bobbles, a pink skull on the hood's front, big
 * black oval eyes under slanted brows, a tiny white body, and a devil tail with
 * a spade tip.
 *
 * STICKER RULES — the same ones Potter is drawn under, and for the same
 * reason: an earlier polished pass at that character was rejected as "too
 * polished", and an elaborate eye (iris, sclera, catchlight ring) was called
 * "ugly". So every form here is a solid fill inside a thick dark outline
 * (stroke 2.6–3.2 at this 120x140 viewBox) and the eyes are one solid oval plus
 * exactly one highlight. Shading is at most ONE flat secondary tone per form —
 * the darker bobbles on the hood points, the shaded far side of the hood, the
 * grey soles. No gradients, no rim lights, no soft cast shadows: they read as
 * "3D toy" rather than "sticker", and they would put her in a different visual
 * family from Potter, which is the one thing she must not do.
 *
 * Consequently there are no <defs>, no gradients, no filters, no clipPaths and
 * therefore NO ids at all. That is load-bearing now that two characters exist:
 * SVG ids are document-global, so a fixed id in here would be resolved by
 * Potter's copies too the moment both mount on one page (settings previews both
 * of them side by side). If anything id-bearing is ever added, it MUST be
 * namespaced with a per-instance suffix from a `useRef`.
 *
 * The one tonal element that is not a fill is the flat contact shadow under her
 * paws. It is load-bearing — without it she floats — so it stays in the perched
 * pose and is dropped while `riding`, where floating is the point.
 */

/**
 * LEDGE_Y = 76 of 140 is the line her paws grip; everything below it is meant
 * to sit behind whatever she is perched on. Exported so the CSS offsets her by
 * exactly the hidden portion instead of a guessed pixel value.
 *
 * Two px lower than Potter's 74, and the difference is the hood: her crown
 * reaches y=1 and her chin y=72, where his hair tops out at y=1 and his chin
 * ends at y=70, so the same "card edge just under the chin" reading lands two
 * px further down. It also has to clear the hood-point bobbles (they bottom out
 * at y=40) and leave the tail's spade tip (y=48–66) fully above the card —
 * cutting at 74 shaved the spade, which is the only place the tail is visible
 * at all in the perched pose.
 */
export const LEDGE_RATIO = 76 / 140;

/**
 * The same line for the RIDING pose, where she straddles a broom instead of
 * gripping a ledge. y = 100 of 140 runs through the broom handle (97.5–104.5),
 * just under her paws: everything below it — the lower half of the handle, the
 * bristle head and both dangling legs — goes behind the card she is perched on,
 * while her torso, arms, tail and head stay above it. Cut any higher and the
 * broom floats free of the card; any lower and her legs dangle over the text.
 *
 * Also bounded from above: `PotterRider` reserves `--potter-band: 52px` between
 * review cards and renders at SIZE 66, so this ratio must keep
 * `66 * RIDE_LEDGE_RATIO` at or under 52 or her head is clipped by the card
 * above. 100/140 gives 47.
 */
export const RIDE_LEDGE_RATIO = 100 / 140;

/**
 * Idle beats. She plays one every 5–12s so she is never merely breathing.
 * `smirk` — a wag of both hood points with a brow twitch — is the most
 * characterful of the four, so it gets two entries and comes up twice as often.
 *
 * Deliberately NOT Potter's set: his `nudge` animates `.potter__specs`, and she
 * has no glasses, so it would have been a beat that silently did nothing. The
 * other three drive `.potter__head-bob` / `.potter__svg`, which she does have,
 * and are reused as-is.
 */
type Gesture = "none" | "smirk" | "nod" | "glance" | "shiver";
const GESTURES: Gesture[] = ["smirk", "smirk", "nod", "glance", "shiver"];
const GESTURE_MS: Record<Gesture, number> = {
  none: 0,
  smirk: 900,
  nod: 800,
  glance: 1400,
  shiver: 700,
};

const OUTLINE = "#1b1720";
const HOOD = "#2b2833";
const HOOD_DEEP = "#171420";
const COAT = "#fbfaff";
const COAT_SHADE = "#ddd9e6";
const PINK = "#f6a5c8";
const BLUSH = "#f5b8c9";
const WOOD = "#3a3340";
const WOOD_DARK = "#241f2b";
const BRISTLE = "#f2a7c9";
const BRISTLE_DARK = "#c87ba3";

export default function Kuromi({
  mood = "idle",
  look = 0,
  lookY = 0,
  size = 110,
  className = "",
  onToggle,
  thoughtsOn = true,
  riding = false,
}: KuromiProps) {
  const [blink, setBlink] = useState(false);
  const [tapped, setTapped] = useState(false);
  /** Small idle beats. Stillness is what reads as dead, so she is never fully still. */
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
    [],
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
        1700 + Math.random() * 3200,
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
          setDrift({
            x: (Math.random() - 0.5) * 0.7,
            y: (Math.random() - 0.5) * 0.5,
          });
          // settle back to centre before the next flick, so she isn't cross-eyed
          later(() => setDrift({ x: 0, y: 0 }), 900 + Math.random() * 1200);
          loop();
        },
        2400 + Math.random() * 3800,
      );
    };
    loop();
    return () => {
      dead = true;
    };
  }, []);

  // Idle gestures. Suppressed while riding — she is busy flying.
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
        5200 + Math.random() * 6500,
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
  // backwards. Mirror the whole figure when she is heading right.
  //
  // Reads `look`, NOT the drifted `lx`: eye saccades add up to +-0.35 of noise,
  // which at the edges of the weave is enough to decide the sign on its own and
  // spin her 180 degrees while hovering.
  //
  // Bare scale(-1,1) — the CSS gives this group transform-origin: 60px 70px, so
  // the usual translate(w,0) scale(-1,1) idiom (which assumes origin 0 0) would
  // compose to a mirror about x=120 and shift her a whole viewBox to the right.
  //
  // Done as an SVG group rather than a CSS transform on `.potter__svg`: that
  // element already carries the breathing/mood keyframes, and a CSS transform
  // would be overwritten by them.
  const facingRight = riding && look > 0.05;

  const art = (
    <svg
      viewBox="0 0 120 140"
      width="100%"
      height="100%"
      className="potter__svg"
    >
      <g
        className="potter__facing"
        transform={facingRight ? "scale(-1,1)" : undefined}
      >
        {/* ============== DEVIL TAIL ==============
          Behind everything, curling up the right-hand side. Its whole reason for
          taking that route is the ledge: a tail drawn hanging off her back would
          live entirely below y=76 and would therefore never once be visible in
          the app, since all three placements cut her at the ledge. Coming up
          past her hip puts the spade tip at y=48–66, clear of the card and clear
          of the right hood bobble above it (which bottoms out at y=40).
          Drawn as a dark outline stroke with a narrower body-coloured stroke
          over it — an outlined limb without a second path to keep in sync. */}
        <g className="kuromi__tail">
          <g fill="none" strokeLinecap="round">
            <path
              d="M76 100C98 106 113 88 104 62"
              stroke={OUTLINE}
              strokeWidth="9.6"
            />
            <path
              d="M76 100C98 106 113 88 104 62"
              stroke={HOOD}
              strokeWidth="4.6"
            />
          </g>
          {/* The spade. The notch in its base is the whole difference between a
            devil tail and a traffic cone — the first pass had a convex base and
            read as a cone at every size. Tilted out of the stalk's line so the
            tip leads away from her rather than straight up. */}
          <path
            d="M104 45.5 115 63.5c-3.8-1.5-7.2-4.2-11-4.2s-7.2 2.7-11 4.2Z"
            transform="rotate(10 104 62)"
            fill={HOOD}
            stroke={OUTLINE}
            strokeWidth="2.6"
            strokeLinejoin="round"
          />
        </g>

        {/* ============== BODY ============== */}
        <g className="potter__torso">
          {riding ? (
            <>
              {/* legs hanging off the broom — drawn first so the coat hem cuts
                across them and reads as cloth in front of the legs */}
              <g stroke={OUTLINE} strokeWidth="2.6">
                <rect x="44" y="102" width="12" height="19" rx="5" fill={COAT} />
                <rect
                  x="64"
                  y="104"
                  width="12"
                  height="19"
                  rx="5"
                  fill={COAT_SHADE}
                />
                <rect
                  x="39"
                  y="117"
                  width="18"
                  height="9"
                  rx="4.5"
                  fill={COAT_SHADE}
                />
                <rect
                  x="60"
                  y="119"
                  width="18"
                  height="9"
                  rx="4.5"
                  fill={COAT_SHADE}
                />
              </g>

              {/* seated body: shorter and wider than the standing one, hem
                draping over the broom.
                No flat secondary tone on it, unlike Potter's robe. His is a
                large dark mass that needs one to stop reading as a silhouette;
                hers is small and white, and every wedge tried on it read as a
                stain rather than a shadow. "At most one secondary tone" is a
                ceiling, not a quota — the outline carries the form here. */}
              <path
                d="M60 62c14 0 25 10 26 24l3 22H31l3-22c1-14 12-24 26-24Z"
                fill={COAT}
                stroke={OUTLINE}
                strokeWidth="2.8"
              />

              {/* arms reaching down to the handle. Both outlines go down first
                so the arms cannot cut into each other. */}
              <g className="potter__arms" fill="none" strokeLinecap="round">
                <path
                  d="M36 74C26 82 28 93 41 99"
                  stroke={OUTLINE}
                  strokeWidth="14"
                />
                <path
                  d="M84 74C94 82 92 95 79 101"
                  stroke={OUTLINE}
                  strokeWidth="14"
                />
                <path
                  d="M36 74C26 82 28 93 41 99"
                  stroke={COAT}
                  strokeWidth="8.8"
                />
                <path
                  d="M84 74C94 82 92 95 79 101"
                  stroke={COAT}
                  strokeWidth="8.8"
                />
              </g>
            </>
          ) : (
            <>
              {/* legs + feet, visible only when she is not perched */}
              <g stroke={OUTLINE} strokeWidth="2.6">
                <rect x="45" y="110" width="12" height="18" rx="5" fill={COAT} />
                <rect
                  x="63"
                  y="110"
                  width="12"
                  height="18"
                  rx="5"
                  fill={COAT_SHADE}
                />
                <rect
                  x="41"
                  y="124"
                  width="18"
                  height="9"
                  rx="4.5"
                  fill={COAT_SHADE}
                />
                <rect
                  x="61"
                  y="124"
                  width="18"
                  height="9"
                  rx="4.5"
                  fill={COAT_SHADE}
                />
              </g>

              {/* Body — a short flared smock, so the head reads as enormous.
                The first pass was a straight-sided tube of the same width top
                and bottom and read as a bottle next to Potter's flaring robe;
                the flare is what puts the two silhouettes in the same family.
                No flat secondary tone on it — see the seated body below. */}
              <path
                d="M60 62c16 0 27 12 27 28l2 14c0 8-13 12-29 12s-29-4-29-12l2-14c0-16 11-28 27-28Z"
                fill={COAT}
                stroke={OUTLINE}
                strokeWidth="2.8"
              />

              {/* short arms up onto the ledge */}
              <path
                d="M41 70c-10 2-16 8-16 16l18 2Z"
                fill={COAT}
                stroke={OUTLINE}
                strokeWidth="2.6"
                strokeLinejoin="round"
              />
              <path
                d="M79 70c10 2 16 8 16 16l-18 2Z"
                fill={COAT}
                stroke={OUTLINE}
                strokeWidth="2.6"
                strokeLinejoin="round"
              />
            </>
          )}
        </g>

        {/* ============== BROOM ==============
          Behind her and in front of the body hem, so the handle passes across
          her lap the way a stick you are sitting on does. Tilted nose-up.
          Reuses `.potter__broom` on purpose: the bob keyframes in globals.css
          are written around exactly this rotate(6 60 100), so sharing the class
          shares the motion instead of duplicating it. */}
        {riding && (
          <g className="potter__broom" transform="rotate(6 60 100)">
            <rect
              x="2"
              y="97.5"
              width="88"
              height="7"
              rx="3.5"
              fill={WOOD}
              stroke={OUTLINE}
              strokeWidth="2.8"
            />
            <path
              d="M95 94.5C105 86 112 84.5 115 87.5c1.4 1.4 1.4 26.6 0 28-3 3-10 1.5-20-7Z"
              fill={BRISTLE}
              stroke={OUTLINE}
              strokeWidth="2.8"
              strokeLinejoin="round"
            />
            <g
              stroke={BRISTLE_DARK}
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            >
              <path d="M99.5 98C105 95.5 110 94.7 112.5 94.9" />
              <path d="M99.5 101.9C105 100.9 110 100.9 112.5 101.7" />
              <path d="M99.5 105.7C105 107.1 110 108.3 112.5 108.9" />
            </g>
            {/* the binding where the straw meets the shaft */}
            <rect
              x="86"
              y="92.5"
              width="10"
              height="18"
              rx="4"
              fill={WOOD_DARK}
              stroke={OUTLINE}
              strokeWidth="2.6"
            />
          </g>
        )}

        {/* ============== HEAD ==============
          Two nested groups on purpose. A CSS animation beats the style
          attribute in the cascade, so an infinite idle bob on the SAME element
          silently overrides the inline look transform — that is the bug that
          left Potter's head unable to turn. The bob owns the outer group; the
          turn owns the inner. */}
        <g className="potter__head-bob">
          <g
            className="potter__head"
            style={{
              transform: `rotate(${lx * 4.5}deg) translateY(${ly * -1.6}px)`,
              // Her neck is 10px lower than his: the head is the same height
              // but sits under a hood, so the pivot follows the chin down.
              transformOrigin: "60px 66px",
            }}
          >
            {/* face — one solid fill, no modelling. Drawn before the hood so
              the hood's hem cuts across the forehead. */}
            <rect
              x="28"
              y="8"
              width="64"
              height="64"
              rx="32"
              fill={COAT}
              stroke={OUTLINE}
              strokeWidth="2.8"
            />

            {/* The hood, with the two points and the skull inside it, so the
              whole headpiece sways as one lagging mass. */}
            <g className="kuromi__hood">
              {/* Hood points, drawn BEFORE the dome so the dome covers their
                bases and they read as growing out of it. They sweep out and up
                from the crown, tips flopping over into the bobbles. */}
              <g className="kuromi__point kuromi__point--l">
                <path
                  d="M35 11C24-3 10 2 11 27c4-10 8-12 19-5Z"
                  fill={HOOD}
                  stroke={OUTLINE}
                  strokeWidth="2.8"
                  strokeLinejoin="round"
                />
                <circle
                  cx="11"
                  cy="33"
                  r="5.8"
                  fill={HOOD_DEEP}
                  stroke={OUTLINE}
                  strokeWidth="2.6"
                />
              </g>
              <g className="kuromi__point kuromi__point--r">
                <path
                  d="M85 11c11-14 25-9 24 16-4-10-8-12-19-5Z"
                  fill={HOOD}
                  stroke={OUTLINE}
                  strokeWidth="2.8"
                  strokeLinejoin="round"
                />
                <circle
                  cx="109"
                  cy="33"
                  r="5.8"
                  fill={HOOD_DEEP}
                  stroke={OUTLINE}
                  strokeWidth="2.6"
                />
              </g>

              {/* the dome. Wider than the head at the sides, hem straight across
                the forehead — that flat hem is what makes it read as a hood
                rather than a bonnet, and it is the shelf the skull stands on. */}
              <path
                d="M18 50C16 13 36 1 60 1s44 12 42 49c-2-14-11-20-28-20H46C29 30 20 36 18 50Z"
                fill={HOOD}
                stroke={OUTLINE}
                strokeWidth="2.9"
                strokeLinejoin="round"
              />
              {/* The head's single flat shadow tone. It hugs the hood's right
                rim: the first pass put a free-floating wedge in the middle of
                the dome and, on a near-black fill, it read as a smudge rather
                than a shaded side. */}
              <path d="M84 7c13 8 19 22 18 43l-6-.6c1-19-4-33-16-40Z" fill={HOOD_DEEP} />

              {/* The pink skull on the hood's front — the badge that says
                Kuromi at a glance, so it is drawn as big as the hem allows and
                left as ONE flat pink. A shaded side was tried and, at 28px
                across, read as a printing misregistration. */}
              <g className="kuromi__skull">
                <path
                  d="M60 2c-8.8 0-16 6.6-16 14.8 0 4 1.8 7.6 4.8 10.2V29h22.4v-2c3-2.6 4.8-6.2 4.8-10.2C76 8.6 68.8 2 60 2Z"
                  fill={PINK}
                  stroke={OUTLINE}
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                />
                <ellipse cx="53.8" cy="16" rx="3.8" ry="4.4" fill={OUTLINE} />
                <ellipse cx="66.2" cy="16" rx="3.8" ry="4.4" fill={OUTLINE} />
                <path d="M60 20.6 62.8 25h-5.6Z" fill={OUTLINE} />
                {/* Two tooth notches, not four. Four came out as a barcode the
                  moment she was rendered at the review screen's 66px. */}
                <path
                  d="M56.4 26V29M63.6 26V29"
                  stroke={OUTLINE}
                  strokeWidth="1.8"
                  fill="none"
                  strokeLinecap="round"
                />
              </g>
            </g>

            {/* brows — short slanted strokes with the inner end LOWER, which is
              the whole expression: it is what makes her read as mischievous
              rather than merely cute. Every variant keeps the same `M x y c …`
              shape so the `d` transition in globals.css can interpolate. */}
            {/* Two nested groups, the same split the head uses and for the same
              reason: the smirk beat animates `.kuromi__brows`, and a CSS
              animation outranks the style attribute — put both on one element
              and the twitch drags the brows back to translateY(0) for its whole
              0.9s, dropping them out of a raised happy pose mid-beat. The beat
              owns the outer group; the mood offset owns the inner. */}
            <g className="kuromi__brows">
              <g
                style={{
                  transform: `translateY(${happy ? -2.6 : mood === "wince" ? 2.2 : 0}px)`,
                  transition: "transform .4s var(--ease)",
                }}
              >
                <path
                  d={
                    mood === "thinking"
                      ? "M38 37c4-2.4 8.4-3 12-2.4"
                      : mood === "wince"
                        ? "M38 32.6c4 2 8.4 4.4 12 6.6"
                        : "M38 34.4c4 1.2 8.4 2.8 12 4.2"
                  }
                  stroke={OUTLINE}
                  strokeWidth="3.2"
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d={
                    mood === "thinking"
                      ? "M82 37c-4-2.4-8.4-3-12-2.4"
                      : mood === "wince"
                        ? "M82 32.6c-4 2-8.4 4.4-12 6.6"
                        : "M82 34.4c-4 1.2-8.4 2.8-12 4.2"
                  }
                  stroke={OUTLINE}
                  strokeWidth="3.2"
                  fill="none"
                  strokeLinecap="round"
                />
              </g>
            </g>

            {/* Eyes — one solid oval plus ONE highlight. Deliberately not a
              layered iris: the elaborate version of Potter's was called ugly,
              and a second character with more detailed eyes would break the
              family read on the settings screen where both are shown together.
              The transition is on the class, not inline: real saccades snap to a
              target and hold. */}
            <g
              className="potter__eyes"
              style={{
                transform: `translate(${lx * 3.4}px, ${ly * -2.4}px)`,
              }}
            >
              {shut ? (
                <>
                  <path
                    d="M40.5 49c3 4.6 9.5 4.6 12.5 0"
                    stroke={OUTLINE}
                    strokeWidth="3.2"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M67 49c3 4.6 9.5 4.6 12.5 0"
                    stroke={OUTLINE}
                    strokeWidth="3.2"
                    fill="none"
                    strokeLinecap="round"
                  />
                </>
              ) : (
                <>
                  <ellipse cx="47" cy="49" rx="6.6" ry="8.2" fill={OUTLINE} />
                  <ellipse cx="73" cy="49" rx="6.6" ry="8.2" fill={OUTLINE} />
                  <circle cx="49.4" cy="45.6" r="2.4" fill="#fff" />
                  <circle cx="75.4" cy="45.6" r="2.4" fill="#fff" />
                </>
              )}
            </g>

            {/* nose + mouth */}
            <ellipse
              cx="60"
              cy="57"
              rx="4.2"
              ry="3.2"
              fill={PINK}
              stroke={OUTLINE}
              strokeWidth="1.8"
            />
            <path
              d={
                happy
                  ? "M52.5 62c4 6.6 11 6.6 15 0"
                  : mood === "wince"
                    ? "M54 66.5c3-3.4 11-3.4 14 0"
                    : mood === "thinking"
                      ? "M55.5 63c1.6 0 7.4 0 9 0"
                      : "M54 62.5c2 3.6 10 3.6 12 0"
              }
              stroke={OUTLINE}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            {happy && <path d="M54 63c3.5 4.4 10 4.4 13.5 0Z" fill="#b8465a" />}

            <g className="potter__cheeks">
              <ellipse cx="38" cy="57" rx="5.4" ry="3.1" fill={BLUSH} />
              <ellipse cx="82" cy="57" rx="5.4" ry="3.1" fill={BLUSH} />
            </g>
          </g>
        </g>

        {/* ============== PAWS ==============
          On the broom handle when riding (same tilt as the broom), otherwise
          gripping the ledge at y=76. Drawn last so they sit over the handle.
          The pink bobble at each wrist is Kuromi's cuff accent; it is placed at
          the INNER end of the paw, which is where the arm actually meets it,
          and high enough on the paw to stay above the ledge line. */}
        {riding ? (
          <g
            className="potter__hands"
            transform="rotate(6 60 100)"
            stroke={OUTLINE}
            strokeWidth="2.6"
          >
            <rect x="32" y="93.5" width="18" height="14" rx="6.5" fill={COAT} />
            <rect x="68" y="93.5" width="18" height="14" rx="6.5" fill={COAT} />
            <circle cx="51" cy="97" r="4.4" fill={PINK} />
            <circle cx="67" cy="97" r="4.4" fill={PINK} />
            <g stroke={COAT_SHADE} strokeWidth="1.8" strokeLinecap="round">
              <path d="M37 98v5M41.5 97v7M46 98v5" />
              <path d="M73 98v5M77.5 97v7M82 98v5" />
            </g>
          </g>
        ) : (
          <g className="potter__hands" stroke={OUTLINE} strokeWidth="2.6">
            <rect x="24" y="66" width="22" height="17" rx="8" fill={COAT} />
            <rect x="74" y="66" width="22" height="17" rx="8" fill={COAT} />
            {/* Straddling the paw's inner edge at its vertical middle. Sat at
              y=71 in the first pass, level with the cheeks and the same pink,
              which turned every mood with blush on into four pink dots and
              read as a second set of cheeks rather than a cuff. */}
            <circle cx="45" cy="74.5" r="5" fill={PINK} />
            <circle cx="75" cy="74.5" r="5" fill={PINK} />
            <g stroke={COAT_SHADE} strokeWidth="1.8" strokeLinecap="round">
              <path d="M29 70.5v8M34 69.5v9M39 70.5v8" />
              <path d="M81 70.5v8M86 69.5v9M91 70.5v8" />
            </g>
          </g>
        )}

        {/* Flat contact shadow beneath the paws — she floats without it, but a
          rider is meant to float, so it only exists in the perched pose.
          Lighter and narrower than Potter's identical ellipse: his lands on a
          near-black robe and disappears into it, hers lands on a white body and
          at his .16/48 read as a grey smear wiped across her front. */}
        {!riding && (
          <ellipse
            cx="60"
            cy="85"
            rx="40"
            ry="5.5"
            fill="#0d1024"
            opacity=".11"
          />
        )}
      </g>

      {/* Outside `.potter__facing` so it never renders reversed.
        A touch smaller and further into the corner than Potter's, which sits at
        (102,14) r11: at his coordinates this badge landed exactly on her right
        hood bobble and swallowed it, and the bobbles are half of what makes the
        hood read as Kuromi's. At (105,11) r10 it covers only the upper arc of
        the hood point and the bobble below it stays whole. */}
      {!thoughtsOn && (
        <g className="potter__muted">
          <circle
            cx="105"
            cy="11"
            r="10"
            fill="var(--surface-2)"
            stroke="var(--line)"
            strokeWidth="1.5"
          />
          <path
            d="M100.5 11h9"
            stroke="var(--muted)"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );

  // `kuromi` is the root modifier every Kuromi-only rule in globals.css is
  // keyed off. Potter never carries it, so nothing in that block can reach him.
  // Everything else on this list is shared with him on purpose: the breath, the
  // mood postures, the tap squash and the gesture beats are posture, not
  // anatomy, and both characters should read as the same species of sticker.
  const classes = [
    "potter",
    "kuromi",
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
      <div
        className={classes}
        style={{ width: size * 0.86, height: size }}
        aria-hidden="true"
      >
        {art}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleTap}
      // A stable NAME plus a state, not a name that renames itself. With both
      // flipping, a screen reader announced "Mute Kuromi's thoughts, pressed",
      // which reads as though muting were already active.
      aria-pressed={thoughtsOn}
      aria-label="Kuromi's thoughts"
      className={`${classes} potter--tappable`}
      style={{ width: size * 0.86, height: size }}
    >
      {art}
    </button>
  );
}
