"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  /** Which plan is chosen. Monthly is the default because it is the better
      deal, not because it is the only one that could be picked — the previous
      version highlighted it and gave no way to choose the other. */
  const [plan, setPlan] = useState<(typeof PLANS)[number]["id"]>("monthly");
  /**
   * The device panel, which is where this sheet belongs.
   *
   * It is rendered THROUGH A PORTAL rather than in place. In place, the nearest
   * positioned ancestor is inside the scrolling review, so `inset: 0` sized the
   * scrim to a 510px box 40px down the list and the sheet floated among the
   * questions. `position: fixed` fixed the position but anchored it to the
   * window, so on a desktop it dimmed the whole page instead of the phone.
   * Portalling into `.app-panel` — which is `position: relative` — gives an
   * absolute scrim the right containing block and keeps the overlay inside the
   * device, which is the only thing that is the app.
   */
  const [panel, setPanel] = useState<Element | null>(null);
  useEffect(() => {
    setPanel(document.querySelector(".app-panel"));
  }, []);
  const planRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the sheet, Escape closes it, and focus returns to the
  // button that opened it — a dialog that traps nothing is worse than none.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // Captured now, not read from the ref inside the cleanup: React may have
    // already detached the button from `openerRef` by the time cleanup runs.
    const opener = openerRef.current;
    // The chosen plan, not whatever button happens to be first.
    (planRefs.current.find((el) => el?.getAttribute("aria-checked") === "true") ??
      sheetRef.current?.querySelector<HTMLElement>("button"))?.focus();

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
      (prev ?? opener)?.focus?.();
    };
  }, [open]);

  const chosenPlan = PLANS.find((p) => p.id === plan) ?? PLANS[1];

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

      {open &&
        panel &&
        createPortal(
        // The backdrop is a dismiss convenience for mouse/touch only — Escape
        // and focus-trapping for keyboard users are wired up above via the
        // `onKey` handler on `document`, so the backdrop itself needs no key
        // handler.
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
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

            {/* A real radio group, not two decorated divs. Arrow keys move
                between plans and only the checked one is a tab stop, which is
                what a screen reader and a keyboard both expect of a choice.
                The group itself is never a tab stop — only the checked
                `radio` is (roving tabindex, below) — so `onKeyDown` here
                catches the arrow key after it bubbles up from whichever
                button currently has focus. jsx-a11y reads any interactive
                role with a key handler as needing its OWN focus, which would
                add a second, redundant stop in the tab order. */}
            {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
            <div
              role="radiogroup"
              aria-label="Choose a plan"
              className="mt-4 space-y-2.5"
              onKeyDown={(e) => {
                if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key)) return;
                e.preventDefault();
                const i = PLANS.findIndex((p) => p.id === plan);
                const next =
                  e.key === "ArrowDown" || e.key === "ArrowRight"
                    ? (i + 1) % PLANS.length
                    : (i - 1 + PLANS.length) % PLANS.length;
                setPlan(PLANS[next].id);
                planRefs.current[next]?.focus();
              }}
            >
              {PLANS.map((p, i) => {
                const chosen = plan === p.id;
                return (
                  <button
                    key={p.id}
                    ref={(el) => {
                      planRefs.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    tabIndex={chosen ? 0 : -1}
                    onClick={() => setPlan(p.id)}
                    className={`plan-row flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left ${
                      chosen
                        ? "border-accent bg-accent-soft"
                        : "border-line bg-paper"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                        chosen ? "border-accent" : "border-line"
                      }`}
                    >
                      {chosen && (
                        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2 font-bold text-ink">
                        {p.name}
                        {"best" in p && p.best && (
                          <span className="chip chip-blue uppercase">
                            Best value
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[0.8125rem] text-muted">
                        {p.blurb}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-lg font-extrabold tabular-nums text-ink">
                        {rupees(p.paise)}
                      </span>
                      <span className="block text-xs text-muted">
                        per {p.per}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="btn-primary mt-4 w-full"
              onClick={() => setOpen(false)}
            >
              Get {chosenPlan.name} · {rupees(chosenPlan.paise)}
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
        </div>,
          panel,
        )}
    </>
  );
}
