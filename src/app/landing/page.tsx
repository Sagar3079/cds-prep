import type { Metadata } from "next";
import Link from "next/link";
import { Anton, IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { MARKING } from "@/lib/daily";
import { PLANS, SITE, SUPPORT_EMAIL, rupees } from "@/lib/legal";
import questions from "@/data/questions.json";
import type { Question } from "@/types";
import Potter from "@/components/potter/Potter";
import Kuromi from "@/components/potter/Kuromi";
import Countdown from "./Countdown";
import LandingMotion from "./LandingMotion";
import TryQuestion from "./TryQuestion";
import "./landing.css";

/** The session this is selling practice for. One place, so the badge, the
 *  eyebrow and any future copy cannot disagree. */
const EXAM_YEAR = 2026;

/**
 * The page paid traffic lands on. Mobile-first, because that is the only
 * device the ads target.
 *
 * The argument it makes, in order: here is a real question, answer it now;
 * that is what the marking feels like; here is where the questions come from;
 * here is what a week of it looks like; it is free.
 *
 * Every number is read from the repo — marking from `MARKING`, prices from
 * `PLANS`, bank counts from `BANK_FACTS` (asserted by
 * `scripts/landing-facts.mjs`). There are no student counts, ratings or
 * testimonials, and there must not be until they are real: invented ones are a
 * lie to the reader and get ad accounts banned.
 */

const display = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });
const body = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });

const BANK_FACTS = { questions: 1324, officialKey: 985, papers: 15 } as const;

/**
 * The question in the hero, taken from the bank rather than written for the
 * advert — a mocked-up question on a page selling real questions would be a
 * strange thing to do. Subject-verb agreement: widely taught, satisfying to
 * get right, and it shows off the underlined-part highlight.
 */
const DEMO_ID = "cds1-2017-084";

function demoQuestion() {
  const bank = questions as unknown as Question[];
  const q = bank.find((x) => x.id === DEMO_ID);
  // Falls back to any improvement item with a target rather than throwing: a
  // landing page that 500s because one record was renamed is a worse outcome
  // than one showing a different question.
  const pick =
    q ??
    bank.find(
      (x) =>
        x.target &&
        x.answer !== null &&
        x.options.some((o) => /^\s*no\s*improvement\s*$/i.test(o)),
    );
  if (!pick || pick.answer === null) return null;
  return {
    stem: pick.question,
    target: pick.target ?? "",
    options: pick.options,
    answer: pick.answer,
    paper:
      /^cds[12]-/.test(pick.id) && pick.session && pick.year
        ? `CDS-${pick.session} ${pick.year} · actual paper`
        : "CDS practice item",
  };
}

const FEATURES = [
  {
    title: "Marked like the real paper",
    body: `+${MARKING.correct} / ${MARKING.wrong} / 0 on a ${Math.round(MARKING.durationSec / 60)}-minute clock. You learn when a guess is worth it.`,
    icon: (
      <>
        <path d="M4 12.5 9 17.5 20 6.5" />
      </>
    ),
  },
  {
    title: "You see which answers are official",
    body: "Each question says how its answer was established — and says so plainly when it wasn't taken from a real paper.",
    icon: (
      <>
        <path d="M12 3l7.5 3.5v5c0 4.6-3.1 8.4-7.5 9.5-4.4-1.1-7.5-4.9-7.5-9.5v-5L12 3Z" />
        <path d="m9 12 2.2 2.2L15.5 10" />
      </>
    ),
  },
  {
    title: "It finds your weak topics",
    body: "The review tells you why, not just what. Topics you keep dropping get weighted into what you see next.",
    icon: (
      <>
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
      </>
    ),
  },
] as const;

