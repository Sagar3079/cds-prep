import Navbar from "@/components/Navbar";
import HomeStats from "@/components/HomeStats";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full">
        <HomeStats />

        <section className="grid md:grid-cols-2 gap-4">
          <div className="card">
            <h2 className="font-semibold text-lavender-800 mb-2">How it works</h2>
            <ul className="text-sm text-lavender-700/80 space-y-2 list-disc pl-4">
              <li>10 fresh questions drawn from official UPSC CDS English papers</li>
              <li>10-minute countdown timer</li>
              <li>+1 for correct · −0.25 for wrong · 0 for skip</li>
              <li>Instant review with correct answers after submit</li>
            </ul>
          </div>
          <div className="card">
            <h2 className="font-semibold text-lavender-800 mb-2">Topics covered</h2>
            <div className="flex flex-wrap gap-2">
              {[
                "Synonyms",
                "Antonyms",
                "Spotting Errors",
                "Fill in the Blanks",
                "Sentence Improvement",
                "Ordering of Words",
                "Ordering of Sentences",
                "Comprehension",
                "Cloze Test",
                "Idioms & Phrases",
                "Prepositions",
                "Active–Passive",
                "Direct–Indirect",
                "One Word Substitution",
                "Homophones",
                "Phrasal Verbs",
              ].map((t) => (
                <span
                  key={t}
                  className="text-xs px-2.5 py-1 rounded-full bg-lavender-100 text-lavender-700 font-medium"
                >
                  {t}
                </span>
              ))}
            </div>
            <Link
              href="/history"
              className="inline-block mt-4 text-sm font-semibold text-lavender-600 hover:text-lavender-800"
            >
              View history →
            </Link>
          </div>
        </section>
      </main>
      <footer className="py-6 text-center text-sm text-lavender-600/70">
        Powered by official UPSC CDS previous year papers
      </footer>
    </div>
  );
}
