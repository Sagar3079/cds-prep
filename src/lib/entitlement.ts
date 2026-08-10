import "server-only";
import { createHash } from "node:crypto";
import { kv } from "./kv";
import {
  FREE_RANDOM_PER_DAY,
  FREE_RANDOM_PER_IP_PER_DAY,
  PLANS,
  type PlanId,
} from "./legal";
import type { Account } from "./account";

/**
 * Who may take a random test, and how many they have left.
 *
 * Two separate things decide it, and they are deliberately not merged. A free
 * allowance is a COUNT that resets every day; a plan is a DATE that either has
 * or has not passed. Collapsing them into one "credits" number was the obvious
 * first design and it is wrong: a plan holder who has used their two free runs
 * would then be blocked, and a refund would have to unpick arithmetic instead
 * of clearing one key.
 *
 * The daily test is untouched by all of this and stays free forever — this
 * governs `?mode=random` only.
 */

export { FREE_RANDOM_PER_DAY };

const usageKey = (accountId: string, day: string) => `rq:${accountId}:${day}`;
const planKey = (accountId: string) => `entl:${accountId}`;

/**
 * The calendar day, in IST.
 *
 * `toISOString().slice(0,10)` is a bug here for the same reason `storage.ts`
 * says so on the client: the server's clock is UTC, candidates are in India,
 * and before 05:30 IST a UTC date rolls the allowance over half a day early.
 * Fixed offset rather than a timezone database because India has no DST.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export function istDayKey(now = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export interface Entitlement {
  planId: PlanId;
  /** Epoch ms. Access ends here. */
  until: number;
  orderId: string;
}

/** The live plan, or null. An expired record is treated as absent. */
export async function activePlan(
  accountId: string,
): Promise<Entitlement | null> {
  const raw = await kv.get(planKey(accountId));
  if (!raw) return null;
  try {
    const e = JSON.parse(raw) as Entitlement;
    return e.until > Date.now() ? e : null;
  } catch {
    return null;
  }
}

/**
 * Record a paid plan.
 *
 * Extends from whatever is left rather than from today, so buying a second
 * month while the first still has a week on it adds thirty days to the week
 * instead of throwing it away. Somebody who pays twice must never end up with
 * less than they paid for.
 */
export async function grantPlan(o: {
  accountId: string;
  planId: PlanId;
  orderId: string;
}): Promise<Entitlement> {
  const plan = PLANS.find((p) => p.id === o.planId);
  const days = plan?.days ?? 0;
  const existing = await activePlan(o.accountId);
  const from = existing ? existing.until : Date.now();
  const record: Entitlement = {
    planId: o.planId,
    until: from + days * 86_400_000,
    orderId: o.orderId,
  };
  await kv.set(planKey(o.accountId), JSON.stringify(record));
  // TTL a week past expiry: the record is worth reading for a few days after
  // it lapses (support asking "what did they buy?") and worth nothing forever.
  await kv.expire(
    planKey(o.accountId),
    Math.ceil((record.until - Date.now()) / 1000) + 7 * 86_400,
  );
  return record;
}

/**
 * Move a plan from one account to another, once.
 *
 * The case: somebody paid anonymously, then bound an address that already had
 * an account. They sign in as the older account and their plan is on the newer
 * one — the exact outcome the bind prompt exists to prevent.
 *
 * Why this is not just `grantPlan(to)`: `grantPlan` *extends* from whatever the
 * target already has, and the only thing standing between a payment and a
 * double grant anywhere in this app is the NX write on `rzp:paid:<orderId>`,
 * which was already consumed when the payment was first recorded. Calling it a
 * second time for the same order would hand out the days twice. So the transfer
 * carries its own one-shot marker, keyed by order, and the days moved are the
 * days remaining rather than a fresh grant of the plan's full length.
 *
 * The source record is deleted last. A crash between the two writes leaves the
 * plan on both accounts, which costs one duplicated entitlement; the other
 * order leaves it on neither, which costs a customer their purchase.
 */
export async function transferPlan(
  fromId: string,
  toId: string,
): Promise<Entitlement | null> {
  if (fromId === toId) return null;
  const source = await activePlan(fromId);
  if (!source) return null;

  const marker = `xfer:${source.orderId}`;
  const won = await kv.setIfAbsent(marker, toId, 400 * 86_400);
  // Already transferred — a double-submitted form, or a retry after a timeout.
  if (!won) return null;

  const target = await activePlan(toId);
  const remaining = Math.max(0, source.until - Date.now());
  const from = target ? target.until : Date.now();
  const record: Entitlement = {
    planId: source.planId,
    until: from + remaining,
    orderId: source.orderId,
  };

  await kv.set(planKey(toId), JSON.stringify(record));
  await kv.expire(
    planKey(toId),
    Math.ceil((record.until - Date.now()) / 1000) + 7 * 86_400,
  );
  await kv.del(planKey(fromId));
  return record;
}

