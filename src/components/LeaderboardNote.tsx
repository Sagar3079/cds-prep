"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SUBJECT_LABEL } from "@/lib/subject";
import type { Question, Subject } from "@/types";

/**
 * The leaderboard side of finishing a test.
 *
 * Two halves that must never become one:
 *
 * - `reportRun()` is fired from `TestClient.finalize()` **after** the score has
 *   been marked, saved and handed off. It is not awaited, it returns `void`, and
 *   every path inside it is wrapped — a 401, a 429, a 500, a dead network or a
 *   browser with `fetch` disabled must cost nobody their result. A leaderboard
 *   is a nice-to-have; the local flow is the product.
 * - `<LeaderboardNote/>` renders what actually happened, on `/results`, in one
 *   muted line. It says nothing while the request is in flight and it never
 *   claims a score was recorded when it wasn't — a signed-out user is told to
 *   sign in, a retake is told only the first attempt counts.
 *
 * The two halves talk through sessionStorage plus a same-document event, because
 * `router.replace("/results")` is a client transition: `TestClient` unmounts but
 * the promise keeps running in the same window, so the event reaches the note
 * whenever the response lands. A hard reload loses the event and the note stays
 * silent, which is the correct failure — silence claims nothing.
 */

const STATUS_KEY = "cds-submit-status";
const STATUS_EVENT = "cds-submit-status";

/** How long to wait before giving up on the board and saying so. */
const TIMEOUT_MS = 8000;

export type SubmitOutcome =
  /** In flight. Renders nothing. */
  | { state: "pending" }
  /** 200, `onBoard: true`. */
  | { state: "posted" }
  /** 200, `onBoard: false` — a same-day retake. `reason` comes from the route. */
  | { state: "not-counted"; reason: string }
  /** 401 — no session cookie. */
  | { state: "signed-out" }
  /** Any other 4xx the route explained in its own `error`/`reason` field. */
  | { state: "rejected"; reason: string }
  /** 429. */
  | { state: "throttled" }
  /** 503 — no store configured. */
  | { state: "off" }
  /** Network, timeout, or anything else that never reached an answer. */
  | { state: "unreachable" };

/** The outcome plus the board it was about — there are two of them now. */
interface Status {
  outcome: SubmitOutcome;
  subject: Subject;
}

function write(outcome: SubmitOutcome, subject: Subject): void {
  try {
    sessionStorage.setItem(STATUS_KEY, JSON.stringify({ ...outcome, subject }));
  } catch {
    /* private mode or a full store — the note simply won't appear */
  }
  try {
    window.dispatchEvent(new Event(STATUS_EVENT));
  } catch {
    /* ignore */
  }
}

/**
 * A random run reports nothing — but it must also erase whatever the LAST
 * daily run wrote, or the random set's /results page inherits that note and
 * claims a leaderboard outcome ("Added to today's board…") for a run that
 * never touched the board. Same storage-plus-event shape as `write`, so a
 * note already on screen empties too.
 */
export function clearRunStatus(): void {
  try {
    sessionStorage.removeItem(STATUS_KEY);
  } catch {
    /* storage blocked — nothing was readable there anyway */
  }
  try {
    window.dispatchEvent(new Event(STATUS_EVENT));
  } catch {
    /* ignore */
  }
}