const FAQ = [
  {
    q: "Is it actually free?",
    a: "Today's test is free and stays free — both subjects, the full review, streaks and the leaderboard. No account and no card to take it. A paid plan only adds unlimited extra practice sets on top.",
  },
  {
    q: "Where do the questions come from?",
    a: "Previous-year CDS papers, read out of the published PDFs and proofread. 985 of them carry the answer UPSC itself published in the key for that paper, and every question tells you which tier it belongs to.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. It runs in your browser. Add it to your home screen if you want it to open like an app.",
  },
  {
    q: "Is this affiliated with UPSC?",
    a: "No. CDS Prep is an independent study tool with no connection to the Union Public Service Commission or the Ministry of Defence, and it cannot help with your application, admit card or result.",
  },
] as const;

export const metadata: Metadata = {
  title: "CDS Prep — ten minutes a day, marked like the real paper",
  description:
    "Answer a real CDS previous-year question right now. Ten questions, ten minutes, marked +1 / −0.25 like the actual paper. Free daily test — no account, no card.",
  alternates: { canonical: "/landing" },
  openGraph: {
    title: "CDS Prep — ten minutes a day, marked like the real paper",
    description:
      "Real CDS previous-year questions on a ten-minute clock. Free daily test, no account needed.",
    url: `${SITE.url}/landing`,
    siteName: SITE.name,
    type: "website",
  },
};

function Tick() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 12.5 5.2 5.2L20 7" />
    </svg>
  );
}

