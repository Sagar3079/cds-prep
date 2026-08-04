import type { Metadata } from "next";
import Frame from "./Frame";

/**
 * The landing page inside a phone, for looking at on a desktop.
 *
 * `/landing` is deliberately full-bleed — it is the one route that escapes the
 * app's device panel, because an advert should not arrive in a 460px column.
 * That makes it awkward to review on a laptop, which is the only place it gets
 * reviewed. So this renders the real page in a real iframe at real phone
 * widths: what you see here is the page itself, not a mock-up of it, laid out
 * by the same CSS a phone would run.
 *
 * Not indexed, and not linked from anywhere — it is a workbench.
 */
export const metadata: Metadata = {
  title: "Landing preview",
  robots: { index: false, follow: false },
};

export default function LandingPreviewPage() {
  return <Frame />;
}
