import type { Metadata } from "next";
import { SITE } from "./legal";

/**
 * One page's metadata, built the way every non-home page here should be.
 *
 * Next.js does not deep-merge `openGraph`/`twitter` between a layout and a
 * page — a page that sets its own `openGraph` REPLACES the root layout's
 * entirely, field for field, not just the fields the page names. Seven pages
 * set only `title`/`description` in their own metadata export and inherited
 * the root layout's `openGraph`/`twitter` verbatim as a result, homepage
 * title and homepage canonical URL included, because there was nothing of
 * their own to replace it with. This is the one place that full shape is
 * written now, so all seven pages agree and none can drift back to quietly
 * describing themselves as the homepage.
 *
 * `title` is passed WITHOUT the "· CDS Prep" suffix — the root layout's title
 * template (`"%s · CDS Prep"`) supplies that once. A page appending it a
 * second time doubles it: "Pricing · CDS Prep · CDS Prep".
 */
export function pageMetadata({
  path,
  title,
  description,
}: {
  /** Leading slash, e.g. "/pricing" — must match the page's own route exactly. */
  path: string;
  title: string;
  description: string;
}): Metadata {
  return {
    title,
    description,
    // Self-referencing, per page. Without it every page here pointed at "/",
    // telling a crawler that seven different pages were all duplicates of the
    // homepage and only the homepage was worth indexing.
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      locale: "en_IN",
      url: path,
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
