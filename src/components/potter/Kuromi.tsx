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
 * The drawing is a flat vector likeness of the character: two long pointed
 * hood horns with a small ball at each tip, a rounded black hood carrying the
 * pink skull, a white face whose forehead point is the NEGATIVE SPACE between
 * two humps of the face outline, a four-point jester ruff with pink bobbles, a
 * small white body with feet, and a stubby devil tail at the right hip.
 *
 * STICKER RULES — the same ones Potter is drawn under. Every form is a solid
 * fill inside one dark outline, and the outline is a UNIFORM 2.7 at this
 * 120x140 viewBox: it is set once on the fit group below and inherited, so
 * there is no per-shape stroke width to drift. Small details (skull sockets,
 * eyes, lashes, nose, mouth) are fills with `stroke="none"`, never thin
 * strokes. Five colours, no gradients, no rim lights, no soft shadows: those
 * read as "3D toy" rather than "sticker" and would put her in a different
 * visual family from Potter, which is the one thing she must not do.
 *
 * The forehead point deserves its own warning because it is the easiest thing
 * here to break. `FACE` starts at (60,68) and rises to a hump on each side, so
 * the dark hood BEHIND it shows through the dip. It is not a separate dark
 * shape laid over the face and must never become one — the moment it is a
 * shape, its outline doubles up against the face outline and she grows a
 * pencilled-in triangle on her forehead.
 *
 * Consequently there are no <defs>, no gradients, no filters, no clipPaths and
 * therefore NO ids at all. That is load-bearing now that two characters exist:
 * SVG ids are document-global, so a fixed id in here would be resolved by
 * Potter's copies too the moment both mount on one page (settings previews both
 * of them side by side). If anything id-bearing is ever added, it MUST be
 * namespaced with a per-instance suffix from a `useRef`.
 */

/** Outline, hood/tail dark, body white, ruff bobble pink, skull/nose pink. */
const OUTLINE = "#241A19";
const HOOD = "#4B4947";
const COAT = "#FFFFFF";
const BOBBLE = "#F49FC3";
const PINK = "#F4B4D1";
/** Broom, in the same five-colour family: her hood tone and her bobble pink. */
const BRISTLE = PINK;
const BRISTLE_DARK = "#D6739F";

/* ── the artwork, as flat path data ───────────────────────────────────────
   Verbatim from the approved drawing, in ITS coordinate system; the whole
   figure is then placed by `FIT` below, which carries the drawing's own
   -1.6 vertical nudge. Ink bounds once `FIT_PERCHED` has nudged it, stroke
   included: x 6.5–113.6, y 5.4–134.4. Every y quoted in this file is in that
   placed frame, which is also the frame the two ledge ratios divide. */

/** Hood horns. Tip up and out, base wide and low; the dome covers the base. */
const HORN_L = "M11.8,13.6 L17.4,54.6 L32,52 L47.6,38.5 C47.2,32 46.3,30.4 43.2,29 Z";
const HORN_R = "M108.2,13.6 L102.6,54.6 L88,52 L72.4,38.5 C72.8,32 73.7,30.4 76.8,29 Z";
/** The devil tail, curling off the right hip just above the feet. */
const TAIL =
  "M80,123.5 C84,121.5 88.2,118 89.8,112.8 L100.2,109.8 C99.4,114.5 95,120.5 90,123 C87,124.6 83,125.2 80,124.8 Z";
/** Body and both legs in one path — the notch at (60,119.5) is the crotch. */
const BODY =
  "M42,96 C40.5,104 40.5,113 42,120.5 C39.2,124.5 38.9,129.5 41.3,132.8 C44,135.4 50,135.4 53,133.2 C57.5,131.8 59,128 59.4,122 L60,119.5 L60.6,122 C61,128 62.5,131.8 67,133.2 C70,135.4 76,135.4 79,132.8 C81.1,129.5 80.8,124.5 78,120.5 C79.5,113 79.5,104 78,96 Z";
const ARM_L =
  "M37,95.5 C35.8,99 35.4,102.3 35.6,104.6 C34.6,105.6 34.6,107.7 35.8,108.6 C34.8,109.7 34.8,111.8 36,112.8 C36.4,115.2 38.6,117 40.8,116.8 C43,116.6 43.6,113.8 43.5,110.4 C43.3,105 43.4,98.5 43.1,95.5 Z";
