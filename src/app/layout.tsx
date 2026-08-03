import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import AppFrame from "@/components/AppFrame";
import { SITE } from "@/lib/legal";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  // Needed for `sitemap.ts`, `robots.ts` and any absolute URL Next generates.
  // Without it those emit relative URLs, which a crawler treats as broken.
  metadataBase: new URL(SITE.url),
  // "CDS Prep" — the repo's own name — rather than "CDS English Prep", which
  // stopped being true when General Knowledge became a second subject.
  title: "CDS Prep",
  description:
    "Daily CDS practice in English and General Knowledge — 10 questions, 10 minutes, marked like the real paper.",
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
      </head>
      <body className={`${inter.className} antialiased`}>
        {/* One panel holds the whole app — a device, not a page. Pages
            contribute only their content; the frame, scrolling and navigation
            all live in `AppFrame`, which also knows the routes that must NOT
            be framed. */}
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
