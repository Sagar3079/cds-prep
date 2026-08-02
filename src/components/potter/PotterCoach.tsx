"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Potter, { LEDGE_RATIO } from "./Potter";
import { usePotterDrag } from "@/lib/usePotterDrag";
import { testLine, type Line } from "@/lib/potter";
import {
  onPotterVisibleChange,
  onThoughtsChange,
  potterVisible,
  thoughtsOn,
  toggleThoughts,
} from "@/lib/potterPrefs";

const SIZE = 112;
const SHOW_MS = 4200;

/**
 * Potter during a run: perched on the timer card, reacting to how it is going.
 * He comments on *pace and situation only* — never on whether an answer looks
 * right, because nothing is marked until submit and a hint would corrupt the
 * score.
 */
export default function PotterCoach({
  index,
  total,
  answered,
  secondsLeft,
  justAnswered,
}: {
  index: number;
  total: number;
  answered: number;
  secondsLeft: number;
  justAnswered: boolean;
}) {
  const [line, setLine] = useState<Line | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [motionOk, setMotionOk] = useState(true);
  const drag = usePotterDrag("test");
  const [talk, setTalk] = useState(true);
  const [shown, setShown] = useState(true);
  // Deliberately impure: only the value from the very first render is ever
  // used (useRef's initial-value argument is discarded on every render after
  // mount), so this reads the real mount time exactly once.
  // eslint-disable-next-line react-hooks/purity
  const enteredAt = useRef(Date.now());
  const hideTimer = useRef<number | null>(null);

  /**
   * The clock ticks once a second. These are read through refs to keep them OUT
   * of the cadence effect's dependencies: when `secondsLeft` was a dependency
   * the effect was torn down and rebuilt every second, so the 2.5s interval was
   * destroyed before it ever fired, and the hide timer was cleared and re-armed
   * on every tick — which is why the bubble never went away.
   */
  const secondsRef = useRef(secondsLeft);
  secondsRef.current = secondsLeft;
  const answeredRef = useRef(answered);
  answeredRef.current = answered;

  // Live, not one-shot — changing the OS setting used to require a remount.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMotionOk(!mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    setTalk(thoughtsOn());
    setShown(potterVisible());
    const a = onThoughtsChange(setTalk);
    const b = onPotterVisibleChange(setShown);
    return () => {
      a();
      b();
    };
  }, []);

  useEffect(() => {
    enteredAt.current = Date.now();
  }, [index]);

  useEffect(() => {
    if (!motionOk) return;

    const tick = () => {
      const next = testLine({
        index,
        total,
        answered: answeredRef.current,
        secondsLeft: secondsRef.current,
        dwellMs: Date.now() - enteredAt.current,
        justAnswered,
      });

      // Armed unconditionally. Arming it only when a line existed meant the
      // last thought froze on screen for the rest of the test the moment
      // testLine returned null — which it does often.
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setLeaving(true), SHOW_MS);

      if (!next) return;
      setLine((cur) => (cur?.text === next.text ? cur : next));
      setLeaving(false);
    };

    tick();
    const id = window.setInterval(tick, 2500);
    return () => {
      window.clearInterval(id);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, [motionOk, index, total, justAnswered]);

  if (!shown) return null;

  return (
    <div
      className="potter-perch potter-perch--centre"
      // Keeps the perch offset tied to the rendered height. Hardcoding one in
      // CSS let them drift apart and left him floating above the card.
      style={
        {
          "--potter-h": `${SIZE}px`,
          "--potter-below": 1 - LEDGE_RATIO,
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
          <Potter
            // Reduced motion should quieten him, not delete him.
            mood={motionOk ? (line?.mood ?? "peek") : "peek"}
            look={0}
            lookY={-0.7}
            size={SIZE}
            thoughtsOn={talk}
            onToggle={() => {
              if (drag.wasDragged()) return;
              setTalk(toggleThoughts());
            }}
          />
          {talk && motionOk && line && (
            <p
              className={`potter-thought ${drag.side === "right" ? "potter-thought--left" : ""}`}
              // Decorative: the text mutates on its own and would otherwise be
              // announced at random.
              aria-hidden="true"
              data-leaving={leaving ? "true" : undefined}
            >
              {line.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
