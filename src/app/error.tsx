"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary. Only the failing segment is replaced — Navbar,
 * TabBar and the rest of the app shell stay mounted — so this uses the same
 * card language as every other screen rather than inventing a new one.
 *
 * Reports the error to `/api/log` once on mount, fire-and-forget: a failed
 * report must never become a second error, so the `fetch` is wrapped in its
 * own `.catch` and nothing here waits on it before rendering.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // Never sends anything that identifies a person: no email, no
    // account/session cookie, no test answers — just what broke, which
    // route it broke on, and a coarse timestamp `/api/log` adds itself.
    void fetch("/api/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        route: window.location.pathname,
        digest: error.digest,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex-1 px-4 py-6">
      <div className="card fade-up flex flex-col items-center gap-4 py-12 text-center">
        <div
          aria-hidden="true"
          className="grid h-14 w-14 place-items-center rounded-full bg-err-soft text-err-ink"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-bold tracking-tight text-ink">
            Something went wrong
          </p>
          <p className="mt-1.5 max-w-[30ch] text-sm leading-relaxed text-muted">
            This screen hit a snag. Nothing saved in this browser was
            touched — it&apos;s safe to try again.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            className="btn-primary"
            onClick={() => reset()}
          >
            Try again
          </button>
          <Link href="/" className="btn-ghost">
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
