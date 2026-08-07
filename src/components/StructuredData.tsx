import { PLANS, SITE, SUPPORT_EMAIL } from "@/lib/legal";

/**
 * JSON-LD, for the machines.
 *
 * Three graphs, each answering a different question a crawler asks:
 * WHO publishes this (Organization), WHAT the site is (WebSite), and what the
 * THING is (an education app, with its price and platform). Google uses the
 * last of these to decide whether a query like "free CDS mock test" has found
 * an app or an article, which is the distinction that decides the click.
 *
 * Every claim here has to be true and has to match the visible page — invented
 * ratings or a price the pricing page contradicts is the fastest way to lose
 * rich results entirely, and the penalty outlasts the fix. There is no
 * `aggregateRating` below for exactly that reason: nobody has rated this.
 */
export default function StructuredData() {
  const graph = [
    {
      "@type": "Organization",
      "@id": `${SITE.url}/#org`,
      name: SITE.name,
      url: SITE.url,
      email: SUPPORT_EMAIL,
      description:
        "An independent study tool for the Combined Defence Services examination. Not affiliated with UPSC or the Ministry of Defence.",
      contactPoint: {
        "@type": "ContactPoint",
        email: SUPPORT_EMAIL,
        contactType: "customer support",
        areaServed: "IN",
        availableLanguage: "English",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE.url}/#website`,
      url: SITE.url,
      name: SITE.name,
      publisher: { "@id": `${SITE.url}/#org` },
      inLanguage: "en-IN",
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE.url}/#app`,
      name: SITE.name,
      url: SITE.url,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web, Android 6.0+",
      browserRequirements: "Requires JavaScript.",
      publisher: { "@id": `${SITE.url}/#org` },
      inLanguage: "en-IN",
      about: {
        "@type": "Course",
        name: "Combined Defence Services (CDS) written examination practice",
        description:
          "Daily timed practice in English and General Knowledge, drawn from UPSC previous-year CDS papers.",
        provider: { "@id": `${SITE.url}/#org` },
      },
      /**
       * Both offers, because both are true and a searcher deciding between
       * tools wants the free tier stated as plainly as the paid one. The free
       * offer is first: it is the one that is always available.
       */
      offers: [
        {
          "@type": "Offer",
          price: "0",
          priceCurrency: "INR",
          name: "Daily practice",
          description:
            "One ten-question English set and one General Knowledge set every day, with full answer review.",
        },
        ...PLANS.map((p) => ({
          "@type": "Offer",
          price: (p.paise / 100).toFixed(2),
          priceCurrency: "INR",
          name: `${p.name} plan`,
          description: p.blurb,
          category: "Subscription",
        })),
      ],
    },
  ];

  return (
    <script
      type="application/ld+json"
      // Server-rendered constant built from `legal.ts`, never from user input,
      // so there is no injection surface here. Escaping `<` anyway, because the
      // one way JSON-LD breaks a page is a `</script>` inside a string.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(
          /</g,
          "\u003c",
        ),
      }}
    />
  );
}
