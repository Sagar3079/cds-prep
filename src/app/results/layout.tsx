import type { Metadata } from "next";

/**
 * Metadata for /results, which is a client component and so cannot export its own.
 * This layout exists for that reason alone and renders nothing of its own.
 */
export const metadata: Metadata = {
  title: "Your results",
  description: "Your score and full answer review for the test you just finished.",
  // Per-session app state, not a document. Kept out of the index so a
  // search result can never surface somebody's half-finished run.
  robots: { index: false, follow: false },
};

export default function Layout({ children }: LayoutProps<"/results">) {
  return children;
}
