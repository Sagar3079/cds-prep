import { ImageResponse } from "next/og";

/**
 * The card every share of prepcadet.in renders as — WhatsApp, Telegram,
 * Twitter, a Slack paste. Without one, a link that gets forwarded around a
 * study group is a bare grey rectangle, which is most of how this site will
 * actually spread.
 *
 * Generated rather than a committed PNG so the claims cannot drift from the
 * app: the numbers and the wording come from the same place the pages do.
 * Rendered at build time and cached, so nobody pays for it at request time.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "CDS Prep — free daily CDS practice from past UPSC papers. 10 questions, 10 minutes.";

// `next/og` ships a Satori renderer with no access to the app's CSS, so the
// tokens are repeated here as literals. They are the same values as
// globals.css's --accent / --ink / --paper.
const ACCENT = "#2F6BFF";
const INK = "#151824";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: ACCENT,
            }}
          />
          <div style={{ fontSize: 30, fontWeight: 700, color: INK }}>
            CDS Prep
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              color: INK,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            A real CDS test, every day.
          </div>
          <div style={{ fontSize: 32, color: "#5b6170", lineHeight: 1.35 }}>
            10 questions, 10 minutes, marked +1 / −0.25 — from past UPSC papers.
          </div>
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          {["Free", "No account", "English + GK"].map((t) => (
            <div
              key={t}
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: ACCENT,
                background: "#eaf0ff",
                borderRadius: 999,
                padding: "10px 26px",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
