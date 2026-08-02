import { NextResponse } from "next/server";
import questions from "@/data/questions.json";
import type { Question } from "@/types";

/**
 * Potter's explanation endpoint.
 *
 * This runs on the SERVER for one reason: the API key must never reach the
 * browser. This app has no auth and the repo is public, so a key in client code
 * — or in any committed file — is a published key. It is read from the
 * environment at request time and is not in git. See .env.example.
 *
 * Currently disabled: with no key configured it returns a scripted explanation
 * built from the bank, which is honest and costs nothing. Set SCALEMAX_API_KEY
 * to turn the model on.
 */

const BANK = questions as Question[];
const BY_ID = new Map(BANK.map((q) => [q.id, q]));

const ENDPOINT =
  process.env.SCALEMAX_BASE_URL ?? "https://api.scalemax.pro/token";
const MODEL = process.env.SCALEMAX_MODEL ?? "glm-5.2";

interface Body {
  id?: unknown;
  chosen?: unknown;
}

/**
 * Explanation without a model.
 *
 * This cannot invent a reason — it has the bank, not a dictionary — so instead
 * of dressing a restatement up as analysis it explains what it genuinely can:
 * what the question is testing, which word or fragment it turns on, and how to
 * attack that question type next time. Saying only "the answer is X" was
 * useless, and saying more than the data supports would be worse.
 */
function offline(q: Question, chosen: number | null): string {
  const right = q.options[q.answer ?? 0];
  const picked = chosen !== null ? q.options[chosen] : null;
  const topic = (q.topic ?? "").toLowerCase();
  const bits: string[] = [];

  // 1. What is actually being tested, and on which word.
  if (topic.includes("synonym")) {
    bits.push(
      q.target
        ? `This tests the meaning of "${q.target}". The answer is "${right}" — the option closest to it in sense.`
        : `This is a synonym question. The answer is "${right}".`,
    );
    if (picked && picked !== right) {
      bits.push(
        `Synonym sets usually plant one option that is the opposite and one that merely shares the subject — check the sense, not the association.`,
      );
    }
  } else if (topic.includes("antonym")) {
    bits.push(
      q.target
        ? `This tests the opposite of "${q.target}". The answer is "${right}".`
        : `This is an antonym question. The answer is "${right}".`,
    );
    if (picked && picked !== right) {
      bits.push(
        `In antonym sets three options usually mean roughly the same thing and only one reverses it — find the odd one out rather than the best match.`,
      );
    }
  } else if (topic.includes("spotting error")) {
    bits.push(
      `The error is in part ${"ABCD"[q.answer ?? 0]}: "${right}". Check agreement, tense and preposition in each fragment separately before choosing.`,
    );
  } else if (
    topic.includes("fill") ||
    topic.includes("blank") ||
    topic.includes("cloze")
  ) {
    bits.push(
      `The blank takes "${right}". Read the whole sentence with each option in place — the one that keeps both the grammar and the sense intact is the answer.`,
    );
  } else if (topic.includes("preposition")) {
    bits.push(
      `The preposition is "${right}". These are fixed by usage rather than rule, so they are worth collecting as you meet them.`,
    );
  } else if (topic.includes("idiom") || topic.includes("phrase")) {
    bits.push(
      `"${q.question.replace(/[:.]$/, "")}" means "${right}". Idioms are not deducible from their words — this one is memorisation.`,
    );
  } else if (topic.includes("ordering")) {
    bits.push(
      `The correct order is "${right}". Find the opening fragment first, then follow the pronouns and connectors.`,
    );
  } else if (topic.includes("improvement") || topic.includes("sentence")) {
    bits.push(
      `The improved version is "${right}". Compare each option against the original for tense, agreement and word order rather than for style.`,
    );
  } else if (topic.includes("one word")) {
    bits.push(`The single word for it is "${right}".`);
  } else {
    bits.push(`The answer is "${right}".`);
  }

  // 2. What the reader actually did, framed by the marking scheme.
  if (chosen === null) {
    bits.push(
      "You left it blank, which scores 0 — the right call when you cannot rule out two options.",
    );
  } else if (chosen === q.answer) {
    bits.push("You got it.");
  } else if (picked) {
    bits.push(`You chose "${picked}".`);
  }

  // 3. How much this answer is worth trusting.
  bits.push(
    q.answerSource === "official-key"
      ? "Backed by the answer key UPSC published for this paper."
      : "This answer is not from an official key, so verify it before you memorise it.",
  );

  return bits.join(" ");
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  const q = id ? BY_ID.get(id) : undefined;
  if (!q) {
    return NextResponse.json(
      { error: "Unknown question id." },
      { status: 404 },
    );
  }
  const chosen =
    typeof body.chosen === "number" && Number.isInteger(body.chosen)
      ? body.chosen
      : null;

  const key = process.env.SCALEMAX_API_KEY;
  if (!key) {
    return NextResponse.json({ text: offline(q, chosen), source: "offline" });
  }

  // The model is told the correct answer rather than asked for it. It explains;
  // it does not adjudicate. Letting it pick would reintroduce exactly the
  // unverified-answer problem this bank was just cleaned of.
  const prompt = [
    `Question: ${q.question}`,
    `Options: ${q.options.map((o, i) => `${"ABCD"[i]}) ${o}`).join("  ")}`,
    `Correct answer: ${"ABCD"[q.answer ?? 0]}) ${q.options[q.answer ?? 0]}`,
    chosen !== null
      ? `The student chose: ${"ABCD"[chosen]}) ${q.options[chosen]}`
      : "The student left it blank.",
    q.answerSource === "official-key"
      ? "This answer comes from the official UPSC key."
      : "This answer is NOT from an official key — say so.",
    "",
    "Explain WHY, in at most three short sentences. Give the actual reason: the",
    "meaning of the tested word, the grammar rule, or the idiom — not a",
    "restatement of which option is correct, which they can already see.",
    "If they chose wrong, name what made their option tempting.",
    "Speak plainly to an Indian defence-exam candidate. No preamble, no",
    "'the correct answer is'. Do not contradict the stated correct answer.",
  ].join("\n");

  try {
    const res = await fetch(
      `${ENDPOINT.replace(/\/$/, "")}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 220,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );

    if (!res.ok) {
      return NextResponse.json({ text: offline(q, chosen), source: "offline" });
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ text: offline(q, chosen), source: "offline" });
    }
    return NextResponse.json({ text: text.trim(), source: "model" });
  } catch {
    // Never let an explanation failure break the review screen.
    return NextResponse.json({ text: offline(q, chosen), source: "offline" });
  }
}
