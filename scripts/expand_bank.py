#!/usr/bin/env python3
"""Append predicted CDS-style English questions across all major topics."""
import json
import re
from pathlib import Path

# Resolve from this file, not from $HOME: the repo is not always at ~/cds-prep and
# a home-relative path silently writes to a phantom directory and reports success.
OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "questions.json"

# (topic, question, [a,b,c,d], answer_index 0-3, optional passage)
EXTRA = [
  # --- SYNONYMS (word highlighted via CAPS) ---
  ("Synonyms", "Choose the word nearest in meaning to: ABATE", ["increase", "diminish", "sharpen", "harden"], 1),
  ("Synonyms", "Choose the word nearest in meaning to: BELLIGERENT", ["peaceful", "hostile", "timid", "cheerful"], 1),
  ("Synonyms", "Choose the word nearest in meaning to: CONCISE", ["lengthy", "brief", "confusing", "complex"], 1),
  ("Synonyms", "Choose the word nearest in meaning to: DEARTH", ["abundance", "scarcity", "wealth", "variety"], 1),
  ("Synonyms", "Choose the word nearest in meaning to: EPHEMERAL", ["permanent", "short-lived", "eternal", "solid"], 1),
  ("Synonyms", "Choose the word nearest in meaning to: FORTITUDE", ["cowardice", "courage", "fear", "doubt"], 1),
  ("Synonyms", "Choose the word nearest in meaning to: GARRULOUS", ["silent", "talkative", "shy", "brief"], 1),
  ("Synonyms", "Choose the word nearest in meaning to: HAPHAZARD", ["planned", "random", "careful", "orderly"], 1),
  ("Synonyms", "Choose the word nearest in meaning to: INEPT", ["skilful", "clumsy", "clever", "adept"], 1),
  ("Synonyms", "Choose the word nearest in meaning to: LACONIC", ["wordy", "terse", "loud", "lengthy"], 1),
  ("Synonyms", "She spoke with great EQUANIMITY during the crisis.", ["anger", "calmness", "fear", "excitement"], 1),
  ("Synonyms", "His REMARKS were quite CAUSTIC.", ["mild", "sarcastic", "kind", "soft"], 1),
  ("Synonyms", "The plan was PRAGMATIC rather than idealistic.", ["impractical", "practical", "foolish", "vague"], 1),
  ("Synonyms", "He tried to ALLEVIATE her suffering.", ["increase", "relieve", "ignore", "cause"], 1),
  ("Synonyms", "The evidence was INCONTROVERTIBLE.", ["doubtful", "undeniable", "weak", "false"], 1),
  # --- ANTONYMS ---
  ("Antonyms", "Choose the word opposite in meaning to: ADVERSITY", ["misfortune", "prosperity", "hardship", "calamity"], 1),
  ("Antonyms", "Choose the word opposite in meaning to: BENIGN", ["kind", "malignant", "gentle", "mild"], 1),
  ("Antonyms", "Choose the word opposite in meaning to: CREDULOUS", ["gullible", "sceptical", "naive", "trusting"], 1),
  ("Antonyms", "Choose the word opposite in meaning to: DILIGENT", ["hardworking", "lazy", "careful", "earnest"], 1),
  ("Antonyms", "Choose the word opposite in meaning to: EXTRAVAGANT", ["wasteful", "frugal", "lavish", "costly"], 1),
  ("Antonyms", "Choose the word opposite in meaning to: FICKLE", ["changeable", "constant", "unstable", "capricious"], 1),
  ("Antonyms", "Choose the word opposite in meaning to: GREGARIOUS", ["sociable", "unsociable", "friendly", "outgoing"], 1),
  ("Antonyms", "Choose the word opposite in meaning to: HUMBLE", ["modest", "arrogant", "meek", "simple"], 1),
  ("Antonyms", "Choose the word opposite in meaning to: ILLICIT", ["illegal", "lawful", "forbidden", "banned"], 1),
  ("Antonyms", "Choose the word opposite in meaning to: JUVENILE", ["youthful", "mature", "childish", "young"], 1),
  ("Antonyms", "He remained STOIC in the face of pain.", ["unemotional", "emotional", "calm", "resigned"], 1),
  ("Antonyms", "Her answer was AMBIGUOUS.", ["unclear", "clear", "vague", "doubtful"], 1),
  ("Antonyms", "The soil was FERTILE.", ["productive", "barren", "rich", "fruitful"], 1),
  ("Antonyms", "He is a NOVICE in this field.", ["beginner", "expert", "learner", "amateur"], 1),
  ("Antonyms", "The crowd was TURBULENT.", ["violent", "calm", "unruly", "agitated"], 1),
  # --- SPOTTING ERRORS ---
  ("Spotting Errors", "Find the error: (a) The number of students / (b) are increasing / (c) every year. / (d) No error", ["The number of students", "are increasing", "every year", "No error"], 1),
  ("Spotting Errors", "Find the error: (a) She is senior / (b) than me / (c) in service. / (d) No error", ["She is senior", "than me", "in service", "No error"], 1),
  ("Spotting Errors", "Find the error: (a) I look forward / (b) to meet / (c) you soon. / (d) No error", ["I look forward", "to meet", "you soon", "No error"], 1),
  ("Spotting Errors", "Find the error: (a) Neither Ramesh / (b) nor his friends / (c) was present. / (d) No error", ["Neither Ramesh", "nor his friends", "was present", "No error"], 2),
  ("Spotting Errors", "Find the error: (a) He is / (b) used to work / (c) hard every day. / (d) No error", ["He is", "used to work", "hard every day", "No error"], 1),
  ("Spotting Errors", "Find the error: (a) The data / (b) is / (c) insufficient. / (d) No error", ["The data", "is", "insufficient", "No error"], 3),
  ("Spotting Errors", "Find the error: (a) She said that / (b) she will come / (c) tomorrow. / (d) No error", ["She said that", "she will come", "tomorrow", "No error"], 1),
  ("Spotting Errors", "Find the error: (a) One should / (b) keep his promise / (c) at all costs. / (d) No error", ["One should", "keep his promise", "at all costs", "No error"], 1),
  ("Spotting Errors", "Find the error: (a) Everybody / (b) have submitted / (c) the form. / (d) No error", ["Everybody", "have submitted", "the form", "No error"], 1),
  ("Spotting Errors", "Find the error: (a) He asked me / (b) that where / (c) I lived. / (d) No error", ["He asked me", "that where", "I lived", "No error"], 1),
  # --- FILL IN THE BLANKS ---
  ("Fill in the Blanks", "He is not ______ to the idea of working abroad.", ["averse", "adverse", "avert", "advert"], 0),
  ("Fill in the Blanks", "The committee will ______ the matter next week.", ["discuss about", "discuss", "discuss on", "discuss over"], 1),
  ("Fill in the Blanks", "She has a great ______ for classical music.", ["aptitude", "attitude", "altitude", "latitude"], 0),
  ("Fill in the Blanks", "Please ______ me to post this letter.", ["remember", "remind", "recall", "recollect"], 1),
  ("Fill in the Blanks", "The river has ______ its banks.", ["overflown", "overflowed", "overflew", "overflewn"], 1),
  ("Fill in the Blanks", "He deals ______ spare parts.", ["with", "in", "at", "on"], 1),
  ("Fill in the Blanks", "I prefer tea ______ coffee.", ["than", "to", "over", "from"], 1),
  ("Fill in the Blanks", "He is ______ of his success.", ["pride", "proud", "proudly", "prided"], 1),
  ("Fill in the Blanks", "The meeting was put ______ until next Monday.", ["off", "of", "on", "out"], 0),
  ("Fill in the Blanks", "She burst ______ tears.", ["in", "into", "with", "to"], 1),
  # --- SENTENCE IMPROVEMENT ---
  ("Sentence Improvement", "Improve: He is knowing me for five years.", ["has known", "knows", "had known", "No improvement"], 0),
  ("Sentence Improvement", "Improve: Unless you do not work hard, you will fail.", ["Unless you work hard", "If you do not work hard", "Both A and B", "No improvement"], 2),
  ("Sentence Improvement", "Improve: The patient died before the doctor arrived.", ["had died", "has died", "was dying", "No improvement"], 0),
  ("Sentence Improvement", "Improve: I am used to get up early.", ["getting up", "got up", "get up", "No improvement"], 0),
  ("Sentence Improvement", "Improve: He suggested me to go.", ["suggested that I go", "suggested me going", "suggested to me go", "No improvement"], 0),
  ("Sentence Improvement", "Improve: She is the taller of the two sisters.", ["tallest", "more tall", "most tall", "No improvement"], 3),
  ("Sentence Improvement", "Improve: No less than fifty students were present.", ["No fewer than", "No lesser than", "Not less than", "No improvement"], 0),
  ("Sentence Improvement", "Improve: He is one of those who always help the poor.", ["helps", "helping", "helped", "No improvement"], 3),
  ("Sentence Improvement", "Improve: The news are true.", ["is true", "were true", "have been true", "No improvement"], 0),
  ("Sentence Improvement", "Improve: I have finished my work yesterday.", ["finished", "had finished", "was finishing", "No improvement"], 0),
  # --- ORDERING OF WORDS ---
  ("Ordering of Words", "Rearrange: P: is the best Q: honesty R: policy S: in the long run", ["Q P R S", "Q R P S", "R Q P S", "P Q R S"], 0),
  ("Ordering of Words", "Rearrange: P: to succeed Q: one must R: work hard S: in life", ["Q R P S", "Q P R S", "R Q P S", "P Q R S"], 0),
  ("Ordering of Words", "Rearrange: P: a beautiful Q: she bought R: dress S: for the party", ["Q P R S", "P Q R S", "Q R P S", "R Q P S"], 0),
  # "P Q R S" = "never trust a man who lies"; "Q R S P" would read "trust a man who lies never".
  ("Ordering of Words", "Rearrange: P: never Q: trust R: a man S: who lies", ["Q R S P", "P Q R S", "Q P R S", "R Q P S"], 1),
  ("Ordering of Words", "Rearrange: P: the sun Q: rises R: in the east S: every morning", ["P Q R S", "Q P R S", "P R Q S", "R P Q S"], 0),
  # --- ORDERING OF SENTENCES ---
  ("Ordering of Sentences", "Arrange: S1: Health is wealth. P: A healthy body has a healthy mind. Q: Without health nothing can be enjoyed. R: We must exercise daily. S: Good food is also essential. S6: So take care of your health.", ["Q P R S", "P Q R S", "R S P Q", "Q R S P"], 0),
  ("Ordering of Sentences", "Arrange: S1: Trees are useful to man. P: They give us fruit. Q: They give us wood. R: They purify the air. S: They provide shade. S6: We should plant more trees.", ["P Q S R", "R P Q S", "P Q R S", "Q P S R"], 0),
  ("Ordering of Sentences", "Arrange: S1: Time is precious. P: Lost time never returns. Q: We must use it wisely. R: Many waste time in idle talk. S: Successful people value time. S6: Guard every minute.", ["P Q R S", "R P Q S", "P R S Q", "S P Q R"], 0),
  # --- IDIOMS ---
  ("Idioms and Phrases", "What does 'A bone of contention' mean?", ["a cause of quarrel", "a gift", "a reward", "a secret"], 0),
  ("Idioms and Phrases", "What does 'To turn a deaf ear' mean?", ["to listen carefully", "to ignore", "to hear partially", "to agree"], 1),
  ("Idioms and Phrases", "What does 'To bury the hatchet' mean?", ["to dig", "to make peace", "to fight", "to hide"], 1),
  ("Idioms and Phrases", "What does 'In hot water' mean?", ["swimming", "in trouble", "cooking", "relaxing"], 1),
  ("Idioms and Phrases", "What does 'To hit below the belt' mean?", ["to play fair", "to act unfairly", "to win", "to lose"], 1),
  ("Idioms and Phrases", "What does 'A wild goose chase' mean?", ["a hunt", "a futile search", "a race", "a journey"], 1),
  ("Idioms and Phrases", "What does 'To smell a rat' mean?", ["to detect something wrong", "to hunt", "to cook", "to clean"], 0),
  ("Idioms and Phrases", "What does 'To face the music' mean?", ["to enjoy", "to face consequences", "to sing", "to dance"], 1),
  ("Idioms and Phrases", "What does 'At daggers drawn' mean?", ["friendly", "bitter enmity", "indifferent", "related"], 1),
  ("Idioms and Phrases", "What does 'To keep one's head' mean?", ["to stay calm", "to be proud", "to sleep", "to hide"], 0),
  # --- PREPOSITIONS ---
  ("Prepositions", "He is addicted ______ gambling.", ["with", "to", "for", "in"], 1),
  ("Prepositions", "She is envious ______ her sister.", ["with", "of", "for", "to"], 1),
  ("Prepositions", "I am tired ______ waiting.", ["with", "of", "from", "by"], 1),
  ("Prepositions", "He congratulated her ______ her promotion.", ["for", "on", "at", "with"], 1),
  ("Prepositions", "The dog jumped ______ the wall.", ["in", "over", "at", "to"], 1),
  ("Prepositions", "She has been working here ______ 2018.", ["for", "since", "from", "in"], 1),
  ("Prepositions", "Distribute the sweets ______ the children.", ["between", "among", "with", "to"], 1),
  ("Prepositions", "He is blind ______ one eye.", ["in", "of", "with", "to"], 0),
  ("Prepositions", "I differ ______ you on this point.", ["from", "with", "to", "on"], 1),
  ("Prepositions", "The book consists ______ ten chapters.", ["with", "of", "in", "by"], 1),
  # --- ACTIVE PASSIVE ---
  ("Active Passive", "Change to passive: They are building a bridge.", ["A bridge is being built by them", "A bridge was built by them", "A bridge has been built by them", "A bridge is built by them"], 0),
  ("Active Passive", "Change to passive: Someone has stolen my watch.", ["My watch has been stolen", "My watch was stolen", "My watch is stolen", "My watch had been stolen"], 0),
  ("Active Passive", "Change to active: The letter was written by her.", ["She wrote the letter", "She writes the letter", "She has written the letter", "She is writing the letter"], 0),
  ("Active Passive", "Change to passive: Open the door.", ["Let the door be opened", "The door is opened", "The door was opened", "The door has been opened"], 0),
  ("Active Passive", "Change to passive: Who wrote this book?", ["By whom was this book written?", "Who was this book written?", "By who was this book written?", "Whom was this book written by?"], 0),
  ("Active Passive", "Change to passive: People speak English all over the world.", ["English is spoken all over the world", "English was spoken all over the world", "English has been spoken all over the world", "English is being spoken all over the world"], 0),
  ("Active Passive", "Change to active: The thief was caught by the police.", ["The police caught the thief", "The police catch the thief", "The police have caught the thief", "The police are catching the thief"], 0),
  ("Active Passive", "Change to passive: She will finish the work tomorrow.", ["The work will be finished by her tomorrow", "The work would be finished by her tomorrow", "The work will finish by her tomorrow", "The work is finished by her tomorrow"], 0),
  # --- DIRECT INDIRECT ---
  ("Direct Indirect", "He said, \"I am busy.\"", ["He said that he was busy", "He said that he is busy", "He said that I was busy", "He said that he had been busy"], 0),
  ("Direct Indirect", "She said to me, \"Where do you live?\"", ["She asked me where I lived", "She asked me where did I live", "She asked me where do I live", "She told me where I lived"], 0),
  ("Direct Indirect", "He said, \"I went to Delhi yesterday.\"", ["He said that he had gone to Delhi the previous day", "He said that he went to Delhi yesterday", "He said that he has gone to Delhi the previous day", "He said that I had gone to Delhi the previous day"], 0),
  ("Direct Indirect", "The teacher said, \"The Earth revolves around the Sun.\"", ["The teacher said that the Earth revolves around the Sun", "The teacher said that the Earth revolved around the Sun", "The teacher said that the Earth had revolved around the Sun", "The teacher said that the Earth is revolving around the Sun"], 0),
  ("Direct Indirect", "She said, \"Please help me.\"", ["She requested me to help her", "She said to please help her", "She requested me help her", "She ordered me to help her"], 0),
  ("Direct Indirect", "He said to her, \"Are you coming?\"", ["He asked her if she was coming", "He asked her if she is coming", "He told her if she was coming", "He asked her was she coming"], 0),
  ("Direct Indirect", "Ram said, \"Alas! I am ruined.\"", ["Ram exclaimed with sorrow that he was ruined", "Ram said that he was ruined", "Ram exclaimed that I am ruined", "Ram cried that he is ruined"], 0),
  ("Direct Indirect", "He said, \"Let us go for a walk.\"", ["He suggested that they should go for a walk", "He said that they go for a walk", "He ordered that they go for a walk", "He suggested that we go for a walk"], 0),
  # --- ONE WORD SUBSTITUTION ---
  ("One Word Substitution", "A person who loves mankind", ["misanthrope", "philanthropist", "anthropologist", "philosopher"], 1),
  ("One Word Substitution", "A person who cannot read or write", ["illiterate", "ignorant", "uneducated", "naive"], 0),
  ("One Word Substitution", "A place where birds are kept", ["aquarium", "aviary", "apiary", "arena"], 1),
  ("One Word Substitution", "One who is present everywhere", ["omnipotent", "omniscient", "omnipresent", "omnivorous"], 2),
  ("One Word Substitution", "A speech delivered without preparation", ["debate", "extempore", "dialogue", "rhetoric"], 1),
  ("One Word Substitution", "One who looks at the bright side of things", ["pessimist", "optimist", "realist", "idealist"], 1),
  ("One Word Substitution", "A government by the people", ["autocracy", "democracy", "plutocracy", "oligarchy"], 1),
  ("One Word Substitution", "One who knows many languages", ["bilingual", "linguist", "polyglot", "orator"], 2),
  ("One Word Substitution", "A person who writes dictionaries", ["calligrapher", "lexicographer", "cartographer", "biographer"], 1),
  ("One Word Substitution", "Killing of one's own father", ["patricide", "matricide", "fratricide", "homicide"], 0),
  # --- HOMOPHONES ---
  ("Homophones", "Choose the correct word: The ______ of the school gave a speech.", ["principal", "principle", "princple", "principale"], 0),
  ("Homophones", "Choose the correct word: Please ______ my invitation.", ["accept", "except", "expect", "access"], 0),
  ("Homophones", "Choose the correct word: The ______ is clear today.", ["weather", "whether", "wether", "wheather"], 0),
  ("Homophones", "Choose the correct word: I need some good ______. ", ["advise", "council", "counsel", "console"], 2),
  ("Homophones", "Choose the correct word: He is a man of ______. ", ["steel", "steal", "still", "stile"], 0),
  ("Homophones", "Choose the correct word: She bought a ______ of bread.", ["loaf", "lough", "love", "laugh"], 0),
  ("Homophones", "Choose the correct word: The ______ was very heavy.", ["stationary", "stationery", "stationory", "stasionary"], 0),
  ("Homophones", "Choose the correct word: They walked ______ the park.", ["threw", "through", "thorough", "though"], 1),
  # --- PHRASAL VERBS ---
  ("Phrasal Verbs", "What does 'call off' mean?", ["to telephone", "to cancel", "to visit", "to shout"], 1),
  ("Phrasal Verbs", "What does 'put up with' mean?", ["to build", "to tolerate", "to store", "to wear"], 1),
  ("Phrasal Verbs", "What does 'look down upon' mean?", ["to search", "to despise", "to admire", "to examine"], 1),
  ("Phrasal Verbs", "What does 'break down' mean?", ["to start", "to stop working", "to enter", "to succeed"], 1),
  ("Phrasal Verbs", "What does 'give in' mean?", ["to donate", "to surrender", "to distribute", "to refuse"], 1),
  ("Phrasal Verbs", "What does 'turn down' mean?", ["to accept", "to reject", "to rotate", "to decrease volume only"], 1),
  ("Phrasal Verbs", "What does 'bring up' mean?", ["to carry upstairs", "to raise a child", "to vomit only", "to invent"], 1),
  ("Phrasal Verbs", "What does 'carry on' mean?", ["to lift", "to continue", "to transport", "to stop"], 1),
  ("Phrasal Verbs", "What does 'get over' mean?", ["to climb", "to recover from", "to receive", "to understand fully"], 1),
  ("Phrasal Verbs", "What does 'run out of' mean?", ["to escape", "to have none left", "to jog outside", "to compete"], 1),
  # --- CLOZE ---
  ("Cloze Test", "The importance of education ______ be overemphasised.", ["can", "cannot", "must", "should"], 1),
  ("Cloze Test", "Hard work is the ______ to success.", ["key", "lock", "door", "gate"], 0),
  ("Cloze Test", "He was so tired that he could ______ walk.", ["hardly", "hard", "harder", "hardest"], 0),
  ("Cloze Test", "If I ______ you, I would accept the offer.", ["am", "was", "were", "be"], 2),
  ("Cloze Test", "She has been living here ______ ten years.", ["since", "for", "from", "during"], 1),
  # --- WORD CLASSES / PARTS OF SPEECH ---
  ("Parts of Speech", "Identify the part of speech of the underlined word: She runs fast. (fast)", ["noun", "verb", "adverb", "adjective"], 2),
  ("Parts of Speech", "Identify the part of speech: Honesty is the best policy. (Honesty)", ["verb", "noun", "adjective", "adverb"], 1),
  ("Parts of Speech", "Identify the part of speech: He is a brave soldier. (brave)", ["noun", "verb", "adjective", "adverb"], 2),
  ("Parts of Speech", "Identify the part of speech: Alas! He is dead. (Alas)", ["noun", "interjection", "conjunction", "preposition"], 1),
  ("Parts of Speech", "Identify the part of speech: This is the book that I bought. (that)", ["pronoun", "preposition", "adverb", "adjective"], 0),
  # --- COMPREHENSION (predicted style) ---
  ("Comprehension", "According to the passage, success mainly depends on:", ["luck alone", "hard work and perseverance", "wealth", "connections"], 1,
   "Success is not a matter of luck. It is the result of hard work, perseverance and a clear goal. Those who wait for fortune to smile upon them often wait in vain. History is full of people who rose from humble beginnings through sheer determination."),
  ("Comprehension", "People who wait for fortune often:", ["succeed quickly", "wait in vain", "become rich", "find easy paths"], 1,
   "Success is not a matter of luck. It is the result of hard work, perseverance and a clear goal. Those who wait for fortune to smile upon them often wait in vain. History is full of people who rose from humble beginnings through sheer determination."),
  ("Comprehension", "The main idea of the passage is that:", ["forests are useless", "forests are vital for life on Earth", "only animals need forests", "forests should be cut for wood"], 1,
   "Forests are the lungs of the Earth. They absorb carbon dioxide and release oxygen, making life possible. They also prevent soil erosion, regulate rainfall and provide habitat for countless species. Destroying forests for short-term gain threatens the future of the planet."),
  ("Comprehension", "Destroying forests threatens:", ["only woodcutters", "the future of the planet", "nothing important", "only wild animals"], 1,
   "Forests are the lungs of the Earth. They absorb carbon dioxide and release oxygen, making life possible. They also prevent soil erosion, regulate rainfall and provide habitat for countless species. Destroying forests for short-term gain threatens the future of the planet."),
  ("Comprehension", "Books are called our best friends because:", ["they are cheap", "they give knowledge and never desert us", "they are heavy", "everyone owns them"], 1,
   "Books are our best friends. They instruct us in our youth and comfort us in old age. They never desert us in times of need. Through books we can travel the world, meet great minds and gain wisdom without leaving our room."),
  ("Comprehension", "Through books we can:", ["only waste time", "travel the world and gain wisdom", "avoid all work", "replace teachers completely"], 1,
   "Books are our best friends. They instruct us in our youth and comfort us in old age. They never desert us in times of need. Through books we can travel the world, meet great minds and gain wisdom without leaving our room."),
  # --- PAIRED WORDS / COMMONLY CONFUSED ---
  ("Commonly Confused Words", "Choose correctly: The ______ of the argument was sound.", ["base", "bass", "basis", "basic"], 2),
  ("Commonly Confused Words", "Choose correctly: He gave me good ______.", ["advise", "advice", "advisee", "advices"], 1),
  ("Commonly Confused Words", "Choose correctly: Please ______ the window.", ["close", "clothes", "cloth", "clause"], 0),
  ("Commonly Confused Words", "Choose correctly: She has a sweet ______.", ["desert", "dessert", "deserve", "deserted"], 1),
  ("Commonly Confused Words", "Choose correctly: I will ______ you at the station.", ["wait", "weight", "wet", "wit"], 0),
  # --- SENTENCE COMPLETION / CORRELATING ---
  ("Sentence Completion", "No sooner had he arrived ______ it started raining.", ["when", "than", "then", "but"], 1),
  ("Sentence Completion", "He is so weak ______ he cannot walk.", ["that", "as", "so", "than"], 0),
  ("Sentence Completion", "______ hard he tried, he could not succeed.", ["However", "Whatever", "Wherever", "Whenever"], 0),
  ("Sentence Completion", "I would rather die ______ beg.", ["than", "then", "to", "from"], 0),
  ("Sentence Completion", "She talks as if she ______ everything.", ["knows", "knew", "know", "had known"], 1),
  # --- MATCHING / WORD MEANING style ---
  ("Word Meaning", "The word 'ubiquitous' means:", ["rare", "present everywhere", "ancient", "expensive"], 1),
  ("Word Meaning", "The word 'meticulous' means:", ["careless", "very careful", "angry", "lazy"], 1),
  ("Word Meaning", "The word 'obsolete' means:", ["modern", "out of date", "useful", "popular"], 1),
  ("Word Meaning", "The word 'resilient' means:", ["fragile", "able to recover quickly", "rigid", "weak"], 1),
  ("Word Meaning", "The word 'eloquent' means:", ["silent", "fluent and persuasive", "confused", "rude"], 1),
  # --- MORE PREDICTED CDS PATTERNS ---
  ("Synonyms", "Choose the word nearest in meaning to: PROCRASTINATE", ["hurry", "delay", "decide", "finish"], 1),
  ("Synonyms", "Choose the word nearest in meaning to: SCRUPULOUS", ["careless", "conscientious", "corrupt", "casual"], 1),
  ("Synonyms", "Choose the word nearest in meaning to: VORACIOUS", ["small", "greedy", "weak", "slow"], 1),
  ("Antonyms", "Choose the word opposite in meaning to: SCARCE", ["rare", "abundant", "limited", "few"], 1),
  ("Antonyms", "Choose the word opposite in meaning to: TRANSPARENT", ["clear", "opaque", "see-through", "lucid"], 1),
  ("Antonyms", "Choose the word opposite in meaning to: VOLUNTARY", ["willing", "compulsory", "optional", "free"], 1),
  ("Idioms and Phrases", "What does 'To take with a grain of salt' mean?", ["to eat", "to believe with caution", "to reject fully", "to ignore"], 1),
  ("Idioms and Phrases", "What does 'A Herculean task' mean?", ["an easy job", "a very difficult task", "a short task", "a funny job"], 1),
  ("Spotting Errors", "Find the error: (a) Despite of the rain / (b) we went / (c) for a walk. / (d) No error", ["Despite of the rain", "we went", "for a walk", "No error"], 0),
  ("Spotting Errors", "Find the error: (a) He is / (b) taller than / (c) any boy in the class. / (d) No error", ["He is", "taller than", "any boy in the class", "No error"], 2),
  ("Fill in the Blanks", "The child is ______ of strangers.", ["afraid", "feared", "frightful", "fearsome"], 0),
  ("Fill in the Blanks", "He has a strong ______ for sweets.", ["liking", "like", "likely", "likeness"], 0),
  ("Sentence Improvement", "Improve: We discussed about the problem.", ["discussed the problem", "discussed on the problem", "discussed of the problem", "No improvement"], 0),
  ("One Word Substitution", "A person who is indifferent to pleasure and pain", ["stoic", "epicure", "hedonist", "cynic"], 0),
  ("One Word Substitution", "Incapable of being read", ["illegible", "illegal", "illiterate", "illogical"], 0),
  ("Phrasal Verbs", "What does 'look into' mean?", ["to stare", "to investigate", "to search pockets", "to visit"], 1),
  ("Phrasal Verbs", "What does 'make up for' mean?", ["to invent", "to compensate", "to decorate", "to reconcile only"], 1),
  ("Active Passive", "Change to passive: Do not insult the poor.", ["Let the poor not be insulted", "The poor is not insulted", "The poor are not insulted", "Do not the poor be insulted"], 0),
  ("Direct Indirect", "Mother said to the child, \"Don't touch the fire.\"", ["Mother warned the child not to touch the fire", "Mother said the child don't touch the fire", "Mother told the child to not touch the fire", "Mother asked the child don't touch the fire"], 0),
  ("Prepositions", "He is good ______ English but weak ______ Mathematics.", ["in, in", "at, in", "in, at", "at, at"], 1),
  ("Homophones", "Choose correctly: A ______ of lions attacked the deer.", ["pride", "prayed", "pried", "prise"], 0),
  ("Parts of Speech", "Identify: He walked across the bridge. (across)", ["adverb", "preposition", "conjunction", "adjective"], 1),
  ("Sentence Completion", "______ you work hard, you cannot pass.", ["If", "Unless", "When", "Although"], 1),
  ("Word Meaning", "The word 'candid' means:", ["secretive", "frank", "rude", "clever"], 1),
  ("Cloze Test", "Prevention is better ______ cure.", ["then", "than", "to", "from"], 1),
  ("Comprehension", "The author's attitude towards discipline is:", ["negative", "positive and encouraging", "indifferent", "humorous"], 1,
   "Discipline is the foundation of character. It teaches us self-control and respect for rules. A disciplined person is more likely to achieve goals than one who is careless. Schools must therefore emphasise discipline along with academics."),
  ("Ordering of Words", "Rearrange: P: always Q: truth R: the S: triumphs", ["R Q P S", "P Q R S", "R P Q S", "Q R P S"], 0),
  ("Antonyms", "Choose the word opposite in meaning to: FRAGILE", ["delicate", "sturdy", "weak", "brittle"], 1),
  ("Synonyms", "Choose the word nearest in meaning to: PLACID", ["stormy", "calm", "angry", "noisy"], 1),
]


