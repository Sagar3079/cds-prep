"use client";

import { useEffect, useRef, useState } from "react";

/** Paise, so no float ever touches a price. Rendered by `rupees()`. */
const PLANS = [
  {
    id: "weekly",
    name: "Weekly",
    paise: 4900,
    per: "week",
    blurb: "Unlimited random sets for seven days.",
  },
  {
    id: "monthly",
    name: "Monthly",
    paise: 14900,
    per: "month",
    blurb: "Everything in weekly, at about half the weekly rate.",
    best: true,
  },
] as const;

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * "Take a random test" at the end of a review, and the plan sheet it opens.
 *
 * Billing is NOT wired up. "Get now" closes the sheet and leaves you where you
 * were, which is what was asked for — but it is also the only honest behaviour
 * available: taking a card and doing nothing with it would be worse than not
 * taking one. The sheet says so rather than implying a charge is about to
 * happen, so nobody comes away thinking they have subscribed.
 */
export default function RandomTestUpsell() {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the sheet, Escape closes it, and focus returns to the
  // button that opened it — a dialog that traps nothing is worse than none.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    sheetRef.current?.querySelector<HTMLElement>("button")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (prev ?? openerRef.current)?.focus?.();
    };
  }, [open]);

  return (
    <>
      <div className="flex justify-center pt-1">
        <button
          ref={openerRef}
          type="button"
          className="btn-primary"
          onClick={() => setOpen(true)}
        >
          Take a random test
        </button>
      </div>

      {open && (
        <div
          className="upsell-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upsell-heading"
            className="upsell-sheet"
          >
            <h2
              id="upsell-heading"
              className="text-lg font-extrabold tracking-tight text-ink"
            >
              Unlimited random tests
            </h2>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
              Today&apos;s test stays free, always. A plan adds random sets
              drawn from the whole bank, weighted towards the topics you keep
              getting wrong.
            </p>

            <div className="mt-4 space-y-2.5">
              {PLANS.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 rounded-2xl border-2 p-3.5 ${
                    "best" in p && p.best
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-paper"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2 font-bold text-ink">
                      {p.name}
                      {"best" in p && p.best && (
                        <span className="chip chip-blue uppercase">
                          Best value
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[0.8125rem] text-muted">
                      {p.blurb}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-extrabold tabular-nums text-ink">
                      {rupees(p.paise)}
                    </p>
                    <p className="text-xs text-muted">per {p.per}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn-primary mt-4 w-full"
              onClick={() => setOpen(false)}
            >
              Get now
            </button>
            <p
              className="mt-2 text-center text-xs text-muted"
              aria-live="polite"
            >
              Payments aren&apos;t live yet — nothing is charged and no card is
              asked for. This just closes.
            </p>
            <button
              type="button"
              className="btn-ghost mt-2 w-full"
              onClick={() => setOpen(false)}
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
