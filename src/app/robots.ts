import type { MetadataRoute } from "next";
import { SITE } from "@/lib/legal";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // A test in progress and a results screen are per-session state, not
      // documents. Indexing them would surface someone's half-finished run.
      // `/landing` is an ad destination, not a search result: it competes with
      // the home page for the same queries and would split the site's own
      // signals between two near-identical pages.
      disallow: ["/api/", "/test", "/results", "/landing"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