const ARM_R =
  "M83,95.5 C84.2,99 84.6,102.3 84.4,104.6 C85.4,105.6 85.4,107.7 84.2,108.6 C85.2,109.7 85.2,111.8 84,112.8 C83.6,115.2 81.4,117 79.2,116.8 C77,116.6 76.4,113.8 76.5,110.4 C76.7,105 76.6,98.5 76.9,95.5 Z";
/** Four-point jester ruff. The two inner points hang lowest, to y=107.5. */
const COLLAR =
  "M28.4,99.6 L36,92.2 Q60,89.8 84,92.2 L91.6,99.6 L74.5,100.2 L73.5,107.5 L60,99.6 L46.5,107.5 L45.5,100.2 Z";
const DOME =
  "M60,33.9 C52,33.9 47.5,35.5 43.6,37.9 C38,40.8 26.5,47.5 23.4,56.2 C22.8,60 22.8,66 23.6,71 C24.8,81 30,88.5 38.5,92 Q60,91 81.5,92 C90,88.5 95.2,81 96.4,71 C97.2,66 97.2,60 96.6,56.2 C93.5,47.5 82,40.8 76.4,37.9 C72.5,35.5 68,33.9 60,33.9 Z";
/** Two humps with a dip at (60,68) — the dip IS the forehead point. */
const FACE =
  "M60,68 C55.5,65.5 51,63.7 47,63.5 C43.5,64.5 34.5,70 33.5,76.5 C32.6,84 38,92.5 47,94.4 C51,95.2 69,95.2 73,94.4 C82,92.5 87.4,84 86.5,76.5 C85.5,70 76.5,64.5 73,63.5 C69,63.7 64.5,65.5 60,68 Z";

/**
 * Where the drawing sits in the viewBox, per pose.
 *
 * Perched is the drawing's own -1.6 nudge and nothing else, so every path
 * above is used at its authored size and the outline stays exactly 2.7.
 *
 * Riding is that same drawing at 0.86, re-seated so its topmost ink lands at
 * y≈2 — and the scale is forced, not stylistic. This character is
 * head-dominant: hood plus face fill y 5.4–94.8 of a 140 box and the ruff runs
 * on to y 111.3, while `RIDE_LEDGE_RATIO` may not put the broom lower than
 * y≈98 without pushing her head out of the review band. At full size that
 * handle would be driven straight through the ruff. Lifting her instead is not
 * available: her horn balls already start at y 5.4, so there are five units of
 * headroom in the whole box. 0.86 moves the bottom of the ruff from 111.3 up
 * to 93.0, which is the ~18 units the broom needs, and costs an outline that
 * renders at 2.32 in this pose — thinner than 2.7, but uniformly so, and only
 * ever seen at the 66px rider.
 */
const FIT_PERCHED = "translate(0,-1.6)";
const FIT_RIDING = "translate(8.4,-4.1) scale(0.86)";

/**
 * LEDGE_RATIO — the line a card's top edge crosses when she is perched.
 *
 * The line the ART wants is y ≈ 103. Read down the drawing: the chin ends at
 * y=94.8, the jester ruff hangs under it from y=88.2, its two OUTER bobbles
 * bottom out at y=102.4 and its two INNER ones run on to y=111.3, and the paws
 * reach y=116.7. 103 is the one line in that stack that cuts nothing round in
 * half: the outer bobbles clear it whole, the inner pair is cleanly out of
 * sight, and the card takes the lower two thirds of the paws, which is what
 * makes her read as leaning on the edge rather than hovering over it. The horn
 * bobbles are at the far top (y 5.4–13.8) and are never in question.
 *
 * The CONSTANT is 96, not 103, and the seven units are not a fudge.
 * `PotterPerch` offsets by `--potter-h × (1 − ratio)` against the perch BOX,
 * and the figure inside it is an inline-block `<button>`, so that box is ~6px
 * taller than the figure — a text descender the offset spends before it
 * reaches any ink. The card therefore lands at `140 × ratio + ~7` in these
 * coordinates, for Potter exactly as much as for her (his 74 lands at 81).
 * Measured, not assumed: 96/140 puts it at 103.1 at the home perch's SIZE 118
 * and 103.5 at the coach's 112.
 *
 * Bounded from above by the coach, which is the tightest placement either
 * character has: at SIZE 112 the figure clears the run header's "Today's Test"
 * by `188 − 112 × ratio`, and her thought bubble opens 4.7px under her own
 * box. Past ratio ≈ 0.70 the bubble covers that heading and her right horn
 * ball lands on the date line. 96/140 = 0.686 keeps both clear.
 *
 * Two honest consequences. Only 15% of her hides behind the card where 47% of
 * Potter hides — that is the art, not a mistake, since 69% of her height is
 * head, and cutting at his proportion would put the card edge across her eyes.
 * And her tail cannot be seen while she is perched at all: this drawing wears
 * it low at the hip (y 106.9–125.0), below every line the header above will
 * allow. It is visible in Settings, where she is drawn whole, and its top
 * clears the card in the riding pose.
 */
