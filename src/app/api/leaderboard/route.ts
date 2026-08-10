import { NextResponse } from "next/server";
import { isSubjectReady } from "@/lib/bank";
import { kv, kvConfigured } from "@/lib/kv";
import { rateLimit } from "@/lib/ratelimit";
import { currentAccount, type Account } from "@/lib/account";
import { toSubject } from "@/lib/subject";
import type { Subject } from "@/types";

export const dynamic = "force-dynamic";

/** Calendar day in IST, which is the day the app's tests are keyed to. */
export function istDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The week a day belongs to, named by its Sunday, in IST.
 *
 * Boards run Sunday to Saturday and are identified by the date of the Sunday
 * they opened — so every day from Sunday to the following Saturday returns the
 * same string, and the board rolls over at midnight IST on Sunday without
 * anything having to run at that moment. There is no reset job: the new week is
 * simply a different key, and the old one expires on its own.
 *
 * Derived from the IST day rather than the server clock's day, for the reason
 * `istDay` already exists: the box is on UTC and a candidate at 01:00 IST on
 * Sunday is still in Saturday's week by UTC reckoning.
 */
export function istWeek(now = new Date()): string {
  const day = istDay(now);
  const [y, m, d] = day.split("-").map(Number);
  // Constructed as UTC from IST parts, so the arithmetic below cannot be
  // dragged across a boundary by the host's own offset.
  const at = new Date(Date.UTC(y, m - 1, d));
  at.setUTCDate(at.getUTCDate() - at.getUTCDay()); // getUTCDay: Sunday === 0
  return at.toISOString().slice(0, 10);
}

/**
 * One board per WEEK per subject, holding each person's best score.
 *
 * It used to be one board per day, wiped nightly, which meant a board that was
 * empty every morning and a score that was gone before anyone saw it. Now a
 * week accumulates: a row goes up on the first attempt and is only ever
 * replaced by a better one from the same person — see the `GT` write in
 * `../submit`. A bad Thursday cannot cost you the place you earned on Monday.
 *
 * The subject stays in the key rather than in a field, so a GK score physically
 * cannot land on the English board and one person can hold a place on both.
 *
 * Nothing migrates. Old `board:<day>:<subject>` keys carried a two-day TTL and
 * have expired or shortly will; the week keys are a different shape and simply
 * start empty.
 */
export const boardKey = (week: string, subject: Subject) =>
  `board:w${week}:${subject}`;
export const boardNameKey = (week: string, subject: Subject) =>
  `boardnames:w${week}:${subject}`;

const TOP = 50;

export interface BoardResult {
  week: string;
  subject: Subject;
  ready: boolean;
  rows: {
    rank: number;
    name: string;
    score: number;
    isYou: boolean;
    paid: boolean;
  }[];
  yourRank: number | null;
  total: number;
  configured: boolean;
}

/**
 * This week's board for one subject, highest first.
 *
 * This week only, by design and by key: the sorted set is per-week and expires,
 * so last week cannot leak into the ranking and the store cannot grow without
 * bound. Each row is that person's best score of the week, not their latest.
 *
 * Exported directly, not just reached through `GET` below, so `/leaderboard`'s
 * server component can call it in-process and render real rows into the HTML a
 * crawler sees on the first request. It used to be reachable only through this
 * route, and `robots.ts` disallows all of `/api/` — Google's renderer respects
 * that even for fetches a client-side script makes during rendering, so a page
 * whose only content arrived through this endpoint had no content a crawler
 * could ever index.
 *
 * `me` is optional and lets a caller who already resolved `currentAccount()`
 * (the page does, for its own "signed in as" line) pass it straight through
 * instead of this function resolving it a second time. `GET` below has nothing
 * to pass, so it is left undefined and resolved here as before.
 */
export async function getBoard(
  subject: Subject,
  me?: Account | null,
): Promise<BoardResult> {
  // The board exists whether or not the bank does; `ready` is what lets the page
  // say "not built yet" instead of "nobody has taken it".
  const ready = isSubjectReady(subject);

  if (!kvConfigured) {
    return {
      week: istWeek(),
      subject,
      ready,
      rows: [],
      yourRank: null,
      total: 0,
      configured: false,
    };
  }
  const week = istWeek();
  const flat = (await kv.zrevrange(boardKey(week, subject), 0, TOP - 1)) ?? [];

  // ZRANGE ... WITHSCORES returns [member, score, member, score, …].
  const entries: { id: string; score: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    entries.push({ id: flat[i], score: Number(flat[i + 1]) });
  }

  const names = await Promise.all(
    entries.map((e) => kv.get(`${boardNameKey(week, subject)}:${e.id}`)),
  );

  const account = me !== undefined ? me : await currentAccount();

  /**
   * Which rows belong to somebody on a plan, so the board can mark them.
   *
   * One `MGET` for the page rather than a `GET` per row: this renders on every
   * leaderboard view, and a round trip per entry would put twenty sequential
   * calls in front of it.
   *
   * It is only ever a colour on a name. Rank is the score and nothing else — a
   * board where paying moved you up would not be a leaderboard.
   */
  const plans = await kv.mget(entries.map((e) => `entl:${e.id}`));
  const paidRow = plans.map((raw) => {
    if (!raw) return false;
    try {
      const until = (JSON.parse(raw) as { until?: number }).until;
      return typeof until === "number" && until > Date.now();
    } catch {
      return false;
    }
  });

  const rows = entries.map((e, i) => ({
    rank: i + 1,
    name: names[i] ?? "Someone",
    // Scores are stored ×100 so the sorted set stays integer-clean with the
    // −0.25 penalty in play.
    score: e.score / 100,
    isYou: Boolean(account && account.id === e.id),
    paid: paidRow[i] ?? false,
  }));

  let yourRank: number | null = null;
  if (account) {
    const r = await kv.zrevrank(boardKey(week, subject), account.id);
    if (typeof r === "number") yourRank = r + 1;
  }

  return {
    week,
    subject,
    ready,
    rows,
    yourRank,
    total: (await kv.zcard(boardKey(week, subject))) ?? rows.length,
    configured: true,
  };
}

export async function GET(req: Request) {
  const limited = await rateLimit(req, "leaderboard");
  if (limited) return limited;

  // Anything unrecognised is english, so a hand-typed query string gets a real
  // board rather than a 400 or an empty one that looks like a bug.
  const subject = toSubject(new URL(req.url).searchParams.get("subject"));
  return NextResponse.json(await getBoard(subject));
}
