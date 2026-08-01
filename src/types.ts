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
