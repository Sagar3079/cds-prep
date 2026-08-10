"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import PanelScroll from "./PanelScroll";
import SiteFooter from "./SiteFooter";
import StatusBar from "./StatusBar";
import TabBar from "./TabBar";

/**
 * Decides whether a route gets the device frame.
 *
 * The whole app lives inside one phone-shaped panel — that IS the product, and
 * every route below is content inside it. A landing page is the exception: it
 * is a full-bleed page an advert drops a stranger onto, and putting it in a
 * 460px column inside a grey stage would waste the one screen that has to sell.
 *
 * Done here, on `pathname`, rather than by moving thirteen route directories
 * into a `(app)` group. The group is the more idiomatic shape, but the move
 * would touch every route in the app — including the seven policy pages a
 * payment gateway is about to be pointed at — to change where two divs render.
 * This is one file and it is reversible.
 *
 * `children` stays a prop, so pages below remain server components: only the
 * frame is client, not what it frames.
 */
// `/admin` is a dashboard of tables and charts, read on a desktop. The phone-
// shaped panel would give it a 420px column to draw them in.
const BARE_ROUTES = ["/landing", "/admin"];

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return <>{children}</>;
  }

  return (
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
  );
}
