"use client";

import { useEffect, useRef, useState } from "react";

type State = "idle" | "loading" | "ready" | "failed";

/**
 * Why this answer is the answer, shown under the question it belongs to.
 *
 * It lives inline rather than in Potter's speech bubble: an explanation is
 * something you read next to the options while comparing them, and a floating
 * panel that follows a character down the page covers the very text it is
 * talking about.
 *
 * Fetched lazily when the card comes near the viewport — a ten-question review
 * would otherwise fire ten requests the instant the page renders, most of them
 * for cards the reader never reaches.
 */
export default function AnswerExplanation({
  id,
  chosen,
}: {
  id: string;
  chosen: number | null;
}) {
  const [state, setState] = useState<State>("idle");
  const [text, setText] = useState("");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || asked.current) return;

    const run = async () => {
      if (asked.current) return;
      asked.current = true;
      setState("loading");
      try {
        const res = await fetch("/api/explain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, chosen }),
        });
        const data = (await res.json()) as { text?: string };
        if (!res.ok || typeof data.text !== "string" || !data.text.trim()) {
          setState("failed");
          return;
        }
        setText(data.text.trim());
        setState("ready");
      } catch {
        setState("failed");
      }
    };

    // No IntersectionObserver (jsdom, very old Safari): just ask immediately
    // rather than leaving the panel permanently empty.
    if (typeof IntersectionObserver === "undefined") {
      void run();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void run();
        }
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(host);
    return () => io.disconnect();
  }, [id, chosen]);

  return (
    <div ref={hostRef} className="explain">
      <p className="explain__label">Why this answer</p>
      {state === "ready" ? (
        <p className="explain__body">{text}</p>
      ) : state === "failed" ? (
        <p className="explain__body explain__body--muted">
          Couldn&apos;t load an explanation for this one.
        </p>
      ) : (
        <p className="explain__body explain__body--muted" aria-live="polite">
          Working it out…
        </p>
      )}
    </div>
  );
}
