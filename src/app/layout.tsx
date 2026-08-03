import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Navbar from "@/components/Navbar";
import PanelScroll from "@/components/PanelScroll";
import SiteFooter from "@/components/SiteFooter";
import StatusBar from "@/components/StatusBar";
import TabBar from "@/components/TabBar";
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
            all live here so no page mounts its own. */}
        <div className="app-stage">
          <div className="shell app-panel">
            <StatusBar />
            <Navbar />
            {/* The footer lives INSIDE the scroller, not beside it: the policy
                links have to be reachable from every route (a payment gateway's
                reviewer opens the home page and looks for them), and a fixed
                strip would eat height from a panel that is already a phone. */}
            <PanelScroll>
              {children}
              <SiteFooter />
            </PanelScroll>
            <TabBar />
          </div>
        </div>
      </body>
    </html>
  );
}
