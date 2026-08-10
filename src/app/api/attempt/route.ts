import { NextResponse } from "next/server";
import { readJsonCapped } from "@/lib/body";
import { currentAccount, displayName } from "@/lib/account";
import { recordAttempt, type Attempt } from "@/lib/attempts";
import { rateLimit } from "@/lib/ratelimit";
import { MARKING } from "@/lib/daily";

/**
 * Keep a copy of a finished test on the server.
 *
 * Distinct from `POST /api/submit`, which exists to place a row on the daily
 * leaderboard: that route re-derives the day's question set and scores it
 * server-side, refuses anything outside a three-day IST window, and spends a
 * one-attempt-per-day claim. None of that fits a random set, and posting one
 * there would score it near zero *and* burn the day's claim. So this is a
 * separate, weaker record: history, not competition.
 *
 * **Random scores are self-reported and the admin panel says so.** For a daily
 * test the server knows which ten questions were asked and cannot be lied to.
 * For a random set the selection happens in the browser (`lib/daily.ts`), so
 * there is no server-side answer key to check a claim against — the numbers
 * below are whatever the client sent. They are bounds-checked for shape, which
 * stops a malformed or absurd payload from poisoning the day's averages, and
 * that is all it stops. Making these trustworthy means moving random selection
 * server-side, which is a larger change than this one.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "attempt:save");
  if (limited) return limited;

  /**
   * No session, no record — and no error either.
   *
   * The daily test deliberately works with cookies blocked, so this will be
   * called by clients that have no account and never will. That is an expected
   * outcome, not a failure, and it must not surface as one: the score is
   * already saved locally and the user has lost nothing they can see.
   */
  const acct = await currentAccount();
  if (!acct) return NextResponse.json({ saved: false, reason: "no-session" });

  const read = await readJsonCapped<Record<string, unknown>>(req);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  const b = read.value;

  const subject = b.subject === "gk" ? "gk" : b.subject === "english" ? "english" : null;
  const mode = b.mode === "random" ? "random" : b.mode === "daily" ? "daily" : null;
  if (!subject || !mode) {
    return NextResponse.json({ error: "Bad subject or mode." }, { status: 400 });
  }

  const int = (v: unknown) =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000 ? v : null;

  const total = int(b.total);
  const correct = int(b.correct);
  const wrong = int(b.wrong);
  const blank = int(b.blank);
  if (total === null || correct === null || wrong === null || blank === null) {
    return NextResponse.json({ error: "Bad counts." }, { status: 400 });
  }

  /**
   * The counts have to describe one test. Without this a client could claim
   * forty correct out of ten and drag the day's average with it.
   */
  if (correct + wrong + blank !== total || total === 0) {
    return NextResponse.json({ error: "Counts don't add up." }, { status: 400 });
  }

  /**
   * Recompute the score from the counts rather than trusting the one sent.
   * The counts are already constrained to a consistent shape above, so this
   * makes the score a function of validated input instead of a fourth number
   * that has to agree with the other three.
   */
  const score = correct * MARKING.correct + wrong * MARKING.wrong;

  const attempt: Attempt = {
    subject,
    mode,
    score,
    correct,
    wrong,
    blank,
    total,
    at: Date.now(),
  };

  await recordAttempt(acct.id, displayName(acct), attempt);
  return NextResponse.json({ saved: true });
}
