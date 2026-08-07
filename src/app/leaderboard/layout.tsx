import type { Metadata } from "next";

/**
 * Metadata for /leaderboard, which is a client component and so cannot export its own.
 * This layout exists for that reason alone and renders nothing of its own.
 */
export const metadata: Metadata = {
  title: "Daily leaderboard",
  description: "Today's top scores on the daily CDS English and General Knowledge tests. Joining is optional and takes an email.",
  alternates: { canonical: "/leaderboard" },
};

export default function Layout({ children }: LayoutProps<"/leaderboard">) {
  return children;
}
