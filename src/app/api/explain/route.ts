import { NextResponse } from "next/server";
import { bankFor } from "@/lib/bank";
import { rateLimit } from "@/lib/ratelimit";
import { subjectOf } from "@/lib/subject";
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

// Both banks, because /results reviews whichever subject was just taken and an
// unresolvable id renders as "couldn't load an explanation". Ids are unique
// across the two (`cds1-2018-001` vs `cds1-2018-gk-001`), and `subjectOf` on the
// record — not the lookup — is what decides how it gets explained.
const BY_ID = new Map(
  [...bankFor("english"), ...bankFor("gk")].map((q) => [q.id, q]),
);

const ENDPOINT =
  process.env.SCALEMAX_BASE_URL ?? "https://api.scalemax.pro/token";
const MODEL = process.env.SCALEMAX_MODEL ?? "glm-5.2";

interface Body {
  id?: unknown;
  chosen?: unknown;
}

// ---------------------------------------------------------------------------
// Offline explanation engine.
//
// `topic` is unreliable — it's a loose OCR/authoring label, and roughly a
// quarter of the bank falls outside every topic-keyword branch (Parts of
// Speech, General, Comprehension, Phrasal Verbs, Direct Indirect, Active
// Passive, Homophones, Spelling, Word Meaning, Commonly Confused Words —
// none of those strings matched anything before). So detection here is
// signature-first: the shape of the options (a "No improvement"/"No error"
// slot, a PQRS-style ordering set, a bag of grammar-term labels, a bag of
// single prepositions) tells you far more about what's being tested than the
// topic string does. Topic is only used as a secondary signal, and only for
// question types with no reliable structural shape (synonyms, antonyms,
// idioms, spelling, one-word substitution).
//
// Every rule that would name a *specific* fact (a preposition a verb takes,
// a day-of-week rule, a subjunctive rule) computes its prediction and checks
// it against the bank's own stored correct answer before saying anything. If
// the prediction doesn't match, the rule stays silent and a more general —
// but still true — explanation is used instead. Nothing here is asserted
// about a specific question that wasn't cross-checked against that
// question's own answer.
// ---------------------------------------------------------------------------

function normWord(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z]/g, "");
}

function isNoImprovementOption(s: string): boolean {
  return normWord(s).includes("improvement");
}

const PREP_WORDS = new Set([
  "of", "in", "on", "at", "to", "for", "with", "from", "by", "about", "into",
  "onto", "upon", "over", "under", "between", "among", "during", "since",
  "until", "towards", "toward", "against", "without", "within", "along",
  "across", "behind", "beyond", "beside", "besides", "before", "after",
  "around", "off", "out", "through", "up", "down", "away", "near", "past",
  "via", "despite",
]);

function isPrepWord(s: string): boolean {
  return PREP_WORDS.has(normWord(s));
}

