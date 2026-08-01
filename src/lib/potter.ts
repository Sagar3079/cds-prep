import type { Mood } from "@/components/potter/Potter";

/**
 * Potter's lines.
 *
 * Rules he lives by:
 * - never claim an answer is right or wrong before it is marked
 * - never call a blank a mistake; under −0.25 marking a blank is often correct
 * - react to the situation, not at random, so he reads as paying attention
 */

export interface Line {
  text: string;
  mood: Mood;
}

const pick = <T,>(arr: T[], seed: number): T => arr[Math.abs(seed) % arr.length];

/* ── while a test is running ───────────────────────────────────────────── */

const ON_START: Line[] = [
  { text: "ten minutes. we lock in.", mood: "excited" },
  { text: "okay okay let's cook 🔥", mood: "excited" },
  { text: "no thoughts, just vocab", mood: "cheer" },
];

const HARD_ONE: Line[] = [
  { text: "ooof. that one's mean.", mood: "wince" },
  { text: "nah this one's built different", mood: "thinking" },
  { text: "hmm. read it twice.", mood: "thinking" },
  { text: "this is a filter question fr", mood: "wince" },
];

const ANSWERED_FAST: Line[] = [
  { text: "instant. no notes.", mood: "impressed" },
  { text: "okay speedrun 👀", mood: "excited" },
  { text: "you had that one loaded", mood: "cheer" },
];

const MIDWAY: Line[] = [
  { text: "halfway. still cruising.", mood: "cheer" },
  { text: "pace is good, keep it", mood: "excited" },
  { text: "five down. eyes up.", mood: "idle" },
];

const LOW_TIME: Line[] = [
  { text: "clock's cooking. pick and move.", mood: "wince" },
  { text: "two mins — don't stall", mood: "thinking" },
  { text: "blank beats a wild guess btw", mood: "thinking" },
];

const NEAR_END: Line[] = [
  { text: "last one. finish clean.", mood: "excited" },
  { text: "one more and we're out", mood: "cheer" },
];

const IDLE_LOOK: Line[] = [
  { text: "take your time. i'm just vibing.", mood: "idle" },
  { text: "reading over your shoulder 👀", mood: "peek" },
  { text: "eliminate two, then commit", mood: "thinking" },
];

/**
 * What Potter says during a run. Deterministic given the situation — he must
 * not appear to change his mind about the same moment.
 */
export function testLine(o: {
  index: number;
  total: number;
  answered: number;
  secondsLeft: number;
  dwellMs: number;
  justAnswered: boolean;
}): Line | null {
  const { index, total, answered, secondsLeft, dwellMs, justAnswered } = o;

  if (index === 0 && dwellMs < 3500) return pick(ON_START, index);
  if (secondsLeft <= 120 && secondsLeft > 0) return pick(LOW_TIME, secondsLeft);
  if (index === total - 1) return pick(NEAR_END, index);
  if (justAnswered && dwellMs < 4000) return pick(ANSWERED_FAST, index * 7);
  if (index === Math.floor(total / 2) && answered >= index) return pick(MIDWAY, index);
  // lingering on one question reads as difficulty
  if (dwellMs > 22000) return pick(HARD_ONE, index * 3);
  if (dwellMs > 9000) return pick(IDLE_LOOK, index * 5);
  return null;
}

/* ── reviewing answers afterwards ──────────────────────────────────────── */

const GOT_IT: Line[] = [
  { text: "clean. next.", mood: "cheer" },
  { text: "yeah that was never in doubt", mood: "impressed" },
  { text: "locked in ✅", mood: "excited" },
];

const MISSED: Line[] = [
  { text: "close one. worth a reread.", mood: "thinking" },
  { text: "this one's a trap, everyone eats it", mood: "wince" },
  { text: "note it down, it repeats", mood: "thinking" },
];

const SKIPPED: Line[] = [
  { text: "left blank — costs you nothing", mood: "idle" },
  { text: "smart skip tbh", mood: "impressed" },
];

const UNTRUSTED: Line[] = [
  { text: "careful — no official key on this one", mood: "wince" },
  { text: "this answer isn't from UPSC, fyi", mood: "thinking" },
];

export function reviewLine(o: {
  index: number;
  correct: boolean;
  skipped: boolean;
  official: boolean;
}): Line {
  if (!o.official) return pick(UNTRUSTED, o.index);
  if (o.skipped) return pick(SKIPPED, o.index);
  return o.correct ? pick(GOT_IT, o.index * 3) : pick(MISSED, o.index * 5);
}

/* ── the home screen ───────────────────────────────────────────────────── */

export function homeLine(o: {
  doneToday: boolean;
  streak: number;
  accuracy: number;
  tests: number;
}): Line {
  if (o.tests === 0) return { text: "first one's the hardest. let's go.", mood: "excited" };
  if (o.doneToday && o.streak >= 3)
    return { text: `${o.streak} days straight. certified.`, mood: "cheer" };
  if (o.doneToday) return { text: "done for today. proud of you 🫡", mood: "impressed" };
  if (o.streak >= 3) return { text: `don't break the ${o.streak}-day run`, mood: "thinking" };
  if (o.accuracy >= 75) return { text: "accuracy's looking sharp", mood: "impressed" };
  return { text: "ten minutes. that's the whole ask.", mood: "peek" };
}
