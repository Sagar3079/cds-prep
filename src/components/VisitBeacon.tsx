"use client";

import { useEffect } from "react";

/**
 * Tells the server a person arrived. Renders nothing.
 *
 * Once per tab, guarded by a sessionStorage flag: without it, this would count
 * every client-side navigation and the "visits" figure would really be page
 * views, which is a different and much less useful number when the question is
 * how many people an ad brought.
 *
 * `sessionStorage` rather than `localStorage` on purpose — a returning visitor
 * tomorrow is a new visit, and localStorage would swallow it. It also degrades
 * correctly in the one place it matters: with storage blocked the `try` fails,
 * the beacon fires anyway, and an over-count is a better failure than a
 * silently missing visitor.
 *
 * Deliberately not tied to the session cookie. This has to work for the people
 * who never take a test — the 78% who landed and left, who are precisely the
 * ones worth counting.
 */
const FLAG = "cds-visit-counted";

export default function VisitBeacon() {
  useEffect(() => {
    let counted = false;
    try {
      counted = sessionStorage.getItem(FLAG) === "1";
      if (!counted) sessionStorage.setItem(FLAG, "1");
    } catch {
      // Storage blocked. Fall through and count — see above.
    }
    if (counted) return;

    void fetch("/api/beacon", { method: "POST", keepalive: true }).catch(() => {});
  }, []);

  return null;
}
