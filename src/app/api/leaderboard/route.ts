import { NextResponse } from "next/server";
import { isSubjectReady } from "@/lib/bank";
import { kv, kvConfigured } from "@/lib/kv";
import { rateLimit } from "@/lib/ratelimit";
import { currentAccount } from "@/lib/account";
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
 * One board per day per subject.
 *
 * The subject is in the key rather than in a field, so a GK score physically
 * cannot land on the English board and one person can hold a place on both. The
 * two-day TTL means there is nothing to migrate: keys written under the old
 * `board:<day>` shape simply expire.
 */
export const boardKey = (day: string, subject: Subject) =>
  `board:${day}:${subject}`;
export const boardNameKey = (day: string, subject: Subject) =>
  `boardnames:${day}:${subject}`;

const TOP = 50;

/**
 * Today's board for one subject, highest first.
 *
 * Today only, by design and by key: the sorted set is per-day and expires, so
 * yesterday cannot leak into the ranking and the store cannot grow without
 * bound.
 */
export async function GET(req: Request) {
  const limited = await rateLimit(req, "leaderboard");
  if (limited) return limited;

  // Anything unrecognised is english, so a hand-typed query string gets a real
  // board rather than a 400 or an empty one that looks like a bug.
  const subject = toSubject(new URL(req.url).searchParams.get("subject"));
  // The board exists whether or not the bank does; `ready` is what lets the page
  // say "not built yet" instead of "nobody has taken it".
  const ready = isSubjectReady(subject);

  if (!kvConfigured) {
    return NextResponse.json({
      day: istDay(),
      subject,
      ready,
      rows: [],
      configured: false,
    });
  }
  const day = istDay();
  const flat = (await kv.zrevrange(boardKey(day, subject), 0, TOP - 1)) ?? [];

  // ZRANGE ... WITHSCORES returns [member, score, member, score, …].
  const entries: { id: string; score: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    entries.push({ id: flat[i], score: Number(flat[i + 1]) });
  }

  const names = await Promise.all(
    entries.map((e) => kv.get(`${boardNameKey(day, subject)}:${e.id}`)),
  );

  const me = await currentAccount();

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
    isYou: Boolean(me && me.id === e.id),
    paid: paidRow[i] ?? false,
  }));

  let yourRank: number | null = null;
  if (me) {
    const r = await kv.zrevrank(boardKey(day, subject), me.id);
    if (typeof r === "number") yourRank = r + 1;
  }

  return NextResponse.json({
    day,
    subject,
    ready,
    rows,
    yourRank,
    total: (await kv.zcard(boardKey(day, subject))) ?? rows.length,
    configured: true,
  });
}