export interface RandomAccess {
  allowed: boolean;
  /** Why not, when `allowed` is false. */
  reason: "signed-out" | "used-up" | null;
  used: number;
  limit: number;
  plan: Entitlement | null;
}

/**
 * Read-only: what would happen if they started a random test now.
 *
 * Never consumes anything, because this is what the page render calls and a
 * render is not a promise that a test will be taken — React may render twice, a
 * prefetch may render it with nobody looking, and a person may open the page
 * and change their mind. `consumeRandom` is the one that costs an allowance,
 * and it is called when a run actually begins.
 */
export async function randomAccess(
  acct: Account | null,
): Promise<RandomAccess> {
  const limit = FREE_RANDOM_PER_DAY;
  if (!acct) {
    return { allowed: false, reason: "signed-out", used: 0, limit, plan: null };
  }
  const plan = await activePlan(acct.id);
  if (plan) {
    return { allowed: true, reason: null, used: 0, limit, plan };
  }
  const raw = await kv.get(usageKey(acct.id, istDayKey()));
  const used = Number(raw ?? 0) || 0;
  return used < limit
    ? { allowed: true, reason: null, used, limit, plan: null }
    : { allowed: false, reason: "used-up", used, limit, plan: null };
}

export type ConsumeResult =
  | { ok: true; used: number; limit: number; plan: Entitlement | null }
  | { ok: false; reason: "signed-out" | "used-up" };

/**
 * Spend one free run, or none if a plan is active.
 *
 * INCR first, then compare — not read-then-write. Two tabs pressing Begin at
 * the same moment both read `1`, both decide there is room, and both start:
 * the check has to be the same atomic operation as the increment. Over the
 * limit, the count is left where it is rather than decremented, because
 * decrementing reintroduces exactly the race this avoids.
 *
 * `kv` fails open and returns null when Redis is unreachable, so `n` is null
 * and this ALLOWS the run. That is the deliberate trade this codebase makes
 * everywhere: a store outage must not stop somebody practising, and the cost is
 * an uncounted free test during an outage.
 */
export async function consumeRandom(
  acct: Account | null,
  ip?: string,
): Promise<ConsumeResult> {
  if (!acct) return { ok: false, reason: "signed-out" };

  const plan = await activePlan(acct.id);
  if (plan) return { ok: true, used: 0, limit: FREE_RANDOM_PER_DAY, plan };

  const day = istDayKey();
  const key = usageKey(acct.id, day);
  const n = await kv.incr(key);
  if (n === null) {
    return { ok: true, used: 0, limit: FREE_RANDOM_PER_DAY, plan: null };
  }
  // Only on the first increment of the day, so a later one cannot push the
  // reset further out and hand somebody a rolling window.
  if (n === 1) await kv.expire(key, 2 * 86_400);

  if (n > FREE_RANDOM_PER_DAY) return { ok: false, reason: "used-up" };

  /**
   * The backstop behind the per-account allowance.
   *
   * The per-account count above is now worth very little on its own: an account
   * costs one cookie, and clearing cookies mints a new one with a fresh two
   * free runs. Nothing can stop a browser clearing its own storage — so the
   * only allowance that survives it is one keyed to something the visitor does
   * not control, and their address is the only such thing available here.
   *
   * Checked AFTER the per-account increment, so the cheap and correct case
   * costs one extra command and never blocks. The IP ceiling is deliberately
   * several times the per-account one: a coaching centre or a hostel behind a
   * single NAT'd address is the normal case in this market, not the abusive
   * one, and the number that matters is the one that makes cookie-clearing
   * pointless rather than the one that makes sharing a network painful. It
   * bites the person on their ninth run of the day, and nobody reaches nine by
   * accident.
   *
   * Fails open, like everything else that touches this store: `kv.incr`
   * returns null when Redis is unreachable and the run is allowed. An outage
   * must not stop somebody practising.
   */
  if (ip && ip !== "unknown") {
    const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 24);
    const ipKey = `rqip:${ipHash}:${day}`;
    const m = await kv.incr(ipKey);
    if (m !== null) {
      if (m === 1) await kv.expire(ipKey, 2 * 86_400);
      if (m > FREE_RANDOM_PER_IP_PER_DAY) return { ok: false, reason: "used-up" };
    }
  }

  return { ok: true, used: n, limit: FREE_RANDOM_PER_DAY, plan: null };
}
