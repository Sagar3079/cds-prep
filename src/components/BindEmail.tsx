"use client";

import { useState } from "react";
import { SUPPORT_EMAIL } from "@/lib/legal";

/**
 * "Put an address on this so you don't lose it."
 *
 * Shown immediately after a payment succeeds, and — this is the point — the
 * only thing between a buyer and a plan that exists solely as a cookie. The
 * checkout gate used to demand a verified email *before* taking money, which
 * made a purchase recoverable by construction and cost most of the people who
 * got that far. Moving the address after the payment keeps the recoverability
 * and moves the friction to a moment when somebody has already decided.
 *
 * So it does not offer a tidy "no thanks". It can be dismissed — trapping
 * somebody who cannot reach their inbox right now would be worse — but the
 * dismissal says what it costs, and settings keeps offering it afterwards.
 *
 * Doubles as the restore path: an address that already has an account signs the
 * caller into it and brings the plan across. `POST /api/account/bind/confirm`
 * decides which of the two happened; nothing here needs to ask in advance, and
 * asking would leak whether an address is registered.
 */
export default function BindEmail({
  onDone,
  onDismiss,
  context = "purchase",
}: {
  onDone?: (outcome: "bound" | "restored") => void;
  onDismiss?: () => void;
  context?: "purchase" | "restore";
}) {
  const [phase, setPhase] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [outcome, setOutcome] = useState<"bound" | "restored">("bound");
  const [planMoved, setPlanMoved] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        sent?: boolean;
        to?: string;
        error?: string;
      };
      if (!res.ok || !data.sent) {
        setError(data.error ?? "We couldn't send the code. Try again in a moment.");
        return;
      }
      setSentTo(data.to ?? email);
      setPhase("code");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/bind/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        outcome?: "bound" | "restored";
        planMoved?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't work. Try again.");
        return;
      }
      const result = data.outcome ?? "bound";
      setOutcome(result);
      setPlanMoved(Boolean(data.planMoved));
      setPhase("done");
      onDone?.(result);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "done") {
    return (
      <div className="rounded-xl bg-accent-soft px-4 py-3 text-left">
        <p className="text-sm font-bold text-accent-ink">
          {outcome === "restored" ? "Welcome back." : "Saved."}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-accent-ink">
          {outcome === "restored"
            ? planMoved
              ? "You're signed in to your existing account and your plan has moved across to it."
              : "You're signed in to your existing account."
            : "Your plan is tied to that address now. If you clear your browser or switch phones, enter it in Settings to get everything back."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-accent-soft px-4 py-3 text-left">
      {phase === "email" ? (
        <form onSubmit={send}>
          <p className="text-sm font-bold text-accent-ink">
            {context === "purchase"
              ? "Save your purchase to an email"
              : "Restore a purchase"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-accent-ink">
            {context === "purchase" ? (
              <>
                Right now your plan lives on this browser only. Clearing your
                history or switching phones would lose it. Add an email and it
                follows you.
              </>
            ) : (
              <>
                Enter the email your plan is saved under and we&apos;ll send a
                six-digit code.
              </>
            )}
          </p>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            className="mt-3 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
          />
          {error ? <p className="mt-2 text-sm font-medium text-red-700">{error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="submit" className="btn-primary" disabled={busy || !email}>
              {busy ? "Sending…" : "Send code"}
            </button>
            {onDismiss ? (
              <button
                type="button"
                className="text-sm underline text-accent-ink"
                onClick={onDismiss}
              >
                Not now — I understand this stays on this browser
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <form onSubmit={confirm}>
          <p className="text-sm font-bold text-accent-ink">Enter the code</p>
          <p className="mt-1 text-sm leading-relaxed text-accent-ink">
            We sent six digits to {sentTo}. It expires in ten minutes.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={code}
            onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            aria-label="Six-digit code"
            className="mt-3 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-center text-lg tracking-[0.3em]"
          />
          {error ? <p className="mt-2 text-sm font-medium text-red-700">{error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="submit" className="btn-primary" disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Confirm"}
            </button>
            <button
              type="button"
              className="text-sm underline text-accent-ink"
              onClick={() => {
                setPhase("email");
                setCode("");
                setError(null);
              }}
            >
              Use a different address
            </button>
          </div>
          <p className="mt-3 text-xs text-accent-ink/70">
            Code not arriving? Check spam, or email {SUPPORT_EMAIL}.
          </p>
        </form>
      )}
    </div>
  );
}
