export interface Attempt {
  date: string;
  mode?: "daily" | "random";
  score: number;
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  timeTaken: number;
  questionIds: string[];
  answers: (number | null)[];
}

const KEYS = {
  attempts: "cds-attempts",
  asked: "cds-asked-ids",
} as const;

export function getAttempts(): Attempt[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEYS.attempts) || "[]");
  } catch {
    return [];
  }
}

export function saveAttempt(attempt: Attempt) {
  const all = getAttempts();
  const idx = all.findIndex(
    (a) => a.date === attempt.date && (a.mode || "daily") === (attempt.mode || "daily")
  );
  if (idx >= 0) all[idx] = attempt;
  else all.push(attempt);
  localStorage.setItem(KEYS.attempts, JSON.stringify(all));
}

export function getAskedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEYS.asked) || "[]");
  } catch {
    return [];
  }
}

export function markAsked(ids: string[]) {
  const set = new Set([...getAskedIds(), ...ids]);
  localStorage.setItem(KEYS.asked, JSON.stringify([...set]));
}

export function getStats() {
  const attempts = getAttempts();
  if (!attempts.length) {
    return { testsTaken: 0, avgScore: 0, bestStreak: 0, accuracy: 0 };
  }
  const testsTaken = attempts.length;
  const avgScore =
    Math.round(
      (attempts.reduce((s, a) => s + a.score, 0) / testsTaken) * 100
    ) / 100;
  const totalCorrect = attempts.reduce((s, a) => s + a.correct, 0);
  const totalAnswered = attempts.reduce((s, a) => s + a.correct + a.wrong, 0);
  const accuracy =
    totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  const dates = new Set(attempts.map((a) => a.date.slice(0, 10)));
  let bestStreak = 0;
  let cur = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const key = d.toISOString().slice(0, 10);
    if (dates.has(key)) {
      cur++;
      bestStreak = Math.max(bestStreak, cur);
    } else if (i > 0) {
      break;
    }
    d.setDate(d.getDate() - 1);
  }

  return { testsTaken, avgScore, bestStreak, accuracy };
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
