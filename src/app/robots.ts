import type { MetadataRoute } from "next";
import { SITE } from "@/lib/legal";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // A test in progress and a results screen are per-session state, not
      // documents. Indexing them would surface someone's half-finished run.
      disallow: ["/api/", "/test", "/results"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
