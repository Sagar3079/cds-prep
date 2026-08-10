import { NextResponse } from "next/server";
import { ADMIN_HEADERS, requireAdmin } from "@/lib/admin";
import { attemptsFor, listPayments, listUsers, overview } from "@/lib/adminData";

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

  return json(await overview(clamp(url.searchParams.get("days"), 30, 400)));
}
