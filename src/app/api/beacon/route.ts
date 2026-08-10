import { NextResponse } from "next/server";
import { bumpAsync, type Metric } from "@/lib/analytics";
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
/**
 * The events a browser is allowed to report, and no others.
 *
 * An allowlist rather than passing the body through to `bump`, because the body
 * is attacker-controlled: without this, anyone could invent metric names and
 * write unbounded keys into the store, or inflate a number the panel presents
 * as fact. These are the funnel steps that only the client can observe — a test
 * beginning happens entirely in the browser, and a card being declined is
 * reported by Razorpay's widget to the page, never to us.
 */
const CLIENT_EVENTS = new Set([
  "test:start:daily",
  "test:start:random",
  "pay:fail",
] as const);

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

  /**
   * No body means a page view. A body naming an allowlisted event counts that
   * instead — one endpoint for every client-observed signal, so there is one
   * throttle and one place to reason about what a browser may assert.
   */
  const url = new URL(req.url);
  const event = url.searchParams.get("event");

  if (event) {
    if (!CLIENT_EVENTS.has(event as never)) {
      // Silently ignored rather than 400: a stale tab from an older deploy
      // sending a retired event name is not an error worth surfacing.
      return new NextResponse(null, { status: 204 });
    }
    bumpAsync(event as Metric);
    return new NextResponse(null, { status: 204 });
  }

  bumpAsync("visit");
  // 204: nothing to say, and nothing the caller does with the answer.
  return new NextResponse(null, { status: 204 });
}
