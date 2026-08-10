import { NextResponse } from "next/server";
import { readJsonCapped } from "@/lib/body";
import {
  ADMIN_HEADERS,
  adminConfigured,
  adminCookie,
  sameOrigin,
  signIn,
  signOut,
} from "@/lib/admin";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Exchange the admin password for a session.
 *
 * Every failure below answers the same way — one message, one status, no
 * distinction between a wrong password, an unconfigured deployment or a store
 * that would not hold the session. There is exactly one account here, so any
 * difference in the reply is a free signal about which half of the credentials
 * is wrong.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "admin:login");
  if (limited) return limited;

  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403, headers: ADMIN_HEADERS });
  }

  const deny = NextResponse.json(
    { error: "Wrong password." },
    { status: 401, headers: ADMIN_HEADERS },
  );

  if (!adminConfigured) return deny;

  const read = await readJsonCapped<{ password?: unknown }>(req);
  if (!read.ok) return deny;

  const token = await signIn(read.value.password);
  if (!token) return deny;

  const res = NextResponse.json({ ok: true }, { headers: ADMIN_HEADERS });
  res.cookies.set(adminCookie(token));
  return res;
}

/** Sign out, revoking the session in the store rather than only in the browser. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403, headers: ADMIN_HEADERS });
  }
  await signOut();
  const res = NextResponse.json({ ok: true }, { headers: ADMIN_HEADERS });
  res.cookies.set({ ...adminCookie(""), maxAge: 0 });
  return res;
}
