import type { Mood } from "@/components/potter/Potter";

/**
 * Potter's lines.
 *
 * Rules he lives by:
 * - never claim an answer is right or wrong before it is marked
 * - never call a blank a mistake; under −0.25 marking a blank is often correct
 * - react to the situation, not at random, so he reads as paying attention
 *
 * Every pool is indexed by a seed derived from the situation, never by
 * `Math.random()` — the same moment must produce the same thought on every
 * render, or he reads as changing his mind.
 */

export interface Line {
  text: string;
  mood: Mood;
}

const pick = <T,>(arr: T[], seed: number): T =>
  arr[Math.abs(Math.trunc(seed) || 0) % arr.length];

/** Fills `{n}` in a templated line. */
const fill = (l: Line, n: number): Line => ({ ...l, text: l.text.replace("{n}", String(n)) });

/* ── while a test is running ───────────────────────────────────────────── */

const ON_START: Line[] = [
  { text: "ten minutes. we lock in.", mood: "excited" },
  { text: "okay okay let's cook 🔥", mood: "excited" },
  { text: "no thoughts, just vocab", mood: "cheer" },
  { text: "ten questions. one breath. go.", mood: "excited" },
  { text: "first one sets the tempo", mood: "thinking" },
  { text: "we're not rushing. we're moving.", mood: "cheer" },
  { text: "clock's running. so are we.", mood: "excited" },
  { text: "day one energy, every day", mood: "cheer" },
  { text: "eyes on the page. i'm here.", mood: "peek" },
  { text: "warmed up? cool. me neither.", mood: "idle" },
];

const HARD_ONE: Line[] = [
  { text: "ooof. that one's mean.", mood: "wince" },
  { text: "nah this one's built different", mood: "thinking" },
  { text: "hmm. read it twice.", mood: "thinking" },
  { text: "this is a filter question fr", mood: "wince" },
  { text: "okay this one's got layers", mood: "thinking" },
  { text: "cut the two worst options first", mood: "thinking" },
  { text: "if it's fog, skipping is free", mood: "idle" },
  { text: "examiner was in their villain era", mood: "wince" },
  { text: "don't wrestle it. park it.", mood: "thinking" },
  { text: "tough one. costs nothing to leave it.", mood: "idle" },
];

const ANSWERED_FAST: Line[] = [
  { text: "instant. no notes.", mood: "impressed" },
  { text: "okay speedrun 👀", mood: "excited" },
  { text: "you had that one loaded", mood: "cheer" },
  { text: "quick hands. keep going.", mood: "excited" },
  { text: "barely read it huh", mood: "impressed" },
  { text: "that was reflex", mood: "impressed" },
  { text: "zero hesitation. respect.", mood: "cheer" },
  { text: "clicked before i blinked", mood: "excited" },
  { text: "tempo's nice. don't rush the next.", mood: "thinking" },
  { text: "fast fingers today", mood: "cheer" },
];

const MIDWAY: Line[] = [
  { text: "halfway. still cruising.", mood: "cheer" },
  { text: "pace is good, keep it", mood: "excited" },
  { text: "five down. eyes up.", mood: "idle" },
  { text: "halfway mark. breathe once.", mood: "idle" },
  { text: "second half hits different", mood: "thinking" },
  { text: "you're on schedule. chill.", mood: "cheer" },
  { text: "midpoint. same energy please.", mood: "excited" },
  { text: "half done, half the clock. perfect.", mood: "impressed" },
  { text: "halfway turn. don't drift.", mood: "thinking" },
  { text: "still with you. keep the rhythm.", mood: "peek" },
];

const LOW_TIME: Line[] = [
  { text: "clock's cooking. pick and move.", mood: "wince" },
  { text: "two mins — don't stall", mood: "thinking" },
  { text: "blank beats a wild guess btw", mood: "thinking" },
  { text: "time's thin. commit fast.", mood: "wince" },
  { text: "don't reread. decide.", mood: "thinking" },
  { text: "skip the mean ones, no penalty", mood: "idle" },
  { text: "quick sweep. easy ones first.", mood: "excited" },
  { text: "can't cut two options? leave it.", mood: "thinking" },
  { text: "tick tick. keep it moving.", mood: "wince" },
  { text: "no time to fall in love", mood: "wince" },
];

