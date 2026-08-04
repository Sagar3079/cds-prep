import { NextResponse } from "next/server";
import { bankById } from "@/lib/bank";
import { MARKING } from "@/lib/daily";
import { kv, kvConfigured } from "@/lib/kv";
import { rateLimit } from "@/lib/ratelimit";
import { currentAccount, displayName } from "@/lib/account";
import { toSubject } from "@/lib/subject";
import { boardKey, boardNameKey, istDay } from "../leaderboard/route";

/** Two days, so a board outlives the IST day it belongs to and then goes. */
const BOARD_TTL = 2 * 86400;

interface Body {
  /** Question id and the TEXT of the option chosen — see below. */
  answers?: { id?: unknown; chose?: unknown }[];
  /** Which board this run belongs to. Unrecognised or absent means english. */
  subject?: unknown;
}

/**
 * Score a finished daily test on the server and record it on today's board.
 *
 * The client sends what it CHOSE, never what it scored. Options are shuffled
 * per run, so a chosen index is meaningless here — the answer travels as the
 * option's text and is compared against this process's own copy of the key.
 * That makes a forged score impossible: the only thing a caller can lie about
 * is which option it picked, which is just being wrong.
 *
 * What this does NOT fix, and it must be said plainly: `questions.json` is
 * still bundled into the browser with its `answer` field, so a determined user
 * can read today's key before answering and then submit a genuine 10/10. The
 * fix is to serve the day's questions without answers and hand them back only
 * after submission; until that lands, this board is honest about scores but not
 * proof against a cheat.
 *
 * One entry per account per day PER SUBJECT, first attempt only — a retake must
 * not let someone grind the same ten questions upward. The subject is part of
 * both the board key and the first-attempt claim, so an English run and a GK run
 * on the same day are two separate entries on two separate boards and neither
 * spends the other's claim.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "submit");
  if (limited) return limited;

  if (!kvConfigured) {
    return NextResponse.json({ error: "Leaderboard is not configured." }, { status: 503 });
  }
  const acct = await currentAccount();
  if (!acct) {
    return NextResponse.json({ error: "Sign in to join the leaderboard." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const submitted = Array.isArray(body.answers) ? body.answers : null;
  if (!submitted || submitted.length === 0 || submitted.length > 50) {
    return NextResponse.json({ error: "Nothing to score." }, { status: 400 });
  }

  const subject = toSubject(body.subject);
  // Per-subject key, not a merged one: an English question id submitted against
  // the GK board resolves to nothing and is dropped, exactly like any other
  // unknown id.
  const byId = bankById(subject);

  let correct = 0;
  let wrong = 0;
  let blank = 0;
  const seen = new Set<string>();

  for (const a of submitted) {
    if (typeof a?.id !== "string") continue;
    const q = byId.get(a.id);
    // Unknown ids and repeats are dropped rather than scored — a caller must
    // not be able to pad a run with the same easy question ten times.
    if (!q || seen.has(q.id) || typeof q.answer !== "number") continue;
    seen.add(q.id);

    if (typeof a.chose !== "string" || !a.chose) {
      blank++;
      continue;
    }
    const key = q.options[q.answer];
    if (typeof key === "string" && a.chose.trim() === key.trim()) correct++;
    else wrong++;
  }

  const score = correct * MARKING.correct + wrong * MARKING.wrong;
  const day = istDay();

  // First attempt of the day only, per subject. NX makes that a property of the
  // store rather than of the order requests happen to arrive in.
  const claimed = await kv.setIfAbsent(
    `done:${day}:${subject}:${acct.id}`,
    "1",
    BOARD_TTL,
  );
  if (!claimed) {
    return NextResponse.json({
      subject,
      scored: { score, correct, wrong, blank },
      onBoard: false,
      reason: "Only your first attempt each day counts on the leaderboard.",
    });
  }

  const nameKey = `${boardNameKey(day, subject)}:${acct.id}`;
  await kv.set(nameKey, displayName(acct));
  await kv.expire(nameKey, BOARD_TTL);
  await kv.zadd(boardKey(day, subject), Math.round(score * 100), acct.id);
  await kv.expire(boardKey(day, subject), BOARD_TTL);

  return NextResponse.json({
    subject,
    scored: { score, correct, wrong, blank },
    onBoard: true,
  });
}
