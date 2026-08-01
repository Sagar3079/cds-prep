import Navbar from "@/components/Navbar";
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
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <TestClient questions={questions} mode={mode} />
      </main>
    </div>
  );
}
