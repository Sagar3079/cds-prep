"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./admin.module.css";

/**
 * The dashboard.
 *
 * Client-rendered against `/api/admin/data` rather than server-rendered, for
 * one reason: it polls. A server component would have to re-render the whole
 * route to refresh a number, and the panel's job is to show what is happening
 * now — during an ad campaign, "now" is the only interesting tense.
 *
 * Authentication is not decided here. A signed-out caller gets a 404 from the
 * API (not a 401 — the path should be indistinguishable from one that does not
 * exist), and that 404 is what puts the password form on screen.
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

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const when = (ms: number) =>
  ms
    ? new Date(ms).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      })
    : "—";

const sum = (s: Record<string, number> | undefined) =>
  s ? Object.values(s).reduce((a, b) => a + b, 0) : 0;

/** Last `n` days of a series, most recent last. */
const tail = (s: Record<string, number> | undefined, n: number) => {
  if (!s) return [];
  const keys = Object.keys(s).sort();
  return keys.slice(-n).map((k) => ({ day: k, value: s[k] }));
};

/**
 * A bar chart in CSS.
 *
 * No chart library: this is one dashboard behind a password, and a charting
 * dependency would ship to every visitor's bundle for the benefit of one person
 * looking at it once a day.
 */
function Bars({ data, label }: { data: { day: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={styles.chart}>
      <div className={styles.chartHead}>
        <span>{label}</span>
        <span className={styles.chartTotal}>{data.reduce((a, b) => a + b.value, 0)}</span>
      </div>
      <div className={styles.bars}>
        {data.map((d) => (
          <div key={d.day} className={styles.barWrap} title={`${d.day}: ${d.value}`}>
            <div
              className={styles.bar}
              style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
              data-zero={d.value === 0 ? "" : undefined}
            />
          </div>
        ))}
      </div>
      <div className={styles.chartFoot}>
        <span>{data[0]?.day.slice(5) ?? ""}</span>
        <span>{data[data.length - 1]?.day.slice(5) ?? ""}</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "warn" | "good";
}) {
  return (
    <div className={styles.stat} data-tone={tone}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
      {hint ? <div className={styles.statHint}>{hint}</div> : null}
    </div>
  );
}

export default function AdminClient() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UsersView | null>(null);
  const [tab, setTab] = useState<"overview" | "users" | "payments">("overview");
  const [live, setLive] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/data?view=overview&days=30", {
      cache: "no-store",
    });
    if (res.status === 404) {
      setAuthed(false);
      return;
    }
    if (!res.ok) return;
    setData((await res.json()) as Overview);
    setAuthed(true);
    setFetchedAt(Date.now());
  }, []);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/data?view=users&limit=500", { cache: "no-store" });
    if (!res.ok) return;
    setUsers((await res.json()) as UsersView);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "users" && !users) void loadUsers();
  }, [tab, users, loadUsers]);

  /** Poll while the tab is visible. A background tab does not need fresh numbers. */
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
        setError("Wrong password.");
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
  };

  if (authed === null) {
    return <div className={styles.loading}>Loading…</div>;
  }

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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>CDS Prep — admin</h1>
          <p className={styles.sub}>
            {fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleTimeString("en-IN")}` : "—"}
            {" · "}
            <button className={styles.linkBtn} onClick={() => void load()}>
              Refresh
            </button>
            {" · "}
            <label className={styles.liveToggle}>
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              Live (15s)
            </label>
          </p>
        </div>
        <button className={styles.signOut} onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      {data && !data.configured ? (
        <p className={styles.banner}>
          The data store is not configured on this deployment, so everything below is empty —
          that is a configuration problem, not a reading of zero.
        </p>
      ) : null}

      {t && !t.accountsComplete ? (
        <p className={styles.banner}>
          The account scan hit its page ceiling, so the account totals below are a floor, not a
          count.
        </p>
      ) : null}

      {t && (t.orphanedPayments > 0 || t.ungrantedPayments > 0) ? (
        <p className={styles.bannerWarn}>
          {t.orphanedPayments > 0 ? `${t.orphanedPayments} payment(s) landed with no account attached. ` : ""}
          {t.ungrantedPayments > 0 ? `${t.ungrantedPayments} payment(s) have no live plan on the account. ` : ""}
          Check the Payments tab — this is money received against access that may never have been granted.
        </p>
      ) : null}

      <nav className={styles.tabs}>
        {(["overview", "users", "payments"] as const).map((k) => (
          <button key={k} data-active={tab === k ? "" : undefined} onClick={() => setTab(k)}>
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </nav>

      {tab === "overview" && data ? (
        <>
          <section className={styles.stats}>
            <Stat
              label="Visits (30d)"
              value={sum(m["visit"])}
              hint="browsers that ran JS — excludes bots"
            />
            <Stat
              label="Accounts"
              value={t?.accounts ?? 0}
              hint={`${t?.bound ?? 0} with email · ${t?.anonymous ?? 0} anonymous`}
            />
            <Stat label="Revenue (all time)" value={rupees(t?.revenuePaise ?? 0)} hint={`${t?.payments ?? 0} payments`} />
            <Stat label="Tests done (30d)" value={sum(m["test:done:daily"]) + sum(m["test:done:random"])} hint={`${sum(m["test:done:daily"])} daily · ${sum(m["test:done:random"])} random`} />
            <Stat label="New accounts (30d)" value={sum(m["acct:new"])} />
            <Stat label="Emails bound (30d)" value={sum(m["bind:ok"])} hint={`${sum(m["restore:ok"])} restored`} />
            <Stat
              label="Abandoned checkouts"
              value={t?.abandonedOrders ?? 0}
              hint="last 7 days"
              tone={(t?.abandonedOrders ?? 0) > 0 ? "warn" : undefined}
            />
          </section>

          <section className={styles.charts}>
            <Bars data={tail(m["visit"], 30)} label="Visits / day" />
            <Bars data={tail(m["acct:new"], 30)} label="New accounts / day" />
            <Bars data={tail(m["test:done:daily"], 30)} label="Daily tests finished" />
            <Bars data={tail(m["test:done:random"], 30)} label="Random tests finished" />
            <Bars data={tail(m["pay:ok"], 30)} label="Payments / day" />
          </section>

          <section className={styles.panel}>
            <h2>Recent activity</h2>
            {data.recent.length === 0 ? (
              <p className={styles.empty}>
                No tests recorded yet. This feed starts filling from the moment auto-save
                shipped — it cannot show tests taken before then, because nothing recorded them.
              </p>
            ) : (
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
                      <td className={styles.dim}>{when(r.at)}</td>
                      <td>{r.name}</td>
                      <td>{r.subject === "gk" ? "GK" : "English"}</td>
                      <td>
                        {r.mode}
                        {r.mode === "random" ? (
                          <span className={styles.tag} title="Random sets are picked in the browser, so this score is self-reported and cannot be checked server-side.">
                            self-reported
                          </span>
                        ) : null}
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
            )}
          </section>
        </>
      ) : null}

      {tab === "users" ? (
        <section className={styles.panel}>
          <h2>
            Users{" "}
            <span className={styles.dim}>
              {users ? `${users.scanned} total · showing ${users.items.length}` : ""}
            </span>
          </h2>
          {!users ? (
            <p className={styles.empty}>Loading…</p>
          ) : (
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
                {users.items.map((u) => (
                  <tr key={u.id}>
                    <td className={styles.dim}>{when(u.createdAt)}</td>
                    <td>
                      {u.name}
                      {u.generatedName ? <span className={styles.tag}>auto</span> : null}
                    </td>
                    <td>
                      {/*
                        Masked until asked for. The rest of this app never shows a
                        whole address back to anyone — the leaderboard masks, whoami
                        does not return one at all, and the email index is a
                        truncated hash so it cannot be walked back to addresses. A
                        dashboard that prints every address in plaintext by default
                        would undo all of that on one screen.
                      */}
                      {!u.email ? (
                        <span className={styles.dim}>—</span>
                      ) : revealed.has(u.id) ? (
                        <span>{u.email}</span>
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
          )}
        </section>
      ) : null}

      {tab === "payments" && data ? (
        <section className={styles.panel}>
          <h2>
            Payments <span className={styles.dim}>{rupees(t?.revenuePaise ?? 0)} all time</span>
          </h2>
          {data.payments.length === 0 ? (
            <p className={styles.empty}>No payments recorded.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Amount</th>
                  <th>Plan</th>
                  <th>Account</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.orderId} data-warn={p.orphaned || p.ungranted ? "" : undefined}>
                    <td className={styles.dim}>{when(p.paidAt)}</td>
                    <td>{rupees(p.paise)}</td>
                    <td>{p.planId ?? "—"}</td>
                    <td className={styles.mono}>{p.accountId ?? <span className={styles.warn}>none</span>}</td>
                    <td>
                      {p.orphaned ? (
                        <span className={styles.warn}>orphaned — no account</span>
                      ) : p.ungranted ? (
                        <span className={styles.warn}>no live plan</span>
                      ) : (
                        <span className={styles.good}>granted</span>
                      )}
                      {p.via ? <span className={styles.tag}>{p.via}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
    </div>
  );
}
