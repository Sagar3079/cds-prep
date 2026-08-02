"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/",
    label: "Today",
    icon: (
      <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5.2l3.4 2" />
      </>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 14a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
      </>
    ),
  },
] as const;

/**
 * Bottom navigation, the way a handset app actually works. Previously the only
 * route into History was a link buried in a card on the home screen.
 *
 * Hidden during a run: the test owns the bottom of the screen with Prev/Next/
 * Submit, and letting someone tab away mid-test with a clock running is a trap.
 */
export default function TabBar() {
  const pathname = usePathname();
  if (pathname === "/test") return null;

  return (
    <nav
      aria-label="Sections"
      className="flex-none flex items-stretch border-t border-line bg-paper pb-1"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[0.6875rem] font-bold transition-colors ${
              active ? "text-accent-ink" : "text-muted"
            }`}
          >
            <span
              className={`grid place-items-center rounded-full px-4 py-1 transition-[background-color,transform] duration-200 ${
                active ? "bg-accent-soft scale-100" : "bg-transparent scale-95"
              }`}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={active ? 2.4 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {tab.icon}
              </svg>
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
