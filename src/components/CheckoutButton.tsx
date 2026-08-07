"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SUPPORT_EMAIL } from "@/lib/legal";

/**
 * Razorpay Standard Checkout, for one plan.
 *
 * The flow is three hops and each one can fail differently, which is most of
 * what this file is: ask our server for an order, hand that order to Razorpay's
 * modal, then hand what the modal returns back to our server to be verified.
 * The button is never the thing that decides a payment succeeded — only
 * `/api/payments/verify` can say that, because only the server holds the secret
 * the signature is made with.
 *
 * The amount is not passed in from here. The server reads it from `PLANS`
 * against the plan id, so there is no price in the browser for anyone to edit.
 */

interface CheckoutSuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface CheckoutFailure {
  error?: { description?: string; reason?: string };
}

interface RazorpayInstance {
  open(): void;
  close(): void;
  on(event: "payment.failed", handler: (e: CheckoutFailure) => void): void;
}

interface CheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (r: CheckoutSuccess) => void;
  modal?: { ondismiss?: () => void; escape?: boolean };
  theme?: { color?: string };
  notes?: Record<string, string>;
}

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => RazorpayInstance;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/**
 * Loaded on first click, not on page load, and cached at module scope so two
 * plan buttons on the same page share one download. A payment script has no
 * business being fetched by someone reading the pricing page, let alone by the
 * rest of the app — and there is nothing to show for it until a button is
 * pressed anyway.
 */
let scriptLoad: Promise<void> | null = null;
function loadCheckout(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Razorpay) return Promise.resolve();
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SCRIPT_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      // Cleared so a later click retries rather than replaying the failure
      // forever — the usual cause is a dropped connection, not a dead URL.
      scriptLoad = null;
      el.remove();
      reject(new Error("script"));
    };
    document.head.appendChild(el);
  });
  return scriptLoad;
}

/** `idle` covers "not started" and "came back from a dismissed modal" alike. */
type Phase = "idle" | "opening" | "verifying" | "paid";

export default function CheckoutButton({
  planId,
  planName,
  label,
  className = "",
}: {
  planId: string;
  planName: string;
  label: string;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  /**
   * Everything below runs across an await and a third-party callback, so both
   * guards are needed: `alive` stops a state update landing on an unmounted
   * component, and `rzp` lets the cleanup close a modal the user has navigated
   * away from rather than leaving it floating over the next page.
   */
  const alive = useRef(true);
  const rzp = useRef<RazorpayInstance | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      rzp.current?.close();
      rzp.current = null;
    };
  }, []);

  const set = useCallback((next: Phase, message: string | null = null) => {
    if (!alive.current) return;
    setPhase(next);
    setError(message);
  }, []);

  const verify = useCallback(
    async (r: CheckoutSuccess) => {
      set("verifying");
      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(r),
        });
        const data = (await res.json().catch(() => ({}))) as {
          verified?: boolean;
          error?: string;
        };
        if (!res.ok || !data.verified) {
          // The money may well have moved even though this failed, so the
          // message must never read as "nothing happened".
          set(
            "idle",
            data.error ??
              `Payment taken but not confirmed. Email ${SUPPORT_EMAIL} with this order and it will be sorted.`,
          );
          return;
        }
        set("paid");
      } catch {
        set(
          "idle",
          `Payment taken but we lost the connection while confirming it. Email ${SUPPORT_EMAIL} and it will be sorted.`,
        );
      }
    },
    [set],
  );

  const start = useCallback(async () => {
    set("opening");
    try {
      const res = await fetch("/api/payments/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        orderId?: string;
        amount?: number;
        currency?: string;
        keyId?: string;
        error?: string;
      };
      if (!res.ok || !data.orderId || !data.keyId) {
        set("idle", data.error ?? "Could not start checkout. Try again.");
        return;
      }

      await loadCheckout();
      if (!alive.current) return;
      if (!window.Razorpay) {
        set("idle", "The payment window could not load. Check your connection.");
        return;
      }

      const instance = new window.Razorpay({
        key: data.keyId,
        amount: data.amount ?? 0,
        currency: data.currency ?? "INR",
        name: "CDS Prep",
        description: `${planName} plan`,
        order_id: data.orderId,
        handler: (r) => {
          void verify(r);
        },
        modal: {
          // Closing the modal is a normal thing to do and is not an error, so
          // it says nothing and puts the button back the way it was.
          ondismiss: () => set("idle"),
          escape: true,
        },
        // `accent` from globals.css. Hardcoded because Checkout renders in its
        // own iframe and cannot read a CSS custom property from this document.
        theme: { color: "#2F6BFF" },
      });

      instance.on("payment.failed", (e) => {
        set(
          "idle",
          e.error?.description ??
            "That payment did not go through. Nothing has been charged — try again or use a different method.",
        );
      });

      rzp.current = instance;
      instance.open();
    } catch {
      set("idle", "Could not open checkout. Check your connection and try again.");
    }
  }, [planId, planName, set, verify]);

  const busy = phase === "opening" || phase === "verifying";

  if (phase === "paid") {
    return (
      <p className={`text-center text-[0.8125rem] font-bold text-ok-ink ${className}`}>
        Payment confirmed. Thank you.
      </p>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        className="btn-primary w-full"
        onClick={() => void start()}
        disabled={busy}
        aria-busy={busy}
      >
        {phase === "opening"
          ? "Opening…"
          : phase === "verifying"
            ? "Confirming…"
            : label}
      </button>
      {/*
        One live region per button, always present rather than mounted with the
        error. A region that appears at the same moment as its text is often not
        announced at all — the screen reader has nothing to compare against.
      */}
      <p
        role="status"
        aria-live="polite"
        className={
          error ? "mt-2 text-[0.8125rem] leading-relaxed text-err-ink" : "sr-only"
        }
      >
        {error ?? ""}
      </p>
    </div>
  );
}
