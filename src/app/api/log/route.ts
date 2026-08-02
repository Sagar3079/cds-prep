import { NextResponse } from "next/server";
import { kv, kvConfigured } from "@/lib/kv";
import { rateLimit } from "@/lib/ratelimit";

/**
 * POST /api/log — minimal, self-hosted error capture for the two client
 * error boundaries (`error.tsx`, `global-error.tsx`). No third-party
 * service: no DSN, no account, nothing beyond the Upstash store this app
 * already has via `kv.ts`.
 *
 * Privacy, stated plainly: this endpoint never receives or stores anything
 * that identifies a person — no email, no account/session cookie, no test
 * answers. Only a message, a stack trace, the route it happened on, and a
 * coarse (minute-resolution) timestamp this handler adds itself. If a field
 * is ever added that could identify someone, this comment is wrong and the
 * endpoint needs to change with it.
 *
 * Storage shape: every report is its OWN short-TTL key, not an appended
 * list. Redis expires each one on its own, so the store cannot grow without
 * bound no matter how long this runs unattended — bounded further by the
 * rate limit below, which caps how many keys one caller can even create.
 */

/** Three days: enough to notice a bug, not a place to warehouse anything. */
const TTL_SEC = 3 * 86400;
/** Well above any real payload (a few KB of message + stack); guards against
 * someone posting an oversized body to run up storage for nothing. */
const MAX_BODY_BYTES = 20_000;
const MAX_FIELD = 2000;
const MAX_ROUTE = 200;
const MAX_DIGEST = 100;

interface Body {
  message?: unknown;
  stack?: unknown;
  route?: unknown;
  digest?: unknown;
}

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, "log");
  if (limited) return limited;

  // Fail soft, same contract as everything else touching `kv.ts`: an error
  // report is a nice-to-have, and the error page must render either way.
  if (!kvConfigured) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Report too large." }, { status: 413 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const record = {
    message: clip(body.message, MAX_FIELD) ?? "(no message)",
    stack: clip(body.stack, MAX_FIELD),
    route: clip(body.route, MAX_ROUTE) ?? "(unknown route)",
    digest: clip(body.digest, MAX_DIGEST),
    // Minute resolution: enough to spot a spike or line up with a deploy,
    // too coarse to reconstruct any one person's session timeline.
    ts: Math.floor(Date.now() / 60_000) * 60_000,
  };

  const key = `errlog:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await kv.set(key, JSON.stringify(record));
  await kv.expire(key, TTL_SEC);

  return NextResponse.json({ ok: true }, { status: 200 });
}
