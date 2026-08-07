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
  { path: "/history", changeFrequency: "weekly", priority: 0.5 },
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
