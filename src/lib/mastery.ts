import type { Question } from "@/types";

/**
 * Per-topic performance, used to weight practice sets toward what you are weak
 * at and away from what you have already shown you can do.
 *
 * Deliberately NOT wired into `pickDailyQuestions`. The daily set is documented
 * as identical for every user on a given date — that is what makes scores
 * comparable — and per-user state entering that path is the exact bug that was
 * fixed once already. Adaptation belongs to practice, which is per-user by
 * design. See `pickAdaptiveQuestions` in daily.ts.
 */

const KEY = "cds-topic-mastery";

/** Ignore anything above this — a fat-fingered tap is not evidence of weakness. */
const MIN_SECONDS_FOR_SIGNAL = 0;

export interface TopicStat {
  /** Questions served in this topic */
  seen: number;
  correct: number;
  wrong: number;
  /** Skipped — counts as "not yet demonstrated", not as a failure */
  blank: number;
  /** Epoch ms of the most recent encounter, for recency decay */
  lastSeen: number;
}

export type Mastery = Record<string, TopicStat>;

const EMPTY: TopicStat = { seen: 0, correct: 0, wrong: 0, blank: 0, lastSeen: 0 };

function isStat(v: unknown): v is TopicStat {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.seen === "number" &&
    typeof s.correct === "number" &&
    typeof s.wrong === "number" &&
    typeof s.blank === "number"
  );
}

export function getMastery(): Mastery {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    const out: Mastery = {};
    for (const [topic, stat] of Object.entries(raw)) {
      if (!isStat(stat)) continue;
      out[topic] = {
        seen: Math.max(0, stat.seen),
        correct: Math.max(0, stat.correct),
        wrong: Math.max(0, stat.wrong),
        blank: Math.max(0, stat.blank),
        lastSeen: typeof stat.lastSeen === "number" ? stat.lastSeen : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Fold one finished attempt into the mastery record. Called once on submit —
 * never during render.
 */
export function recordAttempt(
  questions: Question[],
  answers: (number | null)[],
  now = Date.now()
): boolean {
  if (typeof window === "undefined") return false;
  const mastery = getMastery();

  questions.forEach((q, i) => {
    const topic = q.topic?.trim();
    if (!topic) return;
    const stat = mastery[topic] ?? { ...EMPTY };
    const a = answers[i];
    stat.seen += 1;
    if (a === null || a === undefined) stat.blank += 1;
    else if (a === q.answer) stat.correct += 1;
    else stat.wrong += 1;
    stat.lastSeen = now;
    mastery[topic] = stat;
  });

  try {
    localStorage.setItem(KEY, JSON.stringify(mastery));
    return true;
  } catch {
    return false;
  }
}

export function clearMastery(): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

/** Attempts in a topic before its accuracy is treated as real signal. */
const CONFIDENCE_FLOOR = 4;

/**
 * Accuracy over answered questions only. Blanks are excluded: leaving a question
 * blank under negative marking is often the correct decision, so counting it as
 * a failure would push practice toward topics the user is playing correctly.
 * Returns null when there is not yet enough evidence.
 */
export function topicAccuracy(stat: TopicStat): number | null {
  const answered = stat.correct + stat.wrong;
  if (answered < CONFIDENCE_FLOOR) return null;
  return stat.correct / answered;
}

export interface TopicWeight {
  topic: string;
  weight: number;
  accuracy: number | null;
  seen: number;
  /** Why this topic got the weight it did — surfaced in the UI. */
  reason: "weak" | "shaky" | "solid" | "new";
}

/**
 * Turn mastery into sampling weights.
 *
 * - unseen or barely-seen topics get a healthy weight, so the bank keeps opening
 *   up rather than narrowing to whatever you happened to answer first
 * - weak topics are boosted
 * - solid topics are damped but NEVER zeroed: dropping a topic entirely means
 *   you stop finding out when it decays, and it makes the set feel repetitive
 */
export function topicWeights(topics: string[], mastery: Mastery): TopicWeight[] {
  return topics.map((topic) => {
    const stat = mastery[topic] ?? { ...EMPTY };
    const acc = topicAccuracy(stat);

    if (acc === null) {
      // Not enough evidence. Weight above baseline so it gets probed.
      return {
        topic,
        weight: stat.seen === 0 ? 2.2 : 1.8,
        accuracy: null,
        seen: stat.seen,
        reason: "new",
      };
    }

    // 1.0 at perfect, up to 4.0 at zero — a smooth ramp, no cliff edges.
    const weight = 1 + Math.pow(1 - acc, 1.4) * 3;
    const reason: TopicWeight["reason"] =
      acc < 0.5 ? "weak" : acc < 0.8 ? "shaky" : "solid";

    return {
      topic,
      weight: Math.max(0.35, weight),
      accuracy: acc,
      seen: stat.seen,
      reason,
    };
  });
}

/** Weakest-first, for the UI. Only topics with real evidence. */
export function weakestTopics(mastery: Mastery, limit = 3): TopicWeight[] {
  const entries = Object.keys(mastery);
  return topicWeights(entries, mastery)
    .filter((t) => t.accuracy !== null)
    .sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1))
    .slice(0, limit);
}

export { MIN_SECONDS_FOR_SIGNAL, CONFIDENCE_FLOOR };
