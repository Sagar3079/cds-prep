import type { Metadata } from "next";
import Link from "next/link";
import { Barlow_Condensed, IBM_Plex_Mono, Inter } from "next/font/google";
import { MARKING } from "@/lib/daily";
import { PLANS, SITE, SUPPORT_EMAIL, rupees } from "@/lib/legal";
import LandingMotion from "./LandingMotion";
import "./landing.css";

/**
 * The advert's landing page.
 *
 * Every number on this page is read from the repo, not written by hand: the
 * marking values come from `MARKING`, the prices from `PLANS`, and the bank
 * counts from BANK_FACTS below, which is checked by `scripts/landing-facts.mjs`
 * against the actual question files. A landing page that drifts from the
 * product it sells is the normal failure mode, and for a page carrying claims
 * about answer provenance it would also be a false claim.
 *
 * There are deliberately no student counts, ratings or testimonials. We have no
 * real ones yet, and invented ones on a page that takes ad traffic are both a
 * lie to the reader and grounds for an ad account ban.
 */

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });

/**
 * Counts taken from the question banks. Verified by
 * `node scripts/landing-facts.mjs`, which fails if any of them drifts — the
 * point is that these are checkable, so they must stay true.
 */
const BANK_FACTS = {
  questions: 1324,
  officialKey: 985,
  papers: 15,
} as const;

const nf = new Intl.NumberFormat("en-IN");

const STEPS = [
  {
    title: "Open it. No sign-up.",
    body: "Today's set is already waiting — ten English questions, ten General Knowledge. Same set for everyone, every day, so the leaderboard means something.",
  },
  {
    title: "Ten minutes on the clock.",
    body: "The timer runs the way the invigilator's does. You can skip, come back, or leave a question blank — and leaving it blank is sometimes the right call.",
  },
  {
    title: "Review every question.",
    body: "The answer, where it came from, and why it is right. Your weakest topics get weighted into the practice sets you see next.",
  },
] as const;

const FAQ = [
  {
    q: "Is it really free?",
    a: "Today's test is free and stays free — both subjects, full review, streaks and the leaderboard. No account and no card to take it. A paid plan only adds unlimited extra practice sets on top.",
  },
  {
    q: "Where do the questions come from?",
    a: `Previous-year CDS papers, read out of the published PDFs and proofread. Every question shows how its answer was established, and ${nf.format(BANK_FACTS.officialKey)} of them are the answer UPSC itself published in the key for that paper. Where a question was written in the exam's style rather than taken from a real paper, it says so and shows no paper reference.`,
  },
  {
    q: "Do I need an account?",
    a: "Only to appear on the daily leaderboard. Your practice history is kept in your own browser either way — which also means clearing your browser data clears it.",
  },
  {
    q: "Is this affiliated with UPSC?",
    a: "No. CDS Prep is an independent study tool with no connection to the Union Public Service Commission or the Ministry of Defence, and it can't help with your application, admit card or result.",
  },
] as const;

export const metadata: Metadata = {
  title: "CDS Prep — ten questions, ten minutes, every day",
  description:
    "Daily CDS practice for English and General Knowledge. Real previous-year questions, marked +1 / −0.25 like the actual paper. Today's test is free — no account, no card.",
  alternates: { canonical: "/landing" },
  openGraph: {
    title: "CDS Prep — ten questions, ten minutes, every day",
    description:
      "Real CDS previous-year questions on a ten-minute clock, marked like the real paper. Free daily test, no account needed.",
    url: `${SITE.url}/landing`,
    siteName: SITE.name,
    type: "website",
  },
  robots: { index: true, follow: true },
};

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 12.5 5.2 5.2L20 7" />
    </svg>
  );
}