const NEAR_END: Line[] = [
  { text: "last one. finish clean.", mood: "excited" },
  { text: "one more and we're out", mood: "cheer" },
  { text: "final boss. casual though.", mood: "excited" },
  { text: "end of the line. have a look.", mood: "thinking" },
  { text: "last one, then we breathe", mood: "cheer" },
  { text: "close it out", mood: "excited" },
  { text: "home stretch. no sprint needed.", mood: "idle" },
  { text: "one left. take the good seconds.", mood: "thinking" },
  { text: "answer it or leave it, both fine", mood: "idle" },
  { text: "you made it to the end 🫡", mood: "impressed" },
];

const IDLE_LOOK: Line[] = [
  { text: "take your time. i'm just vibing.", mood: "idle" },
  { text: "reading over your shoulder 👀", mood: "peek" },
  { text: "eliminate two, then commit", mood: "thinking" },
  { text: "thinking is allowed. stalling isn't.", mood: "thinking" },
  { text: "i'll wait. nowhere to be.", mood: "idle" },
  { text: "read the question again, slower", mood: "thinking" },
  { text: "gut says something. listen once.", mood: "peek" },
  { text: "still here. still watching.", mood: "peek" },
  { text: "narrow it down, then decide", mood: "thinking" },
  { text: "no rush. the clock disagrees though.", mood: "wince" },
];

/** the very first answer of the run */
const FIRST_ANSWER: Line[] = [
  { text: "and we're off 🚀", mood: "excited" },
  { text: "one down. keep going.", mood: "cheer" },
  { text: "first one's in. rhythm time.", mood: "excited" },
  { text: "okay that's the ice broken", mood: "cheer" },
  { text: "started. that's the hard part.", mood: "impressed" },
  { text: "first click of the day", mood: "excited" },
  { text: "we're live now", mood: "excited" },
  { text: "one in the bag. next.", mood: "cheer" },
  { text: "nice start. hold the tempo.", mood: "impressed" },
  { text: "off the mark. go go.", mood: "excited" },
];

/** the last thirty seconds */
const FINAL_30: Line[] = [
  { text: "thirty seconds. fill or leave.", mood: "wince" },
  { text: "final sprint. no rereading.", mood: "wince" },
  { text: "clock's basically done", mood: "wince" },
  { text: "last seconds — don't panic click", mood: "thinking" },
  { text: "wild guesses cost you. blanks don't.", mood: "thinking" },
  { text: "quick, anything you actually know", mood: "excited" },
  { text: "half a minute. breathe, decide.", mood: "thinking" },
  { text: "time. wrap it up.", mood: "wince" },
  { text: "seconds left. go with your gut.", mood: "excited" },
  { text: "almost out — leave the fog ones", mood: "thinking" },
];

/** parked on question one for a long time */
const STUCK_ON_ONE: Line[] = [
  { text: "still on one? it happens.", mood: "idle" },
  { text: "question one is not the boss", mood: "thinking" },
  { text: "read it once more, then move", mood: "thinking" },
  { text: "the rest are waiting on you", mood: "peek" },
  { text: "park it. come back later.", mood: "idle" },
  { text: "openers are always the stiffest", mood: "wince" },
  { text: "you can skip and return, y'know", mood: "thinking" },
  { text: "don't spend the whole clock here", mood: "wince" },
  { text: "shake it off. next one's kinder.", mood: "cheer" },
  { text: "stuck is fine. stuck here isn't.", mood: "thinking" },
];

/** blanks piling up in the back half — never framed as a loss */
const BLANKS_LATE: Line[] = [
  { text: "few blanks back there. that's fine.", mood: "idle" },
  { text: "blanks score zero, not minus", mood: "thinking" },
  { text: "skipping the fog ones is smart", mood: "impressed" },
  { text: "no penalty for leaving them", mood: "idle" },
  { text: "you're playing it safe. respect.", mood: "impressed" },
  { text: "blank > guess. you know this.", mood: "thinking" },
  { text: "leave what you can't narrow", mood: "thinking" },
  { text: "empty ones aren't losses", mood: "idle" },
  { text: "strategy, not surrender 🫡", mood: "impressed" },
  { text: "sweep back if time allows", mood: "peek" },
];

/** navigated back to a question already seen */
const BACK_TRACK: Line[] = [
  { text: "oh we're revisiting 👀", mood: "peek" },
  { text: "back for another look?", mood: "thinking" },
  { text: "second opinion on this one", mood: "thinking" },
  { text: "fresh eyes, same question", mood: "idle" },
  { text: "returning to the scene", mood: "peek" },
  { text: "this one stayed on your mind", mood: "thinking" },
  { text: "one more pass, then decide", mood: "thinking" },
  { text: "revisit's fine. don't loop though.", mood: "wince" },
  { text: "trust the second read", mood: "impressed" },
  { text: "back here. make it count.", mood: "excited" },
];

