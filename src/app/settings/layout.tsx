import type { Metadata } from "next";

/**
 * Metadata for /settings, which is a client component and so cannot export its own.
 * This layout exists for that reason alone and renders nothing of its own.
 */
export const metadata: Metadata = {
  title: "Settings",
  description: "Choose your study companion, manage practice preferences, get the Android app, and see exactly what data CDS Prep keeps.",
  alternates: { canonical: "/settings" },
};

export default function Layout({ children }: LayoutProps<"/settings">) {
  return children;
}
