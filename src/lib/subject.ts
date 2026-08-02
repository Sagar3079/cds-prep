import type { Question, Subject } from "@/types";

/**
 * Everything that has to agree about what a "subject" is: the routes, the
 * pickers, the mastery record and the leaderboard keys.
 *
 * Pure and dependency-free on purpose — `daily.ts` must stay importable by
 * `scripts/daily-snapshot.mjs` under plain Node, so nothing in the selection
 * path may reach for React, storage or a path alias at runtime.
 */

export const SUBJECTS = ["english", "gk"] as const;

/** Absent `subject` means english — see the note on `Question.subject`. */
export const DEFAULT_SUBJECT: Subject = "english";

export const SUBJECT_LABEL: Record<Subject, string> = {
  english: "English",
  gk: "General Knowledge",
};

/** For chips and tabs, where "General Knowledge" is too long. */
export const SUBJECT_SHORT: Record<Subject, string> = {
  english: "English",
  gk: "GK",
};

export function isSubject(v: unknown): v is Subject {
  return v === "english" || v === "gk";
}

/** Anything unrecognised — a hand-typed query string, an older record — is english. */
export function toSubject(v: unknown): Subject {
  return isSubject(v) ? v : DEFAULT_SUBJECT;
}

export function subjectOf(q: Pick<Question, "subject">): Subject {
  return toSubject(q.subject);
}

/**
 * The key a topic is stored under in the single `cds-topic-mastery` record.
 *
 * English keeps the bare topic string, so every record already in someone's
 * browser keeps working untouched. GK is namespaced, so a GK topic can never be
 * weighted against an English one even if the two banks one day share a label
 * ("Comprehension" is plausible in both).
 *
 * Many GK records deliberately carry no topic at all. Those return `""` and are
 * simply not tracked — `pickAdaptiveQuestions` falls back to the baseline weight
 * for anything it cannot find, so an untopiced question is drawn normally rather
 * than dropped.
 */
export function masteryKey(subject: Subject, topic: string): string {
  const t = topic.trim();
  if (!t) return "";
  return subject === "english" ? t : `${subject}:${t}`;
}

/** The mastery key for a question, or `""` when it carries no topic. */
export function questionMasteryKey(q: Question): string {
  return masteryKey(subjectOf(q), q.topic ?? "");
}

/** Which subject a stored mastery key belongs to. */
export function subjectOfMasteryKey(key: string): Subject {
  const at = key.indexOf(":");
  return at === -1 ? "english" : toSubject(key.slice(0, at));
}

/** The topic as a human reads it, with any subject namespace stripped. */
export function topicOfMasteryKey(key: string): string {
  const at = key.indexOf(":");
  return at === -1 || !isSubject(key.slice(0, at)) ? key : key.slice(at + 1);
}
