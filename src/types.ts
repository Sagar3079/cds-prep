export interface QuestionPart {
  label: string;
  text: string;
  fixed?: boolean;
}

export interface Question {
  id: string;
  year: number;
  session: number;
  qnum?: number;
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
