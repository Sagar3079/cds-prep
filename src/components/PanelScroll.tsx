"use client";

import { useCallback, useEffect, useRef } from "react";

const IDLE_MS = 700;
const MIN_THUMB = 28;

/**
 * The panel's scroll container plus an iOS-style overlay scrollbar.
 *
 * The native desktop scrollbar is a chunky widget that sits inside the device
 * frame and immediately gives away that this is a browser. It is hidden in CSS
 * and replaced with a thumb that fades in while you scroll and fades out when
 * you stop.
 */
export default function PanelScroll({ children }: { children: React.ReactNode }) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const idleTimer = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  const paint = useCallback(() => {
    const main = mainRef.current;
    const thumb = thumbRef.current;
    const body = bodyRef.current;
    if (!main || !thumb || !body) return;

    const { scrollTop, scrollHeight, clientHeight } = main;
    const overflow = scrollHeight - clientHeight;

    // Nothing to scroll — no thumb, and the nav keeps its flat edge.
    if (overflow <= 1) {
      thumb.style.height = "0px";
      body.dataset.scrolling = "false";
      return;
    }

    const track = clientHeight - 6;
    const height = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * track);
    const top = 3 + (scrollTop / overflow) * (track - height);
    thumb.style.height = `${height}px`;
    thumb.style.transform = `translateY(${top}px)`;
  }, []);

  const onScroll = useCallback(() => {
    const body = bodyRef.current;
    const main = mainRef.current;
    if (!body || !main) return;

    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(paint);

    body.dataset.scrolling = "true";
    // The nav gains a shadow only once something has scrolled beneath it.
    const nav = body.parentElement?.querySelector("nav");
    if (nav) nav.dataset.scrolled = main.scrollTop > 2 ? "true" : "false";

    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      if (bodyRef.current) bodyRef.current.dataset.scrolling = "false";
    }, IDLE_MS);
  }, [paint]);

  useEffect(() => {
    paint();
    const main = mainRef.current;
    if (!main) return;

    // Content height changes on route change, filter toggles, dialogs opening.
    const ro = new ResizeObserver(paint);
    ro.observe(main);
    for (const child of Array.from(main.children)) ro.observe(child);

    return () => {
      ro.disconnect();
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [paint]);

  return (
    <div ref={bodyRef} className="panel-body" data-scrolling="false">
      <main ref={mainRef} onScroll={onScroll}>
        {children}
      </main>
      <div ref={thumbRef} className="scroll-thumb" aria-hidden="true" />
    </div>
  );
}
