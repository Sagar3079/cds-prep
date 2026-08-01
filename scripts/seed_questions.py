#!/usr/bin/env python3
"""
Curated CDS English PYQ-style questions with verified answers.
Mixed from well-known public PYQ patterns + clean OCR merges.
"""
import json
from pathlib import Path

OUT = Path.home() / "cds-prep" / "src" / "data" / "questions.json"
OCR_OUT = Path.home() / "cds-prep" / "scripts" / "ocr_parsed.json"
KEYS = Path.home() / "cds-prep" / "answer_keys" / "manual_keys.json"

# High-quality bank (options + correct index 0-3)
SEED = [
  # --- SYNONYMS ---
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: ABANDON","o":["forsake","keep","cherish","restrain"],"a":0},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: CANDID","o":["frank","secretive","biased","rude"],"a":0},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: DILIGENT","o":["lazy","industrious","careless","proud"],"a":1},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: ELOQUENT","o":["silent","fluent","weak","harsh"],"a":1},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: FEASIBLE","o":["impossible","practicable","expensive","delayed"],"a":1},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: GREGARIOUS","o":["solitary","sociable","greedy","grim"],"a":1},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: HINDER","o":["help","obstruct","hasten","heal"],"a":1},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: IMMINENT","o":["distant","impending","impossible","imaginary"],"a":1},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: JUDICIOUS","o":["foolish","wise","jealous","jumpy"],"a":1},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: KEEN","o":["dull","eager","kind","known"],"a":1},
  {"topic":"Synonyms","q":"A truly respectable old man is a ripe person.","o":["senior","mature","perfect","seasoned"],"a":1,"year":2018,"session":1,"qnum":1},
  {"topic":"Synonyms","q":"The soldiers repulsed the enemy.","o":["defeated","destroyed","rejected","repelled"],"a":3,"year":2018,"session":1,"qnum":2},
  {"topic":"Synonyms","q":"She deftly masked her feelings.","o":["hid","flaunted","oblique","obscured"],"a":0,"year":2018,"session":1,"qnum":3},
  {"topic":"Synonyms","q":"The soldier showed an exemplary courage.","o":["flawed","faulty","ideal","boisterous"],"a":2,"year":2018,"session":1,"qnum":7},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: LETHARGY","o":["energy","sluggishness","liveliness","anger"],"a":1},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: MITIGATE","o":["aggravate","alleviate","multiply","mention"],"a":1},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: NOVICE","o":["expert","beginner","native","notable"],"a":1},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: OBSTINATE","o":["flexible","stubborn","obedient","open"],"a":1},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: PRUDENT","o":["rash","careful","proud","poor"],"a":1},
  {"topic":"Synonyms","q":"Choose the word nearest in meaning to: QUIESCENT","o":["active","dormant","quick","queer"],"a":1},
  # --- ANTONYMS ---
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: ABUNDANT","o":["plentiful","scarce","ample","copious"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: BENEVOLENT","o":["kind","malevolent","generous","helpful"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: COURAGEOUS","o":["brave","timid","bold","valiant"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: DESTITUTE","o":["poor","affluent","needy","penniless"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: EXPLICIT","o":["clear","implicit","obvious","definite"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: FRUGAL","o":["thrifty","extravagant","economical","sparing"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: GENUINE","o":["real","counterfeit","authentic","true"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: HOSTILE","o":["unfriendly","amicable","antagonistic","bitter"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: INNOCENT","o":["guiltless","guilty","pure","blameless"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: JUBILANT","o":["joyful","depressed","elated","cheerful"],"a":1},
  {"topic":"Antonyms","q":"The princess charming was the centre of attraction today. (opposite of charming)","o":["enchanting","hypnotic","repulsive","fascinating"],"a":2,"year":2018,"session":1,"qnum":37},
  {"topic":"Antonyms","q":"Macbeth is an abominable figure. (opposite of abominable)","o":["abhorrent","repugnant","reputable","attractive"],"a":3,"year":2018,"session":1,"qnum":38},
  {"topic":"Antonyms","q":"Terrorists profess fanatical ideology. (opposite of fanatical)","o":["bigoted","militant","moderate","fervid"],"a":2,"year":2018,"session":1,"qnum":39},
  {"topic":"Antonyms","q":"Rakesh is vulnerable to political pressure. (opposite of vulnerable)","o":["weak","unguarded","exposed","resilient"],"a":3,"year":2018,"session":1,"qnum":40},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: LENIENT","o":["mild","strict","soft","tolerant"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: MEEK","o":["humble","arrogant","gentle","submissive"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: NOBLE","o":["honourable","ignoble","dignified","grand"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: OPTIMISTIC","o":["hopeful","pessimistic","positive","confident"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: PERMANENT","o":["lasting","temporary","enduring","stable"],"a":1},
  {"topic":"Antonyms","q":"Choose the word opposite in meaning to: RELUCTANT","o":["unwilling","eager","hesitant","averse"],"a":1},
  # --- SPOTTING ERRORS ---
  {"topic":"Spotting Errors","q":"Find the part with error: (a) The sceneries of Kashmir / (b) is more beautiful / (c) than that of any other place. / (d) No error","o":["The sceneries of Kashmir","is more beautiful","than that of any other place","No error"],"a":0},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) He is one of the / (b) best player / (c) in our team. / (d) No error","o":["He is one of the","best player","in our team","No error"],"a":1},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) Neither of the two boys / (b) have returned / (c) from the picnic. / (d) No error","o":["Neither of the two boys","have returned","from the picnic","No error"],"a":1},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) The committee / (b) have decided / (c) to postpone the meeting. / (d) No error","o":["The committee","have decided","to postpone the meeting","No error"],"a":1},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) She insisted / (b) on me / (c) going there. / (d) No error","o":["She insisted","on me","going there","No error"],"a":1},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) I prefer coffee / (b) than tea / (c) in the morning. / (d) No error","o":["I prefer coffee","than tea","in the morning","No error"],"a":1},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) Each of the students / (b) have submitted / (c) their assignment. / (d) No error","o":["Each of the students","have submitted","their assignment","No error"],"a":1},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) He told to me / (b) that he would / (c) come tomorrow. / (d) No error","o":["He told to me","that he would","come tomorrow","No error"],"a":0},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) The news / (b) are true / (c) and shocking. / (d) No error","o":["The news","are true","and shocking","No error"],"a":1},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) Despite of / (b) his hard work / (c) he failed. / (d) No error","o":["Despite of","his hard work","he failed","No error"],"a":0},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) She is / (b) good in / (c) English grammar. / (d) No error","o":["She is","good in","English grammar","No error"],"a":1},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) One of my friend / (b) is going / (c) to America. / (d) No error","o":["One of my friend","is going","to America","No error"],"a":0},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) The furniture / (b) in this room / (c) are old. / (d) No error","o":["The furniture","in this room","are old","No error"],"a":2},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) He has been / (b) suffering from fever / (c) since three days. / (d) No error","o":["He has been","suffering from fever","since three days","No error"],"a":2},
  {"topic":"Spotting Errors","q":"Find the part with error: (a) Scarcely had he / (b) gone than / (c) a policeman knocked. / (d) No error","o":["Scarcely had he","gone than","a policeman knocked","No error"],"a":1},
  # --- FILL IN THE BLANKS ---
  {"topic":"Fill in the Blanks","q":"In the face of the overwhelming mass of evidence against him, we cannot _____ him of the crime.","o":["punish","absolve","release","ignore"],"a":1,"year":2018,"session":1,"qnum":21},
  {"topic":"Fill in the Blanks","q":"I hope that the rain will _____ for our picnic tomorrow.","o":["keep off","put off","set back","stay out"],"a":0,"year":2018,"session":1,"qnum":22},
  {"topic":"Fill in the Blanks","q":"After the marathon, some of the competitors felt completely _____.","o":["cut up","done in","done out","run out"],"a":1,"year":2018,"session":1,"qnum":23},
  {"topic":"Fill in the Blanks","q":"Scarcely _____ the teacher entered the class when he heard the noise.","o":["did","has","had","will have"],"a":2,"year":2018,"session":1,"qnum":24},
  {"topic":"Fill in the Blanks","q":"I do not think he will ever _____ the shock of his wife's death.","o":["get by","get off","get through","get over"],"a":3,"year":2018,"session":1,"qnum":25},
  {"topic":"Fill in the Blanks","q":"It is no use crying over _____ milk.","o":["spoiled","spirited","split","spilt"],"a":3,"year":2018,"session":1,"qnum":26},
  {"topic":"Fill in the Blanks","q":"You must go to the station now; your brother _____ go just yet as his train leaves after three hours.","o":["shouldn't","mustn't","wouldn't","needn't"],"a":3,"year":2018,"session":1,"qnum":27},
  {"topic":"Fill in the Blanks","q":"Every rash driver becomes a _____ killer.","o":["sure","reckless","potential","powerful"],"a":2,"year":2018,"session":1,"qnum":28},
  {"topic":"Fill in the Blanks","q":"He is _____ honest man.","o":["a","an","the","no article"],"a":1},
  {"topic":"Fill in the Blanks","q":"The train had left before we _____ the station.","o":["reach","reached","had reached","will reach"],"a":1},
  {"topic":"Fill in the Blanks","q":"She is junior _____ me.","o":["than","to","from","with"],"a":1},
  {"topic":"Fill in the Blanks","q":"I look forward to _____ you.","o":["meet","meeting","met","have met"],"a":1},
  {"topic":"Fill in the Blanks","q":"Neither Ram nor his friends _____ present.","o":["is","are","was","has"],"a":1},
  {"topic":"Fill in the Blanks","q":"He congratulated me _____ my success.","o":["for","on","at","with"],"a":1},
  {"topic":"Fill in the Blanks","q":"The more you practise, _____ you become.","o":["the better","better","best","the best"],"a":0},
  # --- IDIOMS ---
  {"topic":"Idioms and Phrases","q":"What does the idiom mean: 'A blessing in disguise'?","o":["a curse","something good that seemed bad at first","a clear advantage","a hidden enemy"],"a":1},
  {"topic":"Idioms and Phrases","q":"What does the idiom mean: 'Beat around the bush'?","o":["to fight","to avoid the main topic","to garden","to celebrate"],"a":1},
  {"topic":"Idioms and Phrases","q":"What does the idiom mean: 'Break the ice'?","o":["to start a conversation","to destroy something","to cool down","to freeze"],"a":0},
  {"topic":"Idioms and Phrases","q":"What does the idiom mean: 'Burn the midnight oil'?","o":["waste fuel","work late into the night","set fire","party all night"],"a":1},
  {"topic":"Idioms and Phrases","q":"What does the idiom mean: 'Call it a day'?","o":["start work","stop working for the day","celebrate","make a phone call"],"a":1},
  {"topic":"Idioms and Phrases","q":"What does the idiom mean: 'Cost an arm and a leg'?","o":["be very cheap","be very expensive","be injured","be free"],"a":1},
  {"topic":"Idioms and Phrases","q":"What does the idiom mean: 'Hit the nail on the head'?","o":["hurt someone","be exactly right","do carpentry","make a mistake"],"a":1},
  {"topic":"Idioms and Phrases","q":"What does the idiom mean: 'Once in a blue moon'?","o":["very often","very rarely","at night","never"],"a":1},
  {"topic":"Idioms and Phrases","q":"What does the idiom mean: 'Piece of cake'?","o":["dessert","something very easy","something difficult","a reward"],"a":1},
  {"topic":"Idioms and Phrases","q":"What does the idiom mean: 'Under the weather'?","o":["enjoying rain","feeling unwell","feeling happy","travelling"],"a":1},
  {"topic":"Idioms and Phrases","q":"'My two cents' means:","o":["My money","My opinion","My decision","My explanation"],"a":1,"year":2018,"session":1,"qnum":109},
  {"topic":"Idioms and Phrases","q":"'Out of the blue' means:","o":["Undoubtedly","Unexpectedly","Unbelievably","Unconcerned"],"a":1,"year":2018,"session":1,"qnum":110},
  {"topic":"Idioms and Phrases","q":"'What a small world' means:","o":["What a coincidence","What a challenging task","What a narrow space","What a beautiful place"],"a":0,"year":2018,"session":1,"qnum":111},
  {"topic":"Idioms and Phrases","q":"'Down the road' means:","o":["In future","In the past","At present","No particular time"],"a":0,"year":2018,"session":1,"qnum":112},
  {"topic":"Idioms and Phrases","q":"'Raising eyebrows' means:","o":["To show surprise","Criticize","Support","Instruct"],"a":0,"year":2018,"session":1,"qnum":113},
  # --- SENTENCE IMPROVEMENT ---
  {"topic":"Sentence Improvement","q":"Improve the underlined part if needed: He is enough tall to touch the ceiling.","o":["tall enough","enough taller","taller enough","No improvement"],"a":0},
  {"topic":"Sentence Improvement","q":"Improve: She did not wrote the letter yesterday.","o":["did not write","does not wrote","had not wrote","No improvement"],"a":0},
  {"topic":"Sentence Improvement","q":"Improve: If I will be you, I would not do it.","o":["If I am you","If I were you","If I was you","No improvement"],"a":1},
  {"topic":"Sentence Improvement","q":"Improve: He is living in Delhi since 2010.","o":["has been living","was living","lived","No improvement"],"a":0},
  {"topic":"Sentence Improvement","q":"Improve: The police accused him for theft.","o":["with","in","of","No improvement"],"a":2,"year":2016,"session":1,"qnum":1},
  {"topic":"Sentence Improvement","q":"Improve: Hardly he had reached when it started raining.","o":["Hardly had he reached","Hardly he reached","He hardly had reached","No improvement"],"a":0},
  {"topic":"Sentence Improvement","q":"Improve: She is knowing the answer.","o":["knows","has known","knew","No improvement"],"a":0},
  {"topic":"Sentence Improvement","q":"Improve: No sooner did the bell ring when the students rushed out.","o":["than the students rushed out","then the students rushed out","but the students rushed out","No improvement"],"a":0},
  {"topic":"Sentence Improvement","q":"Improve: He denied to help me.","o":["denied helping","denied for helping","denied of help","No improvement"],"a":0},
  {"topic":"Sentence Improvement","q":"Improve: The teacher asked that why he was late.","o":["asked why he was late","asked that why was he late","asked why was he late","No improvement"],"a":0},
  # --- ORDERING OF WORDS ---
  {"topic":"Ordering of Words","q":"Rearrange: P: popularity of Indian textiles Q: the British manufacturers R: were jealous of the S: from the very beginning","o":["P Q R S","S P Q R","S P R Q","Q R S P"],"a":2,"year":2018,"session":1,"qnum":11},
  {"topic":"Ordering of Words","q":"Rearrange to form a meaningful sentence: P: to succeed Q: hard work R: is essential S: in life","o":["Q R P S","R Q P S","Q P R S","P Q R S"],"a":0},
  {"topic":"Ordering of Words","q":"Rearrange: P: the most Q: English is R: widely spoken S: language in the world","o":["Q P R S","P Q R S","Q R P S","R Q P S"],"a":0},
  {"topic":"Ordering of Words","q":"Rearrange: P: reading books Q: a good habit R: is S: for everyone","o":["P R Q S","Q R P S","P Q R S","R P Q S"],"a":0},
  {"topic":"Ordering of Words","q":"Rearrange: P: never Q: you should R: give up S: hope","o":["Q P R S","P Q R S","Q R P S","R Q P S"],"a":0},
  # --- ORDERING OF SENTENCES ---
  {"topic":"Ordering of Sentences","q":"Arrange the sentences: S1: Exercise is important for health. P: It strengthens the heart. Q: It also improves mood. R: Doctors recommend daily exercise. S: Walking is a simple form of exercise. S6: So make exercise a habit.","o":["R P Q S","P Q R S","R S P Q","S P Q R"],"a":0},
  {"topic":"Ordering of Sentences","q":"Arrange: S1: Books are our best friends. P: They never leave us. Q: They give us knowledge. R: We can read them anytime. S: Good books shape our character. S6: Therefore we should read good books.","o":["Q P R S","P Q R S","Q R P S","S Q P R"],"a":0},
  # --- PREPOSITIONS ---
  {"topic":"Prepositions","q":"He is good _____ mathematics.","o":["in","at","on","with"],"a":1},
  {"topic":"Prepositions","q":"She is afraid _____ dogs.","o":["from","of","with","by"],"a":1},
  {"topic":"Prepositions","q":"The book is _____ the table.","o":["in","on","at","over"],"a":1},
  {"topic":"Prepositions","q":"He has been ill _____ Monday.","o":["for","since","from","on"],"a":1},
  {"topic":"Prepositions","q":"Divide the sweets _____ the two children.","o":["among","between","with","into"],"a":1},
  {"topic":"Prepositions","q":"I agree _____ your proposal.","o":["to","with","on","for"],"a":1},
  {"topic":"Prepositions","q":"She depends _____ her parents.","o":["to","on","with","from"],"a":1},
  {"topic":"Prepositions","q":"He is married _____ a doctor.","o":["with","to","for","by"],"a":1},
  {"topic":"Prepositions","q":"The teacher was angry _____ the students.","o":["on","with","at","for"],"a":1},
  {"topic":"Prepositions","q":"We arrived _____ the airport on time.","o":["in","at","on","to"],"a":1},
  # --- COMPREHENSION ---
  {"topic":"Comprehension","passage":"Over-population is the most pressing of India's numerous and multi-faceted problems. In fact it has caused equally complex problems such as poverty, under-nourishment, unemployment and excessive fragmentation of land. Simultaneously the political concept of a democratic state with a free individual at its centre has exaggerated the problem of over-population. Strangely, more people means more power in a democracy; hence the politicians encourage people to have more children.","q":"What is the irony behind the over-population of India?","o":["Over-population gives birth to poverty, which itself is the cause of over-population","Under nourishment and unemployment are outcomes of flawed economic progress","Fragmentation of land is leading to over-population","Fruits of economic progress are trickling down to the poor"],"a":0,"year":2018,"session":1,"qnum":51},
  {"topic":"Comprehension","passage":"Over-population is the most pressing of India's numerous and multi-faceted problems. In fact it has caused equally complex problems such as poverty, under-nourishment, unemployment and excessive fragmentation of land.","q":"What, in the author's view, severely affects the economic growth of our country?","o":["poverty","illiteracy","over-population","None of the above"],"a":2,"year":2018,"session":1,"qnum":53},
  {"topic":"Comprehension","passage":"To eat and not be eaten — that's the imperative of a caterpillar's existence. The leaf roller reduces its risks of being picked off by predators by silking together a temporary shelter in which to feed and rest. Adopting a different line of defense, the jelly slug extrudes a sticky translucent coating that may foul the mouth-parts of marauding ants.","q":"Which one of the following caterpillars produces a sticky covering?","o":["Leaf roller","Jelly slug","Aquatic larva","Citrus leaf miner"],"a":1,"year":2018,"session":1,"qnum":57},
  {"topic":"Comprehension","passage":"Reading is a basic tool in the living of a good life. It is a fundamental skill upon which all formal education depends. Through reading we acquire knowledge, develop imagination and learn to think critically. A person who does not read is no better than one who cannot read.","q":"According to the passage, reading is:","o":["only for students","a basic tool for a good life","a waste of time","only for scholars"],"a":1},
  {"topic":"Comprehension","passage":"Reading is a basic tool in the living of a good life. It is a fundamental skill upon which all formal education depends. Through reading we acquire knowledge, develop imagination and learn to think critically. A person who does not read is no better than one who cannot read.","q":"A person who does not read is compared to:","o":["a scholar","one who cannot read","a teacher","a writer"],"a":1},
  # --- CLOZE / more FIB ---
  {"topic":"Cloze Test","q":"One of India's greatest musicians is M.S. Subbulakshmi. Her singing has brought _____ to millions of people.","o":["sorrow","joy","boredom","pain"],"a":1,"year":2018,"session":1,"qnum":91},
  {"topic":"Fill in the Blanks","q":"The country owes a deep debt of _____ to the freedom fighters.","o":["patriotism","sincerity","remembrance","gratitude"],"a":3,"year":2018,"session":1,"qnum":29},
  {"topic":"Synonyms","q":"Choose nearest meaning of: TENACIOUS","o":["weak","persistent","timid","temporary"],"a":1},
  {"topic":"Synonyms","q":"Choose nearest meaning of: VERBOSE","o":["concise","wordy","silent","clear"],"a":1},
  {"topic":"Synonyms","q":"Choose nearest meaning of: WARY","o":["careless","cautious","weary","wild"],"a":1},
  {"topic":"Synonyms","q":"Choose nearest meaning of: ZEALOUS","o":["indifferent","enthusiastic","lazy","jealous"],"a":1},
  {"topic":"Antonyms","q":"Choose opposite of: TRANSIENT","o":["temporary","permanent","brief","fleeting"],"a":1},
  {"topic":"Antonyms","q":"Choose opposite of: URBANE","o":["polished","rude","suave","cultured"],"a":1},
  {"topic":"Antonyms","q":"Choose opposite of: VIRTUE","o":["goodness","vice","morality","honesty"],"a":1},
  {"topic":"Antonyms","q":"Choose opposite of: WISDOM","o":["knowledge","folly","sense","insight"],"a":1},
  {"topic":"Idioms and Phrases","q":"'Spill the beans' means:","o":["cook food","reveal a secret","waste resources","plant seeds"],"a":1},
  {"topic":"Idioms and Phrases","q":"'Bite the bullet' means:","o":["eat metal","face a difficult situation bravely","start a fight","give up"],"a":1},
  {"topic":"Idioms and Phrases","q":"'Let the cat out of the bag' means:","o":["free an animal","reveal a secret","go shopping","make noise"],"a":1},
  {"topic":"Idioms and Phrases","q":"'A penny for your thoughts' means:","o":["asking someone what they are thinking","offering money","being poor","buying ideas"],"a":0},
  {"topic":"Spotting Errors","q":"Find the error: (a) Two thirds of the book / (b) were / (c) rubbish. / (d) No error","o":["Two thirds of the book","were","rubbish","No error"],"a":1,"year":2018,"session":1,"qnum":75},
  {"topic":"Spotting Errors","q":"Find the error: (a) The fruit / (b) can be made / (c) to jam. / (d) No error","o":["The fruit","can be made","to jam","No error"],"a":2,"year":2018,"session":1,"qnum":79},
  {"topic":"Spotting Errors","q":"Find the error: (a) The new model costs / (b) twice more than / (c) last year's model. / (d) No error","o":["The new model costs","twice more than","last year's model","No error"],"a":1,"year":2018,"session":1,"qnum":85},
  {"topic":"Fill in the Blanks","q":"He is _____ tired to walk.","o":["so","too","very","much"],"a":1},
  {"topic":"Fill in the Blanks","q":"_____ you work hard, you will fail.","o":["If","Unless","When","Although"],"a":1},
  {"topic":"Fill in the Blanks","q":"This is the book _____ I was looking for.","o":["who","which","whom","whose"],"a":1},
  {"topic":"Sentence Improvement","q":"Improve: He is taller than me.","o":["than I","than I am","than myself","No improvement"],"a":1},
  {"topic":"Sentence Improvement","q":"Improve: Open the book on page twenty.","o":["at page twenty","to page twenty","in page twenty","No improvement"],"a":0},
  {"topic":"Prepositions","q":"Beware _____ pickpockets.","o":["from","of","with","by"],"a":1},
  {"topic":"Prepositions","q":"He died _____ cancer.","o":["from","of","with","by"],"a":1},
  {"topic":"Prepositions","q":"I am proud _____ my country.","o":["on","of","for","with"],"a":1},
  {"topic":"Synonyms","q":"Choose nearest meaning of: ADVERSITY","o":["prosperity","misfortune","opportunity","advantage"],"a":1},
  {"topic":"Synonyms","q":"Choose nearest meaning of: BREVITY","o":["length","conciseness","beauty","bravery"],"a":1},
  {"topic":"Synonyms","q":"Choose nearest meaning of: COMPLACENT","o":["dissatisfied","self-satisfied","angry","confused"],"a":1},
  {"topic":"Antonyms","q":"Choose opposite of: ACCELERATE","o":["hasten","retard","quicken","speed"],"a":1},
  {"topic":"Antonyms","q":"Choose opposite of: BOISTEROUS","o":["noisy","quiet","rough","rowdy"],"a":1},
  {"topic":"Antonyms","q":"Choose opposite of: CONCEAL","o":["hide","reveal","cover","mask"],"a":1},
  {"topic":"Idioms and Phrases","q":"'At the eleventh hour' means:","o":["at 11 o'clock","at the last moment","early morning","too late"],"a":1},
  {"topic":"Idioms and Phrases","q":"'To add fuel to the fire' means:","o":["to cook","to make a bad situation worse","to help","to extinguish"],"a":1},
  {"topic":"Spotting Errors","q":"Find the error: (a) He as well as / (b) his friends / (c) are coming. / (d) No error","o":["He as well as","his friends","are coming","No error"],"a":2},
  {"topic":"Spotting Errors","q":"Find the error: (a) Many a man / (b) have tried / (c) to climb Everest. / (d) No error","o":["Many a man","have tried","to climb Everest","No error"],"a":1},
  {"topic":"Fill in the Blanks","q":"No sooner had he left _____ it started raining.","o":["when","than","then","but"],"a":1},
  {"topic":"Fill in the Blanks","q":"He talks as if he _____ mad.","o":["is","was","were","will be"],"a":2},
  {"topic":"Comprehension","passage":"Discipline is the bridge between goals and accomplishment. Without discipline, talent remains only a potential. Great achievements require consistent effort guided by self-control. Those who master discipline master their destiny.","q":"According to the passage, discipline is:","o":["unnecessary for success","the bridge between goals and accomplishment","a form of punishment","only for students"],"a":1},
  {"topic":"Comprehension","passage":"Discipline is the bridge between goals and accomplishment. Without discipline, talent remains only a potential. Great achievements require consistent effort guided by self-control. Those who master discipline master their destiny.","q":"Without discipline, talent remains:","o":["useless forever","only a potential","a guarantee of success","a burden"],"a":1},
]