function read(): Status | null {
  try {
    const raw = sessionStorage.getItem(STATUS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const state = (parsed as { state?: unknown }).state;
    if (typeof state !== "string") return null;
    const reason = (parsed as { reason?: unknown }).reason;
    const subject = (parsed as { subject?: unknown }).subject;
    return {
      outcome: {
        state,
        reason: typeof reason === "string" ? reason : "",
      } as SubmitOutcome,
      subject: subject === "gk" ? "gk" : "english",
    };
  } catch {
    return null;
  }
}

interface SubmitReply {
  onBoard?: unknown;
  reason?: unknown;
  error?: unknown;
}

/**
 * Post a finished run to `/api/submit`. Never throws, never rejects, never
 * returns a promise a caller could forget to catch.
 *
 * The answers travel as the **text** of the option picked, not its index:
 * `shuffleQuestionOptions` reorders the options per run, so an index is
 * meaningless against the server's own copy of the key. A blank sends `null`.
 *
 * `subject` decides which board the run lands on and which key it is scored
 * against, so it is sent explicitly rather than inferred from the ids — an
 * unlabelled run would be scored as English and could put a GK score on the
 * English board.
 */
export function reportRun(
  quiz: Question[],
  answers: (number | null)[],
  seconds: number,
  subject: Subject,
): void {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      subject,
      answers: quiz.map((q, i) => {
        const chosen = answers[i];
        return {
          id: q.id,
          chose: chosen === null || chosen === undefined ? null : (q.options[chosen] ?? null),
        };
      }),
      seconds,
    };

    write({ state: "pending" }, subject);

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    void fetch("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      // Survives the tab being closed on the results redirect. The payload is
      // a few hundred bytes, far inside the 64KB keepalive ceiling.
      keepalive: true,
    })
      .then(async (res) => {
        if (res.status === 401) return write({ state: "signed-out" }, subject);
        if (res.status === 429) return write({ state: "throttled" }, subject);
        if (res.status === 503) return write({ state: "off" }, subject);

        let data: SubmitReply = {};
        try {
          data = (await res.json()) as SubmitReply;
        } catch {
          /* a body we can't read is the same as no explanation */
        }

        if (!res.ok) {
          const why = typeof data.error === "string" ? data.error.trim() : "";
          return write(
            why ? { state: "rejected", reason: why } : { state: "unreachable" },
            subject,
          );
        }
        if (data.onBoard === true) return write({ state: "posted" }, subject);

        const why = typeof data.reason === "string" ? data.reason.trim() : "";
        return write(
          {
            state: "not-counted",
            reason: why || "This run isn’t on today’s board.",
          },
          subject,
        );
      })
      .catch(() => write({ state: "unreachable" }, subject))
      .finally(() => window.clearTimeout(timer));
  } catch {
    // `fetch` missing, `AbortController` missing, JSON that won't stringify —
    // the run is already scored and saved, so this is the end of it.
    try {
      write({ state: "unreachable" }, subject);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Copy per outcome. `link` adds a quiet route to the Ranks tab.
 *
 * The board is named wherever a run reached one: with a board per subject,
 * "added to today's leaderboard" no longer says which.
 */
function noteFor(
  outcome: SubmitOutcome,
  subject: Subject,
): { text: string; link: boolean } | null {
  switch (outcome.state) {
    case "pending":
      return null;
    case "posted":
      return {
        text: `Added to today’s ${SUBJECT_LABEL[subject]} leaderboard.`,
        link: true,
      };
    case "not-counted":
      return { text: outcome.reason, link: true };
    case "signed-out":
      return {
        text: "Not on the leaderboard — sign in on the Ranks tab to appear there. This result is saved on this device either way.",
        link: true,
      };
    case "rejected":
      return { text: outcome.reason, link: false };
    case "throttled":
      return {
        text: "Too many results from your network just now, so this run didn’t reach the leaderboard. It’s saved on this device.",
        link: false,
      };
    case "off":
      return {
        text: "The leaderboard is switched off right now, so this run isn’t on it.",
        link: false,
      };
    case "unreachable":
      return {
        text: "Couldn’t reach the leaderboard, so this run isn’t on it. Your result is saved on this device.",
        link: false,
      };
    default:
      return null;
  }
}

/**
 * One muted line under the score. Renders nothing at all until an answer is in,
 * and nothing ever for a random set — only the daily test reports a run.
 */
export default function LeaderboardNote() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const sync = () => setStatus(read());
    sync();
    window.addEventListener(STATUS_EVENT, sync);
    return () => window.removeEventListener(STATUS_EVENT, sync);
  }, []);

  const note = status ? noteFor(status.outcome, status.subject) : null;
  if (!note || !status) return null;

  return (
    <p
      role="status"
      className="mx-auto max-w-[46ch] text-center text-xs leading-relaxed text-muted"
    >
      {note.text}
      {note.link && (
        <>
          {" "}
          {/* Straight to the board this run was about, not to whichever tab
              the Ranks page happens to open on. */}
          <Link
            href={`/leaderboard?subject=${status.subject}`}
            className="font-bold text-accent-ink underline underline-offset-2"
          >
            Ranks
          </Link>
        </>
      )}
    </p>
  );
}
