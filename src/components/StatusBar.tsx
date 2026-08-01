"use client";

import { useEffect, useState } from "react";

/**
 * The handset status strip, shown only when the app is being viewed inside the
 * device frame on a larger screen. On an actual phone the OS draws a real one
 * directly above this, so a second fake one would be absurd — hence `sm:flex`.
 */
export default function StatusBar() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const paint = () =>
      setTime(
        new Date().toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })
      );
    paint();
    // Tick on the minute boundary rather than every second.
    const id = window.setInterval(paint, 15_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="hidden sm:flex flex-none items-center justify-between px-6 pt-2.5 pb-1 text-[0.6875rem] font-bold text-ink select-none"
    >
      <span className="tabular-nums">{time || " "}</span>
      <span className="flex items-center gap-1.5">
        {/* signal */}
        <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor">
          <rect x="0" y="7.5" width="2.5" height="3.5" rx="0.6" />
          <rect x="4" y="5" width="2.5" height="6" rx="0.6" />
          <rect x="8" y="2.5" width="2.5" height="8.5" rx="0.6" />
          <rect x="12" y="0" width="2.5" height="11" rx="0.6" opacity="0.35" />
        </svg>
        {/* wifi */}
        <svg width="14" height="11" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M1 4.2a10.5 10.5 0 0 1 14 0" />
          <path d="M3.8 7.1a6.5 6.5 0 0 1 8.4 0" />
          <path d="M6.6 9.9a2.6 2.6 0 0 1 2.8 0" />
        </svg>
        {/* battery */}
        <svg width="22" height="11" viewBox="0 0 24 12" fill="none">
          <rect x="0.6" y="0.6" width="20" height="10.8" rx="3" stroke="currentColor" strokeWidth="1.1" opacity="0.45" />
          <rect x="2.2" y="2.2" width="14" height="7.6" rx="1.8" fill="currentColor" />
          <path d="M22.2 4.2v3.6a2 2 0 0 0 0-3.6Z" fill="currentColor" opacity="0.45" />
        </svg>
      </span>
    </div>
  );
}
