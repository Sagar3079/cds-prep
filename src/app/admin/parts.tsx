"use client";

import styles from "./admin.module.css";

/**
 * The small pieces the dashboard is built from.
 *
 * Split out of `AdminClient` because that file became the whole panel in one
 * scroll, and because these carry the rules that must not drift between tabs —
 * particularly `Trust`, which decides whether a zero on screen means "nobody
 * did this" or "nothing was ever counted".
 */

export type Trust = "measured" | "reconstructed" | "derived" | "no-writer";

const TRUST_LABEL: Record<Trust, string> = {
  measured: "measured",
  reconstructed: "estimated",
  derived: "from records",
  "no-writer": "not counted",
};

const TRUST_TITLE: Record<Trust, string> = {
  measured:
    "Counted by the app at the moment it happened. Only covers days since that counter shipped.",
  reconstructed:
    "Rebuilt from server access logs. Counts network addresses, not people — several people on one wifi look like one, and one person on two networks looks like two.",
  derived:
    "Computed from the stored records themselves, so it is correct for the whole history rather than only for recent days.",
  "no-writer":
    "Nothing in the running build writes this. The zero is a gap in the code, not a fact about anyone.",
};

export function TrustTag({ trust }: { trust: Trust }) {
  return (
    <span className={styles.trust} data-trust={trust} title={TRUST_TITLE[trust]}>
      {TRUST_LABEL[trust]}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  trust,
  big,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "warn" | "good";
  trust?: Trust;
  big?: boolean;
}) {
  return (
    <div className={styles.stat} data-tone={tone} data-big={big ? "" : undefined}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>
        {label}
        {trust ? <TrustTag trust={trust} /> : null}
      </div>
      {hint ? <div className={styles.statHint}>{hint}</div> : null}
    </div>
  );
}

/** Last `n` entries of a day series, oldest first. */
export const tail = (s: Record<string, number> | undefined, n: number) => {
  if (!s) return [];
  const keys = Object.keys(s).sort();
  return keys.slice(-n).map((k) => ({ day: k, value: s[k] }));
};

export const sum = (s: Record<string, number> | undefined) =>
  s ? Object.values(s).reduce((a, b) => a + b, 0) : 0;

export function Bars({
  data,
  label,
  trust,
}: {
  data: { day: string; value: number }[];
  label: string;
  trust?: Trust;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={styles.chart}>
      <div className={styles.chartHead}>
        <span>
          {label}
          {trust ? <TrustTag trust={trust} /> : null}
        </span>
        <span className={styles.chartTotal}>
          {data.reduce((a, b) => a + b.value, 0)}
        </span>
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

/**
 * A funnel drawn as absolute counts, never as percentages.
 *
 * With 623 arrivals and 0 activations, every percentage in the chain rounds to
 * 0% and the first real customer would not move it. Raw fractions stay legible
 * at the scale this business is actually at.
 */
export function Funnel({
  steps,
}: {
  steps: { step: string; visitors: number; trust?: Trust; note?: string }[];
}) {
  const top = Math.max(1, ...steps.map((s) => s.visitors));
  return (
    <div className={styles.funnel}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].visitors : null;
        const dropped = prev !== null && prev > 0 ? prev - s.visitors : null;
        return (
          <div key={s.step} className={styles.funnelRow}>
            <div className={styles.funnelLabel}>
              {s.step}
              {s.trust ? <TrustTag trust={s.trust} /> : null}
            </div>
            <div className={styles.funnelTrack}>
              <div
                className={styles.funnelFill}
                style={{ width: `${Math.max(0.5, (s.visitors / top) * 100)}%` }}
                data-empty={s.visitors === 0 ? "" : undefined}
              />
            </div>
            <div className={styles.funnelCount}>{s.visitors.toLocaleString("en-IN")}</div>
            <div className={styles.funnelDrop}>
              {dropped !== null && dropped > 0 ? `−${dropped.toLocaleString("en-IN")}` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A labelled horizontal bar list — sources, devices, landing pages. */
export function BarList({
  rows,
  unit = "visitors",
}: {
  rows: { label: string; value: number }[];
  unit?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className={styles.empty}>Nothing recorded.</p>;
  return (
    <div className={styles.barList}>
      {rows.map((r) => (
        <div key={r.label} className={styles.barListRow}>
          <div className={styles.barListLabel} title={r.label}>
            {r.label}
          </div>
          <div className={styles.barListTrack}>
            <div
              className={styles.barListFill}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <div className={styles.barListValue} title={`${r.value} ${unit}`}>
            {r.value.toLocaleString("en-IN")}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Hour-of-day distribution, IST. */
export function HourStrip({ byHour }: { byHour: number[] }) {
  const max = Math.max(1, ...byHour);
  return (
    <div>
      <div className={styles.hours}>
        {byHour.map((n, h) => (
          <div
            key={h}
            className={styles.hourCell}
            style={{ opacity: n === 0 ? 0.12 : 0.25 + (n / max) * 0.75 }}
            title={`${String(h).padStart(2, "0")}:00 IST — ${n} page views`}
          />
        ))}
      </div>
      <div className={styles.chartFoot}>
        <span>00:00</span>
        <span>12:00</span>
        <span>23:00</span>
      </div>
    </div>
  );
}

export const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const when = (ms: number) =>
  ms
    ? new Date(ms).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      })
    : "—";

/** A duration, already measured. Takes no clock reading of its own. */
export const duration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

export const ago = (ms: number) => {
  if (!ms) return "—";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

export function Panel({
  title,
  subtitle,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={styles.panel} data-wide={wide ? "" : undefined}>
      <h2>{title}</h2>
      {subtitle ? <p className={styles.panelSub}>{subtitle}</p> : null}
      {children}
    </section>
  );
}
