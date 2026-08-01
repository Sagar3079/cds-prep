"use client";

import { useEffect, useRef, useState } from "react";
import Potter, { type Mood } from "./Potter";
import { reviewLine } from "@/lib/potter";

export interface RiderItem {
  correct: boolean;
  skipped: boolean;
  official: boolean;
}

/**
 * Potter riding the review list: as you scroll, he drops from one answer card
 * to the next and comments on it.
 *
 * The motion is a real spring integrated on rAF, not a CSS transition. A
 * transition restarts from wherever it happens to be each time the target
 * changes, which during a fast scroll produces a stutter; a spring carries its
 * velocity across target changes, so quick scrolling makes him overshoot and
 * settle exactly the way a dropped object does.
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
  const [index, setIndex] = useState(0);
  const [mood, setMood] = useState<Mood>("peek");
  const [text, setText] = useState("");
  const [enabled, setEnabled] = useState(false);

  // spring state, kept out of React so the loop never re-renders
  const y = useRef(0);
  const v = useRef(0);
  const target = useRef(0);
  const raf = useRef<number | null>(null);
  const landed = useRef(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(max-width: 480px)").matches) return; // no room beside the cards
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const host = hostRef.current;
    const scroller = document.querySelector<HTMLElement>(containerSelector);
    if (!host || !scroller) return;

    const parent = host.offsetParent as HTMLElement | null;
    if (!parent) return;

    const measure = () => {
      const cards = Array.from(
        scroller.querySelectorAll<HTMLElement>(itemSelector)
      );
      if (!cards.length) return;

      // the card nearest a focus line a third of the way down the viewport
      const line = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.34;
      let best = 0;
      let bestDist = Infinity;
      cards.forEach((c, i) => {
        const box = c.getBoundingClientRect();
        const d = Math.abs(box.top + box.height / 2 - line);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });

      const card = cards[best];
      const pTop = parent.getBoundingClientRect().top;
      target.current = card.getBoundingClientRect().top - pTop + 6;

      if (best !== index) {
        setIndex(best);
        landed.current = false;
      }
    };

    const step = () => {
      // critically-ish damped spring — quick, with just enough overshoot to
      // read as a landing rather than a slide
      const k = 0.14;
      const damp = 0.76;
      v.current = (v.current + (target.current - y.current) * k) * damp;
      y.current += v.current;
      host.style.transform = `translate3d(0, ${y.current.toFixed(2)}px, 0)`;

      // squash on impact, once per landing
      if (!landed.current && Math.abs(v.current) < 0.35 && Math.abs(target.current - y.current) < 1.5) {
        landed.current = true;
        host.animate(
          [
            { transform: `translate3d(0, ${y.current}px, 0) scale(1.14, 0.86)` },
            { transform: `translate3d(0, ${y.current}px, 0) scale(0.96, 1.05)` },
            { transform: `translate3d(0, ${y.current}px, 0) scale(1, 1)` },
          ],
          { duration: 380, easing: "cubic-bezier(.22,1,.36,1)" }
        );
      }
      raf.current = requestAnimationFrame(step);
    };

    measure();
    y.current = target.current;
    step();

    scroller.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", measure);
      ro.disconnect();
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [enabled, containerSelector, itemSelector, index]);

  useEffect(() => {
    const it = items[index];
    if (!it) return;
    const line = reviewLine({ index, ...it });
    setMood(line.mood);
    setText(line.text);
  }, [index, items]);

  if (!enabled || items.length === 0) return null;

  return (
    <div ref={hostRef} className="potter-rider" aria-hidden="true">
      <div className="relative">
        <Potter mood={mood} look={-0.45} size={74} />
        {text && (
          <p className="potter-thought" style={{ bottom: "42%", maxWidth: 150 }}>
            {text}
          </p>
        )}
      </div>
    </div>
  );
}
