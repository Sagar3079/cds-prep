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

const ENDPOINT = process.env.SCALEMAX_BASE_URL ?? "https://api.scalemax.pro/token";
const MODEL = process.env.SCALEMAX_MODEL ?? "glm-5.2";

interface Body {
  id?: unknown;
  chosen?: unknown;
}

function offline(q: Question, chosen: number | null): string {
  const right = q.options[q.answer ?? 0];
  const official = q.answerSource === "official-key";
  const provenance = official
    ? "This one is from the official UPSC key, so it is settled."
    : "Heads up — this answer is not from an official key, so it is worth checking yourself.";

  if (chosen === null) {
    return `You left this blank, which costs nothing. The answer is "${right}". ${provenance}`;
  }
  if (chosen === q.answer) {
    return `Correct — "${right}". ${provenance}`;
  }
  return `The answer is "${right}", not "${q.options[chosen] ?? "—"}". ${provenance}`;
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
    return NextResponse.json({ error: "Unknown question id." }, { status: 404 });
  }
  const chosen =
    typeof body.chosen === "number" && Number.isInteger(body.chosen) ? body.chosen : null;

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
    chosen !== null ? `The student chose: ${"ABCD"[chosen]}) ${q.options[chosen]}` : "The student left it blank.",
    q.answerSource === "official-key"
      ? "This answer comes from the official UPSC key."
      : "This answer is NOT from an official key — say so.",
    "",
    "Explain in at most three short sentences why the correct answer is correct,",
    "and if they chose wrong, what the trap was. Speak plainly to an Indian",
    "defence-exam candidate. Do not contradict the stated correct answer.",
  ].join("\n");

  try {
    const res = await fetch(`${ENDPOINT.replace(/\/$/, "")}/v1/chat/completions`, {
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
    });

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
