import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Same mark as `icon.tsx`, larger and WITHOUT rounded corners. iOS applies
 * its own corner mask to a home-screen icon, and a background that already
 * curves fights that mask at some zoom levels rather than matching it.
 */
export default function AppleIcon() {
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
          color: "#1c1102",
          fontSize: 100,
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
