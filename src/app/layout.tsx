import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Navbar from "@/components/Navbar";
import PanelScroll from "@/components/PanelScroll";
import StatusBar from "@/components/StatusBar";
import TabBar from "@/components/TabBar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "CDS English Prep",
  description:
    "Daily CDS English practice — 10 questions, 10 minutes, marked like the real paper.",
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
            <PanelScroll>{children}</PanelScroll>
            <TabBar />
          </div>
        </div>
      </body>
    </html>
  );
}
