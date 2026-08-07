import type { MetadataRoute } from "next";
import { SITE } from "@/lib/legal";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // A test in progress and a results screen are per-session state, not
      // documents. Indexing them would surface someone's half-finished run.
      //
      // `/landing` is NOT here on purpose, though it is noindex in its own
      // metadata. It is a paid-ad destination, and Google's ad crawler checks
      // the page it is sending clicks to — a robots-disallowed landing page
      // risks the ad being disapproved. `noindex` keeps it out of search
      // results, which is the actual goal, without blocking the crawl.
      disallow: ["/api/", "/test", "/results"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
