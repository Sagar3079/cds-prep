"use client";

import { useRef, useState } from "react";
import { SUPPORT_EMAIL } from "@/lib/legal";

/**
 * The six-digit email check, inline wherever it is needed.
 *
 * Deliberately not a page of its own. Verification is never something somebody
 * set out to do — they were buying a plan, and this appeared in the way. Every
 * step that takes them off what they were doing is a step some of them do not
 * come back from, so it happens where the interruption happened and hands
 * control straight back when it is done.
 */
export default function VerifyEmail({
  onVerified,
}: {
  /** Called once the address is confirmed. The caller resumes what it was doing. */
  onVerified: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "sending" | "entering" | "checking">(
    "idle",
  );
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = async () => {
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/account/verify/send", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        sent?: boolean;
        alreadyVerified?: boolean;
        to?: string;
        error?: string;
      };
      if (data.alreadyVerified) {
        onVerified();
        return;
      }
      if (!res.ok) {
        setPhase("idle");
        setError(data.error ?? "Couldn't send the code. Try again in a moment.");
        return;
      }
      setSentTo(data.to ?? null);
      setPhase("entering");
      // The field is the only thing to do next, so put the cursor in it.
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch {
      setPhase("idle");
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  };

  const check = async () => {
    setPhase("checking");
    setError(null);
    try {
      const res = await fetch("/api/account/verify/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        verified?: boolean;
        error?: string;
      };
      if (!res.ok || !data.verified) {
        setPhase("entering");
        setCode("");
        setError(data.error ?? "That didn't work. Try again.");
        inputRef.current?.focus();
        return;
      }
      onVerified();
    } catch {
      setPhase("entering");
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  };

  const busy = phase === "sending" || phase === "checking";

  return (
    <div className="rounded-xl bg-accent-soft px-3 py-3 text-left">
      {phase === "idle" || phase === "sending" ? (
        <>
          <p className="text-sm leading-relaxed text-accent-ink">
            <strong>Verify your email first.</strong> We&apos;ll send a
            six-digit code to the address you signed up with — it takes a
            moment and it&apos;s the only way a plan can be tied to you rather
            than to a browser.
          </p>
          <button
            type="button"
            className="btn-primary mt-3 w-full"
            onClick={() => void send()}
            disabled={busy}
            aria-busy={busy}
          >
            {phase === "sending" ? "Sending…" : "Send me the code"}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-accent-ink">
            Enter the six digits we sent{sentTo ? ` to ${sentTo}` : ""}. Check
            spam if it isn&apos;t there in a minute.
          </p>
          <label className="mt-3 block">
            <span className="sr-only">Six-digit verification code</span>
            <input
              ref={inputRef}
              // `inputMode` and `autoComplete` together are what make a phone
              // offer the code from the SMS/mail notification rather than
              // making somebody switch apps and memorise six digits.
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.length === 6) void check();
              }}
              placeholder="000000"
              className="w-full rounded-xl border-2 border-line bg-paper px-3 py-2.5 text-center text-lg font-bold tracking-[0.35em] tabular-nums text-ink"
            />
          </label>
          <button
            type="button"
            className="btn-primary mt-2.5 w-full"
            onClick={() => void check()}
            disabled={busy || code.length !== 6}
            aria-busy={busy}
          >
            {phase === "checking" ? "Checking…" : "Verify"}
          </button>
          <button
            type="button"
            className="mt-2 w-full text-xs font-semibold text-accent-ink underline"
            onClick={() => void send()}
            disabled={busy}
          >
            Send a new code
          </button>
        </>
      )}

      <p
        role="status"
        aria-live="polite"
        className={
          error
            ? "mt-2 text-[0.8125rem] leading-relaxed text-err-ink"
            : "sr-only"
        }
      >
        {error ?? ""}
      </p>

      <p className="mt-2 text-xs leading-relaxed text-muted">
        Stuck? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </div>
  );
}
