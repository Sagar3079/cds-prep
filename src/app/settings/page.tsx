"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  onPotterVisibleChange,
  onThoughtsChange,
  potterVisible,
  setPotterVisible,
  setThoughts,
  thoughtsOn,
} from "@/lib/potterPrefs";
import { clearMastery, getMastery } from "@/lib/mastery";

function Toggle({
  id,
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className={`flex items-start gap-3 ${disabled ? "opacity-55" : ""}`}>
      <div className="min-w-0 flex-1">
        <label
          htmlFor={id}
          className="block text-[0.9375rem] font-bold text-ink"
        >
          {label}
        </label>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
          {hint}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
          on ? "bg-accent" : "bg-surface-2"
        } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-1 h-5 w-5 rounded-full bg-paper shadow-sm transition-[left] duration-200 ease-[var(--ease)] ${
            on ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  // Nothing is read from storage during render — the server has no access to it
  // and guessing would be a hydration mismatch.
  const [loaded, setLoaded] = useState(false);
  const [showPotter, setShowPotter] = useState(true);
  const [talk, setTalk] = useState(true);
  const [topics, setTopics] = useState(0);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    setShowPotter(potterVisible());
    setTalk(thoughtsOn());
    setTopics(Object.keys(getMastery()).length);
    setLoaded(true);
    const a = onPotterVisibleChange(setShowPotter);
    const b = onThoughtsChange(setTalk);
    return () => {
      a();
      b();
    };
  }, []);

  return (
    <div className="space-y-4 px-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">
        Settings
      </h1>

      <section className="card space-y-5" aria-labelledby="potter-heading">
        <div>
          <h2
            id="potter-heading"
            className="text-[0.9375rem] font-bold text-ink"
          >
            Potter
          </h2>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
            The study companion who perches on your cards.
          </p>
        </div>

        {loaded && (
          <>
            <Toggle
              id="potter-visible"
              label="Show Potter"
              hint="Turn him off completely. Nothing else about the app changes."
              on={showPotter}
              onChange={(next) => {
                setShowPotter(next);
                setPotterVisible(next);
              }}
            />
            <Toggle
              id="potter-thoughts"
              label="Let him think out loud"
              hint="His speech bubbles. You can also tap him anywhere to toggle this."
              on={talk}
              disabled={!showPotter}
              onChange={(next) => {
                setTalk(next);
                setThoughts(next);
              }}
            />
          </>
        )}
      </section>

      <section className="card space-y-3" aria-labelledby="practice-heading">
        <div>
          <h2
            id="practice-heading"
            className="text-[0.9375rem] font-bold text-ink"
          >
            Adaptive practice
          </h2>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
            Random sets pull harder from topics you get wrong.{" "}
            {loaded && topics > 0
              ? `Tracking ${topics} topic${topics === 1 ? "" : "s"} so far.`
              : "Nothing tracked yet."}{" "}
            Today&apos;s test never adapts, so it stays comparable between
            people.
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost"
          disabled={!loaded || topics === 0}
          onClick={() => {
            clearMastery();
            setTopics(0);
            setCleared(true);
          }}
        >
          Reset topic history
        </button>
        {cleared && (
          <p
            role="status"
            className="text-[0.8125rem] font-semibold text-ok-ink"
          >
            Topic history cleared. Practice starts fresh.
          </p>
        )}
      </section>

      <section className="card space-y-2" aria-labelledby="data-heading">
        <h2 id="data-heading" className="text-[0.9375rem] font-bold text-ink">
          Your data
        </h2>
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          Every attempt, streak and preference lives in this browser only. There
          is no account and nothing is sent anywhere. Clearing site data resets
          it all.
        </p>
        <Link
          href="/history"
          className="text-[0.8125rem] font-bold text-accent-ink"
        >
          View your history →
        </Link>
      </section>
    </div>
  );
}
