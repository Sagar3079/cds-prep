import { NextResponse } from "next/server";
import questions from "@/data/questions.json";
import type { Question } from "@/types";
import { rateLimit } from "@/lib/ratelimit";

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
      return `"${original}" takes "${right}" — "${original} ${right}" is a fixed verb/adjective + preposition pairing in English, not something derivable from a rule. The wrong options swap in a preposition that sounds plausible but doesn't actually pair with "${original}".`;
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
    return `The sentence is already correct as written. The three edits on offer each introduce a fresh problem — a tense that no longer fits, a preposition that doesn't belong, or a change that wasn't needed — rather than fixing anything real. When none of the edits fix a genuine fault, "No improvement" is the answer.`;
  }

  const prepHit = explainPreposition(stem, options, right);
  if (prepHit) return prepHit;

  const edits = options.filter((o) => !isNoImprovementOption(o));
  const allSingleWord = edits.every((o) => !/\s/.test(o.trim()));
  if (allSingleWord) {
    return `The fix here is "${right}" — a single-word swap, most likely a preposition, particle or wrong word the original sentence has in that spot. Read the original next to each of the three edits to see exactly what changes.`;
  }
  const hasVerbForm = edits.some((o) =>
    /\b(is|are|was|were|has|have|had|being|been|do|does|did)\b/i.test(o),
  );
  if (hasVerbForm) {
    return `The fix here is "${right}" — this is a tense, voice or agreement correction. Read the original sentence and each edit aloud; the one that keeps the meaning but fixes the grammar is the answer.`;
  }
  return `The fix here is "${right}". Compare it against the original wording and the other two edits for tense, agreement and preposition — the correct edit is the one that changes only what's actually wrong.`;
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
  return `The pieces slot in as ${letters.join(" → ")}. Find the opening piece first — usually the one that names its subject outright rather than with a pronoun — then follow the pronouns and connectors (this, therefore, however) to chain the rest in that order.`;
}

function detectSpottingErrors(
  options: string[],
  right: string,
): string | null {
  if (!options.some((o) => normWord(o) === "noerror")) return null;
  if (normWord(right) === "noerror") {
    return `Every part of this sentence is grammatically fine as written — the three fragments on offer don't actually contain a fault. When nothing is wrong, "No error" is the answer.`;
  }
  const trimmed = right.trim();
  let category: string;
  if (
    /^(is|are|was|were|has|have|had|do|does|did|will|would|can|could|should|shall|may|might|must|being|been)\b/i.test(
      trimmed,
    )
  ) {
    category =
      "a subject–verb agreement or tense problem — check what the actual subject of that fragment's clause is (plural-looking phrases before the verb, like fractions, percentages or \"a number of\", aren't always the real subject)";
  } else if (isPrepWord(trimmed)) {
    category = "a wrong preposition";
  } else if (/^(a|an|the|some|any|each|every|no)\b/i.test(trimmed)) {
    category = "a wrong or missing article";
  } else if (/\b(is|are|was|were|has|have|had)\b/i.test(trimmed)) {
    category = "a subject–verb agreement or tense problem";
  } else {
    category = "a word-choice or agreement slip";
  }
  return `The error sits in "${trimmed}" — ${category}. Check each fragment on its own rather than reading the sentence as a whole; that's how these traps get missed.`;
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
  return `The word or fragment in question functions as "${right}" here. Work out its job in the sentence first — what it modifies, or what it's standing in for — before matching that job to a label; the wrong options are usually real grammatical categories that just don't fit this particular word.`;
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
    ? `Passive voice moves the original object into the subject slot and adds a form of "be" plus the past participle ("is/was/has been done") — match the tense of "be" to the tense of the original verb.`
    : `Active voice puts the doer back into the subject slot and returns the verb to its plain tense — the "by ..." agent becomes the new subject.`;
  return `The correctly converted sentence is "${right}". ${rule}`;
}

function detectDirectIndirect(topic: string, right: string): string | null {
  if (topic !== "direct indirect") return null;
  return `The correctly reported version is "${right}". Reported speech shifts the tense one step back (is → was, will → would), swaps first/second-person pronouns for third-person ones, and drops the question mark and quotation marks — check those three changes separately rather than judging the sentence as a whole.`;
}

function detectSentenceRelationship(
  stem: string,
  right: string,
): string | null {
  if (!/second (sentence|statement)/i.test(stem)) return null;
  const predicate = right.trim().replace(/^./, (c) => c.toLowerCase());
  return `Read S1 and S2 as a pair: S2 ${predicate}. Test each option by asking whether the second statement restates, extends, opposes, or draws a conclusion from the first — that relationship is the whole question, not the topic the two sentences happen to share.`;
}

