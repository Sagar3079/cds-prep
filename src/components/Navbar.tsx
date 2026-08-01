import Link from "next/link";
import StreakChip from "./StreakChip";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-50 bg-paper/90 backdrop-blur border-b border-line"
    >
      {/* flex-wrap is load-bearing: without it this row overflowed at 360px */}
      <div className="shell px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 shrink-0 rounded-[0.625rem] bg-accent text-on-accent grid place-items-center text-sm font-extrabold">
            C
          </span>
          <span className="font-bold text-ink tracking-tight truncate">CDS English</span>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <StreakChip />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
