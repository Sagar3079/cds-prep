/**
 * The browser half of anonymous identity.
 *
 * Not `server-only` and deliberately dependency-free: this runs in the test
 * component, which is the hottest client bundle in the app.
 *
 * Why the client asks for its own session rather than middleware handing one
 * out: middleware runs on every request that reaches the origin, including the
 * uptime pingers, SEO crawlers and vulnerability scanners that make up most of
 * this site's traffic — and each one would mint a permanent account. Asking
 * from here means only something that executes JavaScript and actually opened a
 * test gets an identity.
 */

let inFlight: Promise<boolean> | null = null;
let established = false;

/**
 * Make sure we have an account, creating one if not.
 *
 * Resolves true when a session exists afterwards. False means the store was
 * unreachable, or — the case that matters — the browser refused the cookie.
 *
 * De-duplicated across concurrent callers and remembered after the first
 * success, so a test page that mounts twice does not ask twice.
 */
export async function ensureSession(): Promise<boolean> {
  if (established) return true;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch("/api/session/anon", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { ok?: boolean };
      established = Boolean(data.ok);
      return established;
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export interface AttemptPayload {
  subject: "english" | "gk";
  mode: "daily" | "random";
  correct: number;
  wrong: number;
  blank: number;
  total: number;
}

/**
 * Post a finished test to the server.
 *
 * `keepalive` because the caller redirects to /results immediately after and
 * the component unmounts — without it the browser is entitled to cancel the
 * request in flight, and the score would be lost exactly when the user is most
 * likely to look for it later.
 *
 * Never rejects and never awaited on the critical path. The authoritative copy
 * of this attempt is already in localStorage; this is the server's copy, and
 * losing one row of history is not worth making somebody wait to see their own
 * result.
 */
export function saveAttempt(payload: AttemptPayload): void {
  try {
    void fetch("/api/attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Fire and forget means forget.
  }
}
