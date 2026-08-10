"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./admin.module.css";
import {
  BarList,
  Bars,
  Funnel,
  HourStrip,
  Panel,
  Stat,
  TrustTag,
  ago,
  duration,
  rupees,
  sum,
  tail,
  when,
  type Trust,
} from "./parts";

/**
 * The dashboard.
 *
 * Client-rendered against `/api/admin/data` because it polls; a server
 * component would have to re-render the route to refresh a number.
 *
 * Two rules shape everything here.
 *
 * **Every number says where it came from.** The panel once showed "0 tests in
 * 30 days" for a metric nothing had ever written, which is indistinguishable on
 * screen from nobody taking a test — and those call for opposite responses. So
 * counters carry a trust tag, and a metric with no writer says so instead of
 * rendering a confident zero.
 *
 * **Counts, not percentages.** At one payment and a few hundred arrivals every
 * rate rounds to 0%, and the first real customer would not move it.
 *
 * Tabs fetch their own data on first open. Traffic streams megabytes of access
 * log and Health shells out to git, so folding either into the fifteen-second
 * poll would make everyone pay for a panel nobody is looking at.
 */

interface Overview {
  configured: boolean;
  days: string[];
  metrics: Record<string, Record<string, number>>;
  averages: { english: Record<string, number>; gk: Record<string, number> };
  totals: {
    accounts: number;
    anonymous: number;
    bound: number;
    accountsComplete: boolean;
    payments: number;
    revenuePaise: number;
    abandonedOrders: number;
    orphanedPayments: number;
    ungrantedPayments: number;
  };
  recent: {
    accountId: string;
    name: string;
    subject: string;
    mode: string;
    score: number;
    correct: number;
    wrong: number;
    blank: number;
    total: number;
    at: number;
  }[];
  payments: {
    orderId: string;
    paymentId: string | null;
    planId: string | null;
    paise: number;
    accountId: string | null;
    paidAt: number;
    via: string | null;
    orphaned: boolean;
    ungranted: boolean;
  }[];
}

interface UsersView {
  items: {
    id: string;
    name: string;
    email: string | null;
    emailVerified: boolean;
    anonymous: boolean;
    generatedName: boolean;
    createdAt: number;
    plan: { planId: string; until: number } | null;
  }[];
  complete: boolean;
  scanned: number;
  anonymous: number;
  bound: number;
}

interface TrafficView {
  visitorsByDay: Record<string, number>;
  sources: { source: string; visitors: number }[];
  landingPages: { path: string; visitors: number }[];
  byHour: number[];
  devices: { device: string; visitors: number }[];
  browsers: { browser: string; visitors: number }[];
  funnel: { step: string; visitors: number }[];
  errors: { status: number; path: string; count: number }[];
  totals: {
    requests: number;
    humanPageViews: number;
    visitors: number;
    botRequests: number;
    bounced: number;
    foreignHostRequests: number;
  };
  meta: { files: number; bytes: number; parsedMs: number; from: string; to: string };
}

interface HealthView {
  metrics: {
    metric: string;
    source: string;
    trust: Trust;
    everWritten: boolean;
    lastDay: string | null;
    total30d: number;
  }[];
  deploy: {
    liveSlot: string | null;
    liveCommit: string | null;
    head: string | null;
    headSubject: string | null;
    drifted: boolean;
    dirtyFiles: number;
    unpushed: number;
    buildAgeMs: number | null;
    uptimeSec: number | null;
    rssMb: number | null;
    upstreamPort: string | null;
  };
  host: {
    tlsDaysLeft: number | null;
    tlsExpires: string | null;
    diskFreeGb: number | null;
    diskTotalGb: number | null;
    memFreeMb: number | null;
    memTotalMb: number | null;
    load1: number;
    cores: number;
    storeKeys: number | null;
    storeMemoryMb: number | null;
  };
  errors: {
    key: string;
    message: string;
    route: string;
    stack?: string;
    ts: number;
    synthetic: boolean;
  }[];
}

