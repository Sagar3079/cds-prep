"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Row {
  rank: number;
  name: string;
  score: number;
  isYou: boolean;
}
interface Board {
  day: string;
  rows: Row[];
  yourRank: number | null;
  total: number;
  configured: boolean;
}

const POLL_MS = 5000;

export default function LeaderboardPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [me, setMe] = useState<{ signedIn: boolean; name?: string } | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Board;
      if (!alive.current) return;
      setBoard(data);
      setFailed(false);
    } catch {
      if (alive.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    void fetch("/api/account")
      .then((r) => r.json())
      .then((d) => alive.current && setMe(d))
      .catch(() => {});

    // Polls every 5s, but only while the tab is actually being looked at.
    // A hidden tab polling forever is just battery and quota.
    let timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    const onVis = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      timer = 0;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, username }),
      });
      const data = (await res.json()) as { error?: string; name?: string };
      if (!res.ok) {
        setError(data.error ?? "That didn't work. Try again.");
        return;
      }
      setMe({ signedIn: true, name: data.name });
      void load();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Today&apos;s leaderboard
        </h1>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
          Today&apos;s daily test only, first attempt, scored on the server.
          Resets every day.
        </p>
      </div>

      {me && !me.signedIn && (
        <form onSubmit={signUp} className="card space-y-3">
          <div>
            <h2 className="text-[0.9375rem] font-bold text-ink">
              Join the board
            </h2>
            <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
              Without a username your email shows masked, like{" "}
              <span className="whitespace-nowrap">s••••@gmail.com</span>.
            </p>
          </div>
          <label className="block text-[0.8125rem] font-semibold text-ink">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-[0.9375rem] font-normal text-ink"
              placeholder="you@example.com"
            />
          </label>
          <label className="block text-[0.8125rem] font-semibold text-ink">
            Username <span className="font-normal text-muted">(optional)</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={24}
              className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-[0.9375rem] font-normal text-ink"
              placeholder="How you want to appear"
            />
          </label>
          {error && (
            <p role="alert" className="text-[0.8125rem] font-semibold text-err-ink">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Joining…" : "Join"}
          </button>
          <p className="text-xs leading-relaxed text-muted">
            Your address isn&apos;t verified yet and is never shown in full. It
            is stored so your row survives a reload.
          </p>
        </form>
      )}

      {me?.signedIn && (
        <p className="text-[0.8125rem] text-muted">
          Playing as <span className="font-bold text-ink">{me.name}</span>
          {board?.yourRank ? ` · ranked #${board.yourRank}` : " · no score today yet"}
        </p>
      )}

      <section className="card space-y-1.5" aria-label="Rankings">
        {failed && !board && (
          <p className="py-6 text-center text-[0.8125rem] text-muted">
            Couldn&apos;t load the board.
          </p>
        )}
        {board && board.rows.length === 0 && (
          <p className="py-6 text-center text-[0.8125rem] text-muted">
            Nobody has finished today&apos;s test yet. Be first.
          </p>
        )}
        {board?.rows.map((r) => (
          <div
            key={r.rank}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
              r.isYou ? "bg-accent-soft" : ""
            }`}
          >
            <span className="w-7 shrink-0 text-[0.8125rem] font-bold tabular-nums text-muted">
              {r.rank}
            </span>
            <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold text-ink">
              {r.name}
              {r.isYou && <span className="ml-1.5 text-accent-ink">you</span>}
            </span>
            <span className="shrink-0 font-extrabold tabular-nums text-ink">
              {r.score.toFixed(2)}
            </span>
          </div>
        ))}
      </section>

      <p className="text-xs leading-relaxed text-muted">
        Scores are worked out on the server from the options you picked, so a
        score can&apos;t be sent in directly. Only your first attempt each day
        counts.
      </p>
    </div>
  );
}