function detectSentenceCombination(
  stem: string,
  right: string,
): string | null {
  if (!/correct combination of the given/i.test(stem)) return null;
  return `The correctly combined sentence is "${right}". Check that the connector you land on (because, although, as soon as, when, since, and so on) captures the actual logical relationship between the two original sentences, and that the tense stays consistent across the join.`;
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
    return filled ? `${prepHit} Filled in: "${filled}"` : prepHit;
  }
  if (hasBlank) {
    const before = stem.split(/_{2,}/)[0]?.trim().split(/\s+/) ?? [];
    const governingWord = before[before.length - 1]?.replace(/[^\w']/g, "") ?? "";
    // Not a verified collocation from the dictionary above — so this only
    // points at the word next to the gap rather than asserting it as a rule.
    const anchor = governingWord
      ? `The gap comes right after "${governingWord}", and "${right}" is what fits here`
      : `"${right}" is what fits in the gap here`;
    return `${anchor}. Prepositions like this are fixed by usage rather than by a rule, so the safest approach is to learn the exact pairing rather than reason it out.${filled ? ` Filled in: "${filled}"` : ""}`;
  }
  return `The right preposition here is "${right}". These pairings are fixed by usage rather than derivable from a rule — the fastest way to lock them in is to collect them as you meet them.`;
}

function detectSynonymAntonym(
  topic: string,
  target: string | undefined,
  right: string,
): string | null {
  if (topic.includes("synonym")) {
    const core = target
      ? `This tests the meaning of "${target}" — the closest match in sense is "${right}".`
      : `This tests which option is closest in meaning to the highlighted word — the closest match in sense is "${right}".`;
    return `${core} Synonym sets usually plant one option that means the opposite and one that's merely related in topic — match sense, not association.`;
  }
  if (topic.includes("antonym")) {
    const core = target
      ? `This tests the opposite of "${target}" — the option that reverses its meaning is "${right}".`
      : `This tests which option is the opposite of the highlighted word — the option that reverses its meaning is "${right}".`;
    return `${core} Antonym sets usually have three options that mean roughly the same thing and only one that flips it — find the odd one out rather than the best-sounding match.`;
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
    return `"${term}" means "${right}" here. This is vocabulary rather than grammar — the meaning is learned, or inferred from context and word roots, not worked out from a rule. The wrong options are meanings of other words that get confused with "${term}".`;
  }
  const kind = topic.includes("phrasal") ? "Phrasal verbs" : "Idioms and set phrases";
  return `"${term}" means "${right}" here. ${kind} can't be worked out from their individual words — treat this one as vocabulary to memorise. The wrong options are usually meanings of a different, similarly-worded expression, not this one.`;
}

function detectOneWordSubstitution(
  stem: string,
  topic: string,
  right: string,
): string | null {
  if (!topic.includes("one word")) return null;
  const description = stem.trim().replace(/[:.]$/, "");
  return `"${right}" is the single word for "${description}". These are pure vocabulary — spotting the Latin/Greek root ("-cide" = killing, "omni-" = all, "-phile"/"-phobe" = loving/fearing, and so on) is usually faster than memorising the whole word cold.`;
}

function detectSpelling(stem: string, topic: string, right: string): string | null {
  if (!topic.includes("spelling") && !/correct spelling/i.test(stem)) return null;
  return `Only "${right}" is spelled correctly — the other three are common misspellings of the same word. Sound it out syllable by syllable against "${right}" to see exactly where each distractor goes wrong.`;
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
  return `${core} The options look or sound alike, which is the entire trap — lock in the meaning of "${right}" specifically, not just its spelling.${filled ? ` Filled in: "${filled}"` : ""}`;
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
    return `"were" is correct — the unreal/hypothetical conditional ("if I were you") always takes "were", even for "I", "he" or "she"; it's one of the few places English keeps a separate subjunctive form.`;
  }

  if (!hasBlank) {
    return `The word that fits is "${right}". Read the whole sentence with each option in place — the one that keeps both the grammar and the sense intact is the answer.`;
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
  if (passage) {
    return `This is a passage-based question — the answer turns on a specific detail in the passage, not on the question sentence alone. Go back and re-read the section discussing "${right}" (or its paraphrase) before trusting your memory of it.`;
  }
  return `This is a comprehension question testing a specific word or detail from its passage. The passage text isn't reproduced here, so the safest habit is to re-read the relevant lines rather than rely on recall.`;
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
    return `The word or phrase that fits is "${right}". Filled in: "${filled}" — read it in full rather than judging the option on its own.`;
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
    return `All four options share "${frame}" — only "${middle}" actually changes between them, so that's the specific point this question is testing. The answer is "${right}".`;
  }

  return `"${right}" is correct. This one doesn't match a pattern this offline check knows how to explain — compare it directly against the sentence's content and the other three options, and treat it as worth looking up rather than taking on faith.`;
}

function explainQuestion(q: Question, right: string): string {
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
function offline(q: Question, chosen: number | null): string {
  const right = q.options[q.answer ?? 0];
  const picked = chosen !== null ? q.options[chosen] : null;
  const bits: string[] = [];

  bits.push(explainQuestion(q, right));

  if (chosen === null) {
    bits.push(
      "You left it blank, which scores 0 — the right call when you cannot rule out two options.",
    );
  } else if (chosen === q.answer) {
    bits.push("You got it.");
  } else if (picked) {
    bits.push(`You chose "${picked}".`);
  }

  bits.push(
    q.answerSource === "official-key"
      ? "Backed by the answer key UPSC published for this paper."
      : "This answer is not from an official key, so verify it before you memorise it.",
  );

  return bits.join(" ");
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
