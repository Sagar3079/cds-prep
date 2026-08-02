import englishData from "@/data/questions.json";
import gkData from "@/data/questions-gk.json";
import { answerableCount } from "@/lib/daily";
import { DEFAULT_SUBJECT } from "@/lib/subject";
import type { Question, Subject } from "@/types";

/**
 * One bank per subject, in one file per subject, selected independently.
 *
 * The separation is the whole point and it is not a tidiness preference.
 * `pickDailyQuestions` shuffles its entire pool once from a fixed `CANON_SEED`
 * and lets the date pick a window of that order. Appending General Knowledge to
 * the English array would therefore reshuffle the English order too, silently
 * changing which ten questions every existing user gets today and where they sit
 * in the cycle — with nothing failing to say so. So the two never meet: English
 * is `questions.json`, GK is `questions-gk.json`, and each is passed to the
 * pickers on its own. `scripts/daily-snapshot.mjs` is the standing proof.
 *
 * `questions-gk.json` is produced by the OCR pipeline and may legitimately be
 * empty or hold only a paper or two while it is being built up, so nothing here
 * assumes it has enough to run a test — see `isSubjectReady`.
 */

/** Matches the count TestClient asks the pickers for. */
export const PER_TEST = 10;

/**
 * A bank below this cannot fill a single set, so the subject is not offered at
 * all rather than served as a short, endlessly repeating test.
 */
const MIN_BANK = PER_TEST;

/**
 * Untouched, in file order. Nothing maps or normalises this array: the canonical
 * shuffle is order-sensitive, and a `.map()` that "just adds a field" is exactly
 * the change that would look harmless in review and move everybody's daily set.
 */
const ENGLISH = englishData as Question[];

/** Tolerates a missing, empty or half-written file — see the note above. */
const GK: Question[] = Array.isArray(gkData) ? (gkData as Question[]) : [];

const BANKS: Record<Subject, Question[]> = { english: ENGLISH, gk: GK };

export function bankFor(subject: Subject): Question[] {
  return BANKS[subject] ?? BANKS[DEFAULT_SUBJECT];
}

/** Answerable questions in a subject's bank. */
export function bankSize(subject: Subject): number {
  return answerableCount(bankFor(subject));
}

/** Whether a subject has enough behind it to run a real test today. */
export function isSubjectReady(subject: Subject): boolean {
  return bankSize(subject) >= MIN_BANK;
}

/** Subjects that can actually be started, in display order. */
export function readySubjects(): Subject[] {
  return (["english", "gk"] as const).filter(isSubjectReady);
}

/**
 * Server-side answer key, per subject. Kept separate rather than merged so an
 * English question id can never be scored onto the GK board, even if the two
 * banks ever collide on an id.
 */
export function bankById(subject: Subject): Map<string, Question> {
  return subject === "gk" ? GK_BY_ID : ENGLISH_BY_ID;
}

const ENGLISH_BY_ID = new Map(ENGLISH.map((q) => [q.id, q]));
const GK_BY_ID = new Map(GK.map((q) => [q.id, q]));
