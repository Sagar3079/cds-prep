"use client";

import { useEffect } from "react";
import { SUPPORT_EMAIL } from "@/lib/legal";
import "./globals.css";

/**
 * Root-level error boundary. This only mounts when the ROOT layout itself
 * throws, which means Navbar / TabBar / PanelScroll cannot be trusted to
 * render — so, as Next.js requires, it defines its own `<html>`/`<body>`
 * instead of composing with `layout.tsx`, and re-imports `globals.css`
 * directly (this file does not inherit the layout's CSS either). Still the
 * same design tokens as the rest of the app; nothing here depends on the
 * layout's React tree, only on the stylesheet.
 *
 * Deliberately plainer than `error.tsx`: this is the last line of defence,
 * so it stays small enough to have a good chance of rendering even when a
 * lot else has gone wrong.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // Same privacy contract as the route-level error page: message, stack,
    // route and a coarse timestamp only — never anything that identifies
    // who was using the app.
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
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>CDS Prep</title>
      </head>
      <body className="antialiased">
        <div className="grid min-h-dvh place-items-center bg-surface px-4 py-10">
          <div className="card fade-up flex w-full max-w-[380px] flex-col items-center gap-4 text-center">
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
                The app hit a snag
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Something broke at the page level. Nothing saved in this
                browser was touched — it&apos;s safe to reload.
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
              {/* A plain anchor, not `next/link`: the root layout — which is
                  what carries the router shell — is exactly what just failed,
                  so this needs a real navigation/reload rather than a
                  client-side transition that depends on the same tree. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="btn-ghost">
                Back home
              </a>
            </div>
            <p className="mt-4 text-xs text-muted">
              Still stuck?{" "}
              <a
                className="font-bold text-accent-ink underline underline-offset-2"
                href={`mailto:${SUPPORT_EMAIL}`}
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