interface OrdersView {
  orders: {
    orderId: string;
    planId: string | null;
    paise: number;
    accountId: string | null;
    createdAt: number;
    ttlSec: number | null;
    accountExists: boolean;
  }[];
}

type Tab = "now" | "traffic" | "money" | "product" | "health";
const TABS: { id: Tab; label: string }[] = [
  { id: "now", label: "Now" },
  { id: "traffic", label: "Traffic" },
  { id: "money", label: "Money" },
  { id: "product", label: "Product" },
  { id: "health", label: "Health" },
];

/** Trust for each counter, mirroring `lib/health.ts` so the fold can tag rows. */
const TRUST: Record<string, Trust> = {
  visit: "reconstructed",
  "acct:new": "derived",
  "pay:ok": "derived",
  "test:start:daily": "measured",
  "test:start:random": "measured",
  "test:done:daily": "measured",
  "test:done:random": "measured",
  "pay:order": "measured",
  "pay:fail": "measured",
  "bind:ok": "measured",
  "restore:ok": "measured",
};

const mean = (s: Record<string, number>) => {
  const vals = Object.values(s).filter((v) => v !== 0);
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
};

export default function AdminClient() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UsersView | null>(null);
  const [traffic, setTraffic] = useState<TrafficView | null>(null);
  const [health, setHealth] = useState<HealthView | null>(null);
  const [orders, setOrders] = useState<OrdersView | null>(null);
  const [loadingTab, setLoadingTab] = useState<Tab | null>(null);

  const [tab, setTab] = useState<Tab>("now");
  const [live, setLive] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [hideFixtures, setHideFixtures] = useState(true);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const get = useCallback(async (view: string, extra = "") => {
    const res = await fetch(`/api/admin/data?view=${view}${extra}`, { cache: "no-store" });
    if (res.status === 404) {
      setAuthed(false);
      return null;
    }
    if (!res.ok) return null;
    return res.json();
  }, []);

  const load = useCallback(async () => {
    const d = (await get("overview", "&days=30")) as Overview | null;
    if (!d) return;
    setData(d);
    setAuthed(true);
    setFetchedAt(Date.now());
  }, [get]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Each tab fetches once, on first open — and each RESOURCE retries
   * independently, which the money tab's two resources need in particular.
   *
   * `users` and `orders` load in parallel, and they used to share one guard,
   * `!users`. If `orders` failed transiently while `users` succeeded, `users`
   * becoming non-null retired the guard for BOTH — the orders panel was stuck
   * with no data and no way to recover short of a full page reload. The guard
   * is now `!users || !orders`, and only the piece still missing is actually
   * re-requested, so a transient failure on one resource does not force the
   * other to load again for nothing.
   */
  useEffect(() => {
    if (authed !== true) return;
    void (async () => {
      if (tab === "money" && (!users || !orders)) {
        setLoadingTab("money");
        const [u, o] = await Promise.all([
          users ? Promise.resolve(null) : get("users", "&limit=500"),
          orders ? Promise.resolve(null) : get("orders"),
        ]);
        if (u) setUsers(u as UsersView);
        if (o) setOrders(o as OrdersView);
        // Clear only if this load is still the one the user is looking at.
        // Three loaders write the same `loadingTab` flag, and switching tabs
        // before one resolves used to let a late-arriving OTHER tab's fetch
        // clear the indicator for whichever tab is now on screen — flashing
        // "no data" over a tab that is, in fact, still loading.
        setLoadingTab((cur) => (cur === "money" ? null : cur));
      }
      if (tab === "traffic" && !traffic) {
        setLoadingTab("traffic");
        const t = await get("traffic", "&days=14");
        if (t) setTraffic(t as TrafficView);
        setLoadingTab((cur) => (cur === "traffic" ? null : cur));
      }
      if (tab === "health" && !health) {
        setLoadingTab("health");
        const h = await get("health");
        if (h) setHealth(h as HealthView);
        setLoadingTab((cur) => (cur === "health" ? null : cur));
      }
    })();
  }, [tab, authed, users, orders, traffic, health, get]);

  useEffect(() => {
    if (!authed || !live) return;
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    timer.current = setInterval(tick, 15000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [authed, live, load]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          res.status === 401
            ? "Wrong password."
            : `Sign-in failed (${res.status}). ${d.error ?? ""}`.trim(),
        );
        return;
      }
      setPassword("");
      await load();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    setAuthed(false);
    setData(null);
    setUsers(null);
    setTraffic(null);
    setHealth(null);
    setOrders(null);
  };

  if (authed === null) return <div className={styles.loading}>Loading…</div>;

  if (!authed) {
    return (
      <div className={styles.gate}>
        <form className={styles.gateCard} onSubmit={signIn}>
          <h1>CDS Prep</h1>
          <p>Enter the admin password.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Password"
            aria-label="Admin password"
          />
          {error ? <p className={styles.gateError}>{error}</p> : null}
          <button type="submit" disabled={busy || password.length === 0}>
            {busy ? "Checking…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  const t = data?.totals;
  const m = data?.metrics ?? {};

  const arrivals30 = sum(m["visit"]);
  const testsFinished = sum(m["test:done:daily"]) + sum(m["test:done:random"]);
  const testsStarted = sum(m["test:start:daily"]) + sum(m["test:start:random"]);
  const unresolved = (t?.orphanedPayments ?? 0) + (t?.ungrantedPayments ?? 0);

  /**
   * What is wrong right now, in priority order, rendered only when non-empty.
   * A banner that is always on screen becomes furniture, and furniture is not
   * read.
   */
  const flags: { severity: "bad" | "warn"; text: string }[] = [];
  if (t && t.orphanedPayments > 0) {
    flags.push({
      severity: "bad",
      text: `${t.orphanedPayments} payment(s) taken with no account attached — money received for access that could never be granted. See Money.`,
    });
  }
  if (t && t.ungrantedPayments > 0) {
    flags.push({
      severity: "bad",
      text: `${t.ungrantedPayments} payment(s) belong to an account holding no live plan. Either it expired, or it never arrived.`,
    });
  }
  if (health?.deploy.drifted) {
    flags.push({
      severity: "warn",
      text: `The running build is not the current checkout — live is ${health.deploy.liveCommit?.slice(0, 7)}, HEAD is ${health.deploy.head?.slice(0, 7)}. Anything instrumented since the live build will read zero.`,
    });
  }
  if (data && !data.configured) {
    flags.push({
      severity: "bad",
      text: "The data store is unreachable, so every figure below is empty for that reason rather than because nothing happened.",
    });
  }
  if (t && !t.accountsComplete) {
    flags.push({
      severity: "warn",
      text: "The account scan hit its page ceiling — account totals are a floor, not a count.",
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <h1>CDS Prep — admin</h1>
            <p className={styles.sub}>
              {fetchedAt ? `Updated ${ago(fetchedAt)}` : "—"}
              {" · "}
              <button className={styles.linkBtn} onClick={() => void load()}>
                Refresh
              </button>
              {" · "}
              <label className={styles.liveToggle}>
                <input
                  type="checkbox"
                  checked={live}
                  onChange={(e) => setLive(e.target.checked)}
                />
                Live (15s)
              </label>
              {health?.deploy ? (
                <>
                  {" · "}
                  <span
                    className={styles.slotTag}
                    data-drift={health.deploy.drifted ? "" : undefined}
                    title={`Slot ${health.deploy.liveSlot} on port ${health.deploy.upstreamPort}, built from ${health.deploy.liveCommit?.slice(0, 7)}`}
                  >
                    slot {health.deploy.liveSlot} · {health.deploy.liveCommit?.slice(0, 7)}
                    {health.deploy.drifted ? " · DRIFTED" : ""}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <button className={styles.signOut} onClick={() => void signOut()}>
            Sign out
          </button>
        </header>

        {flags.length > 0 ? (
          <div className={styles.flags}>
            {flags.map((f) => (
              <p
                key={f.text}
                className={f.severity === "bad" ? styles.bannerWarn : styles.banner}
              >
                {f.text}
              </p>
            ))}
          </div>
        ) : null}

        {/*
          The fold: the one number this business turns on, then the money.
          Activation is a raw fraction because at this scale every percentage
          rounds to zero and the first real customer would not move it.
        */}
        <section className={styles.hero}>
          <div className={styles.heroMain}>
            <div className={styles.heroValue}>
              {testsFinished}
              <span className={styles.heroSlash}>/</span>
              {arrivals30.toLocaleString("en-IN")}
            </div>
            <div className={styles.heroLabel}>
              Arrivals who finished a test · 30 days
              <TrustTag trust="reconstructed" />
            </div>
            <div className={styles.heroHint}>
              {testsStarted > 0
                ? `${testsStarted} started, ${testsFinished} finished — ${testsStarted - testsFinished} walked out mid-test.`
                : "Nothing has started a test in this window. If that looks wrong, check Health — a metric with no writer reads zero for the same reason as one nobody triggered."}
            </div>
          </div>
          <div className={styles.heroSide}>
            <Stat
              label="Revenue, all time"
              value={rupees(t?.revenuePaise ?? 0)}
              hint={`${t?.payments ?? 0} payment(s)`}
              trust="derived"
            />
            <Stat
              label="Unresolved payments"
              value={unresolved}
              hint="paid, no live plan"
              tone={unresolved > 0 ? "warn" : undefined}
              trust="derived"
            />
            <Stat
              label="Open orders"
              value={t?.abandonedOrders ?? 0}
              hint="started, unpaid · 7-day window"
              trust="derived"
            />
          </div>
        </section>

        <nav className={styles.tabs}>
          {TABS.map((k) => (
            <button
              key={k.id}
              data-active={tab === k.id ? "" : undefined}
              onClick={() => setTab(k.id)}
            >
              {k.label}
            </button>
          ))}
        </nav>

        {/* ------------------------------------------------------------ NOW */}
        {tab === "now" && data ? (
          <>
            <section className={styles.charts}>
              <Bars data={tail(m["visit"], 30)} label="Arrivals / day" trust={TRUST["visit"]} />
              <Bars data={tail(m["acct:new"], 30)} label="New accounts / day" trust={TRUST["acct:new"]} />
              <Bars data={tail(m["test:done:daily"], 30)} label="Daily tests finished" trust={TRUST["test:done:daily"]} />
              <Bars data={tail(m["pay:ok"], 30)} label="Payments / day" trust={TRUST["pay:ok"]} />
            </section>

            <Panel
              title="Recent activity"
              subtitle="Every finished test, newest first. Every row here is self-reported by the browser — this feed shape-checks that the counts add up but does not re-verify a daily submission against that day's real answer key the way the leaderboard does. Random rows are additionally unverifiable in principle: a random set is chosen client-side, so there is no server-side answer key to check them against at all."
            >
              {data.recent.length === 0 ? (
                <p className={styles.empty}>
                  No tests recorded yet. Arrivals, accounts and payments above reach back
                  through your history; finished tests are the one thing that cannot be
                  recovered, because nothing wrote one down before auto-save shipped.
                </p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Who</th>
                        <th>Subject</th>
                        <th>Mode</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((r, i) => (
                        <tr key={`${r.accountId}-${r.at}-${i}`}>
                          <td className={styles.dim} title={when(r.at)}>
                            {ago(r.at)}
                          </td>
                          <td>{r.name}</td>
                          <td>{r.subject === "gk" ? "GK" : "English"}</td>
                          <td>
                            {r.mode}
                            {/*
                              Every row this table shows comes from
                              POST /api/attempt, which shape-checks a
                              submission but never re-derives the real
                              question set — so this applies to daily rows
                              exactly as much as random ones. It used to show
                              only on random, which correctly said random is
                              unverifiable but wrongly implied daily here
                              was checked against something.
                            */}
                            <span
                              className={styles.tag}
                              title={
                                r.mode === "random"
                                  ? "Random sets are chosen in the browser — no server-side answer key exists to check this against, even in principle."
                                  : "Shape-checked (the counts add up) but not re-verified against that day's real answer key."
                              }
                            >
                              self-reported
                            </span>
                          </td>
                          <td>
                            {r.score} / {r.total}
                            <span className={styles.dim}>
                              {" "}
                              ({r.correct}✓ {r.wrong}✗ {r.blank}–)
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        ) : null}

        {/* -------------------------------------------------------- TRAFFIC */}
        {tab === "traffic" ? (
          !traffic ? (
            <Panel title="Traffic">
              <p className={styles.empty}>
                {loadingTab === "traffic" ? "Reading access logs…" : "No traffic data."}
              </p>
            </Panel>
          ) : (
            <>
              <section className={styles.stats}>
                <Stat
                  label="Visitors"
                  value={traffic.totals.visitors.toLocaleString("en-IN")}
                  hint={`${traffic.meta.from} → ${traffic.meta.to}`}
                  trust="reconstructed"
                />
                <Stat
                  label="Page views"
                  value={traffic.totals.humanPageViews.toLocaleString("en-IN")}
                  hint="prefetches excluded"
                  trust="reconstructed"
                />
                <Stat
                  label="Saw one page and left"
                  value={traffic.totals.bounced.toLocaleString("en-IN")}
                  hint={`of ${traffic.totals.visitors.toLocaleString("en-IN")} visitors`}
                  tone={
                    traffic.totals.bounced > traffic.totals.visitors * 0.7 ? "warn" : undefined
                  }
                  trust="reconstructed"
                />
                <Stat
                  label="Bot &amp; scanner requests"
                  value={(
                    traffic.totals.botRequests + traffic.totals.foreignHostRequests
                  ).toLocaleString("en-IN")}
                  hint={`of ${traffic.totals.requests.toLocaleString("en-IN")} total · ${traffic.totals.foreignHostRequests.toLocaleString("en-IN")} aimed at the bare IP`}
                  trust="reconstructed"
                />
              </section>

              <Panel
                title="Where they land, and how far they get"
                subtitle="Hard page loads only. Clicking a link inside the app does not reach the server, so a step reading zero means nobody loaded that page fresh — not that nobody got there."
              >
                <Funnel
                  steps={traffic.funnel.map((f) => ({
                    ...f,
                    trust: "reconstructed" as Trust,
                  }))}
                />
              </Panel>

              <div className={styles.twoUp}>
                <Panel title="Where they came from">
                  <BarList
                    rows={traffic.sources.map((s) => ({ label: s.source, value: s.visitors }))}
                  />
                </Panel>
                <Panel title="First page seen">
                  <BarList
                    rows={traffic.landingPages.map((s) => ({ label: s.path, value: s.visitors }))}
                  />
                </Panel>
              </div>

              <div className={styles.twoUp}>
                <Panel
                  title="When they arrive (IST)"
                  subtitle="Page views by hour of day — the input for ad scheduling."
                >
                  <HourStrip byHour={traffic.byHour} />
                </Panel>
                <Panel title="What they are using">
                  <BarList
                    rows={traffic.browsers.map((s) => ({ label: s.browser, value: s.visitors }))}
                  />
                </Panel>
              </div>

              <Panel
                title="Broken pages"
                subtitle="Failures the app actually produced. Excluded: scanner probes for /wp-admin and /.env, and requests aimed at the bare IP rather than the domain — nginx answers those before they reach the app, so a 404 on a page that plainly works is not a fault."
              >
                {traffic.errors.length === 0 ? (
                  <p className={styles.empty}>No errors on real routes.</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Path</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {traffic.errors.map((e) => (
                          <tr key={`${e.status}-${e.path}`}>
                            <td className={e.status >= 500 ? styles.warn : undefined}>
                              {e.status}
                            </td>
                            <td className={styles.mono}>{e.path}</td>
                            <td>{e.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <p className={styles.footnote}>
                Read {traffic.meta.files} log file(s), {(traffic.meta.bytes / 1e6).toFixed(1)} MB,
                in {traffic.meta.parsedMs} ms. Cached five minutes. A visitor here is a distinct
                network address: several people on one wifi count as one, and one person on two
                networks counts as two.
              </p>
            </>
          )
        ) : null}

        {/* ---------------------------------------------------------- MONEY */}
        {tab === "money" && data ? (
          <>
            <Panel
              title="Every payment, and whether it was honoured"
              subtitle="The join between money received and access granted. Read-only by design — the paid record is the guard against granting one plan twice, so this surface never writes to it."
            >
              {data.payments.length === 0 ? (
                <p className={styles.empty}>No payments recorded.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Amount</th>
                        <th>Plan</th>
                        <th>Account</th>
                        <th>State</th>
                        <th>Via</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((p) => (
                        <tr key={p.orderId} data-warn={p.orphaned || p.ungranted ? "" : undefined}>
                          <td className={styles.dim}>{when(p.paidAt)}</td>
                          <td>{rupees(p.paise)}</td>
                          <td>{p.planId ?? "—"}</td>
                          <td className={styles.mono}>
                            {p.accountId ?? <span className={styles.warn}>none</span>}
                          </td>
                          <td>
                            {p.orphaned ? (
                              <span className={styles.warn}>no account — cannot be granted</span>
                            ) : p.ungranted ? (
                              <span className={styles.warn}>no live plan</span>
                            ) : (
                              <span className={styles.good}>granted</span>
                            )}
                          </td>
                          <td className={styles.dim}>{p.via ?? "verify"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel
              title="Started checkout, never paid"
              subtitle="Invisible in the table above by construction — an unpaid order has no payment record to be found under. These expire after seven days, so the evidence deletes itself."
            >
              {!orders ? (
                <p className={styles.empty}>{loadingTab === "money" ? "Loading…" : "—"}</p>
              ) : orders.orders.length === 0 ? (
                <p className={styles.empty}>No open orders.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Started</th>
                        <th>Plan</th>
                        <th>Amount</th>
                        <th>Account</th>
                        <th>Expires in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.orders.map((o) => (
                        <tr
                          key={o.orderId}
                          data-warn={o.accountId && !o.accountExists ? "" : undefined}
                        >
                          <td className={styles.dim} title={when(o.createdAt)}>
                            {ago(o.createdAt)}
                          </td>
                          <td>{o.planId ?? "—"}</td>
                          <td>{rupees(o.paise)}</td>
                          <td className={styles.mono}>
                            {!o.accountId ? (
                              <span className={styles.warn}>none</span>
                            ) : o.accountExists ? (
                              o.accountId
                            ) : (
                              <span
                                className={styles.warn}
                                title="This order names an account that no longer exists. If it were paid, the plan could not be granted to anyone."
                              >
                                {o.accountId} — gone
                              </span>
                            )}
                          </td>
                          <td className={styles.dim}>
                            {o.ttlSec == null
                              ? "—"
                              : o.ttlSec < 0
                                ? "no expiry"
                                : `${Math.round(o.ttlSec / 3600)}h`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel
              title="People"
              subtitle="Emails stay hidden until asked for — the rest of the app never shows one in full, and a dashboard printing them all by default would undo that on one screen."
            >
              <label className={styles.inlineToggle}>
                <input
                  type="checkbox"
                  checked={hideFixtures}
                  onChange={(e) => setHideFixtures(e.target.checked)}
                />
                Hide test fixtures (@example.com)
              </label>
              {!users ? (
                <p className={styles.empty}>{loadingTab === "money" ? "Loading…" : "—"}</p>
              ) : (
                (() => {
                  const rows = users.items.filter(
                    (u) => !hideFixtures || !u.email?.endsWith("@example.com"),
                  );
                  return (
                    <>
                      <p className={styles.panelSub}>
                        {users.scanned} account(s) · {users.bound} with an email ·{" "}
                        {users.anonymous} anonymous · showing {rows.length}
                      </p>
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>Joined</th>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Plan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((u) => (
                              <tr key={u.id}>
                                <td className={styles.dim}>{when(u.createdAt)}</td>
                                <td>
                                  {u.name}
                                  {u.generatedName ? <span className={styles.tag}>auto</span> : null}
                                </td>
                                <td>
                                  {!u.email ? (
                                    <span className={styles.dim}>—</span>
                                  ) : revealed.has(u.id) ? (
                                    <span className={styles.mono}>{u.email}</span>
                                  ) : (
                                    <button
                                      className={styles.linkBtn}
                                      onClick={() => setRevealed((s) => new Set(s).add(u.id))}
                                    >
                                      reveal
                                    </button>
                                  )}
                                  {u.email && !u.emailVerified ? (
                                    <span className={styles.tag}>unverified</span>
                                  ) : null}
                                </td>
                                <td>
                                  {u.plan ? (
                                    <span className={styles.good}>
                                      {u.plan.planId} → {when(u.plan.until)}
                                    </span>
                                  ) : (
                                    <span className={styles.dim}>free</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()
              )}
            </Panel>
          </>
        ) : null}

        {/* -------------------------------------------------------- PRODUCT */}
        {tab === "product" && data ? (
          <>
            <section className={styles.stats}>
              <Stat
                label="Tests started"
                value={testsStarted}
                hint="30 days · daily + random"
                trust={TRUST["test:start:daily"]}
              />
              <Stat
                label="Tests finished"
                value={testsFinished}
                hint="30 days"
                trust={TRUST["test:done:daily"]}
              />
              <Stat
                label="Walked out mid-test"
                value={Math.max(0, testsStarted - testsFinished)}
                hint="started but never submitted"
                tone={
                  testsStarted > 0 && testsStarted - testsFinished > testsStarted / 2
                    ? "warn"
                    : undefined
                }
                trust="measured"
              />
              <Stat
                label="Emails bound"
                value={sum(m["bind:ok"])}
                hint={`${sum(m["restore:ok"])} restored`}
                trust={TRUST["bind:ok"]}
              />
            </section>

            <div className={styles.twoUp}>
              <Panel title="Daily vs random">
                <BarList
                  rows={[
                    { label: "Daily started", value: sum(m["test:start:daily"]) },
                    { label: "Daily finished", value: sum(m["test:done:daily"]) },
                    { label: "Random started", value: sum(m["test:start:random"]) },
                    { label: "Random finished", value: sum(m["test:done:random"]) },
                  ]}
                  unit="tests"
                />
              </Panel>
              <Panel
                title="Mean score"
                subtitle="Marks out of 10, negative marking applied. Daily scores are server-checked; random scores are whatever the browser reported."
              >
                <BarList
                  rows={[
                    { label: "English", value: mean(data.averages.english) },
                    { label: "GK", value: mean(data.averages.gk) },
                  ]}
                  unit="marks"
                />
              </Panel>
            </div>

            <Panel
              title="Paywall pressure"
              subtitle="Free random tests are capped at 2 per account per day, with 8 per network behind that. If nobody reaches the cap, the paywall is not what is stopping people buying."
            >
              <BarList
                rows={[
                  { label: "Random tests started", value: sum(m["test:start:random"]) },
                  { label: "Checkouts opened", value: sum(m["pay:order"]) },
                  { label: "Payments failed", value: sum(m["pay:fail"]) },
                  { label: "Payments succeeded", value: sum(m["pay:ok"]) },
                ]}
                unit="events"
              />
            </Panel>
          </>
        ) : null}

        {/* --------------------------------------------------------- HEALTH */}
        {tab === "health" ? (
          !health ? (
            <Panel title="Health">
              <p className={styles.empty}>{loadingTab === "health" ? "Checking…" : "—"}</p>
            </Panel>
          ) : (
            <>
              <Panel
                title="What is actually being counted"
                subtitle="The most important table here. A zero beside “not counted” is a gap in the code; a zero beside “measured” is a fact about your users. Without this, every other number on this dashboard is ambiguous."
              >
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Where it comes from</th>
                        <th>Trust</th>
                        <th>Last seen</th>
                        <th>30d</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.metrics.map((x) => (
                        <tr key={x.metric} data-warn={x.trust === "no-writer" ? "" : undefined}>
                          <td className={styles.mono}>{x.metric}</td>
                          <td className={styles.dim}>{x.source}</td>
                          <td>
                            <TrustTag trust={x.trust} />
                          </td>
                          <td className={styles.dim}>
                            {x.lastDay ?? <span className={styles.warn}>never</span>}
                          </td>
                          <td>{x.total30d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <div className={styles.twoUp}>
                <Panel title="Deploy">
                  <dl className={styles.kv}>
                    <dt>Live slot</dt>
                    <dd>
                      {health.deploy.liveSlot ?? "—"} (port {health.deploy.upstreamPort ?? "?"})
                    </dd>
                    <dt>Running build</dt>
                    <dd className={styles.mono}>
                      {health.deploy.liveCommit?.slice(0, 12) ?? "—"}
                    </dd>
                    <dt>Checkout HEAD</dt>
                    <dd className={health.deploy.drifted ? styles.warn : undefined}>
                      <span className={styles.mono}>{health.deploy.head?.slice(0, 12) ?? "—"}</span>
                      {health.deploy.drifted ? " — differs from the running build" : ""}
                    </dd>
                    <dt>Latest commit</dt>
                    <dd>{health.deploy.headSubject ?? "—"}</dd>
                    <dt>Uncommitted files</dt>
                    <dd>{health.deploy.dirtyFiles}</dd>
                    <dt>Unpushed commits</dt>
                    <dd className={health.deploy.unpushed > 0 ? styles.warn : undefined}>
                      {health.deploy.unpushed}
                      {health.deploy.unpushed > 0
                        ? " — deploy.sh will refuse until these are pushed"
                        : ""}
                    </dd>
                    <dt>Build age</dt>
                    <dd>
                      {health.deploy.buildAgeMs == null
                        ? "—"
                        : `${duration(health.deploy.buildAgeMs)} old`}
                    </dd>
                    <dt>Process</dt>
                    <dd>
                      up {health.deploy.uptimeSec == null ? "—" : `${Math.round(health.deploy.uptimeSec / 3600)}h`}
                      {" · "}
                      {health.deploy.rssMb} MB
                    </dd>
                  </dl>
                </Panel>

                <Panel title="Host and store">
                  <dl className={styles.kv}>
                    <dt>TLS certificate</dt>
                    <dd className={(health.host.tlsDaysLeft ?? 99) < 21 ? styles.warn : undefined}>
                      {health.host.tlsDaysLeft == null
                        ? "—"
                        : `${health.host.tlsDaysLeft} days left`}
                      {health.host.tlsExpires ? ` (${health.host.tlsExpires})` : ""}
                    </dd>
                    <dt>Disk</dt>
                    <dd>
                      {health.host.diskFreeGb ?? "—"} GB free of {health.host.diskTotalGb ?? "—"} GB
                    </dd>
                    <dt>Memory</dt>
                    <dd>
                      {health.host.memFreeMb ?? "—"} MB free of {health.host.memTotalMb ?? "—"} MB
                    </dd>
                    <dt>Load</dt>
                    <dd>
                      {health.host.load1} on {health.host.cores} cores
                    </dd>
                    <dt>Store keys</dt>
                    <dd>{health.host.storeKeys ?? "—"}</dd>
                    <dt>Store memory</dt>
                    <dd>
                      {health.host.storeMemoryMb == null ? "—" : `${health.host.storeMemoryMb} MB`}
                    </dd>
                  </dl>
                </Panel>
              </div>

              <Panel
                title="Client errors"
                subtitle="Crashes reported by the app's error boundaries. Kept three days, then deleted. Carries no email, no cookie and no answers, by design."
              >
                {health.errors.length === 0 ? (
                  <p className={styles.empty}>No client errors reported.</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Route</th>
                          <th>Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {health.errors.map((e) => (
                          <tr key={e.key}>
                            <td className={styles.dim}>{ago(e.ts)}</td>
                            <td className={styles.mono}>{e.route}</td>
                            <td>
                              {e.message}
                              {e.synthetic ? (
                                <span
                                  className={styles.tag}
                                  title="Written by the deploy smoke test, not a real fault."
                                >
                                  smoke test
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}