function fillBlank(stem: string, right: string): string | null {
  const match = /_{2,}/.exec(stem);
  if (!match) return null;
  let before = stem.slice(0, match.index);
  let after = stem.slice(match.index + match[0].length);

  // A handful of options in the bank already restate the word that follows
  // the blank in the stem (a data quirk from OCR) — drop the duplicate
  // rather than doubling it up ("crying over spilt milk milk").
  const rightWords = right.trim().split(/\s+/);
  const lastWord = (rightWords[rightWords.length - 1] ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const afterMatch = /^\s*([A-Za-z']+)/.exec(after);
  if (lastWord && afterMatch && afterMatch[1].toLowerCase() === lastWord) {
    after = after.slice(afterMatch[0].length);
  }

  if (before && !/\s$/.test(before)) before += " ";
  if (after && !/^[\s.,!?;:]/.test(after)) after = " " + after;

  return (before + right + after).replace(/\s+/g, " ").trim();
}

// Curated verb/adjective + preposition collocations. Each entry only ever
// gets used when it agrees with the bank's own correct answer for that
// question — an ambiguous or wrong guess just falls through silently, it is
// never asserted.
const PREP_COLLOCATIONS: Record<string, string> = {
  accuse: "of", accused: "of", accuses: "of",
  abide: "by", abided: "by", abides: "by",
  dispense: "with", dispensed: "with", dispenses: "with",
  junior: "to", senior: "to",
  congratulate: "on", congratulated: "on", congratulates: "on",
  afraid: "of",
  agree: "with", agreed: "with", agrees: "with",
  depend: "on", depends: "on", depended: "on", dependent: "on",
  married: "to", marry: "to", marries: "to",
  angry: "with",
  beware: "of",
  die: "of", died: "of", dies: "of",
  proud: "of",
  capable: "of",
  translate: "into", translated: "into", translates: "into",
  prefer: "to", preferred: "to", prefers: "to",
  burst: "into", bursts: "into", bursting: "into",
  addicted: "to",
  envious: "of",
  tired: "of",
  differ: "with", differed: "with", differs: "with",
  consist: "of", consists: "of", consisted: "of",
  polite: "to",
  blind: "in",
  indebted: "to",
  responsible: "for",
  rely: "on", relies: "on", relied: "on",
  believe: "in", believes: "in", believed: "in",
  insist: "on", insists: "on", insisted: "on",
  apologise: "for", apologize: "for",
  aware: "of",
  fond: "of",
  guilty: "of",
  interested: "in",
  similar: "to",
  different: "from",
};

const PREP_PHRASES: { test: RegExp; prep: string; note: string }[] = [
  {
    test: /dint of/i,
    prep: "by",
    note: `"by dint of" is a fixed phrase meaning "by means of" — the whole phrase is memorised as a unit, not built word by word.`,
  },
  {
    test: /fed[\s-]?up/i,
    prep: "with",
    note: `"fed up with" (= tired of, annoyed by) always takes "with" — it's a fixed phrase.`,
  },
];

/**
 * Tries to name the specific reason a preposition is correct: a fixed
 * verb/adjective pairing, a between-vs-among count, or a time/transport
 * rule. Returns null (never a guess) when nothing checks out against the
 * bank's own answer.
 */
function explainPreposition(
  stem: string,
  options: string[],
  right: string,
): string | null {
  const rightNorm = normWord(right);
  if (!PREP_WORDS.has(rightNorm)) return null;
  const stemLower = stem.toLowerCase();

  const optionNorms = options.map(normWord);
  if (optionNorms.includes("between") && optionNorms.includes("among")) {
    const predicted = /\btwo\b/i.test(stem) ? "between" : "among";
    if (predicted === rightNorm) {
      return rightNorm === "between"
        ? `"between" is correct — English reserves "between" for exactly two, and this sentence names two.`
        : `"among" is correct — English reserves "between" for exactly two; anything more (or an unspecified group) takes "among".`;
    }
  }

  for (const { test, prep, note } of PREP_PHRASES) {
    if (prep === rightNorm && test.test(stemLower)) return note;
  }

  const tokens = stem.split(/\W+/).map((t) => t.toLowerCase()).filter(Boolean);
  for (const tok of tokens) {
    const prep = PREP_COLLOCATIONS[tok];
    if (prep && prep === rightNorm) {
      const originalMatch = new RegExp(`\\b${tok}\\b`, "i").exec(stem);
      const original = originalMatch ? originalMatch[0] : tok;
      return `"${original}" takes "${right}" — a fixed pairing.`;
    }
  }

  const dayNamePresent =
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      stemLower,
    );
  const rules: { test: () => boolean; prep: string; note: string }[] = [
    {
      test: () =>
        /\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(year|years|month|months|week|weeks|day|days|hour|hours|minute|minutes)\b/i.test(
          stemLower,
        ),
      prep: "for",
      note: `A stretch of time after a perfect tense ("has/have/had been ...") takes "for" — "since" would need a specific starting point (a date, day or year) instead.`,
    },
    {
      test: () =>
        /(has|have|had)\s+been\b/i.test(stemLower) &&
        (dayNamePresent || /\b(19|20)\d{2}\b/.test(stemLower)),
      prep: "since",
      note: `A perfect tense ("has/have/had been ...") paired with a specific starting point (a day or a year) takes "since" — "for" would be for a stretch of time instead.`,
    },
    {
      test: () => dayNamePresent,
      prep: "on",
      note: `Named days take "on" ("on Monday", "on Friday morning") — that's fixed, regardless of what else the sentence says.`,
    },
    {
      test: () => /\bnight\b/i.test(stemLower),
      prep: "at",
      note: `"at night" is a fixed exception to the usual day-part pattern ("in the morning/afternoon/evening", but "at night").`,
    },
    {
      test: () =>
        /\b(morning|afternoon|evening)\b/i.test(stemLower) && !dayNamePresent,
      prep: "in",
      note: `A part of the day with no specific date attached takes "in" ("in the morning/afternoon/evening") — a named day or "night" overrides this.`,
    },
    {
      test: () => /\bfoot\b/i.test(stemLower),
      prep: "on",
      note: `"on foot" is the one fixed exception to the "by + mode of transport" pattern.`,
    },
    {
      test: () =>
        /\b(bus|car|train|plane|bike|bicycle|ship|boat|taxi|cab|cycle|tram|ferry|scooter)\b/i.test(
          stemLower,
        ),
      prep: "by",
      note: `Modes of transport take "by" ("by bus/car/train") — the one fixed exception is "on foot".`,
    },
  ];
  for (const rule of rules) {
    if (rule.prep === rightNorm && rule.test()) return rule.note;
  }

  return null;
}

// -- Structural detectors, most reliable signature first --------------------

function detectSentenceImprovement(
  stem: string,
  options: string[],
  right: string,
): string | null {
  const niIndex = options.findIndex(isNoImprovementOption);
  if (niIndex === -1) return null;

  if (isNoImprovementOption(right)) {
    return `The sentence is already correct — each edit on offer introduces a new fault rather than fixing one.`;
  }

  const prepHit = explainPreposition(stem, options, right);
  if (prepHit) return prepHit;

  const edits = options.filter((o) => !isNoImprovementOption(o));
  const allSingleWord = edits.every((o) => !/\s/.test(o.trim()));
  if (allSingleWord) {
    return `"${right}" is the correct form for that slot.`;
  }
  const hasVerbForm = edits.some((o) =>
    /\b(is|are|was|were|has|have|had|being|been|do|does|did)\b/i.test(o),
  );
  if (hasVerbForm) {
    return `"${right}" — the original gets the tense or agreement wrong.`;
  }
  return `"${right}" is the correct version of that phrase.`;
}

/**
 * The bank has OCR noise trailing some ordering options (stray page numbers,
 * "COMPREHENSION" headers bleeding in from the source PDF). Reading only the
 * first 4 P/Q/R/S characters — rather than requiring the whole option string
 * to be clean — is what makes this survive that noise.
 */
function orderingLetters(o: string): string[] | null {
  const letters = (o.toUpperCase().match(/[PQRS]/g) ?? []).slice(0, 4);
  if (letters.length !== 4 || new Set(letters).size !== 4) return null;
  return letters;
}

function detectOrdering(options: string[], right: string): string | null {
  const hits = options.filter((o) => orderingLetters(o) !== null).length;
  if (hits < 3) return null;
  const letters = orderingLetters(right);
  if (!letters) return null;
  return `The order is ${letters.join(" → ")}.`;
}

function detectSpottingErrors(
  options: string[],
  right: string,
): string | null {
  if (!options.some((o) => normWord(o) === "noerror")) return null;
  if (normWord(right) === "noerror") {
    return `No fault in any fragment — the sentence is correct as written.`;
  }
  const trimmed = right.trim();
  let category: string;
  if (
    /^(is|are|was|were|has|have|had|do|does|did|will|would|can|could|should|shall|may|might|must|being|been)\b/i.test(
      trimmed,
    )
  ) {
    category =
      "the verb doesn't agree with its real subject (a fraction or \"a number of\" takes the noun after \"of\", not the phrase before it)";
  } else if (isPrepWord(trimmed)) {
    category = "a wrong preposition";
  } else if (/^(a|an|the|some|any|each|every|no)\b/i.test(trimmed)) {
    category = "a wrong or missing article";
  } else if (/\b(is|are|was|were|has|have|had)\b/i.test(trimmed)) {
    category = "a subject–verb agreement or tense problem";
  } else {
    category = "a word-choice or agreement slip";
  }
  return `"${trimmed}" is the error — ${category}.`;
}

const GRAMMAR_TERMS = [
  "noun", "verb", "adjective", "adverb", "pronoun", "preposition",
  "conjunction", "interjection", "clause", "phrase", "tense", "transitive",
  "intransitive", "subject", "object", "article", "gerund", "participle",
  "infinitive", "auxiliary", "voice", "finite", "determiner", "intensifier",
  "demonstrative", "interrogative", "modal",
];

function detectPartsOfSpeech(
  options: string[],
  right: string,
): string | null {
  const hits = options.filter((o) => {
    if (o.trim().split(/\s+/).length > 3) return false;
    const lo = o.toLowerCase();
    return GRAMMAR_TERMS.some((t) => lo.includes(t));
  });
  if (hits.length < 3) return null;
  return `It functions as "${right}" in this sentence.`;
}

function detectActivePassive(stem: string, right: string): string | null {
  const trimmed = stem.trim();
  if (!/^change\b/i.test(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  const passiveIdx = lower.lastIndexOf("passive");
  const activeIdx = lower.lastIndexOf("active");
  if (passiveIdx === -1 && activeIdx === -1) return null;
  const targetPassive = passiveIdx > activeIdx;
  const rule = targetPassive
    ? `the object becomes the subject, plus "be" + past participle`
    : `the doer becomes the subject and the verb returns to its plain tense`;
  return `"${right}" — ${rule}.`;
}

function detectDirectIndirect(topic: string, right: string): string | null {
  if (topic !== "direct indirect") return null;
  return `"${right}" — reported speech shifts the tense back one step and moves pronouns to third person.`;
}

function detectSentenceRelationship(
  stem: string,
  right: string,
): string | null {
  if (!/second (sentence|statement)/i.test(stem)) return null;
  const predicate = right.trim().replace(/^./, (c) => c.toLowerCase());
  return `S2 ${predicate}.`;
}

function detectSentenceCombination(
  stem: string,
  right: string,
): string | null {
  if (!/correct combination of the given/i.test(stem)) return null;
  return `"${right}" — its connector matches the actual relationship between the two sentences.`;
}

function detectPreposition(
  stem: string,
  topic: string,
  options: string[],
  right: string,
): string | null {
  const hasBlank = /_{2,}/.test(stem);
  const prepCount = options.filter(isPrepWord).length;
  const qualifies =
    (hasBlank && prepCount >= 3) || (topic.includes("preposition") && prepCount >= 3);
  if (!qualifies) return null;

  const prepHit = explainPreposition(stem, options, right);
  const filled = fillBlank(stem, right);
  if (prepHit) {
    return filled ? `${prepHit} "${filled}"` : prepHit;
  }
  if (hasBlank) {
    const before = stem.split(/_{2,}/)[0]?.trim().split(/\s+/) ?? [];
    const governingWord = before[before.length - 1]?.replace(/[^\w']/g, "") ?? "";
    // Not a verified collocation from the dictionary above — so this only
    // points at the word next to the gap rather than asserting it as a rule.
    const anchor = governingWord
      ? `The gap comes right after "${governingWord}", and "${right}" is what fits here`
      : `"${right}" is what fits in the gap here`;
    return `${anchor}.${filled ? ` "${filled}"` : ""}`;
  }
  return `"${right}" is the pairing that fits here.`;
}

function detectSynonymAntonym(
  topic: string,
  target: string | undefined,
  right: string,
): string | null {
  if (topic.includes("synonym")) {
    const core = target
      ? `"${target}" here means "${right}".`
      : `"${right}" is the closest in meaning.`;
    return core;
  }
  if (topic.includes("antonym")) {
    const core = target
      ? `The opposite of "${target}" is "${right}".`
      : `"${right}" is the one that reverses the meaning.`;
    return core;
  }
  return null;
}

function extractQuoted(stem: string): string | null {
  const m = /['"‘’“”]([^'"‘’“”]{2,})['"‘’“”]/.exec(stem);
  return m ? m[1].trim() : null;
}

/**
 * Drop the trailing verb in `'<phrase>' means:` — but only when it really is
 * the verb. Some idioms end in that word themselves: stripping it blindly
 * rendered "Ways and means" as `"Ways and" means "Methods of achieving
 * something"`, quoting a fragment back at the learner as if it were the idiom.
 */
function stripMeaningVerb(stem: string): string {
  const m = /\s+means?\s*:?\s*$/i.exec(stem);
  if (!m) return stem;
  const head = stem.slice(0, m.index).trim();
  // A conjunction cannot end the phrase being defined, so the tail is part of
  // it: "ways and means", "ways or means".
  if (!head || /\b(?:and|or)$/i.test(head)) return stem;
  return head;
}

function detectIdiomPhrase(
  stem: string,
  topic: string,
  right: string,
): string | null {
  const isIdiomTopic =
    topic.includes("idiom") || topic.includes("phrase") || topic.includes("phrasal");
  const trimmedStem = stem.trim();
  const looksLikeMeaning =
    /\bmeans?\s*:?\s*$/i.test(trimmedStem) || /^what does\b/i.test(trimmedStem);
  if (!isIdiomTopic && !looksLikeMeaning) return null;

  const quoted = extractQuoted(stem);
  const term = quoted ?? stripMeaningVerb(trimmedStem);
  const isSingleWord = !/\s/.test(term);

  if (isSingleWord && !isIdiomTopic) {
    return `"${term}" means "${right}".`;
  }
  return `"${term}" means "${right}" — a set phrase, so the individual words don't give it away.`;
}

function detectOneWordSubstitution(
  stem: string,
  topic: string,
  right: string,
): string | null {
  if (!topic.includes("one word")) return null;
  const description = stem.trim().replace(/[:.]$/, "");
  return `"${right}" is the single word for "${description}".`;
}

function detectSpelling(stem: string, topic: string, right: string): string | null {
  if (!topic.includes("spelling") && !/correct spelling/i.test(stem)) return null;
  return `"${right}" is the correct spelling; the other three are common misspellings of it.`;
}

const CONFUSABLE_GLOSSARY: Record<string, string> = {
  principal: "the head of an institution, or most important (as an adjective)",
  principle: "a fundamental rule or belief",
  accept: "to agree to receive or believe something",
  except: "excluding; other than",
  weather: "atmospheric conditions",
  whether: "introduces a choice between alternatives",
  counsel: "advice, or to advise",
  advice: "a noun — a recommendation someone gives you",
  advise: "a verb — to recommend",
  steel: "the metal",
  steal: "to take without permission",
  loaf: "a shaped lump of bread",
  base: "the foundation or lowest part",
  basis: "the underlying reason or foundation for an argument",
  desert: "a dry, barren area (or to abandon, as a verb)",
  dessert: "a sweet course after a meal",
  close: "to shut",
  clothes: "garments",
  wait: "to stay in expectation of something",
  weight: "heaviness",
  than: "used to introduce a comparison",
  then: "at that time, or next in sequence",
  effect: "a noun — a result",
  affect: "a verb — to influence",
  stationary: "not moving",
  stationery: "writing materials",
  complement: "something that completes or goes well with another thing",
  compliment: "an expression of praise",
};

function detectHomophoneConfusable(
  stem: string,
  topic: string,
  right: string,
): string | null {
  const isTopic = topic.includes("homophone") || topic.includes("confused");
  const looksLikeIt = /choose (the correct word|correctly)/i.test(stem);
  if (!isTopic && !looksLikeIt) return null;

  const gloss = CONFUSABLE_GLOSSARY[right.trim().toLowerCase()];
  const filled = fillBlank(stem, right);
  const core = gloss
    ? `"${right}" is correct here — it means ${gloss}.`
    : `"${right}" is the word that matches the sentence's meaning here.`;
  return `${core}${filled ? ` "${filled}"` : ""}`;
}

function detectClozeFillBlank(
  stem: string,
  topic: string,
  right: string,
): string | null {
  const isTopic =
    topic.includes("fill") || topic.includes("blank") || topic.includes("cloze");
  const hasBlank = /_{2,}/.test(stem);
  if (!isTopic && !hasBlank) return null;

  if (/if\s+i\s*_{2,}\s*you\b/i.test(stem) && normWord(right) === "were") {
    return `"were" — the unreal conditional ("if I were you") keeps the subjunctive, even after "I".`;
  }

  if (!hasBlank) {
    return `"${right}" is the word that fits.`;
  }
  const filled = fillBlank(stem, right);
  const before = stem.split(/_{2,}/)[0]?.trim().split(/\s+/) ?? [];
  const governingWord = before[before.length - 1]?.replace(/[^\w']/g, "") ?? "";
  const anchor = governingWord
    ? `The word that fits after "${governingWord}" is "${right}"`
    : `The word that fits is "${right}"`;
  return `${anchor}. Read the whole sentence with it in place — the option that keeps both the grammar and the sense intact is the answer.${filled ? ` Filled in: "${filled}"` : ""}`;
}

function detectSentenceCompletion(
  stem: string,
  topic: string,
  right: string,
): string | null {
  if (!topic.includes("sentence completion")) return null;
  const lowerRight = right.length ? right[0].toLowerCase() + right.slice(1) : right;
  return `The completed sentence reads: "${stem.trim()} ${lowerRight}". Check that the tense, mood and any pronoun references in the ending actually agree with the clause you're given — that's what rules out the other three, not just which one sounds fluent.`;
}

function detectComprehension(
  topic: string,
  passage: string | null,
  right: string,
): string | null {
  if (topic !== "comprehension") return null;
  // The passage is printed directly above this on the card, so "go back and
  // re-read it" is not an explanation — it is an instruction to do the thing
  // they are already doing. Nothing true and specific can be said without
  // reading the passage, so this says the least that is still useful.
  return passage
    ? `The passage supports "${right}".`
    : `"${right}" is what the passage supports.`;
}

function commonPrefix(strs: string[]): string {
  if (!strs.length) return "";
  let prefix = strs[0];
  for (const s of strs.slice(1)) {
    let i = 0;
    while (
      i < prefix.length &&
      i < s.length &&
      prefix[i].toLowerCase() === s[i].toLowerCase()
    ) {
      i++;
    }
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

function commonSuffix(strs: string[]): string {
  const rev = strs.map((s) => s.split("").reverse().join(""));
  return commonPrefix(rev).split("").reverse().join("");
}

/**
 * Last resort. Never seen before, no recognised shape — so instead of just
 * restating the answer, diff the options against each other: whatever text
 * they all share is not the point of the question, and whatever differs is.
 * That's derived straight from the data, not invented.
 */
function fallbackGeneric(stem: string, options: string[], right: string): string {
  const filled = fillBlank(stem, right);
  if (filled) {
    return `"${right}" fits: "${filled}"`;
  }

  const prefix = commonPrefix(options);
  let suffix = commonSuffix(options);
  const shortest = Math.min(...options.map((o) => o.length));
  if (prefix.length + suffix.length >= shortest) suffix = "";
  const middle = right.slice(prefix.length, right.length - suffix.length).trim();
  // Require a substantial shared chunk — a bare inflectional ending like
  // "-ed" or "-ing" is true but not actually informative.
  if (middle && (prefix.trim().length >= 3 || suffix.trim().length >= 3)) {
    const frame = [prefix.trim(), suffix.trim()].filter(Boolean).join(" … ");
    return `All four share "${frame}" — only "${middle}" changes, so that is what is being tested.`;
  }

  return `"${right}" is correct.`;
}

/**
 * General Knowledge, which none of the rules above are about.
 *
 * Every detector below this file's fold reasons about English grammar, and
 * running them over a Polity question would at best land in `fallbackGeneric`
 * and at worst assert a preposition rule about a date. There is no rule to
 * recover here — a GK answer is a fact — so this says the true thing and stops,
 * rather than dressing a restatement up as analysis.
 */
function explainGeneralKnowledge(q: Question, right: string): string {
  const topic = q.topic?.trim();
  const where = topic ? ` It sits under ${topic}.` : "";
  return `The answer is "${right}".${where} General Knowledge is recall rather than reasoning — there is no rule this can be derived from, so the useful move is to fix the fact itself, and to look at the three near-misses beside it, since those are what the paper will offer you again.`;
}

function explainQuestion(q: Question, right: string): string {
  if (subjectOf(q) === "gk") return explainGeneralKnowledge(q, right);

  const stem = q.question;
  const options = q.options;
  const topic = (q.topic ?? "").toLowerCase();

  return (
    detectSentenceImprovement(stem, options, right) ??
    detectOrdering(options, right) ??
    detectSpottingErrors(options, right) ??
    detectPartsOfSpeech(options, right) ??
    detectActivePassive(stem, right) ??
    detectDirectIndirect(topic, right) ??
    detectSentenceRelationship(stem, right) ??
    detectSentenceCombination(stem, right) ??
    detectPreposition(stem, topic, options, right) ??
    detectSynonymAntonym(topic, q.target, right) ??
    detectIdiomPhrase(stem, topic, right) ??
    detectOneWordSubstitution(stem, topic, right) ??
    detectSpelling(stem, topic, right) ??
    detectHomophoneConfusable(stem, topic, right) ??
    detectClozeFillBlank(stem, topic, right) ??
    detectSentenceCompletion(stem, topic, right) ??
    detectComprehension(topic, q.passage ?? null, right) ??
    fallbackGeneric(stem, options, right)
  );
}

/**
 * Explanation without a model.
 *
 * This cannot invent a reason — it has the bank, not a dictionary — so
 * instead of dressing a restatement up as analysis it runs the stem and
 * options through a set of signature-based rules (see `explainQuestion`
 * above) and only falls back to a plain restatement when nothing about the
 * question's shape is recognisable. Saying only "the answer is X" was
 * useless, and saying more than the data supports would be worse — every
 * specific claim below is cross-checked against this question's own stored
 * answer before it's used.
 */
function offline(q: Question): string {
  // Just the reason. Nothing else.
  //
  // This used to append two more things and both were noise. The first
  // restated what the learner had picked, which the review screen already
  // shows them in red directly above this line. The second was a provenance
  // footnote on every non-official item — it undermined the answer the learner
  // had just been given, on the screen where they are trying to trust it, and
  // it appeared on 42% of the bank. The bank's provenance is described once,
  // properly, on the About page; it does not belong stapled to every answer.
  return explainQuestion(q, q.options[q.answer ?? 0]);
}

export async function POST(req: Request) {
  // Ahead of the model call, which is the part that costs money.
  const limited = await rateLimit(req, "explain");
  if (limited) return limited;

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
    return NextResponse.json({ text: offline(q), source: "offline" });
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
    "",
    "Explain WHY, in ONE or TWO short sentences. Under 30 words total.",
    subjectOf(q) === "gk"
      ? "Give the fact behind the answer, and what makes the closest wrong option wrong."
      : "Give the meaning of the tested word, the grammar rule, or the idiom.",
    "If they chose wrong, say in a few words why theirs is wrong — that is the",
    "part that teaches. Never restate which option is correct; they can see it.",
    "No exam-strategy advice ('read each option carefully', 'learn these as",
    "vocabulary') — it is the same for every question and therefore worthless.",
    "No preamble, no 'the correct answer is'. Plain English for an Indian",
    "defence-exam candidate. Do not contradict the stated correct answer.",
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
      return NextResponse.json({ text: offline(q), source: "offline" });
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ text: offline(q), source: "offline" });
    }
    return NextResponse.json({ text: text.trim(), source: "model" });
  } catch {
    // Never let an explanation failure break the review screen.
    return NextResponse.json({ text: offline(q), source: "offline" });
  }
}
