import "server-only";

/**
 * Request bodies, read with a hard ceiling.
 *
 * Every JSON route here used to call `await req.json()` and hope. One of them —
 * `/api/log` — did try to guard itself, with
 * `Number(req.headers.get("content-length") ?? 0) > MAX`, and that check is
 * exactly as strong as the caller's honesty: `Content-Length` is absent under
 * chunked transfer-encoding, the `?? 0` turned that absence into a passing
 * score, and the unbounded body was then parsed anyway. A header cannot bound a
 * body. Only counting the bytes as they arrive can.
 *
 * So these read the stream and stop reading when the cap is passed, rather than
 * buffering everything and measuring afterwards. That matters on this
 * deployment specifically: it is a self-hosted `next start` behind nginx with no
 * platform-level payload limit in front of it, so whatever arrives is held in
 * this process's memory.
 *
 * The declared `Content-Length`, when present, is still checked first — it
 * rejects the honest oversized case before a single byte is read.
 */

export type Read<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 413; error: string };

const TOO_LARGE = "That request was too large.";
const NOT_JSON = "Expected JSON.";

/** Raw body text, capped. Use when the exact bytes matter — HMAC, mostly. */
export async function readTextCapped(
  req: Request,
  maxBytes: number,
): Promise<Read<string>> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: TOO_LARGE };
  }

  const reader = req.body?.getReader();
  if (!reader) return { ok: true, value: "" };

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        // Stop pulling. Without this the sender decides how much memory this
        // process spends, which is the whole point of the cap.
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413, error: TOO_LARGE };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: NOT_JSON };
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, value: new TextDecoder().decode(buf) };
}

/** Parsed JSON body, capped. The default for every route that takes JSON. */
export async function readJsonCapped<T>(
  req: Request,
  maxBytes = 16_000,
): Promise<Read<T>> {
  const text = await readTextCapped(req, maxBytes);
  if (!text.ok) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.value);
  } catch {
    return { ok: false, status: 400, error: NOT_JSON };
  }
  /**
   * Valid JSON is not the same thing as a body.
   *
   * The four bytes `null` parse perfectly and every caller here immediately
   * reaches for a field on what comes back, so `body.code` threw a TypeError
   * inside the handler and the route answered 500 — an unhandled crash on a
   * request that is simply malformed, from any caller who cares to send it.
   * `4`, `"x"` and `true` do the same. The cap above already decided that a
   * body this route cannot use is a 400 and not an exception, so this joins the
   * same rejection rather than inventing a second one.
   *
   * Arrays pass, deliberately: `typeof [] === "object"`, reading a named field
   * off one is `undefined` rather than a throw, and every caller then rejects
   * it on its own missing-field check.
   */
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, status: 400, error: NOT_JSON };
  }
  return { ok: true, value: parsed as T };
}
