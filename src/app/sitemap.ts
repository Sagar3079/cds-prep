import type { MetadataRoute } from "next";
import { LEGAL_LINKS, SITE } from "@/lib/legal";

/**
 * The policy pages exist to be found — by a candidate, and by the reviewer at
 * a payment gateway who is checking that they are all reachable. Listing them
 * from `LEGAL_LINKS` means a page added to the footer is in the sitemap
 * automatically, rather than in one and forgotten in the other.
 *
 * `/test` and `/results` are deliberately absent: they are per-session app
 * state, not documents anyone should land on cold from a search result.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", "/history", "/leaderboard", "/settings"];

  return [...pages, ...LEGAL_LINKS.map((l) => l.href)].map((path) => ({
    url: `${SITE.url}${path === "/" ? "" : path}`,
    lastModified: new Date(),
    changeFrequency: path === "/" ? "daily" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