/** a long unbroken run of answering without pausing */
const ON_A_ROLL: Line[] = [
  { text: "you're not even pausing", mood: "impressed" },
  { text: "rolling. don't look down.", mood: "excited" },
  { text: "back to back to back 🔥", mood: "excited" },
  { text: "this is a rhythm now", mood: "cheer" },
  { text: "machine mode engaged", mood: "impressed" },
  { text: "nonstop. i'm impressed.", mood: "impressed" },
  { text: "tempo's unreal rn", mood: "excited" },
  { text: "no stalling at all. nice.", mood: "cheer" },
  { text: "flowing. stay there.", mood: "cheer" },
  { text: "keep the wave going", mood: "excited" },
];

/** fast answers right after a long slow patch */
const SECOND_WIND: Line[] = [
  { text: "oh you found the gear", mood: "impressed" },
  { text: "from stuck to sprinting", mood: "excited" },
  { text: "there it is. momentum.", mood: "cheer" },
  { text: "that slow patch is over", mood: "cheer" },
  { text: "brain rebooted. love that.", mood: "impressed" },
  { text: "picked the pace back up 🔥", mood: "excited" },
  { text: "we're moving again", mood: "excited" },
  { text: "recovered quick. nice.", mood: "impressed" },
  { text: "that's the switch flipping", mood: "cheer" },
  { text: "back in tempo", mood: "cheer" },
];

/** every question answered, clock barely touched */
const SPARE_TIME: Line[] = [
  { text: "all filled with time left 🫡", mood: "impressed" },
  { text: "everything's in. early too.", mood: "impressed" },
  { text: "done and the clock's still fat", mood: "cheer" },
  { text: "spare minutes. use or submit.", mood: "thinking" },
  { text: "you could recheck the mean ones", mood: "thinking" },
  { text: "full sheet. no rush now.", mood: "cheer" },
  { text: "ahead of the clock. rare.", mood: "impressed" },
  { text: "nothing empty. go breathe.", mood: "idle" },
  { text: "want a second pass? there's time.", mood: "peek" },
  { text: "finished early. flex.", mood: "excited" },
];

/** every question answered */
const ALL_ANSWERED: Line[] = [
  { text: "sheet's full. submit when ready.", mood: "cheer" },
  { text: "that's everything touched", mood: "impressed" },
  { text: "no empties left", mood: "cheer" },
  { text: "all in. hit submit.", mood: "excited" },
  { text: "you covered the whole set", mood: "impressed" },
  { text: "done. review or send it.", mood: "thinking" },
  { text: "nothing left hanging", mood: "cheer" },
  { text: "complete. your call now.", mood: "idle" },
  { text: "that's the lot 🫡", mood: "impressed" },
  { text: "wrapped. good run.", mood: "cheer" },
];

/**
 * What Potter says during a run. Deterministic given the situation — he must
 * not appear to change his mind about the same moment.
 *
 * Everything past `justAnswered` is optional: `PotterCoach` supplies the first
 * six, and the extra signals only sharpen his reactions when a caller has them.
 */
