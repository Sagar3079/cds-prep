import type { Metadata } from "next";

/**
 * Metadata for /history, which is a client component and so cannot export its own.
 * This layout exists for that reason alone and renders nothing of its own.
 */
export const metadata: Metadata = {
  title: "Your practice history",
  description: "Every CDS test you have taken — scores, streaks, accuracy and per-topic strengths, kept in your own browser.",
  alternates: { canonical: "/history" },
};

export default function Layout({ children }: LayoutProps<"/history">) {
  return children;
}
