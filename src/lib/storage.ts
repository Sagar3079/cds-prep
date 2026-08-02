import { DEFAULT_SUBJECT, toSubject } from "@/lib/subject";
import type { Subject } from "@/types";

export interface Attempt {
  /** Local calendar day, "YYYY-MM-DD". Random-mode rows may carry a "-r<ts>" suffix. */
  date: string;
  mode?: "daily" | "random";
  /** Absent on every row written before GK existed, and those are all english. */
  subject?: Subject;
  /**
   * 1 for the first attempt of that day+mode+subject, 2+ for retakes.
   * Set by saveAttempt.
   */
  attemptNo?: number;
  /** Epoch ms the row was written. Set by saveAttempt. */
  savedAt?: number;
  score: number;
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  timeTaken: number;
  questionIds: string[];
  answers: (number | null)[];
}

export type AttemptMode = "daily" | "random";

const KEYS = {
  attempts: "cds-attempts",
  asked: "cds-asked-ids",
  subject: "cds-subject",
} as const;

const DAY_PREFIX = /^\d{4}-\d{2}-\d{2}/;
const DAY_EXACT = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

function readJSON(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

/** SSR-safe, non-throwing write (quota / private mode). false = not persisted. */
function writeJSON(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Local calendar day as "YYYY-MM-DD".
 * Never use toISOString() for this: it is UTC, so for UTC+ users (IST = UTC+5:30)
 * it returns yesterday between midnight and the offset.
 */
export function dateKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayKey(): string {
  return dateKey();
}

/** Calendar day of an attempt date, "" if unparseable. */
function dayOf(date: string): string {
  return DAY_PREFIX.test(date) ? date.slice(0, 10) : "";
}

/** Legacy rows have no mode; a suffixed date means it was a random quiz. */
function modeOf(a: { date: string; mode?: AttemptMode }): AttemptMode {
  return a.mode ?? (DAY_EXACT.test(a.date) ? "daily" : "random");
}

/** Rows written before GK existed carry no subject, and all of them are english. */
function subjectOfAttempt(a: { subject?: Subject }): Subject {
  return toSubject(a.subject);
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

function toAttempt(v: unknown): Attempt | null {
  if (typeof v !== "object" || v === null) return null;
  const a = v as Record<string, unknown>;
  if (typeof a.date !== "string" || !dayOf(a.date)) return null;
  return {
    date: a.date,
    mode: a.mode === "random" || a.mode === "daily" ? a.mode : undefined,
    subject: a.subject === "gk" || a.subject === "english" ? a.subject : undefined,
    attemptNo: typeof a.attemptNo === "number" ? a.attemptNo : undefined,
    savedAt: typeof a.savedAt === "number" ? a.savedAt : undefined,
    score: num(a.score),
    correct: num(a.correct),
    wrong: num(a.wrong),
    skipped: num(a.skipped),
    total: num(a.total),
    timeTaken: num(a.timeTaken),
    questionIds: Array.isArray(a.questionIds)
      ? a.questionIds.filter((x): x is string => typeof x === "string")
      : [],
    answers: Array.isArray(a.answers)
      ? a.answers.map((x) => (typeof x === "number" ? x : null))
      : [],
  };
}

/** Malformed storage (non-array, or junk rows) yields the valid subset. */
export function getAttempts(): Attempt[] {
  const raw = readJSON(KEYS.attempts);
  if (!Array.isArray(raw)) return [];
  const out: Attempt[] = [];
  for (const row of raw) {
    const a = toAttempt(row);
    if (a) out.push(a);
  }
  return out;
}

/**
 * Append-only: a second submit on the same day+mode+subject is recorded as a
 * NEW row (attemptNo 2, 3, …). Nothing is ever overwritten, so a retake cannot
 * destroy the earlier score/answers/questionIds.
 *
 * Contract for callers (TestClient):
 *   - pass `date` as the plain local day key from todayKey() for daily runs;
 *     no need to make it unique — retakes are distinguished by attemptNo/savedAt;
 *   - pass `mode: "random"` for random quizzes (inferred from a suffixed date if omitted);
 *   - pass `subject` (omitted means english, which is what every pre-GK row is);
 *   - `attemptNo` and `savedAt` are assigned here — do not set them;
 *   - returns false if the write failed (SSR / quota / private mode) and never
 *     throws, so a failed persist must not abort the submit flow.
 */
export function saveAttempt(attempt: Attempt): boolean {
  const all = getAttempts();
  const mode = modeOf(attempt);
  const subject = subjectOfAttempt(attempt);
  const day = dayOf(attempt.date);
  // Scoped by subject too: today's first GK run is attempt 1 of GK, not
  // attempt 2 of a day that already has an English run in it.
  const prior = all.filter(
    (a) =>
      dayOf(a.date) === day &&
      modeOf(a) === mode &&
      subjectOfAttempt(a) === subject
  ).length;
  all.push({
    ...attempt,
    mode,
    subject,
    attemptNo: prior + 1,
    savedAt: Date.now(),
  });
  return writeJSON(KEYS.attempts, all);
}

/** All attempts for a calendar day, oldest first. */
export function getAttemptsForDate(
  date: string,
  mode: AttemptMode = "daily",
  subject: Subject = DEFAULT_SUBJECT
): Attempt[] {
  const day = dayOf(date);
  if (!day) return [];
  return getAttempts()
    .filter(
      (a) =>
        dayOf(a.date) === day &&
        modeOf(a) === mode &&
        subjectOfAttempt(a) === subject
    )
    .sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
}

/** Most recent attempt for a calendar day, or null. */
export function getLatestAttempt(
  date: string,
  mode: AttemptMode = "daily",
  subject: Subject = DEFAULT_SUBJECT
): Attempt | null {
  const list = getAttemptsForDate(date, mode, subject);
  return list.length ? list[list.length - 1] : null;
}

export function hasAttemptOn(
  date: string,
  mode: AttemptMode = "daily",
  subject: Subject = DEFAULT_SUBJECT
): boolean {
  return getAttemptsForDate(date, mode, subject).length > 0;
}

/**
 * Which subject the home screen last started. A preference, not state anything
 * depends on: an unreadable or unknown value simply means english.
 */
export function getSubjectPref(): Subject {
  if (typeof window === "undefined") return DEFAULT_SUBJECT;
  try {
    return toSubject(localStorage.getItem(KEYS.subject));
  } catch {
    return DEFAULT_SUBJECT;
  }
}

/** false if the write failed; never throws. */
export function setSubjectPref(subject: Subject): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(KEYS.subject, subject);
    return true;
  } catch {
    return false;
  }
}

export function getAskedIds(): string[] {
  const raw = readJSON(KEYS.asked);
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

/** false if the write failed; never throws. */
export function markAsked(ids: string[]): boolean {
  const set = new Set([...getAskedIds(), ...ids]);
  return writeJSON(KEYS.asked, [...set]);
}

export function getStats() {
  const attempts = getAttempts();
  if (!attempts.length) {
    return {
      testsTaken: 0,
      avgScore: 0,
      bestStreak: 0,
      currentStreak: 0,
      accuracy: 0,
    };
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

  const days = [...new Set(attempts.map((a) => dayOf(a.date)).filter(Boolean))]
    .map(dayNumber)
    .sort((a, b) => a - b);

  // best = longest run anywhere in history, not just the run ending today
  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
  }

  // current = run ending today, or yesterday (today isn't over yet)
  const seen = new Set(days);
  const today = dayNumber(todayKey());
  let currentStreak = 0;
  for (let d = seen.has(today) ? today : today - 1; seen.has(d); d--) {
    currentStreak++;
  }

  return { testsTaken, avgScore, bestStreak, currentStreak, accuracy };
}
