#!/usr/bin/env python3
"""Rebuild questions.json: keep authentic PYQs, drop easy seeds, add hard CDS-grade set."""
import json
from pathlib import Path

OUT = Path.home() / "cds-prep" / "src" / "data" / "questions.json"

TOPIC_MAP = {
    "Fill In The Blank": "Fill in the Blanks",
    "Ordering Of Words": "Ordering of Words",
    "Ordering Of Sentences": "Ordering of Sentences",
    "Cloze Test": "Fill in the Blanks",
}

def load_authentic():
    if not OUT.exists():
        return []
    data = json.loads(OUT.read_text(encoding="utf-8"))
    keep = []
    for q in data:
        if not q["id"].startswith("cds"):
            continue
        if q.get("answer") is None:
            continue
        topic = q.get("topic") or "General"
        # reclassify sentence-improvement style PYQs mislabelled General
        opts = [str(o) for o in q.get("options", [])]
        if topic == "General" and any("improvement" in o.lower() for o in opts):
            topic = "Sentence Improvement"
        q["topic"] = TOPIC_MAP.get(topic, topic)
        keep.append(q)
    return keep


P = "parts"  # marker for readability below

# (topic, question, options, answer_index, extra)
NEW = [
  # ============ SYNONYMS (hard vocab, CDS 2021-2025 level) ============
  ("Synonyms", "Choose the word nearest in meaning to: PERSPICACIOUS", ["dull", "astute", "stubborn", "timid"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: OBSTREPEROUS", ["obedient", "unruly", "quiet", "lazy"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: PUSILLANIMOUS", ["courageous", "cowardly", "generous", "cruel"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: ENERVATE", ["strengthen", "weaken", "excite", "confuse"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: VITIATE", ["improve", "spoil", "verify", "vitalize"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: IMPUGN", ["praise", "challenge", "ignore", "support"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: EXCULPATE", ["accuse", "exonerate", "punish", "blame"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: OBFUSCATE", ["clarify", "confuse", "simplify", "explain"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: EBULLIENT", ["gloomy", "exuberant", "silent", "grave"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: PARSIMONY", ["generosity", "frugality", "wealth", "waste"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: MENDACIOUS", ["truthful", "lying", "honest", "frank"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: PERFIDIOUS", ["loyal", "treacherous", "faithful", "honest"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: SAGACITY", ["folly", "wisdom", "weakness", "poverty"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: BELLICOSE", ["peaceful", "warlike", "gentle", "timid"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: TRUCULENT", ["gentle", "aggressive", "calm", "polite"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: IMPECUNIOUS", ["wealthy", "poor", "generous", "careful"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: PUERILE", ["mature", "childish", "wise", "grave"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: SYCOPHANT", ["critic", "flatterer", "enemy", "rival"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: LUGUBRIOUS", ["cheerful", "mournful", "lively", "bright"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: RECONDITE", ["obvious", "obscure", "clear", "simple"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: CELERITY", ["slowness", "swiftness", "weakness", "laziness"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: DESULTORY", ["focused", "aimless", "careful", "planned"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: FASTIDIOUS", ["careless", "meticulous", "quick", "lazy"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: HARROWING", ["soothing", "distressing", "pleasant", "boring"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: ICONOCLAST", ["worshipper of idols", "attacker of cherished beliefs", "traditionalist", "conformist"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: PERNICIOUS", ["harmless", "harmful", "helpful", "gentle"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: QUERULOUS", ["contented", "complaining", "quiet", "cheerful"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: RETICENT", ["talkative", "reserved", "bold", "frank"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: SPURIOUS", ["genuine", "false", "pure", "real"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: TACITURN", ["talkative", "silent", "cheerful", "witty"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: VENERATE", ["despise", "revere", "ignore", "hate"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: WINSOME", ["repulsive", "charming", "sad", "angry"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: ABSTRUSE", ["easy", "obvious", "hard to understand", "shallow"], 2, {}),
  ("Synonyms", "Choose the word nearest in meaning to: MAGNANIMOUS", ["petty", "generous", "mean", "selfish"], 1, {}),
  ("Synonyms", "Choose the word nearest in meaning to: OBTUSE", ["sharp", "dull-witted", "clever", "keen"], 1, {}),

  # ============ ANTONYMS ============
  ("Antonyms", "Choose the word opposite in meaning to: SPURIOUS", ["false", "genuine", "fake", "artificial"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: TACITURN", ["silent", "talkative", "grave", "shy"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: MAGNANIMOUS", ["generous", "petty", "noble", "kind"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: PERNICIOUS", ["harmful", "beneficial", "deadly", "evil"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: OBTUSE", ["dull", "perceptive", "slow", "blunt"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: VENERATE", ["worship", "despise", "respect", "adore"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: RETICENT", ["reserved", "forthcoming", "shy", "silent"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: DESULTORY", ["aimless", "methodical", "random", "casual"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: CELERITY", ["speed", "slowness", "haste", "hurry"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: LUGUBRIOUS", ["sad", "cheerful", "gloomy", "grave"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: PUERILE", ["childish", "mature", "silly", "young"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: PERFIDIOUS", ["treacherous", "loyal", "deceitful", "false"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: EBULLIENT", ["exuberant", "subdued", "lively", "excited"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: BELLICOSE", ["warlike", "peaceful", "hostile", "fierce"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: IMPECUNIOUS", ["poor", "affluent", "needy", "destitute"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: PUSILLANIMOUS", ["cowardly", "valiant", "timid", "fearful"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: OBSTREPEROUS", ["noisy", "docile", "unruly", "wild"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: MENDACIOUS", ["dishonest", "truthful", "false", "cunning"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: PARSIMONY", ["thrift", "extravagance", "saving", "care"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: TRUCULENT", ["fierce", "amiable", "cruel", "harsh"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: ENERVATE", ["weaken", "invigorate", "tire", "exhaust"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: EXCULPATE", ["acquit", "incriminate", "absolve", "clear"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: OBFUSCATE", ["confuse", "clarify", "muddle", "cloud"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: SAGACITY", ["wisdom", "folly", "prudence", "sense"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: INSIPID", ["bland", "flavoursome", "dull", "flat"], 1, {}),
  ("Antonyms", "Choose the word opposite in meaning to: ABSTRUSE", ["deep", "obvious", "obscure", "subtle"], 1, {}),

  # ============ IDIOMS & PHRASES (harder) ============
  ("Idioms and Phrases", "What does 'To grease the palm' mean?", ["to oil machinery", "to bribe", "to flatter openly", "to work hard"], 1, {}),
  ("Idioms and Phrases", "What does 'To eat humble pie' mean?", ["to eat cheap food", "to apologise humbly", "to suffer hunger", "to share food"], 1, {}),
  ("Idioms and Phrases", "What does 'To have an axe to grind' mean?", ["to work as a carpenter", "to have a selfish motive", "to seek revenge openly", "to work hard"], 1, {}),
  ("Idioms and Phrases", "What does 'To pour oil on troubled waters' mean?", ["to pollute the sea", "to calm a quarrel", "to waste resources", "to create trouble"], 1, {}),
  ("Idioms and Phrases", "What does 'To cast pearls before swine' mean?", ["to waste money", "to offer good things to those who cannot appreciate them", "to rear pigs", "to buy jewellery"], 1, {}),
  ("Idioms and Phrases", "What does 'To cut a sorry figure' mean?", ["to injure oneself", "to make a poor impression", "to draw badly", "to lose weight"], 1, {}),
  ("Idioms and Phrases", "What does 'To go to the dogs' mean?", ["to hunt", "to deteriorate", "to become angry", "to travel"], 1, {}),
  ("Idioms and Phrases", "What does 'Halcyon days' mean?", ["stormy days", "happy and peaceful days of the past", "days of hard work", "future days"], 1, {}),
  ("Idioms and Phrases", "What does 'A man of straw' mean?", ["a thin man", "a man of no substance", "a farmer", "a weak old man"], 1, {}),
  ("Idioms and Phrases", "What does 'Pandora's box' mean?", ["a box of jewels", "a source of endless troubles", "a gift box", "a musical instrument"], 1, {}),
  ("Idioms and Phrases", "What does 'To rob Peter to pay Paul' mean?", ["to steal", "to shift from one debt to another", "to help friends", "to work for two masters"], 1, {}),
  ("Idioms and Phrases", "What does 'To wash one's dirty linen in public' mean?", ["to do laundry outside", "to discuss private matters publicly", "to insult guests", "to clean the house"], 1, {}),
  ("Idioms and Phrases", "What does 'Yeoman's service' mean?", ["a soldier's duty", "excellent and loyal service", "a servant's work", "government service"], 1, {}),
  ("Idioms and Phrases", "What does 'To cool one's heels' mean?", ["to rest after walking", "to be kept waiting", "to take a bath", "to dance"], 1, {}),
  ("Idioms and Phrases", "What does 'A cuckoo in the nest' mean?", ["a singing bird", "an unwelcome intruder", "a pet", "a child"], 1, {}),
  ("Idioms and Phrases", "What does 'To die in harness' mean?", ["to die in an accident", "to die while still at work", "to die young", "to die in battle"], 1, {}),
  ("Idioms and Phrases", "What does 'To hold water' mean?", ["to store water", "to be valid and logical", "to swim", "to be heavy"], 1, {}),
  ("Idioms and Phrases", "What does 'To hang in the balance' mean?", ["to be undecided and uncertain", "to be hanged", "to weigh something", "to be safe"], 0, {}),
  ("Idioms and Phrases", "What does 'A maiden speech' mean?", ["a woman's speech", "the first speech of a person", "a short speech", "an emotional speech"], 1, {}),
  ("Idioms and Phrases", "What does 'To pay through the nose' mean?", ["to pay in cash", "to pay excessively", "to refuse to pay", "to pay late"], 1, {}),
  ("Idioms and Phrases", "What does 'To put the cart before the horse' mean?", ["to travel fast", "to do things in the wrong order", "to sell animals", "to repair a cart"], 1, {}),
  ("Idioms and Phrases", "What does 'To sit on the fence' mean?", ["to rest", "to avoid taking sides", "to guard property", "to watch games"], 1, {}),
  ("Idioms and Phrases", "What does 'A white elephant' mean?", ["a rare animal", "a costly but useless possession", "a lucky gift", "a royal treasure"], 1, {}),
  ("Idioms and Phrases", "What does 'To rest on one's laurels' mean?", ["to sleep on leaves", "to be complacent with past success", "to win medals", "to retire early"], 1, {}),
  ("Idioms and Phrases", "What does 'To give oneself airs' mean?", ["to breathe deeply", "to behave arrogantly", "to fly", "to exercise"], 1, {}),
  ("Idioms and Phrases", "What does 'In the nick of time' mean?", ["very late", "just in time", "at midnight", "in a hurry"], 1, {}),
  ("Idioms and Phrases", "What does 'A bolt from the blue' mean?", ["a lightning strike", "a sudden and unexpected shock", "a blue flag", "a fast runner"], 1, {}),
  ("Idioms and Phrases", "What does 'To take to one's heels' mean?", ["to walk fast", "to run away", "to wear shoes", "to stumble"], 1, {}),
  ("Idioms and Phrases", "What does 'A feather in one's cap' mean?", ["a hat", "an achievement to be proud of", "a bird's nest", "a new fashion"], 1, {}),
  ("Idioms and Phrases", "What does 'To bite off more than one can chew' mean?", ["to eat greedily", "to attempt more than one can manage", "to waste food", "to speak with mouth full"], 1, {}),
  ("Idioms and Phrases", "What does 'A fair-weather friend' mean?", ["a friend in good weather", "a friend only in prosperity", "a loyal friend", "an old friend"], 1, {}),
  ("Idioms and Phrases", "What does 'To turn over a new leaf' mean?", ["to plant trees", "to change for the better", "to read a book", "to start gardening"], 1, {}),
  ("Idioms and Phrases", "What does 'An apple of discord' mean?", ["a sweet fruit", "a cause of quarrel", "a gift", "a medicine"], 1, {}),

  # ============ SPOTTING ERRORS (hard grammar) ============
  ("Spotting Errors", "Find the part with error: (a) It is high time / (b) we go / (c) home now. / (d) No error", ["It is high time", "we go", "home now", "No error"], 1, {}),
  ("Spotting Errors", "Find the part with error: (a) He behaved / (b) as if he / (c) was the king. / (d) No error", ["He behaved", "as if he", "was the king", "No error"], 2, {}),
  ("Spotting Errors", "Find the part with error: (a) Bread and butter / (b) are / (c) my favourite breakfast. / (d) No error", ["Bread and butter", "are", "my favourite breakfast", "No error"], 1, {}),
  ("Spotting Errors", "Find the part with error: (a) The principal along with the teachers / (b) have / (c) arrived. / (d) No error", ["The principal along with the teachers", "have", "arrived", "No error"], 1, {}),
  ("Spotting Errors", "Find the part with error: (a) I, you and he / (b) are / (c) good friends. / (d) No error", ["I, you and he", "are", "good friends", "No error"], 0, {}),
  ("Spotting Errors", "Find the part with error: (a) Being a holiday, / (b) the office was / (c) closed yesterday. / (d) No error", ["Being a holiday,", "the office was", "closed yesterday", "No error"], 0, {}),
  ("Spotting Errors", "Find the part with error: (a) He is more wiser / (b) than / (c) his brother. / (d) No error", ["He is more wiser", "than", "his brother", "No error"], 0, {}),
  ("Spotting Errors", "Find the part with error: (a) No sooner the bell rang / (b) than / (c) the students left the class. / (d) No error", ["No sooner the bell rang", "than", "the students left the class", "No error"], 0, {}),
  ("Spotting Errors", "Find the part with error: (a) Five miles / (b) are / (c) a long distance to walk. / (d) No error", ["Five miles", "are", "a long distance to walk", "No error"], 1, {}),
  ("Spotting Errors", "Find the part with error: (a) He denied / (b) to have stolen / (c) the money. / (d) No error", ["He denied", "to have stolen", "the money", "No error"], 1, {}),
  ("Spotting Errors", "Find the part with error: (a) Supposing if he fails / (b) what / (c) will he do? / (d) No error", ["Supposing if he fails", "what", "will he do?", "No error"], 0, {}),
  ("Spotting Errors", "Find the part with error: (a) Neither the teacher nor the students / (b) was / (c) in the classroom. / (d) No error", ["Neither the teacher nor the students", "was", "in the classroom", "No error"], 1, {}),
  ("Spotting Errors", "Find the part with error: (a) The teacher asked the students / (b) to not make / (c) any noise. / (d) No error", ["The teacher asked the students", "to not make", "any noise", "No error"], 1, {}),
  ("Spotting Errors", "Find the part with error: (a) One should do / (b) his / (c) duty honestly. / (d) No error", ["One should do", "his", "duty honestly", "No error"], 1, {}),
  ("Spotting Errors", "Find the part with error: (a) The Ganges / (b) is one of the longest rivers / (c) in India. / (d) No error", ["The Ganges", "is one of the longest rivers", "in India", "No error"], 3, {}),
  ("Spotting Errors", "Find the part with error: (a) Hardly had he stepped out of the house / (b) when / (c) it began to rain. / (d) No error", ["Hardly had he stepped out of the house", "when", "it began to rain", "No error"], 3, {}),
  ("Spotting Errors", "Find the part with error: (a) He as well as / (b) his brothers / (c) were present. / (d) No error", ["He as well as", "his brothers", "were present", "No error"], 2, {}),
  ("Spotting Errors", "Find the part with error: (a) Many a soldier / (b) have laid down / (c) their lives for the country. / (d) No error", ["Many a soldier", "have laid down", "their lives for the country", "No error"], 1, {}),
  ("Spotting Errors", "Find the part with error: (a) The thief was / (b) caught red-handed / (c) by the police. / (d) No error", ["The thief was", "caught red-handed", "by the police", "No error"], 3, {}),
  ("Spotting Errors", "Find the part with error: (a) Unless you do not work hard / (b) you will / (c) not succeed. / (d) No error", ["Unless you do not work hard", "you will", "not succeed", "No error"], 0, {}),

  # ============ SENTENCE IMPROVEMENT ============
  ("Sentence Improvement", "Improve the sentence: He is bent to ruin himself.", ["bent on ruining", "bent in ruining", "bent to be ruining", "No improvement"], 0, {}),
  ("Sentence Improvement", "Improve the sentence: I would rather you go now.", ["you went", "you will go", "you shall go", "No improvement"], 0, {}),
  ("Sentence Improvement", "Improve the sentence: He availed of the opportunity.", ["availed himself of", "availed him of", "availed for", "No improvement"], 0, {}),
  ("Sentence Improvement", "Improve the sentence: She insisted to go with me.", ["insisted on going", "insisted in going", "insisted for going", "No improvement"], 0, {}),
  ("Sentence Improvement", "Improve the sentence: Hardly had I slept than the phone rang.", ["when the phone rang", "then the phone rang", "but the phone rang", "No improvement"], 0, {}),
  ("Sentence Improvement", "Improve the sentence: No sooner did he see the police when he ran away.", ["than he ran away", "then he ran away", "but he ran away", "No improvement"], 0, {}),
  ("Sentence Improvement", "Improve the sentence: He is working since morning.", ["has been working", "was working", "had worked", "No improvement"], 0, {}),
  ("Sentence Improvement", "Improve the sentence: Let him and I go.", ["him and me go", "he and I go", "he and me go", "No improvement"], 0, {}),
  ("Sentence Improvement", "Improve the sentence: Between you and I, he is dishonest.", ["you and me", "I and you", "me and you", "No improvement"], 0, {}),
  ("Sentence Improvement", "Improve the sentence: He did nothing else than complain.", ["else but complain", "else to complain", "else for complaining", "No improvement"], 0, {}),
  ("Sentence Improvement", "Improve the sentence: The manager wanted that I should go.", ["wanted me to go", "wanted that I go", "wanted for me to go", "No improvement"], 0, {}),
  ("Sentence Improvement", "Improve the sentence: Unless you do not confess, you will be punished.", ["Unless you confess", "If you do not confess", "Until you confess", "No improvement"], 0, {}),

  # ============ ORDERING OF WORDS (structured parts) ============
  ("Ordering of Words", "Rearrange the parts labelled P, Q, R and S to form a meaningful sentence.",
    ["Q S R P", "R S Q P", "Q R S P", "S Q R P"], 0,
    {"parts": [
      {"label": "P", "text": "in the modern world"},
      {"label": "Q", "text": "the importance of"},
      {"label": "R", "text": "cannot be overemphasized"},
      {"label": "S", "text": "technical education"}]}),
  ("Ordering of Words", "Rearrange the parts labelled P, Q, R and S to form a meaningful sentence.",
    ["Q R S P", "P Q R S", "R P Q S", "S R Q P"], 1,
    {"parts": [
      {"label": "P", "text": "democracy"},
      {"label": "Q", "text": "is not merely a form of government"},
      {"label": "R", "text": "but a way of life"},
      {"label": "S", "text": "based on respect for the individual"}]}),
  ("Ordering of Words", "Rearrange the parts labelled P, Q, R and S to form a meaningful sentence.",
    ["Q P R S", "P Q R S", "R Q P S", "S P Q R"], 0,
    {"parts": [
      {"label": "P", "text": "that he had been"},
      {"label": "Q", "text": "the boy confessed"},
      {"label": "R", "text": "stealing apples"},
      {"label": "S", "text": "from the orchard"}]}),
  ("Ordering of Words", "Rearrange the parts labelled P, Q, R and S to form a meaningful sentence.",
    ["Q S P R", "S Q P R", "P Q S R", "R S P Q"], 0,
    {"parts": [
      {"label": "P", "text": "to bring about"},
      {"label": "Q", "text": "the new policy"},
      {"label": "R", "text": "a fundamental change"},
      {"label": "S", "text": "in the administration aims"}]}),
  ("Ordering of Words", "Rearrange the parts labelled P, Q, R and S to form a meaningful sentence.",
    ["R Q S P", "Q R S P", "S P Q R", "P R Q S"], 0,
    {"parts": [
      {"label": "P", "text": "without hard work"},
      {"label": "Q", "text": "can be achieved"},
      {"label": "R", "text": "nothing worthwhile"},
      {"label": "S", "text": "in this world"}]}),
  ("Ordering of Words", "Rearrange the parts labelled P, Q, R and S to form a meaningful sentence.",
    ["Q P R S", "R S P Q", "P Q R S", "S Q R P"], 2,
    {"parts": [
      {"label": "P", "text": "the old man"},
      {"label": "Q", "text": "with a heavy heart"},
      {"label": "R", "text": "left the village"},
      {"label": "S", "text": "where he was born"}]}),
  ("Ordering of Words", "Rearrange the parts labelled P, Q, R and S to form a meaningful sentence.",
    ["P Q R S", "Q R S P", "S P R Q", "R Q P S"], 0,
    {"parts": [
      {"label": "P", "text": "a soldier's duty"},
      {"label": "Q", "text": "is to protect"},
      {"label": "R", "text": "the honour of his country"},
      {"label": "S", "text": "even at the cost of his life"}]}),
  ("Ordering of Words", "Rearrange the parts labelled P, Q, R and S to form a meaningful sentence.",
    ["P Q R S", "Q P S R", "R S P Q", "S Q R P"], 0,
    {"parts": [
      {"label": "P", "text": "the essence of education"},
      {"label": "Q", "text": "is not the mere acquisition of facts"},
      {"label": "R", "text": "but the training of the mind"},
      {"label": "S", "text": "to think clearly"}]}),

  # ============ ORDERING OF SENTENCES (S1..S6) ============
  ("Ordering of Sentences", "Sentences S1 and S6 are fixed. Arrange P, Q, R and S between them to form a coherent paragraph.",
    ["P Q R S", "Q P R S", "R S P Q", "S R Q P"], 0,
    {"parts": [
      {"label": "S1", "text": "The art of conversation is dying.", "fixed": True},
      {"label": "P", "text": "People no longer talk to each other at dinner tables."},
      {"label": "Q", "text": "Instead they remain glued to their mobile screens."},
      {"label": "R", "text": "Even family members prefer messaging to speaking."},
      {"label": "S", "text": "This has weakened personal relationships."},
      {"label": "S6", "text": "We must revive the habit of real conversation.", "fixed": True}]}),
  ("Ordering of Sentences", "Sentences S1 and S6 are fixed. Arrange P, Q, R and S between them to form a coherent paragraph.",
    ["P Q R S", "R P S Q", "Q S P R", "S Q R P"], 0,
    {"parts": [
      {"label": "S1", "text": "Pollution is one of the biggest threats to modern civilization.", "fixed": True},
      {"label": "P", "text": "Factories release poisonous gases into the air."},
      {"label": "Q", "text": "Rivers are choked with industrial waste."},
      {"label": "R", "text": "As a result, respiratory diseases are on the rise."},
      {"label": "S", "text": "Unless checked, it may destroy life on Earth."},
      {"label": "S6", "text": "Strict laws are needed to control pollution.", "fixed": True}]}),
  ("Ordering of Sentences", "Sentences S1 and S6 are fixed. Arrange P, Q, R and S between them to form a coherent paragraph.",
    ["P Q R S", "S R Q P", "Q P S R", "R Q S P"], 0,
    {"parts": [
      {"label": "S1", "text": "A good leader inspires others.", "fixed": True},
      {"label": "P", "text": "He leads by example, not by command."},
      {"label": "Q", "text": "He shares credit with his team."},
      {"label": "R", "text": "He takes responsibility for failures."},
      {"label": "S", "text": "Thus he earns the trust of his followers."},
      {"label": "S6", "text": "Leadership is therefore service, not privilege.", "fixed": True}]}),
  ("Ordering of Sentences", "Sentences S1 and S6 are fixed. Arrange P, Q, R and S between them to form a coherent paragraph.",
    ["P Q R S", "Q S R P", "S P Q R", "R S P Q"], 0,
    {"parts": [
      {"label": "S1", "text": "Napoleon was a great military genius.", "fixed": True},
      {"label": "P", "text": "He rose from a humble background."},
      {"label": "Q", "text": "His ambition knew no bounds."},
      {"label": "R", "text": "He conquered most of Europe."},
      {"label": "S", "text": "But his invasion of Russia proved fatal."},
      {"label": "S6", "text": "He was finally defeated at Waterloo.", "fixed": True}]}),
  ("Ordering of Sentences", "Sentences S1 and S6 are fixed. Arrange P, Q, R and S between them to form a coherent paragraph.",
    ["P Q R S", "S P R Q", "R Q P S", "Q R S P"], 0,
    {"parts": [
      {"label": "S1", "text": "Reading maketh a full man.", "fixed": True},
      {"label": "P", "text": "It fills the mind with ideas."},
      {"label": "Q", "text": "It removes ignorance."},
      {"label": "R", "text": "It teaches us to think logically."},
      {"label": "S", "text": "It makes us better citizens."},
      {"label": "S6", "text": "Hence every student should cultivate the reading habit.", "fixed": True}]}),

  # ============ FILL IN THE BLANKS (hard) ============
  ("Fill in the Blanks", "The government has ______ a committee to look into the scam.", ["set up", "put up", "made up", "taken up"], 0, {}),
  ("Fill in the Blanks", "The mob ______ the building before the police arrived.", ["burnt down", "blew up", "tore away", "broke out"], 0, {}),
  ("Fill in the Blanks", "He ______ his argument with convincing statistics.", ["buttressed", "battered", "blustered", "blunted"], 0, {}),
  ("Fill in the Blanks", "The two brothers decided to ______ their differences.", ["bury", "burn", "breed", "bind"], 0, {}),
  ("Fill in the Blanks", "Unless he ______ his ways, he will land in trouble.", ["mends", "makes", "moves", "marks"], 0, {}),
  ("Fill in the Blanks", "His speech had a ______ effect on the audience; many fell asleep.", ["soporific", "electric", "terrific", "specific"], 0, {}),
  ("Fill in the Blanks", "The minister's statement was ______ with distortions.", ["replete", "deplete", "complete", "refrain"], 0, {}),
  ("Fill in the Blanks", "She ______ her success to sheer hard work.", ["attributes", "contributes", "distributes", "tributes"], 0, {}),
  ("Fill in the Blanks", "The company decided to ______ production owing to low demand.", ["curtail", "curdle", "curtsy", "curate"], 0, {}),
  ("Fill in the Blanks", "He is ______ honest; he never tells a lie.", ["scrupulously", "scrupulous", "scarcely", "severely"], 0, {}),
  ("Fill in the Blanks", "The soldier was ______ for his act of bravery.", ["decorated", "demoted", "dedicated", "defeated"], 0, {}),
  ("Fill in the Blanks", "With his ______ remarks, he offended everyone present.", ["acerbic", "amiable", "affable", "ardent"], 0, {}),
  ("Fill in the Blanks", "The artist's work is ______ for its attention to minute detail.", ["renowned", "restrained", "repentant", "reluctant"], 0, {}),
  ("Fill in the Blanks", "No sooner did the bell ring ______ the students rushed out.", ["than", "when", "then", "but"], 0, {}),
  ("Fill in the Blanks", "______ being rich, he is very humble.", ["Despite", "Although", "Unless", "Since"], 0, {}),
  ("Fill in the Blanks", "He pretended ______ a fool to escape punishment.", ["to be", "being", "been", "be"], 0, {}),
  ("Fill in the Blanks", "The two families have been feuding ______ generations.", ["for", "since", "from", "during"], 0, {}),
  ("Fill in the Blanks", "The weather was bad; ______, the match was postponed.", ["therefore", "however", "moreover", "otherwise"], 0, {}),
  ("Fill in the Blanks", "He is ______ a fool ______ a knave.", ["neither, nor", "either, or", "both, and", "not, but"], 0, {}),
  ("Fill in the Blanks", "He worked hard ______ he might pass the examination.", ["so that", "because", "unless", "though"], 0, {}),

  # ============ PREPOSITIONS & DETERMINERS ============
  ("Prepositions", "The manager dispensed ______ his services.", ["with", "for", "from", "of"], 0, {}),
  ("Prepositions", "He was exonerated ______ all charges.", ["of", "from", "with", "by"], 0, {}),
  ("Prepositions", "She has no taste ______ music.", ["for", "in", "of", "at"], 0, {}),
  ("Prepositions", "He jumped ______ the offer at once.", ["at", "on", "to", "for"], 0, {}),
  ("Prepositions", "We should not deviate ______ the path of truth.", ["from", "to", "of", "with"], 0, {}),
  ("Prepositions", "The soldiers fought ______ the last man.", ["to", "till", "until", "by"], 0, {}),
  ("Prepositions", "He was absorbed ______ his studies.", ["in", "at", "on", "with"], 0, {}),
  ("Prepositions", "The new law will come ______ force next month.", ["into", "in", "to", "with"], 0, {}),
  ("Prepositions", "______ the terms of the agreement, no party can withdraw.", ["Under", "By", "With", "From"], 0, {}),
  ("Prepositions", "He prevailed ______ his opponent in the debate.", ["upon", "over", "with", "on"], 1, {}),
  ("Prepositions", "The committee is ______ session now.", ["in", "at", "on", "under"], 0, {}),
  ("Prepositions", "She abides ______ the decision of the court.", ["by", "with", "to", "on"], 0, {}),

  # ============ ONE WORD SUBSTITUTION (harder) ============
  ("One Word Substitution", "The scientific study of birds", ["ornithology", "entomology", "zoology", "anthropology"], 0, {}),
  ("One Word Substitution", "A word which is no longer in use", ["archaic", "obsolete meaning", "modern", "ancient text"], 0, {}),
  ("One Word Substitution", "Murder of one's brother", ["fratricide", "patricide", "homicide", "regicide"], 0, {}),
  ("One Word Substitution", "A person who pretends to be what he is not", ["hypocrite", "imposter child", "liar", "actor"], 0, {}),
  ("One Word Substitution", "The study of ancient inscriptions", ["epigraphy", "calligraphy", "geography", "biography"], 0, {}),
  ("One Word Substitution", "A place where bees are kept", ["apiary", "aviary", "aquarium", "granary"], 0, {}),
  ("One Word Substitution", "One who loves books", ["bibliophile", "bibliographer", "philosopher", "philanthropist"], 0, {}),
  ("One Word Substitution", "That which cannot be imitated", ["inimitable", "invisible", "inevitable", "invincible"], 0, {}),
  ("One Word Substitution", "A song sung at a funeral", ["elegy", "sonnet", "lyric", "ballad"], 0, {}),
  ("One Word Substitution", "One who eats human flesh", ["cannibal", "carnivore", "herbivore", "scavenger"], 0, {}),
  ("One Word Substitution", "Government by the rich", ["plutocracy", "democracy", "theocracy", "bureaucracy"], 0, {}),
  ("One Word Substitution", "Words inscribed on a tombstone", ["epitaph", "epilogue", "epithet", "epic"], 0, {}),
  ("One Word Substitution", "Loss of memory", ["amnesia", "insomnia", "anemia", "aphasia"], 0, {}),
  ("One Word Substitution", "That which cannot be conquered", ["invincible", "inevitable", "invisible", "indivisible"], 0, {}),
  ("One Word Substitution", "A place where dead bodies are kept", ["mortuary", "monastery", "sanctuary", "dormitory"], 0, {}),
  ("One Word Substitution", "A person who is a hundred years old", ["centenarian", "veteran", "octogenarian", "patriarch"], 0, {}),
  ("One Word Substitution", "Fear of heights", ["acrophobia", "hydrophobia", "claustrophobia", "xenophobia"], 0, {}),
  ("One Word Substitution", "An irresistible urge to steal", ["kleptomania", "dipsomania", "megalomania", "pyromania"], 0, {}),
  ("One Word Substitution", "A disease that spreads by contact", ["contagious", "infectious cough", "chronic", "epidemic cold"], 0, {}),
  ("One Word Substitution", "One who works in return for payment, especially in a war", ["mercenary", "militant", "veteran", "volunteer"], 0, {}),

  # ============ HOMOPHONES (harder) ============
  ("Homophones", "Choose the correct word: They decided to ______ the plan.", ["alter", "altar", "alta", "author"], 0, {}),
  ("Homophones", "Choose the correct word: He was released on ______.", ["bail", "bale", "baal", "beil"], 0, {}),
  ("Homophones", "Choose the correct word: She has ______ three children.", ["borne", "born", "bourne", "bourn"], 0, {}),
  ("Homophones", "Choose the correct word: Apply the ______ to stop the car.", ["brake", "break", "brayk", "braque"], 0, {}),
  ("Homophones", "Choose the correct word: The party workers will ______ for votes.", ["canvass", "canvas", "canvas", "canves"], 0, {}),
  ("Homophones", "Choose the correct word: The ______ of the new school is near the river.", ["site", "cite", "sight", "cyte"], 0, {}),
  ("Homophones", "Choose the correct word: This cloth is very ______.", ["coarse", "course", "corse", "cource"], 0, {}),
  ("Homophones", "Choose the correct word: Milk is sold at the ______.", ["dairy", "diary", "deary", "dairye"], 0, {}),
  ("Homophones", "Choose the correct word: The two knights fought a ______.", ["duel", "dual", "dwell", "doel"], 0, {}),
  ("Homophones", "Choose the correct word: The bus ______ is too high.", ["fare", "fair", "fear", "fire"], 0, {}),
  ("Homophones", "Choose the correct word: He was punished for ______ play.", ["foul", "fowl", "foal", "full"], 0, {}),
  ("Homophones", "Choose the correct word: The soldiers showed their ______ in battle.", ["mettle", "metal", "medal", "meddle"], 0, {}),
  ("Homophones", "Choose the correct word: During the ______ of Akbar, art flourished.", ["reign", "rein", "rain", "reine"], 0, {}),
  ("Homophones", "Choose the correct word: He is the ______ owner of the property.", ["sole", "soul", "sol", "shoal"], 0, {}),
  ("Homophones", "Choose the correct word: The streets ______ with people during the festival.", ["teem", "team", "theme", "teemd"], 0, {}),
  ("Homophones", "Choose the correct word: Blood flows through the ______.", ["vein", "vain", "vane", "wane"], 0, {}),
  ("Homophones", "Choose the correct word: A ______ of people gathered at the gate.", ["horde", "hoard", "hoar", "heard"], 0, {}),
  ("Homophones", "Choose the correct word: Time will ______ all wounds.", ["heal", "heel", "heal", "hail"], 0, {}),

  # ============ PHRASAL VERBS (harder) ============
  ("Phrasal Verbs", "What does 'bear out' mean?", ["to confirm", "to carry out", "to endure silently", "to throw out"], 0, {}),
  ("Phrasal Verbs", "What does 'do away with' mean?", ["to finish food", "to abolish", "to run away", "to distribute"], 1, {}),
  ("Phrasal Verbs", "What does 'pull through' mean?", ["to drag", "to recover from illness", "to succeed easily", "to pass a rope"], 1, {}),
  ("Phrasal Verbs", "What does 'take after' mean?", ["to chase", "to resemble", "to take revenge", "to follow rules"], 1, {}),
  ("Phrasal Verbs", "What does 'call for' mean?", ["to telephone", "to demand or require", "to visit briefly", "to shout loudly"], 1, {}),
  ("Phrasal Verbs", "What does 'come across' mean?", ["to cross a road", "to find by chance", "to arrive late", "to oppose"], 1, {}),
  ("Phrasal Verbs", "What does 'hold out' mean?", ["to offer only", "to resist or last", "to hide", "to withdraw"], 1, {}),
  ("Phrasal Verbs", "What does 'give away' mean?", ["to take back", "to betray or distribute", "to keep safe", "to run away"], 1, {}),
  ("Phrasal Verbs", "What does 'go through' mean?", ["to pass by", "to examine or endure", "to escape", "to travel fast"], 1, {}),
  ("Phrasal Verbs", "What does 'set aside' mean?", ["to place nearby", "to reserve or reject", "to start working", "to sit down"], 1, {}),
  ("Phrasal Verbs", "What does 'fall out' mean?", ["to fall down", "to quarrel", "to escape", "to happen luckily"], 1, {}),
  ("Phrasal Verbs", "What does 'let down' mean?", ["to lower", "to disappoint", "to relax", "to forgive"], 1, {}),
  ("Phrasal Verbs", "What does 'pass away' mean?", ["to go past", "to die", "to distribute", "to forget"], 1, {}),
  ("Phrasal Verbs", "What does 'come round' mean?", ["to visit casually only", "to recover consciousness", "to take a round", "to agree always"], 1, {}),
  ("Phrasal Verbs", "What does 'call in' mean?", ["to telephone only", "to summon for help", "to cancel", "to visit briefly"], 1, {}),
  ("Phrasal Verbs", "What does 'bring about' mean?", ["to carry", "to cause to happen", "to bring back", "to introduce"], 1, {}),
  ("Phrasal Verbs", "What does 'bear with' mean?", ["to carry with", "to tolerate", "to give birth", "to fight"], 1, {}),
  ("Phrasal Verbs", "What does 'work out' mean?", ["to dismiss", "to solve or exercise", "to leave work", "to hire"], 1, {}),
  ("Phrasal Verbs", "What does 'lay by' mean?", ["to lie down", "to save for the future", "to dismiss", "to place beside"], 1, {}),
  ("Phrasal Verbs", "What does 'get at' mean?", ["to arrive", "to imply or reach", "to steal", "to escape"], 1, {}),

  # ============ ACTIVE-PASSIVE ============
  ("Active Passive", "Change into passive voice: They elected him chairman.", ["He was elected chairman by them", "He is elected chairman by them", "He has been elected chairman by them", "He was being elected chairman by them"], 0, {}),
  ("Active Passive", "Change into passive voice: One should keep one's promises.", ["Promises should be kept", "Promises should kept be", "Promises should be keep", "Promises are kept"], 0, {}),
  ("Active Passive", "Change into active voice: The teacher was pleased with his work.", ["His work pleased the teacher", "His work had pleased the teacher", "His work is pleasing the teacher", "His work will please the teacher"], 0, {}),
  ("Active Passive", "Change into passive voice: Why did he refuse my invitation?", ["Why was my invitation refused by him?", "Why my invitation was refused by him?", "Why is my invitation refused by him?", "Why had my invitation been refused by him?"], 0, {}),
  ("Active Passive", "Change into active voice: He is said to be honest.", ["People say that he is honest", "People said that he is honest", "People are saying he was honest", "People will say he is honest"], 0, {}),
  ("Active Passive", "Change into passive voice: Someone has broken the window.", ["The window has been broken", "The window was broken", "The window is broken", "The window had been broken"], 0, {}),
  ("Active Passive", "Change into passive voice: She teaches us grammar.", ["Grammar is taught to us by her", "Grammar was taught to us by her", "Grammar is being taught to us by her", "Grammar has been taught to us by her"], 0, {}),
  ("Active Passive", "Change into active voice: Let the truth always be spoken.", ["Always speak the truth", "Speak the truth always loudly", "The truth was always spoken", "The truth is always spoken"], 0, {}),
  ("Active Passive", "Change into passive voice: He will have finished the work by evening.", ["The work will have been finished by him by evening", "The work will be finished by him by evening", "The work would have been finished by him by evening", "The work has been finished by him by evening"], 0, {}),

  # ============ DIRECT-INDIRECT ============
  ("Direct Indirect", "Change into indirect speech: He said, \"Alas! I am undone.\"", ["He exclaimed with sorrow that he was undone", "He said alas that he is undone", "He cried that he was undone", "He exclaimed with joy that he was undone"], 0, {}),
  ("Direct Indirect", "Change into indirect speech: She said to him, \"Do you know me?\"", ["She asked him if he knew her", "She asked him if he knows her", "She told him that he knew her", "She asked him did he know her"], 0, {}),
  ("Direct Indirect", "Change into indirect speech: The captain said to the soldiers, \"March forward.\"", ["The captain commanded the soldiers to march forward", "The captain asked the soldiers march forward", "The captain said the soldiers to march forward", "The captain requested the soldiers marching forward"], 0, {}),
  ("Direct Indirect", "Change into indirect speech: He said, \"I may go tomorrow.\"", ["He said that he might go the next day", "He said that he may go tomorrow", "He said that he might go tomorrow", "He said that I may go the next day"], 0, {}),
  ("Direct Indirect", "Change into indirect speech: She said, \"What a lovely garden!\"", ["She exclaimed with delight that it was a very lovely garden", "She said that it was a lovely garden", "She asked what a lovely garden it was", "She exclaimed that what a lovely garden"], 0, {}),
  ("Direct Indirect", "Change into indirect speech: He said to me, \"I shall help you.\"", ["He told me that he would help me", "He told me that he shall help me", "He said me that he would help me", "He told me that I shall help him"], 0, {}),
  ("Direct Indirect", "Change into indirect speech: The old man said, \"May you live long, my son!\"", ["The old man blessed his son and prayed that he might live long", "The old man said that his son may live long", "The old man wished his son to live long life", "The old man exclaimed that his son lived long"], 0, {}),
  ("Direct Indirect", "Change into indirect speech: He said, \"Let me go home.\"", ["He requested to be allowed to go home", "He said that let him go home", "He ordered to go home", "He requested that let him go home"], 0, {}),

  # ============ PARTS OF SPEECH ============
  ("Parts of Speech", "Identify the part of speech of 'the' in: The more, the merrier.", ["article", "adverb", "conjunction", "preposition"], 1, {}),
  ("Parts of Speech", "Identify the part of speech of 'after' in: He came after the class had ended.", ["preposition", "conjunction", "adverb", "adjective"], 1, {}),
  ("Parts of Speech", "Identify the part of speech of 'fast' in: He is a fast runner.", ["adverb", "adjective", "verb", "noun"], 1, {}),
  ("Parts of Speech", "Identify the part of speech of 'well' in: He is well now.", ["adverb", "adjective", "noun", "verb"], 1, {}),
  ("Parts of Speech", "Identify the part of speech of 'very' in: That is the very man I met.", ["adverb", "adjective", "pronoun", "conjunction"], 1, {}),
  ("Parts of Speech", "Identify the part of speech of 'hard' in: He works hard.", ["adjective", "adverb", "noun", "verb"], 1, {}),
  ("Parts of Speech", "Identify the part of speech of 'hard' in: This is a hard problem.", ["adverb", "adjective", "noun", "verb"], 1, {}),
  ("Parts of Speech", "Identify the part of speech of 'very' in: She is very beautiful.", ["adjective", "adverb", "pronoun", "article"], 1, {}),

  # ============ BORROWED WORDS (CDS 2024 trend) ============
  ("Borrowed Words", "What does the Latin phrase 'bona fide' mean?", ["in good faith", "with good luck", "by good chance", "on good terms"], 0, {}),
  ("Borrowed Words", "What does 'ad hoc' mean?", ["permanent", "for a specific purpose", "in addition", "beforehand"], 1, {}),
  ("Borrowed Words", "What does 'en masse' mean?", ["in small groups", "all together", "one by one", "in secret"], 1, {}),
  ("Borrowed Words", "What does 'status quo' mean?", ["changed state", "the existing state of affairs", "high status", "legal status"], 1, {}),
  ("Borrowed Words", "What does 'per se' mean?", ["by itself", "for example", "after all", "in person"], 0, {}),
  ("Borrowed Words", "What does 'alma mater' mean?", ["one's mother", "one's school or university", "a good mother", "a famous teacher"], 1, {}),
  ("Borrowed Words", "What does 'fait accompli' mean?", ["a false claim", "a thing already done and irreversible", "a formal agreement", "an easy task"], 1, {}),
  ("Borrowed Words", "What does 'déjà vu' mean?", ["a new experience", "a feeling of having experienced something before", "a clear view", "a repeated dream"], 1, {}),
  ("Borrowed Words", "What does 'vice versa' mean?", ["against virtue", "the other way round", "in addition", "by all means"], 1, {}),
  ("Borrowed Words", "What does 'avant-garde' mean?", ["old-fashioned", "innovative and experimental", "military guard", "well-dressed"], 1, {}),

  # ============ PAIRED WORDS ============
  ("Paired Words", "Choose the sentence in which 'stationary' is used correctly.", ["The bus remained stationary at the signal", "He bought pens from a stationary shop", "The stationary of the company is expensive", "She wrote on a stationary pad"], 0, {}),
  ("Paired Words", "Choose the sentence in which 'elicit' is used correctly.", ["The police tried to elicit information from the suspect", "They were caught in elicit trade", "His elicit activities were exposed", "Elicit goods were seized"], 0, {}),
  ("Paired Words", "Choose the sentence in which 'proscribe' is used correctly.", ["The doctor will proscribe some medicine", "The government proscribed the extremist group", "The teacher proscribed the lesson", "He proscribed his name at the top"], 1, {}),
  ("Paired Words", "Choose the sentence in which 'complement' is used correctly.", ["Red wine complements the meal", "She paid him a nice complement", "He received many complements on his work", "They complemented him for his success"], 0, {}),
  ("Paired Words", "Choose the sentence in which 'dissent' is used correctly.", ["The descent of the hill is steep", "Two members recorded their dissent", "The dissent of water was slow", "He made a dissent into the valley"], 1, {}),
  ("Paired Words", "Choose the sentence in which 'affect' is used correctly.", ["The new law had an immediate affect", "The sad news affected him deeply", "The affect of the drug was quick", "Her affect was one of calm"], 1, {}),
  ("Paired Words", "Choose the sentence in which 'council' is used correctly.", ["The city council met on Monday", "She gave me good council", "He sought council from a lawyer", "My council is to stay calm"], 0, {}),
  ("Paired Words", "Choose the sentence in which 'emigrant' is used correctly.", ["Many emigrants arrived in the city from villages", "The emigrants left Ireland for America", "Immigrants are emigrants too everywhere", "The emigrant train arrived late"], 1, {}),

  # ============ WORD MEANING IN CONTEXT ============
  ("Word Meaning", "In the sentence 'He is a man of letters', the phrase 'man of letters' means:", ["a postman", "a scholar or writer", "a clerk", "a talkative man"], 1, {}),
  ("Word Meaning", "In 'The new rules are a dead letter', 'a dead letter' means:", ["an undelivered letter", "a rule no longer in force", "a bad law", "a secret order"], 1, {}),
  ("Word Meaning", "In 'He went back on his promise', 'went back on' means:", ["repeated", "kept", "broke", "remembered"], 2, {}),
  ("Word Meaning", "In 'The old machine has been cast off', 'cast off' means:", ["repaired", "discarded", "sold", "polished"], 1, {}),
  ("Word Meaning", "In 'The officer carried out the orders', 'carried out' means:", ["executed", "postponed", "ignored", "changed"], 0, {}),
  ("Word Meaning", "In 'The project fell through for want of funds', 'fell through' means:", ["succeeded", "failed", "completed", "began"], 1, {}),

  # ============ SENTENCE COMBINATION ============
  ("Sentence Combination", "Combine: He was ill. He attended the meeting.", ["Although he was ill, he attended the meeting", "Because he was ill, he attended the meeting", "He was ill so he attended the meeting", "Being ill he attended the meeting happily"], 0, {}),
  ("Sentence Combination", "Combine: The thief saw the police. He ran away.", ["As soon as the thief saw the police, he ran away", "The thief saw the police but he ran away", "Seeing police the thief had run away", "The thief saw the police though he ran away"], 0, {}),
  ("Sentence Combination", "Combine: She worked hard. Yet she failed.", ["Despite working hard, she failed", "Because she worked hard, she failed", "She worked hard so she failed", "Since she worked hard, she failed"], 0, {}),
  ("Sentence Combination", "Combine: I know the man. He stole your watch.", ["I know the man who stole your watch", "I know the man which stole your watch", "I know the man he stole your watch", "I know the man whom stole your watch"], 0, {}),
  ("Sentence Combination", "Combine: He is poor. He is honest.", ["Though he is poor, he is honest", "Because he is poor, he is honest", "He is poor therefore he is honest", "Since he is poor, he is honest"], 0, {}),
  ("Sentence Combination", "Combine: He ran fast. He missed the train.", ["He ran fast, yet he missed the train", "He ran fast because he missed the train", "He ran fast so he missed the train", "Running fast he missed the train luckily"], 0, {}),

  # ============ COMPREHENSION (harder) ============
  ("Comprehension", "According to the author, the greatest evil of the present age is:", ["poverty", "inequality", "ignorance", "corruption"], 1,
    {"passage": "The greatest evil of the present age is not poverty but inequality. Wealth accumulates in the hands of a few while the many struggle for bare subsistence. The rich grow richer, not by the sweat of their brow, but by the toil of others. Such a state of affairs is not merely unjust; it is unstable. A society that tolerates extremes of wealth and want sows the seeds of its own destruction. If democracy is to survive, it must be economic as well as political."}),
  ("Comprehension", "According to the passage, the rich grow richer because of:", ["their hard work", "the toil of others", "their intelligence", "good fortune"], 1,
    {"passage": "The greatest evil of the present age is not poverty but inequality. Wealth accumulates in the hands of a few while the many struggle for bare subsistence. The rich grow richer, not by the sweat of their brow, but by the toil of others. Such a state of affairs is not merely unjust; it is unstable. A society that tolerates extremes of wealth and want sows the seeds of its own destruction. If democracy is to survive, it must be economic as well as political."}),
  ("Comprehension", "Extreme inequality is dangerous because it:", ["makes people lazy", "sows the seeds of society's own destruction", "reduces population", "encourages hard work"], 1,
    {"passage": "The greatest evil of the present age is not poverty but inequality. Wealth accumulates in the hands of a few while the many struggle for bare subsistence. The rich grow richer, not by the sweat of their brow, but by the toil of others. Such a state of affairs is not merely unjust; it is unstable. A society that tolerates extremes of wealth and want sows the seeds of its own destruction. If democracy is to survive, it must be economic as well as political."}),
  ("Comprehension", "For democracy to survive, the author says it must become:", ["stronger militarily", "economic as well as political", "more violent", "less demanding"], 1,
    {"passage": "The greatest evil of the present age is not poverty but inequality. Wealth accumulates in the hands of a few while the many struggle for bare subsistence. The rich grow richer, not by the sweat of their brow, but by the toil of others. Such a state of affairs is not merely unjust; it is unstable. A society that tolerates extremes of wealth and want sows the seeds of its own destruction. If democracy is to survive, it must be economic as well as political."}),
  ("Comprehension", "A man without character is compared to:", ["a bird without wings", "a ship without a rudder", "a house without doors", "a tree without roots"], 1,
    {"passage": "Character is the most precious asset of a man. Wealth may come and go, but character remains. A man without character is like a ship without a rudder, tossed about by every wind of temptation. Money can buy many things, but it cannot buy integrity. Nations do not become great by material prosperity alone; they become great by the strength of character of their citizens."}),
  ("Comprehension", "According to the passage, money cannot buy:", ["comfort", "luxury", "integrity", "medicine"], 2,
    {"passage": "Character is the most precious asset of a man. Wealth may come and go, but character remains. A man without character is like a ship without a rudder, tossed about by every wind of temptation. Money can buy many things, but it cannot buy integrity. Nations do not become great by material prosperity alone; they become great by the strength of character of their citizens."}),
  ("Comprehension", "Nations become great through:", ["material prosperity alone", "military power", "the strength of character of their citizens", "natural resources"], 2,
    {"passage": "Character is the most precious asset of a man. Wealth may come and go, but character remains. A man without character is like a ship without a rudder, tossed about by every wind of temptation. Money can buy many things, but it cannot buy integrity. Nations do not become great by material prosperity alone; they become great by the strength of character of their citizens."}),
  ("Comprehension", "The author compares the mind without exercise to:", ["a rusty machine", "barren land", "a dark room", "still water"], 0,
    {"passage": "Just as the body needs exercise to remain healthy, the mind needs the exercise of reading and reflection to remain alert. A mind that is not exercised grows sluggish like a rusty machine. Reading great books is the finest gymnastics for the intellect. It stretches our imagination, sharpens our judgement and deepens our sympathy."}),
  ("Comprehension", "According to the passage, reading great books is called:", ["a waste of time", "the finest gymnastics for the intellect", "a physical exercise", "an old habit"], 1,
    {"passage": "Just as the body needs exercise to remain healthy, the mind needs the exercise of reading and reflection to remain alert. A mind that is not exercised grows sluggish like a rusty machine. Reading great books is the finest gymnastics for the intellect. It stretches our imagination, sharpens our judgement and deepens our sympathy."}),
  ("Comprehension", "Reading does all of the following EXCEPT:", ["stretches imagination", "sharpens judgement", "deepens sympathy", "weakens memory"], 3,
    {"passage": "Just as the body needs exercise to remain healthy, the mind needs the exercise of reading and reflection to remain alert. A mind that is not exercised grows sluggish like a rusty machine. Reading great books is the finest gymnastics for the intellect. It stretches our imagination, sharpens our judgement and deepens our sympathy."}),
]


def main():
    authentic = load_authentic()
    by_id = {q["id"]: q for q in authentic}

    n = 10000
    for row in NEW:
        topic, question, options, ans, extra = row
        n += 1
        qid = f"hard-{n}"
        entry = {
            "id": qid,
            "year": 2024,
            "session": 2,
            "qnum": n,
            "passage": extra.get("passage"),
            "question": question,
            "options": options,
            "answer": ans,
            "answerSource": "hard-cds-pattern",
            "topic": topic,
        }
        if extra.get("parts"):
            entry["parts"] = extra["parts"]
        by_id[qid] = entry

    final = sorted(
        by_id.values(),
        key=lambda x: (x.get("year", 0), x.get("session", 0), x.get("qnum") or 0, x["id"]),
    )
    OUT.write_text(json.dumps(final, indent=2, ensure_ascii=False), encoding="utf-8")
    from collections import Counter
    print(f"Total: {len(final)}  (authentic PYQs kept: {len(authentic)})")
    print(Counter(q.get("topic") for q in final).most_common())


if __name__ == "__main__":
    main()
