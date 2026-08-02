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
  // Stem labels its own fragments, or an option names the letters — reordering
  // would make the question contradict itself even though scoring stays correct.
  if (q.fixedOptions) return q;
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

/** How many of a bank's questions can actually be served and scored. */
export function answerableCount(all: Question[]): number {
  return answeredPool(all).length;
}

/** Fixed — the canonical order must depend on neither the user nor the date */
const CANON_SEED = 0x5cd5c0de;
const DAY_MS = 86400000;

function dayIndex(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return hashString(date);
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
}

/** Days of distinct daily sets before the bank comes round again */
export function dailyCycleDays(all: Question[], count = 10): number {
  const len = answeredPool(all).length;
  return Math.max(1, Math.floor(len / Math.max(1, count)));
}

/**
 * Deterministic per date and identical for every user: the whole answered bank is
 * ordered once from a fixed seed, and the date only picks which window of it is
 * today's. Per-user state must never enter this path — `excludeIds` is accepted
 * for call compatibility and deliberately ignored (see pickRandomQuestions for
 * the per-user path). Repeats are a cycle, not a silent collapse: the bank runs
 * dry after `dailyCycleDays(all, count)` days and then restarts in the same order.
 */
export function pickDailyQuestions(
  all: Question[],
  date: string,
  count = 10,
  // Accepted for call-site compatibility with the other pick* functions and
  // deliberately never read — see the invariant above and CLAUDE.md.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  excludeIds: string[] = []
): Question[] {
  const pool = answeredPool(all);
  if (!pool.length) return [];
  const n = Math.min(count, pool.length);
  const canonical = shuffleInPlace([...pool], mulberry32(CANON_SEED));
  const cycle = Math.max(1, Math.floor(canonical.length / n));
  const idx = dayIndex(date);
  const start = (((idx % cycle) + cycle) % cycle) * n;

  const rng = mulberry32(hashString(date));
  return shuffleInPlace(canonical.slice(start, start + n), rng).map((q) =>
    shuffleQuestionOptions(q, rng)
  );
}

/** Answered questions the user has not been served yet */
export function unseenCount(all: Question[], excludeIds: string[] = []): number {
  const exclude = new Set(excludeIds);
  return answeredPool(all).filter((q) => !exclude.has(q.id)).length;
}

/**
 * Fresh random set every call — options shuffled each time. Unseen questions come
 * first; once they run out the set is topped up from seen ones rather than
 * dropping the exclusion wholesale. Callers can detect exhaustion with
 * unseenCount() and tell the user.
 */
export function pickRandomQuestions(
  all: Question[],
  count = 10,
  seed?: number,
  excludeIds: string[] = []
): Question[] {
  const pool = answeredPool(all);
  const exclude = new Set(excludeIds);
  const rng = mulberry32(
    seed ?? (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
  );
  const picked = shuffleInPlace(
    pool.filter((q) => !exclude.has(q.id)),
    rng
  ).slice(0, count);
  if (picked.length < count) {
    const seen = shuffleInPlace(
      pool.filter((q) => exclude.has(q.id)),
      rng
    );
    picked.push(...seen.slice(0, count - picked.length));
  }
  return picked.map((q) => shuffleQuestionOptions(q, rng));
}

/**
 * Practice set weighted by topic mastery: more of what you get wrong, less of
 * what you have already shown you can do.
 *
 * This is the per-user path on purpose. `pickDailyQuestions` must stay identical
 * for every user on a given date, so adaptation lives here and never there.
 *
 * Selection is weighted sampling WITHOUT replacement across topics: a topic's
 * weight decides how likely it is to be drawn next, and every draw removes that
 * question from the pool. Unseen questions are preferred; the set is topped up
 * from seen ones rather than coming back short.
 */
export function pickAdaptiveQuestions(
  all: Question[],
  count: number,
  weightByTopic: Record<string, number>,
  excludeIds: string[] = [],
  seed?: number
): Question[] {
  const pool = answeredPool(all);
  if (!pool.length) return [];

  const rng = mulberry32(seed ?? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0));
  const exclude = new Set(excludeIds);
  const weightOf = (q: Question) => {
    const w = weightByTopic[q.topic?.trim() ?? ""];
    return typeof w === "number" && w > 0 ? w : 1;
  };

  const draw = (candidates: Question[], n: number): Question[] => {
    const remaining = [...candidates];
    const out: Question[] = [];
    while (out.length < n && remaining.length > 0) {
      let total = 0;
      for (const q of remaining) total += weightOf(q);
      let r = rng() * total;
      let idx = remaining.length - 1;
      for (let i = 0; i < remaining.length; i++) {
        r -= weightOf(remaining[i]);
        if (r <= 0) {
          idx = i;
          break;
        }
      }
      out.push(remaining[idx]);
      // splice, so nothing can be drawn twice
      remaining.splice(idx, 1);
    }
    return out;
  };

  const unseen = pool.filter((q) => !exclude.has(q.id));
  const picked = draw(unseen, count);
  if (picked.length < count) {
    const seen = pool.filter((q) => exclude.has(q.id));
    picked.push(...draw(seen, count - picked.length));
  }

  return shuffleInPlace(picked, rng).map((q) => shuffleQuestionOptions(q, rng));
}

/** Distinct topics present among answerable questions. */
export function availableTopics(all: Question[]): string[] {
  const set = new Set<string>();
  for (const q of answeredPool(all)) {
    const t = q.topic?.trim();
    if (t) set.add(t);
  }
  return [...set].sort();
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