export default function LandingPage() {
  const weekly = PLANS.find((p) => p.id === "weekly")!;
  const monthly = PLANS.find((p) => p.id === "monthly")!;
  const penalty = Math.abs(MARKING.wrong);
  const minutes = Math.round(MARKING.durationSec / 60);

  return (
    <div className={`lp ${display.variable} ${mono.variable} ${body.variable}`}>
      <LandingMotion />

      {/* The world the content stands in: one light source, one receding
          floor. Fixed, so scrolling moves the reader through it. */}
      <div className="lp-field" aria-hidden="true">
        <div className="lp-grid" />
      </div>

      <header className="lp-nav">
        <Link href="/landing" className="lp-brand">
          <span aria-hidden="true">C</span>
          CDS Prep
        </Link>
        <Link href="/" className="lp-nav-cta">
          Open the app
        </Link>
      </header>

      <main className="lp-main">
        {/* ---------- HERO ---------- */}
        <section className="lp-wrap lp-hero">
          <div>
            <p className="lp-eyebrow lp-reveal">CDS &middot; English &amp; General Knowledge</p>
            <h1 className="lp-reveal" data-reveal-delay="60">
              Ten questions.
              <br />
              Ten minutes.
              <br />
              <em>Every day.</em>
            </h1>
            <div className="lp-hero-rule lp-reveal" data-reveal-delay="120" />
            <p className="lp-lede lp-reveal" data-reveal-delay="160">
              Real previous-year CDS questions, cut into a drill short enough
              that you finish it — and marked exactly like the paper you sit,
              negative marking and all.
            </p>
            <div className="lp-cta-row lp-reveal" data-reveal-delay="220">
              <Link href="/" className="lp-btn">
                Start today&apos;s test
                <span className="lp-btn-arrow" aria-hidden="true">→</span>
              </Link>
              <a href="#how" className="lp-btn-quiet">
                See how it works
              </a>
            </div>
            <p className="lp-reassure lp-reveal" data-reveal-delay="260">
              Free. No account, no card, no download.
            </p>
          </div>

          {/* The product, at the moment it matters: mid-question, clock
              running. Not a screenshot — the real card language, in 3D. */}
          <div className="lp-stage lp-reveal" data-reveal-delay="140" aria-hidden="true">
            <div className="lp-deck">
              <div className="lp-card lp-card--back2" />
              <div className="lp-card lp-card--back1" />
              <div className="lp-card lp-card--face">
                <div className="lp-card-head">
                  <span className="lp-card-q">Question 04 / 10</span>
                  <span className="lp-timer">
                    <i className="lp-timer-dot" />
                    06:12
                  </span>
                </div>
                <p className="lp-card-stem">
                  The chairman with the other members of the board{" "}
                  <mark>are touring</mark> Europe these days.
                </p>
                <div className="lp-opts">
                  <div className="lp-opt">
                    <b>A</b> have been on touring
                  </div>
                  <div className="lp-opt lp-opt--right">
                    <b>B</b> is touring
                  </div>
                  <div className="lp-opt">
                    <b>C</b> have toured
                  </div>
                  <div className="lp-opt">
                    <b>D</b> No improvement
                  </div>
                </div>
              </div>

              <span className="lp-chip lp-chip--mark">+1.00 correct</span>
              <span className="lp-chip lp-chip--neg">&minus;0.25 wrong</span>
              <span className="lp-chip lp-chip--streak">🔥 12-day streak</span>
            </div>
          </div>
        </section>

        {/* ---------- MARKING ---------- */}
        <section className="lp-wrap lp-section lp-section--edge">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">The part most practice skips</p>
            <h2>A guess costs you marks. Practise like it does.</h2>
            <p className="lp-lede">
              Most question banks tell you right or wrong and move on. The real
              paper takes {penalty} of a mark off every wrong answer, which
              makes knowing when to leave a question blank a skill of its own.
              Every set here is scored on the real rule.
            </p>
          </div>
          <div className="lp-marks">
            <div className="lp-mark lp-mark--plus lp-reveal" style={{ "--i": 0 } as React.CSSProperties}>
              <div className="lp-mark-value lp-mono">+{MARKING.correct.toFixed(2)}</div>
              <h3>Correct</h3>
              <p>What you came for.</p>
              {/* Three cards side by side on a phone, so the three lines are
                  kept to one length. Unequal copy in equal boxes reads as a
                  layout bug, not as emphasis. */}
            </div>
            <div className="lp-mark lp-mark--minus lp-reveal" data-reveal-delay="80" style={{ "--i": 1 } as React.CSSProperties}>
              <div className="lp-mark-value lp-mono">&minus;{penalty.toFixed(2)}</div>
              <h3>Wrong</h3>
              <p>Four guesses erase a right answer.</p>
            </div>
            <div className="lp-mark lp-mark--zero lp-reveal" data-reveal-delay="160" style={{ "--i": 2 } as React.CSSProperties}>
              <div className="lp-mark-value lp-mono">0.00</div>
              <h3>Left blank</h3>
              <p>Often the smartest move on the page.</p>
            </div>
          </div>
        </section>

        {/* ---------- PROVENANCE ---------- */}
        <section className="lp-wrap lp-section lp-section--edge">
          <div className="lp-split">
            <div>
              <div className="lp-section-head lp-reveal" style={{ marginBottom: 0 }}>
                <p className="lp-eyebrow lp-eyebrow--blue">Where the answers come from</p>
                <h2>We tell you which answers are official.</h2>
                <p className="lp-lede">
                  Every question carries a label saying how its answer was
                  established, and you see it when you review. Where the answer
                  is the one UPSC published in the key for that paper, it says
                  so. Where a question was written in the exam&apos;s style
                  rather than taken from a real paper, it says that too — and
                  shows no paper reference.
                </p>
                <p className="lp-lede" style={{ marginTop: "1rem" }}>
                  It is a strange thing to advertise. It is also the reason you
                  can trust the rest.
                </p>
              </div>
            </div>
            <dl className="lp-stats lp-reveal" data-reveal-delay="80">
              <div className="lp-stat">
                <dt>Questions</dt>
                <dd className="lp-mono">
                  {nf.format(BANK_FACTS.questions)}
                  <small>Across English and General Knowledge.</small>
                </dd>
              </div>
              <div className="lp-stat">
                <dt>From official keys</dt>
                <dd className="lp-mono">
                  {nf.format(BANK_FACTS.officialKey)}
                  <small>Answers read from the key UPSC published for that paper.</small>
                </dd>
              </div>
              <div className="lp-stat">
                <dt>Papers mined</dt>
                <dd className="lp-mono">
                  {BANK_FACTS.papers}
                  <small>Previous-year CDS papers, read and proofread.</small>
                </dd>
              </div>
              <div className="lp-stat">
                <dt>Minutes a day</dt>
                <dd className="lp-mono">
                  {minutes}
                  <small>Per subject. Short enough that you actually do it.</small>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ---------- HOW ---------- */}
        <section id="how" className="lp-wrap lp-section lp-section--edge">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">How it works</p>
            <h2>Three minutes to learn. Ten a day to keep.</h2>
          </div>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div
                key={s.title}
                className="lp-step lp-reveal"
                data-reveal-delay={i * 80}
              >
                {/* Numbered because it IS a sequence — you cannot review a
                    test you have not sat. */}
                <div className="lp-step-n lp-mono">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- HABIT ---------- */}
        <section className="lp-wrap lp-section lp-section--edge">
          <div className="lp-split lp-split--flip">
            <div className="lp-stats lp-reveal" data-reveal-delay="60">
              <div className="lp-stat">
                <dt>Streak</dt>
                <dd className="lp-mono">
                  Daily
                  <small>
                    One set a day, the same set for everyone. Miss a day and the
                    streak goes — which turns out to be motivating.
                  </small>
                </dd>
              </div>
              <div className="lp-stat">
                <dt>Leaderboard</dt>
                <dd className="lp-mono">
                  Today
                  <small>
                    Only today&apos;s scores, per subject, scored on our server
                    so a fast browser can&apos;t fake a rank.
                  </small>
                </dd>
              </div>
            </div>
            <div className="lp-section-head lp-reveal" style={{ marginBottom: 0 }}>
              <p className="lp-eyebrow">Why a daily set at all</p>
              <h2>The syllabus is not the problem. Turning up is.</h2>
              <p className="lp-lede">
                Nobody fails CDS because ten more questions existed. They fail
                because a month disappeared. So there is one set a day, it is
                the same set for every candidate, and it takes ten minutes —
                small enough that skipping it is a decision rather than an
                accident.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- PRICING ---------- */}
        <section className="lp-wrap lp-section lp-section--edge">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">Pricing</p>
            <h2>The daily test is free. Permanently.</h2>
            <p className="lp-lede">
              A plan buys more practice — unlimited random sets drawn from the
              whole bank, weighted towards the topics you keep losing marks on.
              Nothing else changes.
            </p>
          </div>
          <div className="lp-plans">
            <div className="lp-plan lp-plan--hero lp-reveal">
              <span className="lp-plan-name lp-display">Daily</span>
              <div className="lp-plan-price lp-mono">Free</div>
              <span className="lp-plan-per">Always</span>
              <ul>
                <li><Tick /> Today&apos;s English set and GK set</li>
                <li><Tick /> Real marking on a {minutes}-minute clock</li>
                <li><Tick /> Full review with answer provenance</li>
                <li><Tick /> Streaks, topic history, leaderboard</li>
              </ul>
              <div className="lp-plan-foot">
                <Link href="/" className="lp-btn" style={{ width: "100%", justifyContent: "center" }}>
                  Start now
                </Link>
              </div>
            </div>

            <div className="lp-plan lp-reveal" data-reveal-delay="80">
              <span className="lp-plan-name lp-display">Weekly</span>
              <div className="lp-plan-price lp-mono">{rupees(weekly.paise)}</div>
              <span className="lp-plan-per">for {weekly.days} days</span>
              <ul>
                <li><Tick /> Everything in Daily</li>
                <li><Tick /> Unlimited random practice sets</li>
                <li><Tick /> Weighted to your weak topics</li>
              </ul>
              <div className="lp-plan-foot">
                <Link href="/pricing" className="lp-btn-quiet">
                  See full pricing →
                </Link>
              </div>
            </div>

            <div className="lp-plan lp-reveal" data-reveal-delay="160">
              <span className="lp-plan-name lp-display">Monthly</span>
              <div className="lp-plan-price lp-mono">{rupees(monthly.paise)}</div>
              <span className="lp-plan-per">for {monthly.days} days</span>
              <ul>
                <li><Tick /> Everything in Weekly</li>
                <li><Tick /> About half the weekly rate</li>
                <li><Tick /> No auto-renewal</li>
              </ul>
              <div className="lp-plan-foot">
                <Link href="/pricing" className="lp-btn-quiet">
                  See full pricing →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="lp-wrap lp-section lp-section--edge">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">Straight answers</p>
            <h2>Before you start</h2>
          </div>
          <div className="lp-faq">
            {FAQ.map((f, i) => (
              <details key={f.q} className="lp-reveal" data-reveal-delay={i * 60}>
                <summary>{f.q}</summary>
                <div className="lp-faq-body">{f.a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- CLOSE ---------- */}
        <section className="lp-close">
          <div className="lp-wrap">
            <p className="lp-eyebrow lp-reveal">Today&apos;s set is waiting</p>
            <h2 className="lp-reveal" data-reveal-delay="60">
              Ten minutes.
              <br />
              <em style={{ fontStyle: "normal", color: "var(--lp-signal)" }}>
                Starting now.
              </em>
            </h2>
            <p className="lp-lede lp-reveal" data-reveal-delay="120" style={{ marginTop: "1.25rem" }}>
              No account. No card. Just today&apos;s ten.
            </p>
            <div className="lp-cta-row lp-reveal" data-reveal-delay="180">
              <Link href="/" className="lp-btn">
                Start today&apos;s test
                <span className="lp-btn-arrow" aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <nav className="lp-foot-links" aria-label="Policies">
            <Link href="/about">About us</Link>
            <Link href="/contact">Contact us</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/terms">Terms &amp; conditions</Link>
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/refunds">Refunds &amp; cancellation</Link>
            <Link href="/shipping">Delivery</Link>
          </nav>
          <p>
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--lp-muted)" }}>
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p>
            CDS Prep is an independent study tool. It is not affiliated with,
            endorsed by, or connected to the Union Public Service Commission or
            the Ministry of Defence. Practising here is not a prediction of any
            examination result.
          </p>
        </div>
      </footer>

      {/* Phone only, and only once the hero's button is gone. Ads for this page
          run on mobile, where the real CTA is off-screen for almost the whole
          session — this is the one that gets tapped. */}
      <div className="lp-sticky" data-shown="false">
        <span className="lp-sticky-copy">
          <b>Today&apos;s test</b>
          Free · no account
        </span>
        <Link href="/" className="lp-btn">
          Start
          <span className="lp-btn-arrow" aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
