import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-lavender-200">
      <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-lavender-400 to-lavender-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
            C
          </span>
          <span className="text-lg font-bold text-lavender-800 group-hover:text-lavender-600 transition">
            CDS English Prep
          </span>
        </Link>
        <div className="flex gap-1 text-sm font-medium">
          <Link
            href="/test"
            className="px-3 py-1.5 rounded-lg text-lavender-700 hover:bg-lavender-100 transition"
          >
            Daily
          </Link>
          <Link
            href="/test?mode=random"
            className="px-3 py-1.5 rounded-lg text-lavender-700 hover:bg-lavender-100 transition"
          >
            Random
          </Link>
          <Link
            href="/history"
            className="px-3 py-1.5 rounded-lg text-lavender-700 hover:bg-lavender-100 transition"
          >
            History
          </Link>
        </div>
      </div>
    </nav>
  );
}
