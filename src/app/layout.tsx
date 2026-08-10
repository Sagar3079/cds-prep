import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import AppFrame from "@/components/AppFrame";
import VisitBeacon from "@/components/VisitBeacon";
import StructuredData from "@/components/StructuredData";
import { SITE } from "@/lib/legal";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

const TAGLINE =
  "Daily CDS practice in English and General Knowledge — 10 questions, 10 minutes, marked like the real paper.";

export const metadata: Metadata = {
  // Needed for `sitemap.ts`, `robots.ts` and any absolute URL Next generates.
  // Without it those emit relative URLs, which a crawler treats as broken.
  metadataBase: new URL(SITE.url),
  // "CDS Prep" — the repo's own name — rather than "CDS English Prep", which
  // stopped being true when General Knowledge became a second subject.
  title: {
    default: "CDS Prep — free daily CDS practice from past UPSC papers",
    // Every page that sets its own title gets the brand appended, so a search
    // result is attributable without each page repeating the suffix by hand.
    template: "%s · CDS Prep",
  },
  description: TAGLINE,
  applicationName: SITE.name,
  // What a candidate actually types. Not a keyword-stuffing tag — Google has
  // ignored `keywords` for years — but Bing and several Indian aggregators
  // still read it, and it costs one line.
  keywords: [
    "CDS exam preparation",
    "CDS English practice",
    "CDS General Knowledge",
    "UPSC CDS previous year questions",
    "CDS mock test free",
    "Combined Defence Services exam",
    "CDS daily quiz",
    "NDA CDS English",
  ],
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  publisher: SITE.name,
  // Self-referencing canonical on every page. Without it the same test is
  // reachable at /, /?subject=english and any tracking-tagged variant an ad
  // click appends, and a crawler treats those as competing duplicates.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_IN",
    url: SITE.url,
    title: "CDS Prep — free daily CDS practice from past UPSC papers",
    description: TAGLINE,
  },
  twitter: {
    card: "summary_large_image",
    title: "CDS Prep — free daily CDS practice from past UPSC papers",
    description: TAGLINE,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Defaults cap the description snippet and forbid large image previews;
      // for a study tool the richer result is the one that gets the click.
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  category: "education",
  // Chrome uses this for "Add to Home Screen" on the web, and it is the same
  // name the Android app carries.
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#151824" },
  ],
};

// Runs before first paint so a saved dark preference doesn't flash white.
const NO_FLASH = `try{var t=localStorage.getItem("cds-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
        <StructuredData />
      </head>
      <body className={`${inter.className} antialiased`}>
        {/* One panel holds the whole app — a device, not a page. Pages
            contribute only their content; the frame, scrolling and navigation
            all live in `AppFrame`, which also knows the routes that must NOT
            be framed. */}
        <AppFrame>{children}</AppFrame>
        {/* Counts arrivals, including the majority who land and leave without
            touching anything. Renders nothing and fires once per tab. */}
        <VisitBeacon />
      </body>
    </html>
  );
}