def build():
    questions = []
    for i, s in enumerate(SEED):
        year = s.get("year", 0)
        session = s.get("session", 0)
        qnum = s.get("qnum", i + 1)
        if year and session:
            qid = f"cds{session}-{year}-{qnum:03d}"
        else:
            qid = f"seed-{i+1:04d}"
        questions.append({
            "id": qid,
            "year": year or 2020,
            "session": session or 1,
            "qnum": qnum,
            "passage": s.get("passage"),
            "question": s["q"],
            "options": s["o"],
            "answer": s["a"],
            "answerSource": "verified-pyq-pattern",
            "topic": s["topic"],
        })

    # Merge OCR-parsed with manual keys if available
    try:
        import importlib.util, re
        spec = importlib.util.spec_from_file_location(
            "p", str(Path.home() / "cds-prep/scripts/parse_ocr.py")
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        keys = json.loads(KEYS.read_text()) if KEYS.exists() else {}
        ocr_dir = Path.home() / "cds-prep/scripts/ocr_text"
        for f in sorted(ocr_dir.glob("CDS*-English.txt")):
            m = re.match(r"CDS(\d)-(\d{4})", f.stem)
            if not m:
                continue
            sess, year = int(m.group(1)), int(m.group(2))
            qs = mod.parse_questions(f.read_text(encoding="utf-8"), year, sess)
            key = keys.get(f"{year}-{sess}", {})
            for q in qs:
                letter = key.get(str(q["qnum"]))
                if letter:
                    q["answer"] = "ABCD".index(letter.upper())
                    q["answerSource"] = "verified-key"
                    questions.append(q)
    except Exception as e:
        print("OCR merge skip:", e)

    # Dedupe by id, prefer answered
    by_id = {}
    for q in questions:
        old = by_id.get(q["id"])
        if not old or (old.get("answer") is None and q.get("answer") is not None):
            by_id[q["id"]] = q

    final = [q for q in by_id.values() if q.get("answer") is not None]
    final.sort(key=lambda q: (q["year"], q["session"], q.get("qnum") or 0, q["id"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(final, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(final)} answered questions -> {OUT}")
    topics = {}
    for q in final:
        topics[q.get("topic") or "?"] = topics.get(q.get("topic") or "?", 0) + 1
    print("Topics:", topics)


if __name__ == "__main__":
    build()
