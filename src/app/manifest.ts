import type { MetadataRoute } from "next";
import { SITE } from "@/lib/legal";

/**
 * Backs the "Add to Home Screen" claim already made in the root layout's
 * `appleWebApp` metadata (`capable: true`) — without a manifest, that claim
 * described an installable app that did not actually exist anywhere on the
 * site, and every direct request for `/manifest.json` or `/site.webmanifest`
 * 404d.
 *
 * `theme_color`/`background_color` match the root layout's own
 * `viewport.themeColor` (`layout.tsx`) rather than the landing page's gold
 * accent, so the installed app's OS chrome agrees with the surface colour of
 * the app it is actually chrome around.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — free daily CDS practice`,
    short_name: SITE.name,
    description:
      "Daily CDS practice in English and General Knowledge — 10 questions, 10 minutes, marked like the real paper.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
