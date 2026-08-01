"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Question } from "@/types";
import QuestionCard from "./QuestionCard";
import Timer from "./Timer";
import {
  pickDailyQuestions,
  pickRandomQuestions,
  MARKING,
  scoreAnswers,
} from "@/lib/daily";
import {
  getAskedIds,
  markAsked,
  saveAttempt,
  todayKey,
  getAttempts,
} from "@/lib/storage";
import Link from "next/link";

export default function TestClient({
  questions,
  mode = "daily",
}: {
  questions: Question[];
  mode?: "daily" | "random";
}) {
  const router = useRouter();
  const date = todayKey();
  const isRandom = mode === "random";

  const [quiz, setQuiz] = useState<Question[]>([]);
  const [ready, setReady] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [seconds, setSeconds] = useState<number>(MARKING.durationSec);
  const [started, setStarted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState<ReturnType<
    typeof getAttempts
  >[0] | null>(null);
  const [runId, setRunId] = useState(0);

  const buildQuiz = useCallback(() => {
    if (isRandom) {
      return pickRandomQuestions(questions, 10);
    }
    return pickDailyQuestions(questions, date, 10, getAskedIds());
  }, [questions, date, isRandom]);

  useEffect(() => {
    const q = buildQuiz();
    setQuiz(q);
    setAnswers(Array(q.length).fill(null));
    setIdx(0);
    setSeconds(MARKING.durationSec);
    setStarted(false);
    setSubmitted(false);
    setReady(true);
  }, [buildQuiz, runId]);

  useEffect(() => {
    if (!isRandom) {
      const prev = getAttempts().find((a) => a.date === date);
      if (prev) setAlreadyDone(prev);
    }
  }, [date, isRandom]);

  const reshuffle = () => {
    setRunId((n) => n + 1);
  };

  const submit = useCallback(() => {
    if (submitted || quiz.length === 0) return;
    const timeTaken = MARKING.durationSec - seconds;
    const result = scoreAnswers(quiz, answers);
    const attemptDate = isRandom
      ? `${date}-r${Date.now()}`
      : date;
    const attempt = {
      date: attemptDate,
      ...result,
      timeTaken,
      questionIds: quiz.map((q) => q.id),
      answers,
    };
    saveAttempt(attempt);
    if (!isRandom) markAsked(quiz.map((q) => q.id));
    sessionStorage.setItem(
      "cds-last-result",
      JSON.stringify({ ...attempt, questions: quiz, mode })
    );
    setSubmitted(true);
    router.push("/results");
  }, [submitted, quiz, seconds, answers, date, router, isRandom, mode]);

  useEffect(() => {
    if (!started || submitted) return;
    if (seconds <= 0) {
      submit();
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [started, seconds, submitted, submit]);

  if (!ready) {
    return (
      <div className="card text-center py-16 text-lavender-600">Loading…</div>
    );
  }

  if (quiz.length === 0) {
    return (
      <div className="card text-center py-16">
        <p className="text-lavender-800 font-medium mb-2">No questions loaded yet</p>
        <Link href="/" className="btn-ghost">
          Back home
        </Link>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="card max-w-lg mx-auto text-center py-10">
        <h1 className="text-2xl font-bold text-lavender-900 mb-2">
          {isRandom ? "Random Quiz" : "Today's Test"}
        </h1>
        <p className="text-lavender-700/80 mb-1">
          {isRandom ? "New questions & shuffled options every time" : date}
        </p>
        <p className="text-sm text-lavender-600 mb-6">
          {quiz.length} questions · {MARKING.durationSec / 60} min · +1 / −0.25
        </p>
        {!isRandom && alreadyDone && (
          <p className="text-sm bg-lavender-100 text-lavender-700 rounded-lg px-3 py-2 mb-4">
            Previous score today: <strong>{alreadyDone.score}</strong> (
            {alreadyDone.correct}/{alreadyDone.total} correct)
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button type="button" className="btn-primary" onClick={() => setStarted(true)}>
            Begin test
          </button>
          {isRandom && (
            <button type="button" className="btn-ghost" onClick={reshuffle}>
              Shuffle again
            </button>
          )}
        </div>
      </div>
    );
  }

  const q = quiz[idx];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 sticky top-[57px] z-40 bg-lavender-50/95 backdrop-blur py-3 -mx-1 px-1">
        <div className="flex gap-1.5 flex-wrap">
          {quiz.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              className={`progress-dot ${i === idx ? "active" : ""} ${
                answers[i] !== null ? "answered" : ""
              }`}
              aria-label={`Question ${i + 1}`}
            />
          ))}
        </div>
        <Timer seconds={seconds} />
      </div>

      <QuestionCard
        question={q}
        index={idx}
        total={quiz.length}
        selected={answers[idx]}
        onSelect={(opt) => {
          setAnswers((prev) => {
            const next = [...prev];
            next[idx] = opt;
            return next;
          });
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="btn-ghost"
          disabled={idx === 0}
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
        >
          ← Prev
        </button>
        <button
          type="button"
          className="btn-ghost text-lavender-500"
          onClick={() => {
            setAnswers((prev) => {
              const next = [...prev];
              next[idx] = null;
              return next;
            });
          }}
        >
          Clear
        </button>
        {idx < quiz.length - 1 ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIdx((i) => Math.min(quiz.length - 1, i + 1))}
          >
            Next →
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={submit}>
            Submit test
          </button>
        )}
      </div>
    </div>
  );
}