export default function LandingPage() {
  const demo = demoQuestion();
  const weekly = PLANS.find((p) => p.id === "weekly")!;
  const monthly = PLANS.find((p) => p.id === "monthly")!;
  const minutes = Math.round(MARKING.durationSec / 60);

  return (
    <div className={`lp ${display.variable} ${body.variable} ${mono.variable}`}>
      <LandingMotion />
      {/* The floor the whole page stands on. Fixed, so scrolling moves the
          reader through a space instead of down a document. */}
      <div className="floor" aria-hidden="true" />

      <header className="nav">
        <Link href="/landing" className="brand">
          <i aria-hidden="true">C</i> CDS Prep
        </Link>
        <Countdown />
      </header>

      <main>
        {/* ---------- HERO ---------- */}
        <section className="wrap hero">
          <div>
            <p className="eyebrow rise">
              CDS {EXAM_YEAR} · English &amp; General Knowledge
            </p>
            {/* Word by word, so the headline lands like a countdown rather
                than appearing all at once. `--i` drives the stagger. */}
            <h1 className="words">
              {"Ten minutes a day.".split(" ").map((w, i) => (
                <span key={i} className="w" style={{ "--i": i } as React.CSSProperties}>
                  {w}{" "}
                </span>
              ))}
              <br />
              <em>
                {"That's the whole plan.".split(" ").map((w, i) => (
                  <span key={i} className="w" style={{ "--i": i + 3 } as React.CSSProperties}>
                    {w}{" "}
                  </span>
                ))}
              </em>
            </h1>

            {/* The three objections a cold visitor has, answered before they
                are asked. These are the reason someone taps, so they get
                weight rather than a line of grey small print. */}
            <ul className="claims rise" data-delay="420" aria-label="What it costs">
              <li className="claim claim--free">
                <b>₹0</b>
                <span>Free daily test</span>
              </li>
              <li className="claim">
                <b>No</b>
                <span>account needed</span>
              </li>
              <li className="claim">
                <b>0</b>
                <span>apps to install</span>
              </li>
            </ul>

            <p className="lede rise" data-delay="480">
              Real CDS previous-year questions, marked the way UPSC marks them.
              Try the one below — it takes ten seconds.
            </p>
            <div className="hero-cta rise" data-delay="540" data-cta-anchor>
              <Link href="/" className="btn btn--go btn--wide">
                Start today&apos;s free test
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          {/* The page's whole argument, in one card — sitting in a real 3D
              scene. Two ghosts behind it at negative Z say "there is a stack
              of these"; the two chips sit in FRONT of it, which is the cue
              that sells the depth. The deck's tilt comes from the handset's
              own orientation on a phone. */}
          <div className="stage rise" data-delay="600">
            {/* The companions, peering at the question over the top of the
                card — the same thing they do on every card inside the app, so
                the advert and the product share a face. Behind the deck in Z,
                so only their heads clear it. Decorative: they carry no
                information and are hidden from assistive tech. */}
            <div className="cast" aria-hidden="true">
              {/* `thoughtsOn` left at its default. Passing `false` draws the
                  little "thoughts muted" badge beside their heads, which is a
                  control on a screen with no control to press. With no
                  `onToggle` the figures render inert and speechless — the
                  bubble is the parent's job, and here there is no bubble. */}
              {/* One says what costs nothing, the other says what the plan
                  adds. Two short lines rather than a pitch: a speech bubble on
                  a phone gets about four words before it stops being read.
                  Neither claims you can buy today — billing is not live, and a
                  bubble promising a purchase that 404s at the till would burn
                  the click it won. */}
              <span className="cast-one cast-one--l">
                <b className="say say--l">Ten a day. Free.</b>
                <Potter size={64} mood="peek" lookY={-0.6} look={0.25} />
              </span>
              <span className="cast-one cast-one--r">
                <b className="say say--r">Want more? Go unlimited.</b>
                <Kuromi size={64} mood="peek" lookY={-0.6} look={-0.25} />
              </span>
            </div>
            <div className="deck">
              <span className="deck-ghost deck-ghost--2" aria-hidden="true" />
              <span className="deck-ghost deck-ghost--1" aria-hidden="true" />
              {demo ? (
                <TryQuestion {...demo} />
              ) : (
                <div className="try">
                  <p className="try-stem">Today&apos;s set is ready.</p>
                  <Link href="/" className="btn btn--go btn--wide">
                    Start today&apos;s test
                  </Link>
                </div>
              )}
              <span className="chip3d chip3d--ok" aria-hidden="true">
                +1.00
              </span>
              <span className="chip3d chip3d--bad" aria-hidden="true">
                −0.25
              </span>
            </div>
          </div>
        </section>

        {/* ---------- NUMBERS ---------- */}
        <section className="wrap sec">
          <div className="sec-head rise">
            <p className="eyebrow">The bank</p>
            <h2>
              Built from the <em>real papers</em>.
            </h2>
          </div>
          <div className="figs rise" data-delay="60">
            <div className="fig">
              <span className="fig-n mono" data-count={BANK_FACTS.questions}>
                {BANK_FACTS.questions.toLocaleString("en-IN")}
              </span>
              <span className="fig-l">questions</span>
            </div>
            <div className="fig">
              <span className="fig-n mono" data-count={BANK_FACTS.officialKey}>
                {BANK_FACTS.officialKey.toLocaleString("en-IN")}
              </span>
              <span className="fig-l">
                answers from the official UPSC key
              </span>
            </div>
            <div className="fig">
              <span className="fig-n mono" data-count={BANK_FACTS.papers}>
                {BANK_FACTS.papers}
              </span>
              <span className="fig-l">past papers mined</span>
            </div>
          </div>
        </section>

        {/* ---------- WHAT YOU GET ---------- */}
        <section className="wrap sec">
          <div className="sec-head rise">
            <p className="eyebrow">What you get</p>
            <h2>
              Practice that <em>tells you the truth</em>.
            </h2>
          </div>
          <div className="rows">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="row rise" data-delay={i * 70}>
                <span className="row-ico" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    {f.icon}
                  </svg>
                </span>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="proof rise" data-delay="120">
            <div className="proof-cell">
              <span className="proof-k">Per day</span>
              <span className="proof-v">
                {minutes}<small>min × 2</small>
              </span>
            </div>
            <div className="proof-cell">
              <span className="proof-k">Per set</span>
              <span className="proof-v">
                10<small>questions</small>
              </span>
            </div>
            <div className="proof-cell">
              <span className="proof-k">Subjects</span>
              <span className="proof-v">
                2<small>Eng + GK</small>
              </span>
            </div>
            <div className="proof-cell">
              <span className="proof-k">Cost</span>
              <span className="proof-v">
                ₹0<small>daily set</small>
              </span>
            </div>
          </div>
        </section>

        {/* ---------- PRICING ---------- */}
        <section className="wrap sec">
          <div className="sec-head rise">
            <p className="eyebrow">Pricing</p>
            <h2>
              The daily test is <em>free forever</em>.
            </h2>
            <p className="lede">
              A plan only adds unlimited extra sets, weighted to the topics you
              keep losing marks on. Nothing else changes.
            </p>
          </div>
          <div className="plans">
            <div className="plan plan--free rise">
              <span className="plan-n">Daily</span>
              <div className="plan-p">Free</div>
              <span className="plan-sub">Always</span>
              <ul>
                <li><Tick /> Today&apos;s English and GK sets</li>
                <li><Tick /> Real marking, {minutes}-minute clock</li>
                <li><Tick /> Full review + answer provenance</li>
                <li><Tick /> Streaks and the daily leaderboard</li>
              </ul>
              <div className="plan-foot">
                <Link href="/" className="btn btn--go btn--wide">Start now</Link>
              </div>
            </div>
            <div className="plan rise" data-delay="70">
              <span className="plan-n">Weekly</span>
              <div className="plan-p mono">{rupees(weekly.paise)}</div>
              <span className="plan-sub">{weekly.days} days</span>
              <ul>
                <li><Tick /> Everything in Daily</li>
                <li><Tick /> Unlimited random sets</li>
              </ul>
              <div className="plan-foot">
                <Link href="/pricing" className="plan-link">Full pricing →</Link>
              </div>
            </div>
            <div className="plan rise" data-delay="140">
              <span className="plan-n">Monthly</span>
              <div className="plan-p mono">{rupees(monthly.paise)}</div>
              <span className="plan-sub">{monthly.days} days</span>
              <ul>
                <li><Tick /> Everything in Weekly</li>
                <li><Tick /> No auto-renewal</li>
              </ul>
              <div className="plan-foot">
                <Link href="/pricing" className="plan-link">Full pricing →</Link>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="wrap sec">
          <div className="sec-head rise">
            <p className="eyebrow">Before you start</p>
            <h2>Straight answers.</h2>
          </div>
          <div className="faq">
            {FAQ.map((f, i) => (
              <details key={f.q} className="rise" data-delay={i * 50}>
                <summary>{f.q}</summary>
                <div className="faq-a">{f.a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- CLOSE ---------- */}
        <section className="close">
          <div className="wrap">
            <p className="eyebrow rise">
              <Countdown />
            </p>
            <h2 className="rise" data-delay="60">
              Ten minutes.
              <br />
              <em>Starting now.</em>
            </h2>
            <p className="lede rise" data-delay="110">
              Today&apos;s set is waiting. Tomorrow&apos;s will be a different
              one.
            </p>
            <Link href="/" className="btn btn--go rise" data-delay="160">
              Start today&apos;s test
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <nav className="foot-nav" aria-label="Policies">
            <Link href="/about">About us</Link>
            <Link href="/contact">Contact us</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refunds">Refunds</Link>
            <Link href="/shipping">Delivery</Link>
          </nav>
          <p>
            <a className="mail" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
          <p>
            CDS Prep is an independent study tool. Not affiliated with,
            endorsed by, or connected to the Union Public Service Commission or
            the Ministry of Defence. Practising here is not a prediction of any
            examination result.
          </p>
        </div>
      </footer>

      {/* Phone only, after the hero button leaves. */}
      <div className="dock" data-shown="false">
        <span className="dock-copy">
          <b>Today&apos;s set</b>
          Free · no account
        </span>
        <Link href="/" className="btn btn--go">
          Start <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
