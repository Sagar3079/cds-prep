import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * The same mark already on screen in the app, not a new one invented for this
 * file: a gold rounded square with a dark "C", exactly matching the landing
 * page's own nav brand (`src/app/landing/landing.css` `.brand i` — the colors
 * are lifted verbatim: `--gold: #ffb627`, `--on-gold: #1c1102`).
 *
 * Generated here rather than shipped as a static file because there is no
 * `public/` directory in this repo and no exported asset to point one at —
 * this function IS the asset, defined once, in the one place the browser tab
 * and every share preview both read it from.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffb627",
          borderRadius: 7,
          color: "#1c1102",
          fontSize: 22,
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        C
      </div>
    ),
    { ...size },
  );
}
