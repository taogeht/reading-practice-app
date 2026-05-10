// Reading-level definitions for the Raz-Kids-style reading practice feature.
//
// Lives as a code constant rather than a DB table — the level IDs are referenced
// by future readingPassages rows, but the rules themselves (vocab cap, sentence
// cap, page count, allowed grammar) are read by the generator + validator and
// don't need cross-team mutation. Single source of truth: this file.
//
// Levels target K–Grade 4 ESL learners, mapped to the school's American
// Family & Friends progression (Starter → Grade 4). All numbers are starting
// values to be tuned after the first generated stories — comments call out
// the rationale so a reviewer knows why a knob was set the way it was.

export const READING_LEVELS = [
  {
    id: 1,
    name: 'Emerging',
    targetAfFLevel: 'starter',
    // K-level / pre-Grade 1. Single-clause sight-word sentences, no tense
    // variation. Pages are short so kids can finish in a sitting.
    maxSentenceWords: 5,
    avgSentenceWords: 4,
    pageCount: { min: 6, max: 8 },
    wordsPerPage: { min: 8, max: 15 },
    vocabConstraints: {
      cumulativeCefrCap: 'A1',
      allowedPartsOfSpeech: [
        'noun',
        'verb',
        'adjective',
        'pronoun',
        'determiner',
        'preposition',
        'interjection',
      ],
    },
    grammarConstraints: {
      allowContractions: false,
      allowPastTense: false,
      allowFutureTense: false,
      allowConditionals: false,
      allowPhrasalVerbs: false,
      maxClausesPerSentence: 1,
    },
    targetVocabPerStory: 4,
    // Sequence ordering is too cognitively demanding at this level —
    // dropped here, reintroduced from Level 3. Total stays at 5.
    questionTypeMix: { mcq_comprehension: 4, vocab_matching: 1, sequence_order: 0 },
  },
  {
    id: 2,
    name: 'Early',
    targetAfFLevel: 'grade1',
    // Grade 1. Past tense introduced, basic conjunctions ("and", "but"),
    // contractions OK. Still single-clause-mostly to keep cognitive load low.
    maxSentenceWords: 8,
    avgSentenceWords: 6,
    pageCount: { min: 8, max: 10 },
    wordsPerPage: { min: 12, max: 20 },
    vocabConstraints: {
      cumulativeCefrCap: 'A1',
      allowedPartsOfSpeech: [
        'noun',
        'verb',
        'adjective',
        'adverb',
        'pronoun',
        'determiner',
        'preposition',
        'conjunction',
        'interjection',
      ],
    },
    grammarConstraints: {
      allowContractions: true,
      allowPastTense: true,
      allowFutureTense: false,
      allowConditionals: false,
      allowPhrasalVerbs: false,
      maxClausesPerSentence: 1,
    },
    targetVocabPerStory: 5,
    // Same as Level 1 — sequence ordering deferred until Level 3.
    questionTypeMix: { mcq_comprehension: 4, vocab_matching: 1, sequence_order: 0 },
  },
  {
    id: 3,
    name: 'Developing',
    targetAfFLevel: 'grade2',
    // Grade 2. Future tense + simple phrasal verbs, two-clause sentences.
    // CEFR cap rises to A2 so generator can use slightly less-frequent words.
    maxSentenceWords: 10,
    avgSentenceWords: 7,
    pageCount: { min: 10, max: 12 },
    wordsPerPage: { min: 18, max: 25 },
    vocabConstraints: {
      cumulativeCefrCap: 'A2',
      allowedPartsOfSpeech: [
        'noun',
        'verb',
        'adjective',
        'adverb',
        'pronoun',
        'determiner',
        'preposition',
        'conjunction',
        'interjection',
      ],
    },
    grammarConstraints: {
      allowContractions: true,
      allowPastTense: true,
      allowFutureTense: true,
      allowConditionals: false,
      allowPhrasalVerbs: true,
      maxClausesPerSentence: 2,
    },
    targetVocabPerStory: 6,
    // Sequence ordering returns at Level 3 — kids can hold a 4-event
    // narrative in working memory and reorder it.
    questionTypeMix: { mcq_comprehension: 3, vocab_matching: 1, sequence_order: 1 },
  },
  {
    id: 4,
    name: 'Fluent',
    targetAfFLevel: 'grade3',
    // Grade 3. Zero/first conditionals introduced, all POS unlocked.
    // Stories long enough to support a small narrative arc.
    maxSentenceWords: 14,
    avgSentenceWords: 9,
    pageCount: { min: 12, max: 14 },
    wordsPerPage: { min: 25, max: 35 },
    vocabConstraints: {
      cumulativeCefrCap: 'A2',
      allowedPartsOfSpeech: [
        'noun',
        'verb',
        'adjective',
        'adverb',
        'pronoun',
        'determiner',
        'preposition',
        'conjunction',
        'interjection',
        'other',
      ],
    },
    grammarConstraints: {
      allowContractions: true,
      allowPastTense: true,
      allowFutureTense: true,
      allowConditionals: true,
      allowPhrasalVerbs: true,
      maxClausesPerSentence: 2,
    },
    targetVocabPerStory: 6,
    questionTypeMix: { mcq_comprehension: 3, vocab_matching: 1, sequence_order: 1 },
  },
  {
    id: 5,
    name: 'Confident',
    targetAfFLevel: 'grade4',
    // Grade 4. CEFR up to B1, three-clause sentences, full grammar set.
    // The ceiling for the K–G4 band the rest of the app currently serves.
    maxSentenceWords: 18,
    avgSentenceWords: 11,
    pageCount: { min: 14, max: 16 },
    wordsPerPage: { min: 30, max: 45 },
    vocabConstraints: {
      cumulativeCefrCap: 'B1',
      allowedPartsOfSpeech: [
        'noun',
        'verb',
        'adjective',
        'adverb',
        'pronoun',
        'determiner',
        'preposition',
        'conjunction',
        'interjection',
        'other',
      ],
    },
    grammarConstraints: {
      allowContractions: true,
      allowPastTense: true,
      allowFutureTense: true,
      allowConditionals: true,
      allowPhrasalVerbs: true,
      maxClausesPerSentence: 3,
    },
    targetVocabPerStory: 7,
    questionTypeMix: { mcq_comprehension: 3, vocab_matching: 1, sequence_order: 1 },
  },
] as const;