export function testLine(o: {
  index: number;
  total: number;
  answered: number;
  secondsLeft: number;
  dwellMs: number;
  justAnswered: boolean;
  /** consecutive questions answered without leaving one blank */
  answerStreak?: number;
  /** the learner navigated back to a question they had already seen */
  revisited?: boolean;
  /** how long they sat on the question before this one */
  prevDwellMs?: number;
  /**
   * A salt that is constant for one attempt (an attempt number works). Some
   * moments — the opening line especially — have no other signal that varies,
   * so without this he greets every run identically. Stays deterministic
   * *within* a run, which is the property that matters.
   */
  runSeed?: number;
}): Line | null {
  const {
    index,
    total,
    answered,
    secondsLeft,
    dwellMs,
    justAnswered,
    answerStreak = 0,
    revisited = false,
    prevDwellMs = 0,
    runSeed = 0,
  } = o;

  const seen = index + 1;
  // walked past and still empty — a choice, not a mistake
  const blanks = Math.max(0, index - answered);
  const late = index >= Math.ceil(total * 0.6);
  // answering more than you have walked past means you came back for one
  const backtracking = revisited || answered > seen;
  const rolling = answerStreak >= 4 || (justAnswered && index >= 4 && answered >= seen);

  // Seeds mix in something that actually moves. A seed like `index * 5` on a
  // ten-line pool only ever reaches two of them.
  if (secondsLeft <= 30 && secondsLeft > 0) return pick(FINAL_30, secondsLeft / 4 + index * 3);
  if (total > 0 && answered >= total)
    return pick(secondsLeft > 150 ? SPARE_TIME : ALL_ANSWERED, secondsLeft / 15 + runSeed);
  if (justAnswered && answered === 1) return pick(FIRST_ANSWER, secondsLeft / 10 + index + runSeed);
  if (index === 0 && dwellMs < 3500) return pick(ON_START, dwellMs / 1800 + runSeed * 2);
  if (index === 0 && dwellMs > 20000) return pick(STUCK_ON_ONE, dwellMs / 4000);
  // coarse enough that he is not re-opening his mouth every second, and the
  // two terms do not cancel as the clock falls and the index climbs
  if (secondsLeft <= 120 && secondsLeft > 0) return pick(LOW_TIME, secondsLeft / 7 + index * 3);
  if (late && blanks >= 3) return pick(BLANKS_LATE, index * 3 + blanks);
  if (index === total - 1) return pick(NEAR_END, index + answered + runSeed);
  if (backtracking && dwellMs < 9000) return pick(BACK_TRACK, index * 3 + answered);
  if (justAnswered && dwellMs < 4500 && prevDwellMs > 18000) return pick(SECOND_WIND, index * 7);
  if (rolling) return pick(ON_A_ROLL, index * 11 + answerStreak);
  if (justAnswered && dwellMs < 4000) return pick(ANSWERED_FAST, index * 7);
  if (index === Math.floor(total / 2) && answered >= index) return pick(MIDWAY, index + answered + runSeed);
  // lingering on one question reads as difficulty
  if (dwellMs > 22000) return pick(HARD_ONE, index * 3 + Math.floor(dwellMs / 26000));
  if (dwellMs > 9000) return pick(IDLE_LOOK, index * 7 + 3);
  return null;
}

/* ── reviewing answers afterwards ──────────────────────────────────────── */

const GOT_IT: Line[] = [
  { text: "clean. next.", mood: "cheer" },
  { text: "never in doubt", mood: "impressed" },
  { text: "locked in ✅", mood: "excited" },
  { text: "you knew that cold", mood: "impressed" },
  { text: "green. moving on.", mood: "cheer" },
  { text: "no notes on this one", mood: "impressed" },
  { text: "textbook. love it.", mood: "excited" },
  { text: "that's a keeper", mood: "cheer" },
  { text: "smooth. next.", mood: "cheer" },
  { text: "banked it 🫡", mood: "impressed" },
];

const MISSED: Line[] = [
  { text: "close one. worth a reread.", mood: "thinking" },
  { text: "classic trap question", mood: "wince" },
  { text: "note it down, it repeats", mood: "thinking" },
  { text: "sneaky wording. flag it.", mood: "wince" },
  { text: "one to revisit tomorrow", mood: "thinking" },
  { text: "add it to the list", mood: "thinking" },
  { text: "the distractor did its job", mood: "wince" },
  { text: "learn it once, never again", mood: "cheer" },
  { text: "happens. reread the options.", mood: "idle" },
  { text: "this pattern repeats", mood: "thinking" },
];

const SKIPPED: Line[] = [
  { text: "blank costs nothing", mood: "idle" },
  { text: "smart skip tbh", mood: "impressed" },
  { text: "zero is better than minus", mood: "thinking" },
  { text: "blank scored 0. no damage.", mood: "idle" },
  { text: "you didn't gamble. good.", mood: "impressed" },
  { text: "know it next time", mood: "cheer" },
  { text: "safe under negative marking", mood: "impressed" },
  { text: "blank isn't wrong", mood: "idle" },
  { text: "no penalty taken here", mood: "idle" },
  { text: "learn it for next time", mood: "thinking" },
];

/**
 * What he says beside a reviewed question.
 *
 * He used to have a tenth bank of lines for items with no official key —
 * "trust this one less than the rest", "verify before memorising" — and it took
 * priority over everything else. On 42% of the bank that meant the companion
 * answered "did I get it right?" with a warning about the answer's paperwork.
 * It undercut the answer on the one screen built for absorbing it, and it did
 * so in the app's friendliest voice, which made it land harder. The bank's
 * provenance is stated properly on the About page; it is not this character's
 * job to relitigate it on every card.
 */
