import type { Metadata } from "next";
import AdminClient from "./AdminClient";

/**
 * The panel is deliberately absent from `robots.ts`.
 *
 * Adding a `Disallow: /admin` line publishes the path to everyone who reads
 * robots.txt, which is not a trade worth making against crawlers that ignore it
 * anyway. `noindex` here does the real work, and the gate does the rest.
 */
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminPage() {
  return <AdminClient />;
}
