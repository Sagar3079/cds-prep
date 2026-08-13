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
 * "Has anybody taken responsibility for granting this order?", as its own key.
 *
 * A different question from "has this payment been recorded", and collapsing
 * the two is what could take money and hand back nothing. `/verify` and the
 * webhook both race to write `rzp:paid:<order>` with NX and the loser used to
 * skip the grant — but that NX write also reports a loss when the call itself
 * times out on the wire, and then a write that DID land is found by the next
 * reader, reported to the customer as confirmed, and granted by nobody: this
 * side skipped on a false loss, the webhook skipped on a true one, and
 * `rzp:paid:*` is written once and never revisited, so nothing ever retried.
 *
 * Asking the grant question separately decouples it. Whichever route runs
 * second still gets to claim the grant when the first never did, while NX
 * still guarantees exactly one of them ever holds the claim.
 *
 * It lives here rather than beside `paidKey` in `razorpay.ts` because it is an
 * entitlement's idempotency and not a gateway detail — `transferPlan` below
 * already carries the same shape of marker against the same hazard.
 */
export const grantedKey = (orderId: string) => `rzp:granted:${orderId}`;

/**
 * How long a payment record and its grant marker live. 400 days.
 *
 * The figure `analytics.ts` gives its own long-lived counters and the one
 * `transferPlan`'s `xfer:` marker already uses, so nothing new is being
 * invented. Both payment keys share it, and that they MATCH is the load-bearing
 * part: `/verify` needs no session and the signature it checks stays valid
 * forever, so the marker is the only thing between a replayed callback and a
 * second free plan. A marker that expired before the record it guards would
 * reopen exactly the double grant it exists to close.
 */
export const PAYMENT_RECORD_TTL_SEC = 400 * 86_400;

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
 * `activePlan`, for the one caller that must not confuse "there is no plan"
 * with "we could not find out".
 *
 * `kv.get` fails open: a timeout, a dropped connection and a 500 from Upstash
 * all arrive as the same `null` that a missing key does. Everywhere else that
 * is the trade this app makes on purpose. In a grant it is not, because there
 * "no existing plan" means "start counting from today" — so one unlucky read
 * during a renewal silently overwrites the twenty-five days somebody still had
 * with the thirty they just bought, logs nothing, and leaves no record of what
 * was thrown away.
 *
 * So this one reads through `kv.getStrict`, which throws on anything that is
 * not an answer. `null` from it means precisely one thing: the store replied
 * and the key is not there — no plan, or one that lapsed and was reaped, both
 * of which correctly extend from now.
 *
 * A present-but-unreadable record throws as well. It is remaining paid time
 * that EXISTS and cannot be read, which is the same harm as a failed read:
 * overwriting it would destroy both the days and the only evidence of them,
 * where failing leaves the raw value in Redis and the payment showing as
 * `ungranted` in the admin panel for somebody to look at.
 */
async function activePlanStrict(
  accountId: string,
): Promise<Entitlement | null> {
  const raw = await kv.getStrict(planKey(accountId));
  // Strictly `null`, not falsy: an empty value at this key is a corrupt record,
  // not an absent one, and it falls through to the parse below to be treated
  // as such rather than quietly reading as "this account never had a plan".
  if (raw === null) return null;
  const e = JSON.parse(raw) as Entitlement;
  if (typeof e.until !== "number") {
    throw new Error(`entitlement record for ${accountId} carries no expiry`);
  }
  return e.until > Date.now() ? e : null;
}

/**
 * Serialize read-modify-write access to one account's entitlement.
 *
 * `grantPlan` and `transferPlan` both GET the current record, compute a new
 * one, then SET it — two network round trips with nothing atomic connecting
 * them. Two grants for the SAME account that overlap in time — a webhook
 * retry landing while a fresh purchase's own `verify` call is also granting,
 * which is routine, since Razorpay's webhook typically fires within seconds of
 * the client-side confirmation — both read the same pre-grant state, and
 * whichever write lands second silently discards the first. A customer who
 * paid for two plans in quick succession could end up credited for only one.
 * This lock turns that window into a queue instead of a race.
 *
 * Built on `setIfAbsent`, a primitive already proven against this store,
 * rather than on Redis Lua scripting or `WATCH`/`MULTI` transactions — this
 * app's REST client has never exercised either, and a payment endpoint is not
 * where to first find out whether the hosting plan even allows them.
 *
 * Release is a plain `DEL`, not compare-and-delete, so there is a narrow
 * window where a holder whose section outlasts the TTL could delete a lock a
 * later caller has since acquired. That is a possible harmless double-release,
 * not a correctness problem: every section here completes in a handful of
 * Redis round trips, milliseconds against a five-second TTL, so the window
 * exists in theory and not in the traffic this app actually sees.
 */
