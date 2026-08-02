export interface QuestionPart {
  label: string;
  text: string;
  fixed?: boolean;
}

/**
 * Which paper a question belongs to. Each subject is its own bank in its own
 * file, selected independently — see `src/lib/bank.ts`.
 */
export type Subject = "english" | "gk";

export interface Question {
  id: string;
  year: number;
  session: number;
  qnum?: number;
  /**
   * Absent means `"english"`. Left optional on purpose: `questions.json` carries
   * no `subject` field and must not gain one — `pickDailyQuestions` shuffles the
   * whole pool from a fixed seed, so touching that file at all would move every
   * existing user to a different daily set.
   */
  subject?: Subject;
  passage?: string | null;
  question: string;
  parts?: QuestionPart[];
  target?: string;
  /**
   * The option order carries meaning, so it must never be shuffled — the stem
   * labels its own fragments ("(a) Two thirds of the book / (b) were …"), or an
   * option refers to the letters ("Both A and B", "None of the above").
   * `shuffleQuestionOptions` returns these untouched.
   */
  fixedOptions?: boolean;
  options: string[];
  answer: number | null;
  answerSource: string;
  topic?: string;
}

export interface Results {
  score: number;
  total: number;
  answers: (number | null)[];
  questions: Question[];
  timeTaken: number;
}
