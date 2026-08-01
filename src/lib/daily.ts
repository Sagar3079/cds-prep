import type { Question } from "@/types";

/** Seeded PRNG (mulberry32) */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Shuffle options and remap answer index so correct choice stays correct */
export function shuffleQuestionOptions(
  q: Question,
  rng: () => number
): Question {
  if (!q.options || q.options.length !== 4 || q.answer === null || q.answer === undefined) {
    return q;
  }
  const idxs = [0, 1, 2, 3];
  shuffleInPlace(idxs, rng);
  const newOptions = idxs.map((i) => q.options[i]);
  const newAnswer = idxs.indexOf(q.answer);
  return { ...q, options: newOptions, answer: newAnswer };
}

function answeredPool(all: Question[]): Question[] {
  return all.filter(
    (q) =>
      q.answer !== null &&
      q.answer !== undefined &&
      Array.isArray(q.options) &&
      q.options.length === 4
  );
}

export function pickDailyQuestions(
  all: Question[],
  date: string,
  count = 10,
  excludeIds: string[] = []
): Question[] {
  const withAnswers = answeredPool(all);
  const exclude = new Set(excludeIds);
  let pool = withAnswers.filter((q) => !exclude.has(q.id));
  if (pool.length < count) pool = withAnswers;

  const rng = mulberry32(hashString(date));
  const shuffled = shuffleInPlace([...pool], rng);
  return shuffled
    .slice(0, Math.min(count, shuffled.length))
    .map((q) => shuffleQuestionOptions(q, rng));
}

/** Fresh random set every call — options shuffled each time */
export function pickRandomQuestions(
  all: Question[],
  count = 10,
  seed?: number
): Question[] {
  const pool = answeredPool(all);
  const rng = mulberry32(
    seed ?? (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
  );
  const shuffled = shuffleInPlace([...pool], rng);
  return shuffled
    .slice(0, Math.min(count, shuffled.length))
    .map((q) => shuffleQuestionOptions(q, rng));
}

export const MARKING = {
  correct: 1,
  wrong: -0.25,
  skip: 0,
  durationSec: 600,
} as const;

export function scoreAnswers(
  questions: Question[],
  answers: (number | null)[]
) {
  let score = 0;
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  questions.forEach((q, i) => {
    const a = answers[i];
    if (a === null || a === undefined) {
      skipped++;
      return;
    }
    if (a === q.answer) {
      correct++;
      score += MARKING.correct;
    } else {
      wrong++;
      score += MARKING.wrong;
    }
  });
  return {
    score: Math.round(score * 100) / 100,
    correct,
    wrong,
    skipped,
    total: questions.length,
  };
}