export type ReadingLevel = (typeof READING_LEVELS)[number];
export type ReadingLevelId = ReadingLevel['id'];

/** Per-level question-type mix. The three counts must sum to 5 (total
 *  questions per passage). Sequence ordering is dropped at Levels 1-2
 *  because reordering 4-5 narrative events demands more working memory
 *  than a Grade 1 ESL student reliably has; it returns at Level 3 once
 *  short-text-comprehension fluency is established. */
export interface QuestionTypeMix {
  mcq_comprehension: number;
  vocab_matching: number;
  sequence_order: number;
}

export function getReadingLevel(id: number): ReadingLevel {
  const level = READING_LEVELS.find((l) => l.id === id);
  if (!level) {
    throw new Error(`Unknown reading level id: ${id}`);
  }
  return level;
}

/** Sugar wrapper around getReadingLevel — pulls the questionTypeMix
 *  field. Both Stage 4 (generation) and Stage 5 (validation) consume
 *  this so neither has to re-derive the mix. */
export function getQuestionTypeMix(levelId: number): QuestionTypeMix {
  return getReadingLevel(levelId).questionTypeMix;
}

// AF&F levels above Grade 4 (grade5, grade6) currently have no reading-level
// mapping — those students can use Confident as a ceiling until we extend the
// ladder. Returns undefined for unknown inputs so callers can fall back.
export function getLevelByAfFLevel(afFLevel: string): ReadingLevel | undefined {
  return READING_LEVELS.find((l) => l.targetAfFLevel === afFLevel);
}
