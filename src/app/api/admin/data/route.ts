import { NextResponse } from "next/server";
import { ADMIN_HEADERS, requireAdmin } from "@/lib/admin";
import {
  attemptsFor,
  listPayments,
  listUsers,
  openOrders,
  overview,
} from "@/lib/adminData";
import { clientErrors, deployInfo, hostInfo, metricHealth } from "@/lib/health";
import { trafficSummary } from "@/lib/traffic";

/**
 * Everything the dashboard renders, behind one gate.
 *
 * One route with a `view` parameter rather than four routes, on purpose: there
 * is no middleware in this app, so authorisation is per-handler and every extra
 * handler is another chance to forget `requireAdmin()`. One entry point means
 * one gate to get right.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "overview";

  const clamp = (raw: string | null, fallback: number, max: number) => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
  };

  const json = (body: unknown) =>
    NextResponse.json(body, { headers: ADMIN_HEADERS });

  if (view === "users") {
    return json(await listUsers({ limit: clamp(url.searchParams.get("limit"), 200, 2000) }));
  }

  if (view === "payments") {
    return json(await listPayments(clamp(url.searchParams.get("limit"), 200, 2000)));
  }

  if (view === "user") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Missing id" });
    return json({ id, attempts: await attemptsFor(id, 50) });
  }

  if (view === "orders") {
    return json({ orders: await openOrders(100) });
  }

  /**
   * Health and traffic are their own views, lazily fetched when their tab is
   * opened, because both are expensive in ways the others are not: health
   * shells out to git and reads the filesystem, and traffic streams megabytes
   * of access log. Folding either into the overview would make the page that
   * polls every fifteen seconds pay for panels nobody is looking at.
   */
  if (view === "health") {
    /**
     * The overview is fetched first so the two derived metrics can be reported
     * with the same figures the rest of the dashboard shows. Without it this
     * table would vouch for a number by contradicting it.
     */
    const ov = await overview(30);
    const lastNonZero = (s: Record<string, number>) => {
      const days = Object.keys(s).sort().filter((d) => s[d] > 0);
      return days.length ? days[days.length - 1] : null;
    };
    const total = (s: Record<string, number>) =>
      Object.values(s).reduce((a, b) => a + b, 0);

    const [metrics, deploy, host, errors] = await Promise.all([
      metricHealth(30, {
        "acct:new": {
          total: total(ov.metrics["acct:new"] ?? {}),
          lastDay: lastNonZero(ov.metrics["acct:new"] ?? {}),
        },
        "pay:ok": {
          total: total(ov.metrics["pay:ok"] ?? {}),
          lastDay: lastNonZero(ov.metrics["pay:ok"] ?? {}),
        },
      }),
      deployInfo(),
      hostInfo(),
      clientErrors(30),
    ]);
    return json({ metrics, deploy, host, errors });
  }

  if (view === "traffic") {
    return json(await trafficSummary(clamp(url.searchParams.get("days"), 14, 60)));
  }

  return json(await overview(clamp(url.searchParams.get("days"), 30, 400)));
}
