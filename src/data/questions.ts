export interface Question {
  id: string;
  year: number;
  session: number;
  passage?: string;
  question: string;
  options: [string, string, string, string];
  answer: number;
  answerSource: string;
  topic?: string;
}