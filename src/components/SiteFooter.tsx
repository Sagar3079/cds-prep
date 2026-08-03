"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { COPYRIGHT_YEAR, LEGAL_LINKS, SITE, SUPPORT_EMAIL } from "@/lib/legal";

/**
 * The policy links, at the bottom of every screen.
 *
 * Not optional decoration: a payment gateway's reviewer opens the home page
 * and looks for exactly these links. Buried on a settings sub-page, they are
 * treated as absent and the application is rejected. So they live where they
 * are always one scroll away, on every route.
 *
 * Hidden during a run, for the same reason the tab bar is: the test owns the
 * bottom of the screen and nothing should invite a tap away from it with a
 * clock going.
 */
export default function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/test") return null;

  return (
    <footer className="site-footer" aria-labelledby="site-footer-heading">
      <h2 id="site-footer-heading" className="sr-only">
        About this site
      </h2>

      <nav aria-label="Policies" className="site-footer-links">
        {LEGAL_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
      </nav>

      <p className="site-footer-meta">
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
      <p className="site-footer-meta">
        © {COPYRIGHT_YEAR} {SITE.name} · Not affiliated with UPSC or the Ministry of
        Defence.
      </p>
    </footer>
  );
}
