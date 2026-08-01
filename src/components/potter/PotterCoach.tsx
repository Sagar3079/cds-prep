"use client";

import { useEffect, useRef, useState } from "react";
import Potter from "./Potter";
import { testLine, type Line } from "@/lib/potter";

/**
 * Potter during a run: perched on the question card, reacting to how it is
 * going. He comments on *pace and situation only* — never on whether an answer
 * is right, because nothing is marked until submit and a hint would corrupt
 * the score.
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
  const [enabled, setEnabled] = useState(false);
  const enteredAt = useRef(Date.now());
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    setEnabled(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    enteredAt.current = Date.now();
  }, [index]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const next = testLine({
        index,
        total,
        answered,
        secondsLeft,
        dwellMs: Date.now() - enteredAt.current,
        justAnswered,
      });
      if (!next) return;
      setLine((cur) => (cur?.text === next.text ? cur : next));
      setLeaving(false);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      // A thought that never leaves stops being a reaction and becomes decor.
      hideTimer.current = window.setTimeout(() => setLeaving(true), 4200);
    };
    tick();
    const id = window.setInterval(tick, 2500);
    return () => {
      window.clearInterval(id);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, [enabled, index, total, answered, secondsLeft, justAnswered]);

  if (!enabled) return null;

  return (
    <div className="potter-perch" style={{ right: 14 }}>
      <div className="relative">
        <Potter mood={line?.mood ?? "peek"} look={-0.25} lookY={-0.7} size={92} />
        {line && !leaving && <p className="potter-thought">{line.text}</p>}
        {line && leaving && (
          <p className="potter-thought" data-leaving="true">
            {line.text}
          </p>
        )}
      </div>
    </div>
  );
}
