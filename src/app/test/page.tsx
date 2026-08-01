import TestClient from "@/components/TestClient";
import type { Question } from "@/types";
import questionsData from "@/data/questions.json";

export default async function TestPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const mode = params.mode === "random" ? "random" : "daily";
  const questions = questionsData as Question[];

  return (
    <div className="px-4 py-8">
      <TestClient questions={questions} mode={mode} />
    </div>
  );
}