# --- target: the stem word a synonym/antonym item is testing -------------------
# The UI highlights it. Without it the component guesses from the stem and picks
# the wrong word (e.g. REMARKS instead of CAUSTIC in pred-9011).

# Stems where the tested word cannot be read off mechanically — more than one
# all-caps word, or the word is embedded in an ordinary sentence.
TARGET_OVERRIDES = {
    "His REMARKS were quite CAUSTIC.": "CAUSTIC",
}

LEAD_IN = re.compile(
    r"(?:nearest in meaning to|opposite in meaning to|nearest meaning of"
    r"|meaning of|opposite of|synonym of|antonym of)\s*[:\-]?\s*",
    re.I,
)
CAPS_HEAD = re.compile(r"([A-Z][A-Z'’\-]{2,})")
CAPS_ANY = re.compile(r"\b([A-Z]{3,})\b")
NOT_TARGETS = {"CDS", "UPSC"}


def derive_target(topic, question):
    """The stem word the options are a synonym/antonym OF, or None."""
    if not re.search(r"synonym|antonym", topic, re.I):
        return None
    if question in TARGET_OVERRIDES:
        return TARGET_OVERRIDES[question]
    lead = LEAD_IN.search(question)
    if lead:
        caps = CAPS_HEAD.match(question[lead.end():])
        if caps:
            return caps.group(1)
    caps = CAPS_ANY.search(question)
    if caps and caps.group(1) not in NOT_TARGETS:
        return caps.group(1)
    return None


