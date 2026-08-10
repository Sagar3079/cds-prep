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
/**
 * Priority is a hint about RELATIVE importance within this site, not a score.
 * The home page is where the product is; the board changes daily and is the
 * only other page with a reason to be recrawled often; the policy pages exist
 * to be findable and almost never change.
 */
const PAGES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/leaderboard", changeFrequency: "daily", priority: 0.8 },
  // `/history` is deliberately absent. Its content lives entirely in the
  // visitor's own localStorage — nothing a crawler (or a first-time visitor)
  // has — so the server-rendered HTML for this URL is permanently just
  // "Loading your history…" with nothing else, verified live: there is no
  // static content on the page at all, only that one placeholder string.
  // Listing a URL that can never carry indexable content asks a crawl budget
  // to be spent on a page that will never earn it a result.
  { path: "/settings", changeFrequency: "monthly", priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    ...PAGES,
    ...LEGAL_LINKS.map((l) => ({
      path: l.href,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ].map(({ path, changeFrequency, priority }) => ({
    url: `${SITE.url}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
