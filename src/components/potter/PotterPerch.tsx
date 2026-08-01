"use client";

import { useEffect, useRef, useState } from "react";
import Potter from "./Potter";
import { homeLine } from "@/lib/potter";
import { getStats, hasAttemptOn, todayKey } from "@/lib/storage";
import { onThoughtsChange, thoughtsOn, toggleThoughts } from "@/lib/potterPrefs";

/**
 * Potter perched on the daily card: hands on the top edge, lower half hidden
 * behind it, head and shoulders above — peering in at the test.
 *
 * The occlusion is real, not a mask. He sits at `z-index: 0` in the card's
 * stacking context while the card paints over him, so the overlap survives
 * whatever the card's height ends up being.
 *
 * Mount him inside a `relative` parent — he anchors to its top edge.
 */
export default function PotterPerch() {
  const [ready, setReady] = useState(false);
  const [line, setLine] = useState(() =>
    homeLine({ doneToday: false, streak: 0, accuracy: 0, tests: 0 })
  );
  const [look, setLook] = useState(0);
  const [talk, setTalk] = useState(true);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const s = getStats();
    setLine(
      homeLine({
        doneToday: hasAttemptOn(todayKey(), "daily"),
        streak: s.currentStreak > 0 ? s.currentStreak : s.bestStreak,
        accuracy: s.accuracy,
        tests: s.testsTaken,
      })
    );
    setTalk(thoughtsOn());
    setReady(true);
  }, []);

  useEffect(() => onThoughtsChange(setTalk), []);

  // His eyes follow the pointer, but only while it is over the panel — a
  // character tracking a cursor that is off in another window is unsettling.
  useEffect(() => {
    const host = hostRef.current;
    const scope = host?.closest(".app-panel");
    if (!scope) return;
    const onMove = (e: Event) => {
      const ev = e as PointerEvent;
      const box = host!.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      setLook(Math.max(-1, Math.min(1, (ev.clientX - cx) / 190)));
    };
    const onLeave = () => setLook(0);
    scope.addEventListener("pointermove", onMove);
    scope.addEventListener("pointerleave", onLeave);
    return () => {
      scope.removeEventListener("pointermove", onMove);
      scope.removeEventListener("pointerleave", onLeave);
    };
  }, [ready]);

  if (!ready) return null;

  return (
    <div ref={hostRef} className="potter-perch potter-perch--right">
      <div className="relative">
        {/* lookY is negative: he is leaning over a ledge, so he is looking DOWN
            into the card, not out at the reader. */}
        <Potter
          mood={line.mood === "idle" ? "peek" : line.mood}
          look={look}
          lookY={-0.75}
          size={104}
          thoughtsOn={talk}
          onToggle={() => setTalk(toggleThoughts())}
        />
        {talk && <p className="potter-thought">{line.text}</p>}
      </div>
    </div>
  );
}
