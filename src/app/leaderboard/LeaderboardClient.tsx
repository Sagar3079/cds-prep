"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSubjectPref } from "@/lib/storage";
import { SUBJECT_LABEL, SUBJECT_SHORT, SUBJECTS, toSubject } from "@/lib/subject";
import { formatScore } from "@/components/ScoreRing";
import type { Subject } from "@/types";

interface Row {
  rank: number;
  name: string;
  score: number;
  isYou: boolean;
}
interface Board {
  /** The Sunday this week's board opened on, in IST. */
  week: string;
  subject: Subject;
  /** The subject's bank is big enough to run a test at all. */
  ready: boolean;
  rows: Row[];
  yourRank: number | null;
  total: number;
  configured: boolean;
}

const POLL_MS = 5000;

/**
 * The interactive half of `/leaderboard`.
 *
 * Split out of `page.tsx` so the page itself can be a server component: it
 * calls `getBoard()` directly and renders real rows into the HTML a crawler
 * sees on the very first request, rather than shipping an empty shell that
 * only fills in after a client-side fetch to a path `robots.ts` disallows.
 * Everything past that first paint — subject switching, live polling, "you"
 * highlighting once the browser is involved — still happens here exactly as
 * it did when this file was the whole page.
 */
export default function LeaderboardClient({
  initialSubject,
  initialBoard,
  initialMe,
  hadExplicitSubject,
}: {
  initialSubject: Subject;
  initialBoard: Board;
  initialMe: { signedIn: boolean; name?: string };
  /**
   * Whether the URL itself named a subject. If not, a stored preference from
   * an earlier visit may still override the server's default once the client
   * can read one — the server has no access to localStorage.
   */
  hadExplicitSubject: boolean;
}) {
  const [subject, setSubject] = useState<Subject>(initialSubject);
  const [board, setBoard] = useState<Board | null>(initialBoard);
  const [failed, setFailed] = useState(false);
  const [me, setMe] = useState<{ signedIn: boolean; name?: string }>(initialMe);
  const alive = useRef(true);
  const loadId = useRef(0);

  useEffect(() => {
    if (hadExplicitSubject) return;
    const preferred = getSubjectPref();
    if (preferred !== initialSubject) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSubject(preferred);
    }
  }, [hadExplicitSubject, initialSubject]);

  const load = useCallback(async () => {
    // Bumped per request, and only the newest one is allowed to write.
    //
    // Without this the mount's fetch — fired before the effect above has
    // resolved a stored subject preference — lands whenever it lands, and
    // `alive.current` cannot stop it: switching subject tears the effect down
    // and immediately sets it true again. Measured: opening
    // /leaderboard?subject=gk showed the English rows under the GK tab, which
    // is precisely the confusion separate boards exist to prevent.
    const id = ++loadId.current;
    try {
      const res = await fetch(`/api/leaderboard?subject=${subject}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Board;
      if (!alive.current || id !== loadId.current) return;
      setBoard(data);
      setFailed(false);
    } catch {
      if (alive.current && id === loadId.current) setFailed(true);
    }
  }, [subject]);

  useEffect(() => {
    alive.current = true;
    void load();
    /**
     * Fire-and-forget, purely for its side effect. `GET /api/account`
     * re-stamps the session cookie's browser-side max-age on every call,
     * which is what keeps "signed in a year ago, back today" from silently
     * running out. The server component above already resolved `initialMe`
     * directly via `currentAccount()`, which is enough to render — but a
     * Server Component cannot set response cookies, so the actual stamp still
     * has to happen from a route handler, reached from here the same way it
     * always was. Its response is intentionally not wired back into `me`:
     * the server's answer is already current.
     */
    void fetch("/api/account").catch(() => {});

    // Polls every 5s, but only while the tab is actually being looked at.
    // A hidden tab polling forever is just battery and quota.
    // Switching subject re-runs this whole effect: the old interval is cleared
    // and a new one starts on the new board, so the poll follows the tab rather
    // than stopping at it.
    let timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    const onVis = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      timer = 0;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  return (
    <div className="space-y-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          This week&apos;s leaderboard
        </h1>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
          Your best daily score this week, scored on the server. One board per
          subject, and both reset on Sunday. A later, lower score never replaces
          a better one.
        </p>
      </div>

      {/* One board per subject, so this is a switch between two lists rather
          than a filter on one — the same toggle shape the review screen uses,
          `aria-pressed` and all, so nothing new has to be learned. */}
      <div
        role="group"
        aria-label="Choose a leaderboard"
        className="flex gap-2"
      >
        {SUBJECTS.map((s) => {
          const active = subject === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (active) return;
                // Drop the old rows immediately: leaving them under the new
                // tab for a poll's worth of time reads as GK scores on the
                // English board, which is the whole thing this split prevents.
                setBoard(null);
                setFailed(false);
                setSubject(s);
              }}
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
              <span className="sr-only">{SUBJECT_LABEL[s]}</span>
              <span aria-hidden="true">{SUBJECT_SHORT[s]}</span>
            </button>
          );
        })}
      </div>

      {/*
        The join form used to live here: email, optional username, and a
        six-digit code when the address already had an account.

        It is gone because signing up is gone. An account is created the first
        time somebody starts a test, with a generated name, so by the time
        anyone reaches this page they already have a row waiting — asking them
        to type an address to "join" a board they are on would be asking for
        something the site no longer needs.

        Nothing that stood here was deleted outright. Trading a code for a
        session moved to Settings' bind flow (`/api/account/bind`), where
        somebody restoring a purchase on a new phone will look for it, rather
        than sitting in front of everybody else. `POST /api/account/claim` — an
        older route that could hand a session to anyone who could spell an
        unclaimed address, no code required — is actually gone; see
        `src/app/api/account/route.ts`'s header comment for why.
      */}

      {me.signedIn && (
        <p className="text-[0.8125rem] text-muted">
          Playing as <span className="font-bold text-ink">{me.name}</span>
          {board?.yourRank
            ? ` · ranked #${board.yourRank} in ${SUBJECT_LABEL[subject]}`
            : ` · no ${SUBJECT_SHORT[subject]} score this week yet`}
        </p>
      )}

      {/* `data-rankings` is the stable hook scripts/visual-check.mjs measures
          rows against — the accessible name now names the board, so it is no
          longer a selector anything can rely on. */}
      <section
        data-rankings=""
        className="card space-y-1.5"
        aria-label={`${SUBJECT_LABEL[subject]} rankings`}
      >
        {failed && !board && (
          <p className="py-6 text-center text-[0.8125rem] text-muted">
            Couldn&apos;t load the board.
          </p>
        )}
        {board && !board.ready && (
          // The board is keyed and live; the bank behind it is not built yet.
          // Saying "nobody has taken it" would be true and misleading.
          <p className="py-6 text-center text-[0.8125rem] leading-relaxed text-muted">
            {/* One expression — see the note in app/test/page.tsx: a trailing
                text child loses the space that separated it from `{...}`. */}
            {`${SUBJECT_LABEL[subject]} isn’t ready yet`} — the question bank is
            still being built, so there is no test to rank.
          </p>
        )}
        {board && board.ready && board.rows.length === 0 && (
          <p className="py-6 text-center text-[0.8125rem] text-muted">
            Nobody has finished a {SUBJECT_SHORT[subject]} test this week yet.
            Be first.
          </p>
        )}
        {board?.rows.map((r) => (
          <div
            key={r.rank}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
              r.isYou ? "bg-accent-soft" : ""
            }`}
          >
            <span className="w-7 shrink-0 text-[0.8125rem] font-bold tabular-nums text-muted">
              {r.rank}
            </span>
            {/*
              A plan used to colour the name here. It no longer does, and the
              board no longer receives that fact at all: this page is public and
              unauthenticated, so anyone reading the response could see which
              named people had paid. See the note in `api/leaderboard/route.ts`
              — the row is a name and a score, and "you" is the only marking on
              it.
            */}
            <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold text-ink">
              {r.name}
              {r.isYou && <span className="ml-1.5 text-accent-ink">you</span>}
            </span>
            {/* Negative marking is real on this board, not just on the results
                screen — a run with more wrong guesses than right answers nets
                below zero, and it was rendering in the same plain ink as
                everyone else's. `err-ink` is the same tone the results page
                and the ring already use for a negative score, so a row that
                went red here reads the same way it did when the run itself
                finished. */}
            <span
              className={`shrink-0 font-extrabold tabular-nums ${
                r.score < 0 ? "text-err-ink" : "text-ink"
              }`}
            >
              {formatScore(r.score)}
            </span>
          </div>
        ))}
      </section>

      <p className="text-xs leading-relaxed text-muted">
        Scores are worked out on the server from the options you picked, so a
        score can&apos;t be sent in directly. Only your first attempt each day
        counts, once per subject — an English run and a General Knowledge run on
        the same day are two separate entries.
      </p>
    </div>
  );
}