export function reviewLine(o: {
  index: number;
  correct: boolean;
  skipped: boolean;
}): Line {
  if (o.skipped) return pick(SKIPPED, o.index);
  return o.correct ? pick(GOT_IT, o.index * 3) : pick(MISSED, o.index * 7 + 1);
}

/* ── the home screen ───────────────────────────────────────────────────── */

const FIRST_TEST: Line[] = [
  { text: "first one's the hardest. let's go.", mood: "excited" },
  { text: "day zero. ten minutes. easy.", mood: "cheer" },
  { text: "never done one? perfect start.", mood: "peek" },
  { text: "we begin. no pressure 🫡", mood: "excited" },
  { text: "ten questions to day one", mood: "excited" },
  { text: "start now, brag later", mood: "cheer" },
  { text: "nothing on the board yet. fix that.", mood: "thinking" },
  { text: "first test is just a warmup", mood: "idle" },
];

const DONE_STREAK: Line[] = [
  { text: "{n} days straight. certified.", mood: "cheer" },
  { text: "{n} in a row. unbothered.", mood: "impressed" },
  { text: "{n} days. that's a habit now.", mood: "impressed" },
  { text: "streak's at {n}. don't blink.", mood: "excited" },
  { text: "{n} days deep 🔥", mood: "excited" },
  { text: "day {n} done. see you tomorrow.", mood: "cheer" },
  { text: "{n} straight. quietly cracked.", mood: "impressed" },
  { text: "{n}-day run and today's in", mood: "cheer" },
];

const DONE_TODAY: Line[] = [
  { text: "done for today. proud of you 🫡", mood: "impressed" },
  { text: "today's handled. go touch grass.", mood: "cheer" },
  { text: "that's the ask. done.", mood: "impressed" },
  { text: "clocked out. nice.", mood: "cheer" },
  { text: "today's box is ticked ✅", mood: "excited" },
  { text: "you showed up. that's the thing.", mood: "impressed" },
  { text: "done. come back tomorrow.", mood: "idle" },
  { text: "finished. rest is training too.", mood: "idle" },
];

const KEEP_STREAK: Line[] = [
  { text: "don't break the {n}-day run", mood: "thinking" },
  { text: "{n} days on the line rn", mood: "wince" },
  { text: "{n}-day streak wants feeding", mood: "peek" },
  { text: "ten minutes saves the {n}-day run", mood: "thinking" },
  { text: "streak's at {n}. keep it breathing.", mood: "thinking" },
  { text: "{n} days. today decides.", mood: "wince" },
  { text: "protect the {n} 🔥", mood: "excited" },
  { text: "you're {n} deep. don't stop now.", mood: "cheer" },
];

const SHARP: Line[] = [
  { text: "accuracy's looking sharp", mood: "impressed" },
  { text: "you've been cooking lately", mood: "excited" },
  { text: "numbers are clean. keep going.", mood: "impressed" },
  { text: "accuracy's holding. respect.", mood: "impressed" },
  { text: "you're in form rn 🔥", mood: "excited" },
  { text: "sharp lately. don't get comfy.", mood: "thinking" },
  { text: "form's good. ride it.", mood: "cheer" },
  { text: "stats say you know things", mood: "peek" },
];

const HOME_IDLE: Line[] = [
  { text: "ten minutes. that's the whole ask.", mood: "peek" },
  { text: "ten questions. one sitting.", mood: "idle" },
  { text: "we doing today or nah 👀", mood: "peek" },
  { text: "back for more? good.", mood: "cheer" },
  { text: "one test, then freedom", mood: "excited" },
  { text: "the bank won't read itself", mood: "thinking" },
  { text: "quick one before you forget", mood: "peek" },
  { text: "ten minutes beats zero minutes", mood: "thinking" },
];

export function homeLine(o: {
  doneToday: boolean;
  streak: number;
  accuracy: number;
  tests: number;
}): Line {
  if (o.tests === 0) return pick(FIRST_TEST, o.tests);
  if (o.doneToday && o.streak >= 3) return fill(pick(DONE_STREAK, o.streak + o.tests), o.streak);
  if (o.doneToday) return pick(DONE_TODAY, o.tests);
  if (o.streak >= 3) return fill(pick(KEEP_STREAK, o.streak + o.tests), o.streak);
  if (o.accuracy >= 75) return pick(SHARP, o.accuracy + o.tests);
  return pick(HOME_IDLE, o.tests);
}
