import { NextResponse } from "next/server";
import { kv, kvConfigured } from "@/lib/kv";
import { rateLimit } from "@/lib/ratelimit";
import { currentAccount } from "@/lib/account";

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

export const boardKey = (day: string) => `board:${day}`;
export const boardNameKey = (day: string) => `boardnames:${day}`;

const TOP = 50;

/**
 * Today's board, highest first.
 *
 * Today only, by design and by key: the sorted set is per-day and expires, so
 * yesterday cannot leak into the ranking and the store cannot grow without
 * bound.
 */
export async function GET(req: Request) {
  const limited = await rateLimit(req, "leaderboard");
  if (limited) return limited;

  if (!kvConfigured) {
    return NextResponse.json({ day: istDay(), rows: [], configured: false });
  }
  const day = istDay();
  const flat = (await kv.zrevrange(boardKey(day), 0, TOP - 1)) ?? [];

  // ZRANGE ... WITHSCORES returns [member, score, member, score, …].
  const entries: { id: string; score: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    entries.push({ id: flat[i], score: Number(flat[i + 1]) });
  }

  const names = await Promise.all(
    entries.map((e) => kv.get(`${boardNameKey(day)}:${e.id}`)),
  );

  const me = await currentAccount();
  const rows = entries.map((e, i) => ({
    rank: i + 1,
    name: names[i] ?? "Someone",
    // Scores are stored ×100 so the sorted set stays integer-clean with the
    // −0.25 penalty in play.
    score: e.score / 100,
    isYou: Boolean(me && me.id === e.id),
  }));

  let yourRank: number | null = null;
  if (me) {
    const r = await kv.zrevrank(boardKey(day), me.id);
    if (typeof r === "number") yourRank = r + 1;
  }

  return NextResponse.json({
    day,
    rows,
    yourRank,
    total: (await kv.zcard(boardKey(day))) ?? rows.length,
    configured: true,
  });
}
