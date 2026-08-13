"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useCharacter, useCharacterSwitch } from "./characters";
import { usePotterDrag } from "@/lib/usePotterDrag";

const SIZE = 118;
/**
 * How far the painted art reaches above its own box, in px.
 *
 * The ambient loops translate the whole `<svg>` — the breath, the head bob —
 * so the figure you see is not the box that bounds it. Reserving only the
 * ledge height still lost 12.2px off the top of his head.
 */
const ART_OVERHANG = 14;

/**
 * How much of the figure stands above the thing it is perched on, in px.
 *
 * Exported so a sticky container can leave room for it. Stuck at `top: 0` the
 * card pins to the panel edge while he keeps his position ABOVE it, i.e.
 * off-screen, and the scroller shears his head — measured at 24.2px gone.
 *
 * Takes the ledge ratio as an argument rather than reading Potter's: the line
 * is a property of each character's art, so a constant computed here would be
 * right for exactly one of them.
 */
export const headRoom = (ledgeRatio: number) =>
  Math.round(SIZE * ledgeRatio) + ART_OVERHANG;
import { homeLine } from "@/lib/potter";
import { getStats, hasAttemptOn, todayKey } from "@/lib/storage";
import {
  onPotterVisibleChange,
  onThoughtsChange,
  potterVisible,
  thoughtsOn,
  toggleThoughts,
} from "@/lib/potterPrefs";

/**
 * The companion perched on the daily card: hands on the top edge, lower half
 * hidden behind it, head and shoulders above — peering in at the test.
 *
 * The occlusion is real, not a mask. He sits at `z-index: 0` in the card's
 * stacking context while the card paints over him, so the overlap survives
 * whatever the card's height ends up being. WHERE the card cuts him is
 * `--potter-below`, taken from the chosen character's own ledge ratio — the
 * one number that has to follow the art rather than the placement.
 *
 * Mount him inside a `relative` parent — he anchors to its top edge.
 */
export default function PotterPerch() {
  const [ready, setReady] = useState(false);
  const [line, setLine] = useState(() =>
    homeLine({ doneToday: false, streak: 0, accuracy: 0, tests: 0 }),
  );
  const [look, setLook] = useState(0);
  const drag = usePotterDrag("home");
  const [talk, setTalk] = useState(true);
  const [shown, setShown] = useState(true);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const { art, ready: artReady } = useCharacter();
  // Switching character strands the offset the other one was dragged to, so
  // this placement goes back to its ledge. See `setCharacter`, which clears the
  // stored copy for the placements that are not mounted to hear this.
  useCharacterSwitch(art.id, artReady, drag.reset);

  useEffect(() => {
    const s = getStats();
    setLine(
      homeLine({
        doneToday: hasAttemptOn(todayKey(), "daily"),
        streak: s.currentStreak > 0 ? s.currentStreak : s.bestStreak,
        accuracy: s.accuracy,
        tests: s.testsTaken,
      }),
    );
    setTalk(thoughtsOn());
    setShown(potterVisible());
    setReady(true);
  }, []);

  useEffect(() => onThoughtsChange(setTalk), []);
  useEffect(() => onPotterVisibleChange(setShown), []);

  // His eyes follow the pointer, but only while it is over the panel — a
  // character tracking a cursor that is off in another window is unsettling.
  useEffect(() => {
    const host = hostRef.current;
    const scope = host?.closest(".app-panel");
    if (!scope) return;
    const onMove = (e: Event) => {
      const ev = e as PointerEvent;
      // A touch scroll IS a stream of pointermove events — on a mouse,
      // moving the cursor and scrolling are mutually exclusive, so this
      // never mattered on desktop. On a real touchscreen, every swipe over
      // this component was re-rendering the whole SVG mid-scroll.
      if (ev.pointerType !== "mouse") return;
      const box = host!.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      // Quantised to 0.1: setLook on every pointermove re-rendered the whole
      // SVG at pointer rate for sub-pixel changes nobody can see.
      const next =
        Math.round(Math.max(-1, Math.min(1, (ev.clientX - cx) / 190)) * 10) /
        10;
      setLook((cur) => (cur === next ? cur : next));
    };
    const onLeave = () => setLook(0);
    scope.addEventListener("pointermove", onMove);
    scope.addEventListener("pointerleave", onLeave);
    return () => {
      scope.removeEventListener("pointermove", onMove);
      scope.removeEventListener("pointerleave", onLeave);
    };
  }, [ready]);

  if (!ready || !artReady || !shown) return null;

  const Figure = art.Figure;

  // Sitting behind the card is what makes him look perched ON it — but only
  // while he is actually on the ledge. Once he is being dragged, or has been
  // left somewhere else, the overlap stops reading as depth and just swallows
  // him: drag him over the card and he disappears under it. The z-index has to
  // live out here, on the element that shares a stacking context with the card;
  // the inner drag wrapper is inside this one and cannot climb out of it.
  const inFront = drag.dragging || drag.offset.x !== 0 || drag.offset.y !== 0;

  return (
    <div
      ref={hostRef}
      className={`potter-perch potter-perch--right ${inFront ? "potter-perch--front" : ""}`}
      // Ties the perch offset to the rendered height so the two cannot drift.
      style={
        {
          "--potter-h": `${SIZE}px`,
          "--potter-below": 1 - art.ledgeRatio,
        } as CSSProperties
      }
    >
      <div
        ref={drag.hostRef}
        className={`potter-drag ${drag.dragging ? "potter-drag--active" : ""}`}
        style={{
          transform: `translate3d(${drag.offset.x}px, ${drag.offset.y}px, 0)`,
        }}
        {...drag.handlers}
      >
        <div className="relative">
          {/* lookY is negative: he is leaning over a ledge, so he is looking DOWN
            into the card, not out at the reader. */}
          <Figure
            mood={line.mood === "idle" ? "peek" : line.mood}
            look={look}
            lookY={-0.75}
            size={SIZE}
            thoughtsOn={talk}
            onToggle={() => {
              if (drag.wasDragged()) return;
              setTalk(toggleThoughts());
            }}
          />
          {talk && (
            <p
              className={`potter-thought ${drag.side === "right" ? "potter-thought--left" : ""}`}
              aria-hidden="true"
            >
              {line.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
