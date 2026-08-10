import { NextResponse } from "next/server";
import { bumpAsync } from "@/lib/analytics";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Count a visit.
 *
 * The top of the funnel, and the only number here that is not derived from
 * something a user did on purpose. It exists because the question this panel
 * was built to answer — an ad ran, did anybody arrive and did anybody stay —
 * needs both halves, and the app records the second half only.
 *
 * Counted from the browser rather than in a layout or middleware, and the
 * distinction is the whole value of the figure. Server-side counting would
 * include every scanner spraying `/wp-admin`, every uptime pinger, and the
 * vulnerability traffic that is most of what reaches this origin — which is
 * exactly the traffic nginx's logs already show and nobody needs counted twice.
 * What this measures is browsers that ran JavaScript, which is the closest
 * cheap approximation of a person.
 *
 * Fired once per tab (the client holds a sessionStorage flag), so this counts
 * sessions rather than page views. No body, no identity, nothing stored per
 * caller — a single INCR on a day bucket.
 */
export async function POST(req: Request) {
  /**
   * Reuses the leaderboard bucket rather than adding a twelfth.
   *
   * The throttle here is not protecting anything sensitive; it is stopping one
   * script from inflating a chart. Any generous per-IP window does that, and a
   * dedicated bucket would cost a Redis key family for no additional property.
   */
  const limited = await rateLimit(req, "leaderboard");
  if (limited) return limited;

  bumpAsync("visit");
  // 204: nothing to say, and nothing the caller does with the answer.
  return new NextResponse(null, { status: 204 });
}
