"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_CHARACTER,
  character,
  onCharacterChange,
  onPotterVisibleChange,
  onThoughtsChange,
  potterVisible,
  setCharacter,
  setPotterVisible,
  setThoughts,
  thoughtsOn,
  type CharacterId,
} from "@/lib/potterPrefs";
import { POTTER, useCharacterRoster } from "@/components/potter/characters";
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
  const [who, setWho] = useState<CharacterId>(DEFAULT_CHARACTER);
  const [topics, setTopics] = useState(0);
  const [cleared, setCleared] = useState(false);
  const [moved, setMoved] = useState(false);
  /**
   * Only the characters this build can actually draw. A second character's art
   * may not have landed yet, and an option that cannot be honoured is worse
   * than no option — so with one entry there is simply no choice to present.
   */
  const { list: cast } = useCharacterRoster();
  const castRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Falls back to Potter when a stored id has no art here: he is the character
  // actually on screen in that case, so he is the one the copy must name.
  const current = cast.find((c) => c.id === who) ?? POTTER;

  useEffect(() => {
    setShowPotter(potterVisible());
    setTalk(thoughtsOn());
    setWho(character());
    setTopics(Object.keys(getMastery()).length);
    setLoaded(true);
    const a = onPotterVisibleChange(setShowPotter);
    const b = onThoughtsChange(setTalk);
    const c = onCharacterChange(setWho);
    return () => {
      a();
      b();
      c();
    };
  }, []);

  return (
    <div className="space-y-4 px-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">
        Settings
      </h1>

      <section className="card space-y-5" aria-labelledby="companion-heading">
        <div>
          <h2
            id="companion-heading"
            className="text-[0.9375rem] font-bold text-ink"
          >
            Study companion
          </h2>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
            Who perches on your cards while you practise.
          </p>
        </div>

        {loaded && (
          <>
            {/* A real radio group, not two decorated divs — the same control
                the plan sheet uses, because this is the same kind of choice.
                Arrow keys move between characters and only the checked one is a
                tab stop, which is what a keyboard and a screen reader both
                expect. The group itself is never a tab stop, so `onKeyDown`
                here catches the arrow after it bubbles from whichever button
                has focus; jsx-a11y reads an interactive role with a key handler
                as needing its own focus, which would add a second, redundant
                stop in the tab order.

                Hidden entirely when there is only one character to be: an
                option the build cannot honour is worse than no option. */}
            {cast.length > 1 && (
              /* eslint-disable-next-line jsx-a11y/interactive-supports-focus */
              <div
                role="radiogroup"
                aria-label="Choose your companion"
                className="space-y-2.5"
                onKeyDown={(e) => {
                  if (
                    !["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(
                      e.key,
                    )
                  ) {
                    return;
                  }
                  e.preventDefault();
                  const i = cast.findIndex((c) => c.id === current.id);
                  const next =
                    e.key === "ArrowDown" || e.key === "ArrowRight"
                      ? (i + 1) % cast.length
                      : (i - 1 + cast.length) % cast.length;
                  setWho(cast[next].id);
                  setCharacter(cast[next].id);
                  castRefs.current[next]?.focus();
                }}
              >
                {cast.map((c, i) => {
                  const chosen = c.id === current.id;
                  const Figure = c.Figure;
                  return (
                    <button
                      key={c.id}
                      ref={(el) => {
                        castRefs.current[i] = el;
                      }}
                      type="button"
                      role="radio"
                      aria-checked={chosen}
                      tabIndex={chosen ? 0 : -1}
                      onClick={() => {
                        setWho(c.id);
                        setCharacter(c.id);
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-[border-color,background-color,transform] duration-200 ease-[var(--ease)] active:scale-[0.985] ${
                        chosen
                          ? "border-accent bg-accent-soft"
                          : "border-line bg-paper"
                      }`}
                    >
                      {/* Shape, not colour: a filled ring reads as chosen with
                          the hue removed, which the border alone does not. */}
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
                        <span className="block font-bold text-ink">
                          {c.name}
                        </span>
                        <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">
                          {c.blurb}
                        </span>
                      </span>
                      {/* The art itself, so the choice is made by looking
                          rather than by reading. Inert: without `onToggle` a
                          character renders as an aria-hidden figure with no
                          pointer events, so the row stays one tap target. */}
                      <span
                        aria-hidden="true"
                        className="grid h-[52px] w-11 shrink-0 place-items-end"
                      >
                        <Figure size={52} mood="peek" lookY={-0.15} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <Toggle
              id="potter-visible"
              label={`Show ${current.name}`}
              hint="Turn the companion off completely. Nothing else about the app changes."
              on={showPotter}
              onChange={(next) => {
                setShowPotter(next);
                setPotterVisible(next);
              }}
            />
            <Toggle
              id="potter-thoughts"
              label="Let them think out loud"
              hint="Their reactions during a test, and their explanation of each answer when you review. You can also tap them to toggle this."
              on={talk}
              disabled={!showPotter}
              onChange={(next) => {
                setTalk(next);
                setThoughts(next);
              }}
            />

            <div className={showPotter ? "" : "opacity-55"}>
              <p className="text-[0.8125rem] leading-relaxed text-muted">
                Drag them anywhere and they stay put, per screen. Switching
                character starts them back on the ledge.
              </p>
              <button
                type="button"
                className="btn-ghost mt-2"
                disabled={!showPotter}
                onClick={() => {
                  // A drag can strand them off-screen; this is the way back.
                  for (const k of ["home", "test", "review"]) {
                    try {
                      localStorage.removeItem(`cds-potter-pos-${k}`);
                    } catch {
                      /* ignore */
                    }
                  }
                  setMoved(true);
                }}
              >
                Reset their position
              </button>
              {moved && (
                <p
                  role="status"
                  className="mt-2 text-[0.8125rem] font-semibold text-ok-ink"
                >
                  Position reset. Reload to see them back in place.
                </p>
              )}
            </div>
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
          Every attempt, streak and preference lives in this browser only.
          Clearing site data resets it all.
        </p>
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          The leaderboard is the exception, and only if you join it. Joining
          stores your email address, the username you pick and your daily score
          on a server. Your email is never shown to anyone — the board shows a
          masked form like{" "}
          <span className="whitespace-nowrap">s••••@gmail.com</span> unless you
          set a username. It is not verified yet, so treat it as an unconfirmed
          address rather than proof of who you are. Leaderboard entries are
          deleted two days after the day they belong to.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Link
            href="/history"
            className="text-[0.8125rem] font-bold text-accent-ink"
          >
            View your history →
          </Link>
          {/* The summary above is the honest short version; this is the page
              that has to stay in step with the code. Linked from here because
              "your data" is where somebody goes looking for it. */}
          <Link
            href="/privacy"
            className="text-[0.8125rem] font-bold text-accent-ink"
          >
            Full privacy policy →
          </Link>
        </div>
      </section>
    </div>
  );
}
