"use client";

import { useEffect, useRef, useState } from "react";
import Potter, { type Mood } from "./Potter";
import { reviewLine } from "@/lib/potter";
import { onThoughtsChange, thoughtsOn, toggleThoughts } from "@/lib/potterPrefs";

export interface RiderItem {
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
/** How far above a card's top edge he flies when he is settled on it. */
const PERCH = 40;
/** 0 = he simply tracks the reading line, 1 = he stops dead on every card. */
const DWELL = 0.75;
/** Fraction of the gap to the next card he spends settled before setting off. */
const HOLD = 0.42;
/** Spring, in rad²/s² and 1/s: ω≈5.1 rad/s, ζ≈0.86. Slow and heavy, with just
    enough left under 1 to round off each arrival instead of stopping flat. */
const STIFF = 26;
const DAMP = 8.8;
/** One full left→right→left weave every four cards. */
const WAVE_CARDS = 4;
/** How far past the column edge each end of the sweep reaches. */
const EDGE = 10;
/** Closest he is allowed to get to the top or bottom edge of the panel. */
const MARGIN = 8;
/** Degrees he rolls into the turn at the fastest part of a crossing. */
const BANK = 9;

/**
 * Where he sits between two cards, as a fraction of the gap, given how far the
 * reading line has travelled through that gap.
 *
 * Pure `t` would park him on the reading line forever — he would never appear
 * to visit a card. A hard step would teleport. This holds him near the card for
 * the first `HOLD` of the gap and then eases him onto the next one, blended
 * back towards `t` so he is always drifting with the scroll rather than
 * waiting. Its derivative is zero at both ends of the eased half, so the joins
 * between one gap and the next are smooth, not kinked.
 */
function ride(t: number): number {
  return (1 - DWELL) * t + DWELL * smoothstep(clamp01((t - HOLD) / (1 - HOLD)));
}

/**
 * Potter riding the review list — he flies down the answers on a broom,
 * weaving across the column as he descends.
 *
 * VERTICAL is scroll-driven, not target-driven. `measure()` turns the scroll
 * position into a continuous distance down the list (the reading line), finds
 * which gap between cards that falls in, and shapes it through `ride()`. So the
 * target moves the instant you move the wheel — there is no snapped card
 * position to jump between — and it still lingers on whichever card you are
 * reading.
 *
 * HORIZONTAL is a cosine of that same vertical distance, never of elapsed time:
 * `x = -A/2 (1 - cos 2πy/λ)`. Being a function of where he *is*, the weave
 * cannot drift out of sync with the fall, is identical at any frame rate, and
 * replays the same path when you scroll back up. The cosine also spends his
 * slowest moments at the two edges and crosses the text quickly in between,
 * which is both prettier and less in the way. `look` is that curve's slope,
 * `-sin θ`, so he banks into the turn instead of flying sideways.
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
}: {
  containerSelector: string;
  itemSelector: string;
  items: RiderItem[];
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const sayRef = useRef<HTMLDivElement | null>(null);

  const [visible, setVisible] = useState(false);
  const [talk, setTalk] = useState(true);
  const [face, setFace] = useState(0);
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
  const faceRef = useRef(0);
  const base = useRef(0); // list y the weave takes its phase from
  const wave = useRef(640); // weave wavelength, in px of list travel
  const amp = useRef(0); // weave width, in px
  const lo = useRef(-1e6); // list y at which he would leave the top of the panel
  const hi = useRef(1e6); //  … and the bottom
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    setTalk(thoughtsOn());
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 620) return; // no room beside the column

    const host = hostRef.current;
    const scroller = document.querySelector<HTMLElement>(containerSelector);
    const parent = host?.offsetParent as HTMLElement | null;
    if (!host || !scroller || !parent) return;

    let raf = 0;
    let prev = performance.now();

    /** Scroll position → where he is trying to be, in list coordinates. */
    const measure = () => {
      const cards = Array.from(scroller.querySelectorAll<HTMLElement>(itemSelector));
      if (!cards.length) return;

      const view = scroller.getBoundingClientRect();
      const originY = parent.getBoundingClientRect().top;
      const anchors = cards.map((c) => c.getBoundingClientRect().top - originY - PERCH);
      const last = anchors.length - 1;
      const pitch = last > 0 ? (anchors[last] - anchors[0]) / last : cards[0].offsetHeight + 14;

      base.current = anchors[0];
      wave.current = Math.min(1600, Math.max(420, pitch * WAVE_CARDS));
      // Edge to edge of the column, plus a little overhang at both ends so the
      // extremes of the sweep clear the cards rather than resting on them.
      amp.current = Math.max(0, parent.clientWidth - host.offsetWidth + EDGE * 2);

      // The range of list positions that still has him inside the panel, so the
      // loop can hold him there without doing any layout reads of its own.
      const top = originY - view.top; // list origin, relative to the panel top
      lo.current = MARGIN - top;
      hi.current = Math.max(lo.current, view.height - host.offsetHeight - MARGIN - top);

      // The reading line, as a distance down the list. Continuous in scrollTop:
      // this is what makes him travel rather than snap.
      const focus = view.top + view.height * FOCUS - originY;

      let i = 0;
      while (i < last && anchors[i + 1] <= focus) i++;
      const gap = i < last ? anchors[i + 1] - anchors[i] : pitch;
      const t = clamp01(gap > 0 ? (focus - anchors[i]) / gap : 0);

      // Past the last card he stays with it rather than sailing off the end.
      target.current = i < last ? anchors[i] + ride(t) * gap : anchors[last];

      // He has committed to the next card once he is over halfway across.
      const cur = i < last && t >= 0.55 ? i + 1 : i;
      if (cur !== idx.current) {
        idx.current = cur;
        const it = itemsRef.current[cur];
        if (it) {
          const line = reviewLine({ index: cur, ...it });
          setSay({ mood: line.mood, text: line.text });
        }
      }
    };