# --- fixedOptions: options whose meaning is bound to their position ------------
# Either the stem labels the fragments "(a) … / (b) …" and the options repeat
# them, or an option refers to another option ("Both A and B", "None of the
# above"). Shuffling these makes the rendered card contradict itself.
QUANTIFIER = r"(?:[Bb]oth|[Ee]ither|[Nn]either|[Aa]ll|[Nn]one|[Aa]ny)\s+(?:of\s+)?(?:the\s+)?"
SELF_REF_POSITION = re.compile(QUANTIFIER + r"(?:above|below)\b")
SELF_REF_LETTER = re.compile(QUANTIFIER + r"(?:\([a-dA-D]\)|[A-D])\b")
STEM_LABEL = re.compile(r"\(\s*([a-d])\s*\)")


def derive_fixed_options(question, options):
    if len(set(STEM_LABEL.findall(question))) >= 2:
        return True
    return any(
        SELF_REF_POSITION.match(o.strip()) or SELF_REF_LETTER.match(o.strip())
        for o in options
    )


def main():
    existing = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else []
    by_id = {q["id"]: q for q in existing if q.get("answer") is not None}

    start = 9000
    for i, row in enumerate(EXTRA):
        if len(row) == 5:
            topic, q, opts, ans, passage = row
        else:
            topic, q, opts, ans = row
            passage = None
        qid = f"pred-{start + i:04d}"
        rec = {
            "id": qid,
            "year": 2024,
            "session": 1,
            "qnum": start + i,
            "passage": passage,
            "question": q,
        }
        target = derive_target(topic, q)
        if target:
            rec["target"] = target
        rec["options"] = opts
        if derive_fixed_options(q, opts):
            rec["fixedOptions"] = True
        rec["answer"] = ans
        rec["answerSource"] = "predicted-cds-pattern"
        rec["topic"] = topic
        by_id[qid] = rec

    final = sorted(
        by_id.values(),
        key=lambda x: (x.get("year", 0), x.get("session", 0), x.get("qnum") or 0, x["id"]),
    )
    # write_bytes, not write_text: text mode rewrites every "\n" as "\r\n" on
    # Windows and flips the line endings of the whole checked-in file.
    OUT.write_bytes(json.dumps(final, indent=2, ensure_ascii=False).encode("utf-8"))
    from collections import Counter
    print(f"Total: {len(final)}")
    print(Counter(q.get("topic") for q in final))


if __name__ == "__main__":
    main()
