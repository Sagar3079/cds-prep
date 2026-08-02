"use client";

import { useCallback, useEffect, useState } from "react";
import { getSubjectPref, setSubjectPref } from "@/lib/storage";
import { SUBJECT_LABEL, SUBJECT_SHORT } from "@/lib/subject";
import type { Subject } from "@/types";

/**
 * The one place the app decides which subject you are looking at.
 *
 * The choice lives in `localStorage` rather than in React state because the
 * pieces that care about it are separate client islands inside a server-rendered
 * page — the SET chip, the start buttons, the practice link — with no common
 * ancestor to hold state for them. They stay in step through a same-document
 * event, the same mechanism `LeaderboardNote` uses to talk across a client
 * transition. It is a preference, not state anything depends on: an unreadable
 * value simply means english.
 */
const SUBJECT_EVENT = "cds-subject-change";

/**
 * Reads the stored subject after mount — never during render, so the first
 * client render matches the server HTML exactly — and clamps it to what is
 * actually offered. A stored `"gk"` on a build whose GK bank has since gone
 * empty must not put a dead "Start today's GK test" button on the home screen.
 */
export function useSubject(available: Subject[]): {
  subject: Subject;
  choose: (s: Subject) => void;
} {
  const [subject, setSubject] = useState<Subject>("english");
  const offered = available.length > 0 ? available : (["english"] as Subject[]);
  const key = offered.join(",");

  useEffect(() => {
    const allowed = key.split(",") as Subject[];
    const sync = () => {
      const stored = getSubjectPref();
      setSubject(allowed.includes(stored) ? stored : allowed[0]);
    };
    sync();
    window.addEventListener(SUBJECT_EVENT, sync);
    return () => window.removeEventListener(SUBJECT_EVENT, sync);
  }, [key]);

  const choose = useCallback((s: Subject) => {
    setSubjectPref(s);
    setSubject(s);
    try {
      window.dispatchEvent(new Event(SUBJECT_EVENT));
    } catch {
      /* the other islands just stay on their last value */
    }
  }, []);

  return { subject, choose };
}

/**
 * Two pills, full width, directly above the button they change. Renders nothing
 * when there is only one subject to pick, so the home screen a single-subject
 * build shows is exactly the one it showed before General Knowledge existed.
 */
export default function SubjectSwitch({
  available,
  subject,
  onChoose,
}: {
  available: Subject[];
  subject: Subject;
  onChoose: (s: Subject) => void;
}) {
  if (available.length < 2) return null;

  return (
    <div
      role="group"
      aria-label="Choose a subject"
      className="flex w-full gap-2"
    >
      {available.map((s) => {
        const active = subject === s;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            onClick={() => onChoose(s)}
            className={`inline-flex min-h-[2.25rem] flex-1 items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-bold transition-colors ${
              active
                ? "border-accent bg-accent-soft text-accent-ink"
                : "border-line bg-paper text-muted hover:text-ink"
            }`}
          >
            {active && (
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-accent"
              />
            )}
            {/* "GK" is what fits and what people say; the full name is what a
                screen reader should hear. */}
            <span className="sr-only">{SUBJECT_LABEL[s]}</span>
            <span aria-hidden="true">{SUBJECT_SHORT[s]}</span>
          </button>
        );
      })}
    </div>
  );
}