    /** Write the current state to the DOM. No layout reads live in here. */
    const paint = () => {
      const theta = ((y.current - base.current) / wave.current) * Math.PI * 2;
      const x = -amp.current * 0.5 * (1 - Math.cos(theta));
      const dir = -Math.sin(theta); // +1 travelling right, −1 travelling left

      host.style.transform = `translate3d(${x.toFixed(2)}px, ${y.current.toFixed(2)}px, 0)`;
      if (tiltRef.current) {
        tiltRef.current.style.transform = `rotate(${(dir * BANK).toFixed(2)}deg)`;
      }

      // The bubble sits on whichever side of him has room, and fades out
      // through the crossing — swapping sides at full opacity would pop.
      const n = amp.current > 1 ? -x / amp.current : 0; // 0 = far right, 1 = far left
      const lean = n > 0.5 ? "left" : "right";
      if (host.dataset.lean !== lean) host.dataset.lean = lean;
      if (sayRef.current) {
        const fade = smoothstep(clamp01((Math.abs(n - 0.5) - 0.06) / 0.2));
        sayRef.current.style.opacity = fade.toFixed(3);
      }

      // Quantised hard so banking costs ~8 renders per crossing, not 60/s.
      const q = Math.round(dir * 4) / 4;
      if (q !== faceRef.current) {
        faceRef.current = q;
        setFace(q);
      }
    };

    const step = (now: number) => {
      const dt = Math.min(0.034, Math.max(0.0005, (now - prev) / 1000));
      prev = now;

      vel.current += ((target.current - y.current) * STIFF - vel.current * DAMP) * dt;
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

      paint();
      raf = requestAnimationFrame(step);
    };

    measure();
    y.current = target.current; // seed once, on first mount only
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
    };
    // Intentionally NOT depending on the current index — see the note above.
  }, [containerSelector, itemSelector]);

  useEffect(() => onThoughtsChange(setTalk), []);

  if (items.length === 0) return null;

  return (
    <div
      ref={hostRef}
      className="potter-rider"
      style={{ visibility: visible ? "visible" : "hidden" }}
    >
      <div className="relative">
        <div ref={tiltRef} className="potter-rider__tilt">
          <Potter
            riding
            mood={say.mood}
            look={face}
            lookY={-0.35}
            size={92}
            thoughtsOn={talk}
            onToggle={() => setTalk(toggleThoughts())}
          />
        </div>
        {/* A wrapper the loop can fade: `.potter-thought`'s own entry animation
            fills forwards, so its opacity cannot be driven from here. */}
        <div ref={sayRef} className="potter-rider__say">
          {talk && say.text && <p className="potter-thought">{say.text}</p>}
        </div>
      </div>
    </div>
  );
}