async function withAccountLock<T>(
  accountId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockKey = `lock:entl:${accountId}`;
  /**
   * Bounded by the clock, not by a number of attempts.
   *
   * Thirty tries reads like three seconds only if every `setIfAbsent` comes
   * back promptly. Nothing makes it: `kv`'s fetch allows each call a six-second
   * `AbortSignal.timeout`, so a store that is slow rather than down turned this
   * into thirty × six ≈ three minutes spent inside a live payment request —
   * well past nginx's proxy read timeout, which turns one webhook delivery into
   * a retry landing while the first is still running, which is more contention,
   * which makes the loop slower still.
   *
   * A deadline caps the whole loop no matter how slow one call is. The honest
   * worst case is these eight seconds plus whichever call was already in flight
   * when they ran out, so ~14s rather than ~180s.
   */
  const deadline = Date.now() + 8_000;
  let acquired = false;
  while (!acquired && Date.now() < deadline) {
    acquired = await kv.setIfAbsent(lockKey, "1", 5);
    // Randomised, so two callers that collided do not line up and collide again.
    if (!acquired && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
    }
  }
  // The deadline passed and still no lock: proceed unlocked rather than hang a
  // payment confirmation indefinitely. This one call degrades to the pre-fix
  // behaviour instead of failing the request outright — a real regression
  // only under contention far beyond anything this app has ever seen.
  try {
    return await fn();
  } finally {
    if (acquired) await kv.del(lockKey);
  }
}

/**
 * Record a paid plan.
 *
 * Extends from whatever is left rather than from today, so buying a second
 * month while the first still has a week on it adds thirty days to the week
 * instead of throwing it away. Somebody who pays twice must never end up with
 * less than they paid for — which is exactly the property `withAccountLock`
 * exists to protect: without it, "extends from whatever is left" is only true
 * when the two grants happen to run one after the other.
 */
export async function grantPlan(o: {
  accountId: string;
  planId: PlanId;
  orderId: string;
}): Promise<Entitlement> {
  return withAccountLock(o.accountId, async () => {
    const plan = PLANS.find((p) => p.id === o.planId);
    const days = plan?.days ?? 0;
    /**
     * Refuse rather than guess.
     *
     * The whole "extends from whatever is left" promise above rests on this one
     * read, and a read that failed looks exactly like an account with nothing on
     * it. Proceeding on that would hand a renewing customer thirty days in place
     * of the fifty-five they should have had and destroy the old record doing
     * it, with no error and nothing left to reconcile from.
     *
     * Throwing costs far less than that. The payment is already recorded, both
     * callers hand back their grant claim when this throws so the other one can
     * try, Razorpay redelivers the webhook until it is granted, and until then
     * the payment shows in the admin panel as one whose account holds no live
     * plan. Loud and recoverable beats quiet and permanent.
     */
    let existing: Entitlement | null;
    try {
      existing = await activePlanStrict(o.accountId);
    } catch (err) {
      console.error(
        `[entitlement] grant aborted for ${o.accountId} on order ${o.orderId}: existing plan unreadable`,
        err,
      );
      throw new Error(`entitlement read failed for ${o.accountId}`);
    }
    const from = existing ? existing.until : Date.now();
    const record: Entitlement = {
      planId: o.planId,
      until: from + days * 86_400_000,
      orderId: o.orderId,
    };
    /**
     * The one write this whole function exists to make, and until now the
     * one place in it that still trusted `kv` blind. `kv.set` fails open —
     * timeout, 5xx, dropped connection all come back as the same `null` a
     * genuine success never returns — so a caller that doesn't check it can
     * tell a customer "confirmed" over a plan that was never written, then
     * hold the grant claim for 400 days with nothing left to retry it. Every
     * other write that matters in this codebase checks its result
     * (`account.ts`'s `createAnonymousAccount`, `payments/order/route.ts`'s
     * pending write); this one hadn't, and it is the most important of them.
     *
     * A non-`"OK"` result is not automatically a failure, though — the same
     * ambiguity `getStrict` exists to resolve elsewhere applies here too: the
     * response can be lost after the write actually lands. So a failed-
     * looking result gets one strict re-read before this throws, checked
     * against `record.orderId` specifically rather than merely "a plan
     * exists" — an OLDER purchase's still-live entitlement would otherwise
     * read as false success for a DIFFERENT order that never actually wrote.
     */
    const ttlSec =
      Math.ceil((record.until - Date.now()) / 1000) + 7 * 86_400;
    const wrote = await kv.setEx(
      planKey(o.accountId),
      ttlSec,
      JSON.stringify(record),
    );
    if (wrote !== "OK") {
      let confirmed: Entitlement | null;
      try {
        confirmed = await activePlanStrict(o.accountId);
      } catch (err) {
        console.error(
          `[entitlement] grant unconfirmed for ${o.accountId} on order ${o.orderId}: write result lost and re-read failed`,
          err,
        );
        throw new Error(`entitlement write unconfirmed for ${o.accountId}`);
      }
      if (confirmed?.orderId !== o.orderId) {
        console.error(
          `[entitlement] grant write failed for ${o.accountId} on order ${o.orderId}`,
        );
        throw new Error(`entitlement write failed for ${o.accountId}`);
      }
      // It landed despite the ambiguous response — proceed as a success.
    }
    return record;
  });
}

