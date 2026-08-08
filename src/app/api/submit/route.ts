import { NextResponse } from "next/server";
import { readJsonCapped } from "@/lib/body";
import { PER_TEST, bankById, bankFor } from "@/lib/bank";
import { MARKING, pickDailyQuestions } from "@/lib/daily";
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
 * Only ids from the day's actual set are scored. This matters more than it
 * looks: `bankById` holds the WHOLE subject bank, so without this check a caller
 * could post fifty ids of its own choosing and be scored on all of them — and
 * since `questions.json` ships to the browser with its `answer` field intact,
 * choosing fifty correct ones costs nothing. The ceiling that comment above
 * accepted as the residual cheat ("a genuine 10/10") was not actually the
 * ceiling the code enforced; a 50/10 was. The day's set is recomputed here from
 * the same deterministic picker the client used, so the ceiling is now real.
 *
 * What this still does NOT fix, and it must be said plainly: the bank is in the
 * browser, answers included, so a determined user can read today's key before
 * answering and submit a genuine 10/10. The fix for that is to serve the day's
 * questions without answers and hand them back only after submission; until
 * that lands, this board is honest about scores but not proof against a cheat.
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

  const read = await readJsonCapped<Body>(req);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = read.value;

  const submitted = Array.isArray(body.answers) ? body.answers : null;
  // A run is `PER_TEST` questions; the slack is for a client that ever sends a
  // little more, not for a caller with something to gain. What actually bounds
  // the score is the day's-set check below — this only bounds the parsing work.
  if (!submitted || submitted.length === 0 || submitted.length > PER_TEST * 2) {
    return NextResponse.json({ error: "Nothing to score." }, { status: 400 });
  }

  const subject = toSubject(body.subject);
  // Per-subject key, not a merged one: an English question id submitted against
  // the GK board resolves to nothing and is dropped, exactly like any other
  // unknown id.
  const byId = bankById(subject);

  const day = istDay();

  /**
   * Which ten questions this run is allowed to be about.
   *
   * Recomputed here rather than trusted from the body, which is the whole point:
   * `pickDailyQuestions` is deterministic per date, so the server can derive
   * exactly what the client was shown without being told.
   *
   * Three candidate days are considered and **exactly one is used** — the one
   * the submission actually matches. Unioning them would raise the ceiling to
   * thirty questions, which is the thing this check exists to prevent; picking
   * the best match keeps it at ten.
   *
   * Why three, when the board is keyed to one IST day:
   *
   * - The client builds its set from `todayKey()`, the visitor's LOCAL calendar
   *   day. This route works in IST. Those disagree for anyone outside India —
   *   behind IST (Europe, the Americas) the client is on yesterday's date, ahead
   *   of it (Japan, Australia, NZ) it is already on tomorrow's.
   * - Even inside IST, a ten-minute test begun at 23:55 is submitted after
   *   midnight against the previous day's questions.
   *
   * Scoring any of those as zero would punish an honest candidate for where they
   * are sitting or when they started. The board entry is still claimed against
   * `day`, so first-attempt-per-IST-day is unchanged.
   */
  const idsFor = (d: string) =>
    new Set(pickDailyQuestions(bankFor(subject), d, PER_TEST).map((q) => q.id));
  const shifted = (days: number) =>
    idsFor(istDay(new Date(Date.now() + days * 86400000)));

  const submittedIds = submitted
    .map((a) => (typeof a?.id === "string" ? a.id : null))
    .filter((id): id is string => Boolean(id));
  const hits = (set: Set<string>) =>
    submittedIds.filter((id) => set.has(id)).length;

  // Today first, so an exact tie can only ever resolve in its favour.
  const allowed = [shifted(0), shifted(-1), shifted(1)].reduce((best, set) =>
    hits(set) > hits(best) ? set : best,
  );

  let correct = 0;
  let wrong = 0;
  let blank = 0;
  const seen = new Set<string>();

  for (const a of submitted) {
    if (typeof a?.id !== "string") continue;
    // Not in the day's set, unknown, or already counted — all dropped rather
    // than scored. A caller must not be able to pad a run with questions it
    // was never asked, nor with the same easy one ten times.
    if (!allowed.has(a.id)) continue;
    const q = byId.get(a.id);
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
