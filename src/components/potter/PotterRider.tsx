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

/**
 * Potter riding the review list — he drops from one answer card to the next as
 * you scroll.
 *
 * The spring is integrated on rAF rather than driven by a CSS transition,
 * because a transition restarts from wherever it happens to be each time the
 * target changes; during a fast scroll that reads as stutter. A spring carries
 * its velocity across target changes, so quick scrolling overshoots and settles
 * the way a dropped object does.
 *
 * The loop is set up ONCE. An earlier version listed the current index in the
 * effect's dependencies, so every landing tore the loop down and re-seeded
 * `y = target` — which snapped him into place instantly and meant the fall
 * never rendered at all. Index now lives in a ref; only the speech bubble is
 * React state.
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
  const [visible, setVisible] = useState(false);
  const [talk, setTalk] = useState(true);
  const [say, setSay] = useState<{ mood: Mood; text: string }>({
    mood: "peek",
    text: "",
  });

  // physics + index, deliberately outside React so the loop never re-renders
  const y = useRef(0);
  const vel = useRef(0);
  const target = useRef(0);
  const idx = useRef(-1);
  const settled = useRef(true);
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

    setVisible(true);
    let raf = 0;

    const measure = () => {
      const cards = Array.from(scroller.querySelectorAll<HTMLElement>(itemSelector));
      if (!cards.length) return;

      // the card nearest a focus line a third of the way down the viewport
      const line = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.32;
      let best = 0;
      let bestDist = Infinity;
      cards.forEach((c, i) => {
        const b = c.getBoundingClientRect();
        const d = Math.abs(b.top + Math.min(b.height, 140) / 2 - line);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });

      const b = cards[best].getBoundingClientRect();
      target.current = b.top - parent.getBoundingClientRect().top - 34;

      if (best !== idx.current) {
        idx.current = best;
        settled.current = false;
        const it = itemsRef.current[best];
        if (it) {
          const line2 = reviewLine({ index: best, ...it });
          setSay({ mood: line2.mood, text: line2.text });
        }
      }
    };

    const step = () => {
      // spring: stiff enough to keep up with a flick, loose enough to overshoot
      vel.current = (vel.current + (target.current - y.current) * 0.13) * 0.78;
      y.current += vel.current;
      host.style.transform = `translate3d(0, ${y.current.toFixed(2)}px, 0)`;

      if (!settled.current && Math.abs(vel.current) < 0.3 && Math.abs(target.current - y.current) < 1.2) {
        settled.current = true;
        host.animate(
          [
            { transform: `translate3d(0,${y.current}px,0) scale(1.16,0.84)` },
            { transform: `translate3d(0,${y.current}px,0) scale(0.95,1.06)` },
            { transform: `translate3d(0,${y.current}px,0) scale(1,1)` },
          ],
          { duration: 400, easing: "cubic-bezier(.22,1,.36,1)" }
        );
      }
      raf = requestAnimationFrame(step);
    };

    measure();
    y.current = target.current; // seed once, on first mount only
    raf = requestAnimationFrame(step);

    scroller.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);

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
        <Potter
          mood={say.mood}
          look={-0.5}
          lookY={-0.4}
          size={92}
          thoughtsOn={talk}
          onToggle={() => setTalk(toggleThoughts())}
        />
        {talk && say.text && <p className="potter-thought">{say.text}</p>}
      </div>
    </div>
  );
}
