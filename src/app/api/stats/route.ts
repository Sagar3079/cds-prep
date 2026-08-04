import { NextResponse } from "next/server";
import { kv, kvConfigured } from "@/lib/kv";

/**
 * GET /api/stats — how many people have actually signed up.
 *
 * Exists so the landing page can show social proof that is TRUE. A hardcoded
 * "join 60+ students" is a number that is wrong the day it is written and
 * wronger every day after; this is the real one, and it grows on its own.
 *
 * Counted by scanning `acct:*`, which is one key per account. Cached hard,
 * because a landing page under ad traffic must not put a SCAN on the hot path
 * — the number moving an hour late costs nothing, a scan per visitor costs the
 * store.
 *
 * Fails soft to `null`: the page renders a line that needs no number at all if
 * this is unavailable, which is the correct behaviour for decoration on a page
 * whose job is the button.
 */

export const revalidate = 900;

/** Below this a real count is worse than no count, so the page shows a line
 *  that does not mention numbers. Raise it if the honest figure is ever
 *  embarrassing for a different reason; never fake it. */
const MEANINGFUL_AT = 50;

export async function GET() {
  if (!kvConfigured) {
    return NextResponse.json({ students: null, meaningfulAt: MEANINGFUL_AT });
  }
  try {
    let cursor = "0";
    let students = 0;
    // Bounded: a runaway loop on a public endpoint is a bill, not a bug.
    for (let page = 0; page < 20; page++) {
      const [next, keys] = await kv.scan(cursor, "acct:*", 1000);
      students += keys.length;
      cursor = next;
      if (cursor === "0") break;
    }
    return NextResponse.json(
      { students, meaningfulAt: MEANINGFUL_AT },
      { headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=3600" } },
    );
  } catch {
    return NextResponse.json({ students: null, meaningfulAt: MEANINGFUL_AT });
  }
}
