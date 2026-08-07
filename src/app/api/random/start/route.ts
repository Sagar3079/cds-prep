import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/account";
import { consumeRandom } from "@/lib/entitlement";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Spend one free random test, or none when a plan is active.
 *
 * Called as a run BEGINS, not when the page renders: a render is not a promise
 * that a test will be taken, and charging an allowance for opening a page and
 * changing your mind is the kind of thing people remember.
 *
 * This is an allowance, not a security boundary, and it is worth being plain
 * about why. The question bank ships to the browser, so somebody determined can
 * assemble a random set without asking this endpoint at all. What this stops is
 * ordinary unlimited use through the app's own UI, which is what the plan
 * actually sells. Closing the other hole means moving question delivery to the
 * server, which is a different and much larger change.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "random:start");
  if (limited) return limited;

  const acct = await currentAccount();
  const result = await consumeRandom(acct);

  if (!result.ok) {
    return NextResponse.json(
      {
        allowed: false,
        reason: result.reason,
        error:
          result.reason === "signed-out"
            ? "Sign in to take random tests."
            : "You've used today's free random tests.",
      },
      { status: result.reason === "signed-out" ? 401 : 402 },
    );
  }

  return NextResponse.json({
    allowed: true,
    used: result.used,
    limit: result.limit,
    plan: result.plan ? { planId: result.plan.planId, until: result.plan.until } : null,
  });
}