/**
 * Whether THIS specific order's grant already landed on the account.
 *
 * Called only after losing the `grantedKey` race — the marker being held
 * means either "someone else is genuinely handling it" or "someone else
 * claimed it a moment ago and hasn't finished, or failed and is about to hand
 * it back", and those two look identical from outside. A strict read failure
 * counts as unconfirmed rather than as a coin flip either way: the honest
 * answer is "cannot tell right now", and every caller treats "cannot tell"
 * the same as "not yet" — report it upward, let a webhook redelivery or the
 * sibling route's own retry settle it, rather than answering 200 on a guess.
 */
export async function grantConfirmedFor(
  accountId: string,
  orderId: string,
): Promise<boolean> {
  try {
    const current = await activePlanStrict(accountId);
    return current?.orderId === orderId;
  } catch {
    return false;
  }
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

  /**
   * Both accounts are locked, in a fixed order regardless of which is "from"
   * and which is "to". Without the fixed order, `transferPlan(A, B)` and a
   * concurrent `transferPlan(B, A)` — pathological, but the lock has to hold
   * even for cases that should never happen — would each acquire one side
   * first and wait forever on the other. Sorting by id means both calls agree
   * on which lock to take first, so one of them simply queues behind the
   * other instead of deadlocking.
   */
  const [firstId, secondId] = fromId < toId ? [fromId, toId] : [toId, fromId];
  return withAccountLock(firstId, () =>
    withAccountLock(secondId, async () => {
      // Deliberately the fail-open read: a source that cannot be read reports
      // "nothing to move", and nothing is written or deleted on the way to that
      // answer. Unlike the target read below, it destroys nothing to be wrong.
      const source = await activePlan(fromId);
      if (!source) return null;

      const marker = `xfer:${source.orderId}`;
      const won = await kv.setIfAbsent(marker, toId, PAYMENT_RECORD_TTL_SEC);
      // Already transferred — a double-submitted form, or a retry after a timeout.
      if (!won) return null;

      /**
       * The same read as `grantPlan`'s and the same hazard: `from` below
       * extends whatever the target already holds, so a failed read here writes
       * over the days that account had rather than adding to them — and by this
       * point the one-shot marker is spent, so nothing would ever put them back.
       *
       * Hand the marker back before failing. Nothing has been written yet and
       * the source plan is still on `fromId`, so a retry is a real second
       * attempt rather than a duplicate transfer.
       */
      let target: Entitlement | null;
      try {
        target = await activePlanStrict(toId);
      } catch (err) {
        await kv.del(marker);
        console.error(
          `[entitlement] transfer ${fromId} -> ${toId} aborted: target plan unreadable`,
          err,
        );
        throw new Error(`entitlement read failed for ${toId}`);
      }
      const remaining = Math.max(0, source.until - Date.now());
      const from = target ? target.until : Date.now();
      const record: Entitlement = {
        planId: source.planId,
        until: from + remaining,
        orderId: source.orderId,
      };

      /**
       * The delete below is the irreversible half of this function — the
       * one-shot marker above is already spent, so once `fromId`'s plan is
       * gone, nothing retries this. It used to run unconditionally after a
       * `kv.set` whose result nobody checked: `kv.set` fails open, so a
       * dropped response reads identically to a real write, and the delete
       * then ran anyway — the plan vanishes from BOTH accounts, no crash
       * required, just an unlucky timeout. Gating the delete on a confirmed
       * write is what the header comment already promised ("a crash between
       * the two writes leaves the plan on both accounts") — that promise only
       * held for an actual crash, not for this.
       */
      const ttlSec =
        Math.ceil((record.until - Date.now()) / 1000) + 7 * 86_400;
      const wrote = await kv.setEx(planKey(toId), ttlSec, JSON.stringify(record));
      let confirmed = wrote === "OK";
      if (!confirmed) {
        try {
          confirmed = (await activePlanStrict(toId))?.orderId === record.orderId;
        } catch (err) {
          console.error(
            `[entitlement] transfer ${fromId} -> ${toId} target write unconfirmed`,
            err,
          );
        }
      }
      if (!confirmed) {
        // Deliberately not `kv.del(marker)` here: unlike the read failure
        // above, a write of unknown outcome must not be retried blind — a
        // second attempt on top of a write that actually landed would double
        // the days on the target. This is now a case for the admin panel's
        // reconciliation view, the same as an ungranted payment.
        console.error(
          `[entitlement] transfer ${fromId} -> ${toId} aborted: source plan left in place, target unconfirmed`,
        );
        throw new Error(`entitlement transfer write failed for ${toId}`);
      }
      await kv.del(planKey(fromId));
      return record;
    }),
  );
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
