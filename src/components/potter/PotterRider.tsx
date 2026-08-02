"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Potter, { RIDE_LEDGE_RATIO, type Mood } from "./Potter";
import { reviewLine } from "@/lib/potter";
import { usePotterDrag } from "@/lib/usePotterDrag";
import {
  onPotterVisibleChange,
  onThoughtsChange,
  potterVisible,
  thoughtsOn,
  toggleThoughts,
} from "@/lib/potterPrefs";

export interface RiderItem {
  /** Question id — the explanation endpoint keys on this. */
  id: string;
  /** Which option the user picked, or null if left blank. */
  chosen: number | null;
  correct: boolean;
  skipped: boolean;
  official: boolean;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smoothstep = (n: number) => n * n * (3 - 2 * n);

/* ── the motion model ──────────────────────────────────────────────────────
   Every constant below is in list coordinates (px down the <ol>) or seconds,
   never in frames — the loop integrates against a real delta so a 120Hz
   display gets the same flight as a 60Hz one. */

/** The reading line: how far down the panel the card you are looking at sits. */
const FOCUS = 0.36;
/** His rendered height. `--potter-band` in globals.css — the gap opened between
    review cards — must stay at or above the `PERCH` derived from it. */
const SIZE = 66;
/**
 * How much of him stands ABOVE the card's top edge once he has settled on it —
 * the remaining `SIZE - PERCH` is behind the card. Derived from the art's own
 * ride line rather than guessed, so resizing him cannot silently sink his head
 * behind the card or lift his broom off it.
 */
const PERCH = Math.round(SIZE * RIDE_LEDGE_RATIO);
/**
 * The dead band BEFORE the handover point, as a fraction of the gap to the next
 * card — hysteresis, not a ramp. See the handover note below.
 */
const HYST = 0.06;
/** Spring, in rad²/s² and 1/s: ω≈5.1 rad/s, ζ≈0.86. Slow and heavy, with just
    enough left under 1 to round off each arrival instead of stopping flat. */
const STIFF = 26;
const DAMP = 8.8;
/** One full right→left→right sway every two cards. */
const WAVE_CARDS = 2;
/**
 * Peak-to-peak of the horizontal drift, in px.
 *
 * The old motion was a ~200px crossing of the whole column, designed back when
 * a reserved lane meant there was nothing under him to cross. There is no lane
 * now — he perches on the card — so a crossing would carry him along the card's
 * top edge and out over the question below the moment the gap narrowed, and it
 * would drag his bubble with him into the panel wall. A drift about a third of
 * his own width reads as a living hover, keeps him over the card's right
 * padding at both extremes, and leaves the bubble anchored in open band.
 */
const DRIFT = 24;
/** Closest he is allowed to get to the top or bottom edge of the panel. */
const MARGIN = 8;
/** Degrees he rolls at the fastest part of the drift. Small, because the drift
    is small: a 9° bank over 24px of travel reads as a wobble, not a turn. */
const BANK = 5;
/** He is reading a card to his left, so his gaze stays left of centre. Kept
    below the +0.05 at which `Potter` mirrors the art — flipping him 180° over
    24px of drift read as a glitch. */
const GAZE = -0.5;
const GAZE_SWING = 0.35;

/* ── the handover ──────────────────────────────────────────────────────────
   A perched rider has only two places he can be SEEN: the band above the card
   he is on, and the band above the next one. Everywhere between them a card is
   painted over him.

   The first version of the perch SCRUBBED between the two, moving the target
   smoothly down the gap over a window of scroll. That is why he vanished: a
   sweep of the whole scroll range found him fully hidden at 34% of positions,
   with six consecutive samples — about 300px of continuous scrolling — showing
   no character at all. Worse, the scrub has no resting state in the middle, so
   stopping the wheel inside the window parked him half way down a card.

   So the target is now a Schmitt trigger. It is ALWAYS a card edge, which means
   wherever the scroll stops he is perched on one, and the travel between them
   is the spring's alone — a step into a ζ<1 second-order system leaves at zero
   velocity, accelerates, and rounds off on arrival, which is the fall the
   scrub was trying to hand-animate.

   `cross` is where the trigger belongs: the last instant the band he is sitting
   in is still fully inside the top of the panel, `FOCUS × panel height` of
   scroll into the gap less the margin the clamp keeps. `HYST` holds it on the
   near side only, so a jitter at the threshold cannot ping-pong him between two
   cards but nothing can delay the departure past the point he starts sinking.

   Being invisible for the length of the fall is then dealt with by z-order
   rather than by shortening the fall — see `SHOW` and `LAND`. */

/**
 * Visible px above the card below which staying behind it swallows him. Settled
 * he shows exactly `PERCH`; anything less means he has left the edge.
 */
const SHOW = PERCH - 4;
/**
 * How close to his perch counts as arrived, in px. Must clear the band's
 * overhang (`--potter-band` − `PERCH`, the few px his head is behind the card
 * ABOVE at the moment it lets go of him) so the landing is allowed to happen,
 * and stay far under a gap so a real handover always reads as a departure.
 */
const LAND = 24;
/**
 * How far right he leans while crossing, in px, and the panel margin that
 * caps it. Cards are left-aligned but `Your answer — incorrect` is not, so the
 * right edge is the cheapest place to cross — and it is measured against the
 * panel live, never assumed.
 */
const CROSS_X = 30;
const CROSS_EDGE = 8;
/** Lift easing, in seconds: off the card fast, back onto it slowly. */
const LIFT_UP = 0.09;
const LIFT_DOWN = 0.24;
/**
 * Nose-down roll while falling, and the speed at which it reaches full. The art
 * faces left (the bristles are on the right), so a dive is negative.
 *
 * Taken from his SPEED rather than from the lift, for two reasons. He is not
 * always falling while he is in front — held against the top of the panel past
 * the last card he is in front and perfectly still, and a stationary dive is
 * just a crooked mascot. And a rolled figure has a taller bounding box than an
 * upright one: the landing is timed to the few px between his head and the card
 * above, so still diving as he touched down, that box reached back under the
 * card and the landing frame rendered him hidden — four of them in the sweep.
 */
const DIVE = -7;
const DIVE_SPEED = 600;
/**
 * Slack on the landing test, in px, for the roll and for sub-pixel layout: the
 * card above has to have let go of his bounding box, not just of his top edge.
 */
const CLEAR = 3;

/**
 * Potter riding the review list — he flies down the answers on a broom and
 * settles on the top edge of whichever card you are reading, legs and broom
 * behind it, head and torso in the gap above it.
 *
 * The occlusion is CSS, and it has two states. SETTLED on a card he is behind
 * it — `.review-list > li` is positioned with a z-index and `.potter-rider` is
 * not, so the card paints over his lower half, and that overlap is the whole
 * reason he reads as sitting ON the card rather than beside it. CROSSING to the
 * next card he passes IN FRONT, because the gap he is falling down is one card
 * tall and behind it he is simply gone.
 *
 * The loop drives that: `data-phase="cross"` on the host raises him above the
 * cards, and the switch is taken from the geometry it already has rather than
 * from a timer — he goes in front the moment his target stops being the edge he
 * is standing on, and comes back down the moment being behind would still show
 * `SHOW` px of him. Landing, that moment is when his head clears the bottom
 * edge of the card ABOVE, where the difference between the two layers is the
 * few px of broom the band does not cover, so the flip is nearly invisible and
 * he is moving through it either way.
 *
 * VERTICAL is scroll-driven. `measure()` turns the scroll position into a
 * continuous distance down the list (the reading line) and picks which card
 * edge that belongs to; the spring does the travel between edges. On screen he
 * then rides WITH that card, because his target is a list position and the list
 * is what is scrolling.
 *
 * HORIZONTAL is a cosine of that same vertical distance, never of elapsed time:
 * `x = -A/2 cos 2πy/λ`. Being a function of where he *is*, the drift cannot get
 * out of sync with the fall, is identical at any frame rate, and replays the
 * same path when you scroll back up. It is now a 24px sway rather than a
 * crossing of the column — see `DRIFT`. `look` is that curve's slope, `-sin θ`,
 * so he leans into the sway instead of sliding sideways.
 *
 * The spring is integrated on rAF rather than driven by a CSS transition,
 * because a transition restarts from wherever it happens to be each time the
 * target changes; during a fast scroll that reads as stutter. A spring carries
 * its velocity across target changes.
 *
 * The loop is set up ONCE. An earlier version listed the current index in the
 * effect's dependencies, so every landing tore the loop down and re-seeded
 * `y = target` — which snapped him into place instantly and meant the fall
 * never rendered at all. Index now lives in a ref; only the speech bubble and
 * the coarsely quantised facing direction are React state.
 */
export default function PotterRider({
  containerSelector,
  itemSelector,
  items,
  onActiveChange,
}: {
  containerSelector: string;
  itemSelector: string;
  items: RiderItem[];
  /**
   * Told whether he is actually on screen, so the list can open the band
   * between cards that his visible upper half sits in — and close it again to
   * a normal 14px rhythm when he is hidden, off-gate or has nothing to ride.
   */
  onActiveChange?: (active: boolean) => void;
}) {
  const drag = usePotterDrag("review");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const sayRef = useRef<HTMLDivElement | null>(null);

  const [visible, setVisible] = useState(false);
  const [talk, setTalk] = useState(true);
  const [shown, setShown] = useState(true);
  const [face, setFace] = useState(GAZE);
  const [say, setSay] = useState<{ mood: Mood; text: string }>({
    mood: "peek",
    text: "",
  });

  // physics, geometry + index, deliberately outside React so the loop never
  // re-renders and never goes stale.
  const y = useRef(0);
  const vel = useRef(0);
  const target = useRef(0);
  const idx = useRef(-1);
  const faceRef = useRef(GAZE);
  const base = useRef(0); // list y the weave takes its phase from
  const wave = useRef(640); // weave wavelength, in px of list travel
  const amp = useRef(0); // weave width, in px
  const lo = useRef(-1e6); // list y at which he would leave the top of the panel
  const hi = useRef(1e6); //  … and the bottom
  // Card edges in list coordinates, so the loop can work out how much of him a
  // card is covering without reading layout on every frame.
  const tops = useRef<number[]>([]);
  const bots = useRef<number[]>([]);
  const tall = useRef(SIZE); // his measured height
  const lean = useRef(0); // px of rightward room for the crossing lean
  const front = useRef(false); // is he painting over the cards?
  const lift = useRef(0); // eased 0→1 follower of `front`
  const phase = useRef<"perch" | "cross">("perch");
  const itemsRef = useRef(items);
  itemsRef.current = items;
  /** Lets the filter-change effect re-run the measurement without re-subscribing. */
  const measureRef = useRef<(() => void) | null>(null);

  /** Live gates. Evaluated once at mount, he never appeared on a widened window. */
  const [roomToFly, setRoomToFly] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 620px)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setRoomToFly(wide.matches && !still.matches);
    apply();
    wide.addEventListener("change", apply);
    still.addEventListener("change", apply);
    return () => {
      wide.removeEventListener("change", apply);
      still.removeEventListener("change", apply);
    };
  }, []);

  /**
   * Whether the host node is in the DOM at all — see the early return at the
   * bottom. The flight effect captures `hostRef.current` once, so a re-mount
   * has to rebuild it: hiding him in Settings and turning him back on used to
   * leave the loop writing transforms to the detached old node while the new
   * one sat unanimated at the top of the list.
   */
  const mounted = shown && items.length > 0;

  useEffect(() => {
    setTalk(thoughtsOn());
    setShown(potterVisible());
    if (typeof window === "undefined") return;
    if (!roomToFly) return;

    const host = hostRef.current;
    const scroller = document.querySelector<HTMLElement>(containerSelector);
    const parent = host?.offsetParent as HTMLElement | null;
    if (!host || !scroller || !parent) return;
    /** The wall the crossing lean is measured against. */
    const panel = host.closest<HTMLElement>(".app-panel");

    let raf = 0;
    let prev = performance.now();

    /** Scroll position → where he is trying to be, in list coordinates. */
    const measure = () => {
      const cards = Array.from(
        scroller.querySelectorAll<HTMLElement>(itemSelector),
      );
      if (!cards.length) return;

      const view = scroller.getBoundingClientRect();
      const org = parent.getBoundingClientRect();
      const originY = org.top;
      // `offsetTop`, NOT getBoundingClientRect().top. Both are measured from
      // this same origin (the cards' offsetParent IS `parent`), but a rect
      // includes transforms and the cards enter under `.fade-up`, which holds a
      // 14px translate for half a second. Measuring during it perched him 14px
      // low on every card, and nothing re-measured afterwards because a
      // transform changes no layout box for the ResizeObserver to notice.
      const anchors = cards.map((c) => c.offsetTop - PERCH);
      const last = anchors.length - 1;
      const pitch =
        last > 0
          ? (anchors[last] - anchors[0]) / last
          : cards[0].offsetHeight + PERCH;

      // Both edges of every card, in the same list coordinates as `y`, so the
      // loop can tell whether a card is covering him — the signal the z-order
      // switch runs on — with no layout read of its own.
      tops.current = cards.map((c) => c.offsetTop);
      bots.current = cards.map((c) => c.offsetTop + c.offsetHeight);
      tall.current = host.offsetHeight || SIZE;

      // How far right he may lean while crossing. `offsetLeft` is his position
      // WITHOUT the flight transform, which is what has to clear the panel;
      // reading his rect here would fold in the drift and creep every frame.
      const wall = (panel ?? scroller).getBoundingClientRect().right;
      lean.current = Math.max(
        0,
        Math.min(
          CROSS_X,
          wall - CROSS_EDGE - (org.left + host.offsetLeft + host.offsetWidth),
        ),
      );

      base.current = anchors[0];
      wave.current = Math.min(1600, Math.max(300, pitch * WAVE_CARDS));
      // A fixed sway, not a fraction of anything measured. Every previous
      // version derived the amplitude from a box — the column, then the lane —
      // and both were wrong for the same reason: the amplitude has to be small
      // enough that BOTH extremes stay over the card's right padding, which is
      // a constant, not a share of the column. See DRIFT.
      amp.current = DRIFT;

      // Where he is allowed to be, so the loop needs no layout reads of its own.
      //
      // Two constraints, and BOTH matter. The panel bound keeps him on screen.
      // The list bound keeps him on the answer cards — without it he rose above
      // the first card and sat on the provenance note and the "Review" heading.
      // (The list's own padding-top is what leaves him a band above card one;
      // clamped to the top of the list with no padding he would be entirely
      // behind it.)
      const top = originY - view.top; // list origin, relative to the panel top
      const listSpan = Math.max(0, parent.clientHeight - host.offsetHeight);
      lo.current = Math.max(MARGIN - top, 0);
      hi.current = Math.max(
        lo.current,
        Math.min(view.height - host.offsetHeight - MARGIN - top, listSpan),
      );

      // The reading line, as a distance down the list. Continuous in scrollTop:
      // this is what makes him travel rather than snap.
      const focus = view.top + view.height * FOCUS - originY;

      let i = 0;
      while (i < last && anchors[i + 1] <= focus) i++;
      const gap = i < last ? anchors[i + 1] - anchors[i] : pitch;
      const t = clamp01(gap > 0 ? (focus - anchors[i]) / gap : 0);
      // Where in the gap his own perch reaches the top margin of the panel —
      // `lo` below. It is the LAST instant the handover can happen cleanly:
      // one px later the clamp starts pushing him down off the edge he is
      // sitting on and into the card, which costs him the band, sinks his
      // bubble's foot into the question and is not a state worth having.
      // (Held off both ends so it stays inside the gap, however short a card
      // is.) The hysteresis is therefore all on the near side: he leaves on the
      // dot and only comes back if you scroll a good way back up.
      const cross = Math.min(
        0.85,
        Math.max(0.15, gap > 0 ? (view.height * FOCUS - MARGIN) / gap : 0.5),
      );

      // Which edge he is bound for. Past the last card he stays with it rather
      // than sailing off the end; inside the dead band he keeps the edge he
      // already has, so scrubbing the wheel across the threshold cannot bounce
      // him between two cards.
      let cur = i;
      if (i < last) {
        if (t >= cross) cur = i + 1;
        else if (t > cross - HYST && idx.current === i + 1) cur = i + 1;
      }
      target.current = anchors[cur];

      // He speaks for the card he is SITTING ON, so the line changes with him,
      // as he sets off rather than once he lands.
      if (cur !== idx.current) {
        idx.current = cur;
        const it = itemsRef.current[cur];
        if (it) {
          const line = reviewLine({ index: cur, ...it });
          setSay({ mood: line.mood, text: line.text });
        }
      }
    };

    /**
     * How much of his top edge a card would leave showing if he stayed behind
     * them, at list position `at`. Zero means the card he overlaps starts above
     * his head — i.e. he is inside it, and behind it he would not be there at
     * all. This is the same number `npm run visual` sweeps the scroll range
     * for, computed from the cached edges rather than from rects.
     */
    const seen = (at: number) => {
      const a = tops.current;
      const b = bots.current;
      const h = tall.current;
      let out = h;
      for (let j = 0; j < a.length; j++) {
        if (b[j] <= at || a[j] >= at + h) continue; // that card is not over him
        const above = a[j] - at;
        if (above < out) out = above > 0 ? above : 0;
      }
      return out;
    };

    /** Write the current state to the DOM. No layout reads live in here. */
    const paint = () => {
      const theta = ((y.current - base.current) / wave.current) * Math.PI * 2;
      // Centred on the resting point: this spans [-A/2, +A/2] about `right:
      // 22px`, so neither extreme reaches past the card's own padding.
      const drift = -amp.current * 0.5 * Math.cos(theta);
      const dir = -Math.sin(theta); // +1 drifting right, −1 drifting left
      const k = lift.current;
      const far = clamp01(Math.abs(vel.current) / DIVE_SPEED);

      // Crossing, the sway is traded for a lean into the right margin: he is
      // over the card rather than in the band, so the only thing to do is cover
      // as little of it as possible. `lean` is measured against the panel, so
      // this cannot push him through the wall.
      const x = drift * (1 - k) + lean.current * k;

      host.style.transform = `translate3d(${x.toFixed(2)}px, ${y.current.toFixed(2)}px, 0)`;
      if (tiltRef.current) {
        // The bank belongs to the sway and goes with it; a dive takes its
        // place, and levels back out as he slows into the perch.
        const roll = dir * BANK * (1 - k) + DIVE * k * far;
        tiltRef.current.style.transform = `rotate(${roll.toFixed(2)}deg)`;
      }

      // Raise him over the cards only while he is crossing one. Written as an
      // attribute rather than a style so the z-order still lives in CSS beside
      // the rule it is inverting, and only on change — this runs at 60Hz.
      const want = front.current ? "cross" : "perch";
      if (want !== phase.current) {
        phase.current = want;
        host.dataset.phase = want;
      }

      // He speaks where he has landed, and only there. Two things silence him:
      // his own speed, so a flick-scroll does not smear a dozen lines down the
      // list, and the crossing — a 200px bubble in front of the question is
      // exactly the cost the reserved lane was removed to stop paying, so it
      // goes well before he is over any text.
      if (sayRef.current) {
        const fade =
          1 - smoothstep(clamp01((Math.abs(vel.current) - 70) / 380));
        const op = Math.min(fade, 1 - clamp01(k * 2));
        sayRef.current.style.opacity = op.toFixed(3);
      }

      // Gaze, not heading: he is perched on a card reading leftwards across it,
      // so this stays inside [-0.85, -0.15] and never crosses the +0.05 at
      // which `Potter` mirrors the whole figure. Quantised hard so the head
      // turn costs ~6 renders per sway, not 60/s.
      const q = Math.round((GAZE + dir * GAZE_SWING) * 4) / 4;
      if (q !== faceRef.current) {
        faceRef.current = q;
        setFace(q);
      }
    };

    const step = (now: number) => {
      const dt = Math.min(0.034, Math.max(0.0005, (now - prev) / 1000));
      prev = now;

      vel.current +=
        ((target.current - y.current) * STIFF - vel.current * DAMP) * dt;
      y.current += vel.current * dt;

      // A spring this heavy trails a flick-scroll by a couple of hundred px —
      // far enough to leave the panel, and he is no use off screen. The edges
      // of the panel are a wall he cannot pass, with no bounce: the outward
      // velocity is dropped so he sets off again from rest rather than
      // lurching once the scroll stops.
      //
      // Being pinned is not being frozen. `lo`/`hi` are list positions, so they
      // travel with the scroll — held against the top edge he tracks the wheel
      // 1:1 and the weave runs at full speed, which is exactly what a flick
      // should look like.
      if (y.current < lo.current) {
        y.current = lo.current;
        if (vel.current < 0) vel.current = 0;
      } else if (y.current > hi.current) {
        y.current = hi.current;
        if (vel.current > 0) vel.current = 0;
      }

      // ── which layer he is on ────────────────────────────────────────────
      // Leaving is by TARGET, not by pixels: the frame his target stops being
      // the edge under him is the frame he lifts off, so the flip lands while
      // he is still standing on the card with only the `SIZE - PERCH` px of
      // broom the card was hiding to reveal — never while he is stationary,
      // and never once he is already buried.
      //
      // Landing is by PIXELS, and only once he is nearly home: `seen` first
      // comes back the moment his head clears the card above, where a whole
      // band's worth of him is showing and the two layers differ by a few px
      // of bristle. Reading the target on the way in instead would drop him
      // behind the card while the spring was still a card-length short — the
      // exact bug this replaced.
      //
      // The asymmetry is also what makes the landing overshoot harmless: `seen`
      // dips a few px past the edge, but nothing but a new target can put him
      // back in front, so he cannot flicker.
      const home = Math.abs(target.current - y.current);
      if (front.current) {
        if (home < LAND && seen(y.current - CLEAR) >= SHOW) front.current = false;
      } else if (home > LAND) {
        front.current = true;
      }
      const to = front.current ? 1 : 0;
      lift.current +=
        (to - lift.current) *
        (1 - Math.exp(-dt / (to > lift.current ? LIFT_UP : LIFT_DOWN)));

      paint();
      raf = requestAnimationFrame(step);
    };

    measureRef.current = measure;
    measure();
    y.current = target.current; // seed once, on first mount only
    // The refs outlive the loop, so a re-mount (Settings, or the list emptying)
    // has to start him from rest rather than from whatever he was doing when
    // the old node went away — the dive and the bubble both read his velocity.
    vel.current = 0;
    front.current = false;
    lift.current = 0;
    phase.current = "perch";
    host.dataset.phase = "perch";
    paint();
    setVisible(true);
    raf = requestAnimationFrame(step);

    scroller.addEventListener("scroll", measure, { passive: true });
    // The scroller is `inset: 0`, so its own box only changes on a window
    // resize. Observing the list too is what catches the review filter
    // swapping the cards out underneath him without a scroll to follow.
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    ro.observe(parent);

    return () => {
      scroller.removeEventListener("scroll", measure);
      ro.disconnect();
      cancelAnimationFrame(raf);
      measureRef.current = null;
      // He is hidden again until the rebuilt loop has placed him, so a re-mount
      // cannot flash him at the CSS default position for a frame.
      setVisible(false);
    };
    // Intentionally NOT depending on the current index — see the note above.
    // `mounted` IS a legitimate dependency: it changes only when the host node
    // itself comes or goes (a Settings toggle, or the list emptying), and the
    // loop closes over that node.
  }, [containerSelector, itemSelector, roomToFly, mounted]);

  /**
   * The review filter swaps which question sits at each index without changing
   * the index itself, so the line has to be recomputed explicitly — otherwise
   * he praises a question you got wrong, on the one screen whose entire job is
   * honest feedback.
   */
  useEffect(() => {
    idx.current = -1;
    measureRef.current?.();
  }, [items]);

  useEffect(() => onThoughtsChange(setTalk), []);
  useEffect(() => onPotterVisibleChange(setShown), []);

  const active = mounted && roomToFly;
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  if (!mounted) return null;

  return (
    <div
      ref={hostRef}
      className="potter-rider"
      // `--potter-sink` is exactly how much of him the card covers, and it is
      // where the bubble stands its foot — so the bubble's baseline is the
      // card's top edge by construction rather than by a tuned pixel value.
      style={
        {
          visibility: visible ? "visible" : "hidden",
          "--potter-sink": `${SIZE - PERCH}px`,
        } as CSSProperties
      }
    >
      {/* Drag offset lives on its own wrapper so it composes with the flight
          transform the rAF loop writes to `hostRef` instead of fighting it. */}
      <div
        ref={drag.hostRef}
        className={`potter-drag ${drag.dragging ? "potter-drag--active" : ""}`}
        style={{
          transform: `translate3d(${drag.offset.x}px, ${drag.offset.y}px, 0)`,
        }}
        {...drag.handlers}
      >
        <div className="relative">
          <div ref={tiltRef} className="potter-rider__tilt">
            <Potter
              riding
              mood={say.mood}
              look={face}
              // He is looking down into the card he is sitting on.
              lookY={-0.35}
              size={SIZE}
              thoughtsOn={talk}
              // A drag must not also fire the mute toggle on release.
              onToggle={() => {
                if (drag.wasDragged()) return;
                setTalk(toggleThoughts());
              }}
            />
          </div>

          {/* A wrapper the loop can fade: `.potter-thought`'s own entry
              animation fills forwards, so its opacity cannot be driven here. */}
          <div ref={sayRef} className="potter-rider__say">
            {/* Opens to his LEFT, into the band beside him, because that is
                where the room is. Dragged far enough left that the bubble would
                run into the panel wall, `usePotterDrag` measures the room live
                and flips it to his right instead — the same escape hatch the
                perched placements use. */}
            {talk && say.text && (
              <p
                className={`potter-thought ${drag.side === "right" ? "potter-thought--left" : ""}`}
                aria-hidden="true"
              >
                {say.text}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