export const LEDGE_RATIO = 96 / 140;

/**
 * RIDE_LEDGE_RATIO — the same line for the RIDING pose, through the broom.
 *
 * y = 98 of 140 runs along the middle of the handle, which spans y 94.8–101.3
 * once `FIT_RIDING` has placed it: the nose of the handle stays above the card
 * and the bristle head, both legs and the lower half of the shaft go behind
 * it. The ruff bottoms out at 93.0 and the nose-up tilt lifts the handle as it
 * goes left, so the clearance between the two runs from 1.8 units at her
 * centre down to about half a unit under the left bobble — tight by design,
 * and the reason `FIT_RIDING` is 0.86 and not 0.9.
 *
 * Bounded from above, and this is the binding constraint on the whole riding
 * pose: `PotterRider` renders at SIZE 66 into `--potter-band: 52px`, so
 * `66 * ratio` must stay at or under 52. 98/140 gives 46 and leaves the same
 * 6px of band slack Potter has — which is not spare, it is the room his
 * flight bob and roll need above his own box.
 */
export const RIDE_LEDGE_RATIO = 98 / 140;

/**
 * Idle beats. She plays one every 5–12s so she is never merely breathing.
 * `smirk` — a wag of both hood horns with a lash twitch — is the most
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
        {/* The pose fit, and the ONE place the outline is declared. Every shape
          below inherits stroke 2.7 and only names its own fill; the face
          details switch it off with stroke="none" and draw as pure fills. */}
        <g
          transform={riding ? FIT_RIDING : FIT_PERCHED}
          fill="none"
          stroke={OUTLINE}
          strokeWidth="2.7"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          {/* ============== DEVIL TAIL ==============
            First, so the body covers where it joins her hip. It sits low, by
            her right foot, which is where this drawing wears it and why no
            perched placement can show it — see LEDGE_RATIO. `transformOrigin`
            is set here rather than left to globals.css because the pivot is a fact about
            the art: (80,124) is the root of the stalk, so the tip travels and
            the join stays welded to her hip. An inline style outranks the
            stylesheet's own origin while leaving its keyframes untouched. */}
          <path
            className="kuromi__tail"
            style={{ transformOrigin: "80px 124px" }}
            d={TAIL}
            fill={HOOD}
          />

          {/* ============== BODY ==============
            One path: torso, both legs and both feet, with the crotch notch at
            (60,119.5). In the riding pose that notch is exactly where the broom
            handle crosses, so the same body straddles the stick — no second
            seated silhouette to keep in sync with this one. */}
          <g className="potter__torso">
            <path d={BODY} fill={COAT} />
          </g>

          {/* ============== BROOM ==============
            Over the body so the handle crosses her lap the way a stick you are
            sitting on does, under the paws so they close on it. Reuses
            `.potter__broom` on purpose: the bob keyframes in globals.css are
            written around exactly this rotate(6 …), so sharing the class shares
            the motion instead of duplicating it. Nose-up and travelling left. */}
          {riding && (
            <g className="potter__broom" transform="rotate(6 60 118.75)">
              <rect x="2" y="115" width="90" height="7.5" rx="3.75" fill={HOOD} />
              <path
                d="M95,111.5 C105,103 112,101.5 115,104.5 c1.4,1.4 1.4,26.6 0,28 -3,3 -10,1.5 -20,-7 Z"
                fill={BRISTLE}
              />
              <g stroke={BRISTLE_DARK} strokeWidth="2">
                <path d="M99.5,115 C105,112.5 110,111.7 112.5,111.9" />
                <path d="M99.5,118.9 C105,117.9 110,117.9 112.5,118.7" />
                <path d="M99.5,122.7 C105,124.1 110,125.3 112.5,125.9" />
              </g>
              {/* the binding where the straw meets the shaft */}
              <rect x="86" y="109.5" width="10" height="18" rx="4" fill={OUTLINE} />
            </g>
          )}

          {/* ============== ARMS / PAWS ==============
            Mitts at her sides. The perched ledge takes their lower two thirds,
            which is what reads as leaning on the card rather than hovering over
            it; riding, the broom handle passes just under them. */}
          <g className="potter__hands">
            <path d={ARM_L} fill={COAT} />
            <path d={ARM_R} fill={COAT} />
          </g>

          {/* ============== JESTER RUFF ==============
            After the paws, so its outer points hang over her upper arms, and
            before the hood, so the hood's hem covers where it meets the neck.
            The bobbles come last within the group so the ruff's own outline
            cannot paint over them. */}
          <g className="kuromi__collar">
            <path d={COLLAR} fill={HOOD} />
            <circle cx="28.4" cy="99.6" r="3" fill={BOBBLE} />
            <circle cx="91.6" cy="99.6" r="3" fill={BOBBLE} />
            <circle cx="46.5" cy="108.5" r="3" fill={BOBBLE} />
            <circle cx="73.5" cy="108.5" r="3" fill={BOBBLE} />
          </g>

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
                // The pivot is her neck, where the hood meets the ruff — not
                // the middle of the head. Turning about anything higher swings
                // the chin out past the ruff instead of rotating over it.
                transformOrigin: "60px 92px",
              }}
            >
              {/* Hood, horns and skull as one lagging mass. */}
              <g className="kuromi__hood">
                {/* Horns first: the dome is drawn after them and covers their
                  wide bases, which is what makes them grow out of the hood
                  instead of being pinned to it. Each pivots at its own base
                  (see the tail above for why the origin lives here) — hinged
                  anywhere else the tip stays put and the base swings, which
                  is the wag backwards. */}
                <path
                  className="kuromi__point kuromi__point--l"
                  style={{ transformOrigin: "40px 42px" }}
                  d={HORN_L}
                  fill={HOOD}
                />
                <path
                  className="kuromi__point kuromi__point--r"
                  style={{ transformOrigin: "80px 42px" }}
                  d={HORN_R}
                  fill={HOOD}
                />
                <circle cx="10.6" cy="11.2" r="2.8" fill={HOOD} />
                <circle cx="109.4" cy="11.2" r="2.8" fill={HOOD} />

                <path d={DOME} fill={HOOD} />

                {/* The pink skull — the badge that says Kuromi at a glance, so
                  it is left as ONE flat pink with dark cut-outs. Drawn inside
                  the hood group so it sways with it; it clears the face's
                  forehead point by three units, so its order against the face
                  never matters. */}
                <g className="kuromi__skull" stroke="none">
                  <path d="M56.4,58 L63.6,58 L62.8,64.2 Q60,65.3 57.2,64.2 Z" fill={PINK} />
                  <ellipse cx="60" cy="53.7" rx="9.5" ry="8" fill={PINK} />
                  <ellipse
                    cx="54"
                    cy="57.2"
                    rx="1.9"
                    ry="2.9"
                    fill={OUTLINE}
                    transform="rotate(-8 54 57.2)"
                  />
                  <ellipse
                    cx="66"
                    cy="57.2"
                    rx="1.9"
                    ry="2.9"
                    fill={OUTLINE}
                    transform="rotate(8 66 57.2)"
                  />
                  <rect x="58.7" y="60.6" width="0.9" height="3.8" fill={OUTLINE} />
                  <rect x="60.8" y="60.6" width="0.9" height="3.8" fill={OUTLINE} />
                </g>
              </g>

              {/* The face. Its top edge is two humps with a dip at (60,68), and
                the hood showing through that dip IS her forehead point. There
                is deliberately no separate shape there — see the header. */}
              <path d={FACE} fill={COAT} />

              {/* Eyes. One solid oval each, no iris and no catchlight: the
                elaborate version of Potter's eye was rejected as ugly, and a
                second character with more detailed eyes would break the family
                read on the settings screen where both are shown together.
                The lashes live INSIDE this group so they travel with the eye
                they belong to — parked outside it they detach the moment
                `look` moves the eyes 3px. The transition is on the class, not
                inline: real saccades snap to a target and hold. */}
              <g
                className="potter__eyes"
                style={{ transform: `translate(${lx * 3.4}px, ${ly * -2.4}px)` }}
              >
                {shut ? (
                  <>
                    <path d="M39.6,76.5 Q43.4,81.5 47.2,76.5" />
                    <path d="M72.8,76.5 Q76.6,81.5 80.4,76.5" />
                  </>
                ) : (
                  <g stroke="none">
                    <ellipse
                      cx="43.4"
                      cy="77.5"
                      rx="3.8"
                      ry="6.4"
                      fill={OUTLINE}
                      transform="rotate(-9 43.4 77.5)"
                    />
                    <ellipse
                      cx="76.6"
                      cy="77.5"
                      rx="3.8"
                      ry="6.4"
                      fill={OUTLINE}
                      transform="rotate(9 76.6 77.5)"
                    />
                  </g>
                )}

                {/* Lashes, and her brows in every sense that matters: they are
                  the only thing above the eye that a mood can move.
                  Two nested groups, the same split the head uses and for the
                  same reason: the smirk beat animates `.kuromi__brows`, and a
                  CSS animation outranks the style attribute — put both on one
                  element and the twitch drags them back to translateY(0) for
                  its whole 0.9s, dropping them out of a raised happy pose
                  mid-beat. The beat owns the outer group; the mood owns the
                  inner. The offset is small on purpose: these touch the eye,
                  and anything past ~1px opens a visible gap. */}
                <g className="kuromi__brows">
                  <g
                    stroke="none"
                    fill={OUTLINE}
                    style={{
                      transform: `translateY(${happy ? -1.1 : mood === "wince" ? 0.9 : 0}px)`,
                      transition: "transform .4s var(--ease)",
                    }}
                  >
                    <path d="M43,71.2 L40.6,69 L41.6,72.3 Z" />
                    <path d="M41.6,72.7 L39.4,71.3 L41,74 Z" />
                    <path d="M77,71.2 L79.4,69 L78.4,72.3 Z" />
                    <path d="M78.4,72.7 L80.6,71.3 L79,74 Z" />
                  </g>
                </g>
              </g>

              {/* Nose and mouth. Every mouth variant keeps the same
                `M … Q … Q … Q … Z` shape so the `d` transition in globals.css
                can interpolate between them instead of snapping. */}
              <g stroke="none">
                <ellipse cx="60" cy="83.6" rx="2.9" ry="2.6" fill={OUTLINE} />
                <ellipse cx="60" cy="83.8" rx="1.9" ry="1.7" fill={PINK} />
                <path
                  d={
                    happy
                      ? "M53.6,85.4 Q60,89.2 66.4,85.4 Q66.1,93.4 60,93.8 Q53.9,93.4 53.6,85.4 Z"
                      : mood === "wince"
                        ? "M56.6,88.8 Q60,86.8 63.4,88.8 Q63.2,90.8 60,91 Q56.8,90.8 56.6,88.8 Z"
                        : mood === "thinking"
                          ? "M56.8,87.4 Q60,88.2 63.2,87.4 Q63.1,89.6 60,89.8 Q56.9,89.6 56.8,87.4 Z"
                          : "M55.9,86.6 Q60,88.7 64.1,86.6 Q63.9,91.5 60,91.7 Q56.1,91.5 55.9,86.6 Z"
                  }
                  fill={OUTLINE}
                />
                {/* Only while the mouth is actually open — dropped into a
                  pursed one it is a pink dot sitting on her chin. */}
                {(happy || (mood !== "wince" && mood !== "thinking")) && (
                  <ellipse
                    cx="60.3"
                    cy={happy ? 91.6 : 89.9}
                    rx={happy ? 2.2 : 1.8}
                    ry={happy ? 1.1 : 0.9}
                    fill={PINK}
                  />
                )}
                {/* Off by default — globals.css fades these in on the three
                  happy moods and nowhere else, so the resting face keeps the
                  drawing's own flat white cheeks. */}
                <g className="potter__cheeks">
                  <ellipse cx="42" cy="87" rx="5" ry="2.8" fill={BOBBLE} />
                  <ellipse cx="78" cy="87" rx="5" ry="2.8" fill={BOBBLE} />
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>

      {/* Outside `.potter__facing` so it never renders reversed.
        Beside her head rather than in the corner above it, which is where
        Potter's sits: this hood's right horn ball lands at (109.4,9.6) r4.2,
        exactly under a corner badge, and it would swallow the one bobble that
        edge of the silhouette has. The flank at y=70 is the only other gap big
        enough — clear of the hood's widest point by three units, clear of the
        horn by six, and above BOTH cut lines so it survives being perched
        (y≈103) and being ridden (y=98). */}
      {!thoughtsOn && (
        <g className="potter__muted">
          <circle
            cx="109.5"
            cy="70"
            r="9"
            fill="var(--surface-2)"
            stroke="var(--line)"
            strokeWidth="1.5"
          />
          <path
            d="M105.5,70h8"
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
