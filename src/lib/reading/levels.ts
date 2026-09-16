// Reading-level definitions for the Raz-Kids-style reading practice feature.
//
// Lives as a code constant rather than a DB table — the level IDs are referenced
// by future readingPassages rows, but the rules themselves (vocab cap, sentence
// cap, page count, allowed grammar) are read by the generator + validator and
// don't need cross-team mutation. Single source of truth: this file.
//
// Level N maps one-to-one onto Family and Friends N: level 1 is FF1, level 5
// is FF5. There is deliberately no Starter level — the school's ladder begins
// at Grade 1. All numbers are starting values to be tuned against generated
// stories; comments call out the rationale so a reviewer knows why a knob was
// set the way it was.

export const READING_LEVELS = [
  {
    id: 0,
    name: 'Starter',
    targetAfFLevel: 'starter',
    // Kindergarten / Pre-K / Early ESL emergent readers. Ultra-simple repetitive
    // sentence frames ("I can jump", "It is a ball"), basic pronouns, concrete nouns.
    maxSentenceWords: 5,
    avgSentenceWords: 4,
    pageCount: { min: 6, max: 8 },
    wordsPerPage: { min: 3, max: 8 },
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
      allowContractions: false,
      allowPastTense: false,
      allowFutureTense: false,
      allowConditionals: false,
      allowPhrasalVerbs: false,
      maxClausesPerSentence: 1,
    },
    targetVocabPerStory: 3,
    questionTypeMix: { mcq_comprehension: 2, vocab_matching: 1, sequence_order: 0 },
  },
  {
    id: 1,
    name: 'Early',
    targetAfFLevel: 'grade1',
    // Grade 1 / Family and Friends 1. Present simple, present continuous,
    // imperatives, "can", "let's". Basic conjunctions ("and", "but"), contractions OK.
    // Zero past tense taught in FF1 — stories must be in present tense. Single-clause.
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
      allowPastTense: false,
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
    id: 2,
    name: 'Developing',
    targetAfFLevel: 'grade2',
    // Grade 2 / Family and Friends 2. Present tense reinforced ("have got", "like/don't like").
    // Future tense ("going to") + simple phrasal verbs, two-clause sentences.
    // General past tense is deferred (FF2 only introduces was/were in Units 14-15;
    // general regular past actions begin in Grade 3).
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
      allowPastTense: false,
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
    id: 3,
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
    id: 4,
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
  {
    id: 5,
    name: 'Advanced',
    targetAfFLevel: 'grade5',
    // Grade 5 / Family and Friends 5. The top of the ladder. Defined so
    // getReadingLevel(5) resolves and the UI can offer the level, but no
    // grade5 vocabulary is seeded yet — generation at this level will
    // throw on target selection until FF5 goes through the curriculum
    // extraction workflow. Numbers extrapolate the Grade 4 step.
    maxSentenceWords: 20,
    avgSentenceWords: 13,
    pageCount: { min: 16, max: 18 },
    wordsPerPage: { min: 35, max: 55 },
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
    targetVocabPerStory: 8,
    questionTypeMix: { mcq_comprehension: 3, vocab_matching: 1, sequence_order: 1 },
  },
] as const;

export type ReadingLevel = (typeof READING_LEVELS)[number];
export type ReadingLevelId = ReadingLevel['id'];

/** Per-level question-type mix. The three counts must sum to 5 (total
 *  questions per passage). Sequence ordering is dropped at Level 1
 *  because reordering 4-5 narrative events demands more working memory
 *  than a Grade 1 ESL student reliably has; it returns at Level 2 once
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

// ---------- Override application ----------
//
// The teacher-facing generation page accepts overrides for length,
// sentence cap, grammar toggles, and so on. We model the effective
// configuration the rest of the pipeline reads as a level-shaped
// object — the unchanged fields come from the canonical level, the
// overridden fields are swapped in. Everything downstream
// (plan/prose/validate) reads from this object as if it were the
// level. Avoids threading individual overrides through every
// signature.
//
// What stays canonical regardless of overrides:
//   - vocabConstraints (CEFR cap, allowed parts of speech) — these
//     are the pedagogical guarantee of leveled reading.
//   - id / name / targetAfFLevel / avgSentenceWords — identity +
//     soft targets the model treats as hints.

import type { GenerateOverrides, ThemeSource, StoryLength } from './generate/types';
import { CHARACTER_CASTS, isCastId } from './names';

export interface StoryLengthConfig {
  pageCount: { min: number; max: number };
  wordsPerPage: { min: number; max: number };
}

export const STORY_LENGTH_MATRIX: Record<number, Record<StoryLength, StoryLengthConfig>> = {
  0: {
    short: { pageCount: { min: 5, max: 6 }, wordsPerPage: { min: 3, max: 5 } },
    medium: { pageCount: { min: 6, max: 8 }, wordsPerPage: { min: 3, max: 8 } },
    long: { pageCount: { min: 8, max: 10 }, wordsPerPage: { min: 4, max: 8 } },
  },
  1: {
    short: { pageCount: { min: 6, max: 8 }, wordsPerPage: { min: 8, max: 12 } },
    medium: { pageCount: { min: 8, max: 10 }, wordsPerPage: { min: 12, max: 20 } },
    long: { pageCount: { min: 10, max: 12 }, wordsPerPage: { min: 16, max: 22 } },
  },
  2: {
    short: { pageCount: { min: 8, max: 10 }, wordsPerPage: { min: 14, max: 18 } },
    medium: { pageCount: { min: 10, max: 12 }, wordsPerPage: { min: 18, max: 25 } },
    long: { pageCount: { min: 12, max: 14 }, wordsPerPage: { min: 22, max: 28 } },
  },
  3: {
    short: { pageCount: { min: 8, max: 10 }, wordsPerPage: { min: 20, max: 25 } },
    medium: { pageCount: { min: 12, max: 14 }, wordsPerPage: { min: 25, max: 35 } },
    long: { pageCount: { min: 14, max: 16 }, wordsPerPage: { min: 30, max: 40 } },
  },
  4: {
    short: { pageCount: { min: 10, max: 12 }, wordsPerPage: { min: 25, max: 35 } },
    medium: { pageCount: { min: 14, max: 16 }, wordsPerPage: { min: 30, max: 45 } },
    long: { pageCount: { min: 16, max: 18 }, wordsPerPage: { min: 35, max: 50 } },
  },
  5: {
    short: { pageCount: { min: 12, max: 14 }, wordsPerPage: { min: 28, max: 40 } },
    medium: { pageCount: { min: 16, max: 18 }, wordsPerPage: { min: 35, max: 55 } },
    long: { pageCount: { min: 18, max: 20 }, wordsPerPage: { min: 40, max: 60 } },
  },
};

export function resolveStoryLengthConfig(
  levelId: number,
  length?: StoryLength,
): StoryLengthConfig {
  const chosenLength: StoryLength = length ?? 'medium';
  const matrixForLevel = STORY_LENGTH_MATRIX[levelId] ?? STORY_LENGTH_MATRIX[1];
  return matrixForLevel[chosenLength] ?? matrixForLevel.medium;
}

/** Level-shaped object with overridden fields applied. The literal
 *  types from `as const READING_LEVELS` are widened here so callers
 *  can write to them. Otherwise structurally identical to ReadingLevel
 *  — the rest of the pipeline reads from these fields exactly as
 *  before and doesn't care it's a synthetic level. */
export interface EffectiveReadingLevel {
  id: number;
  name: string;
  targetAfFLevel: string;
  maxSentenceWords: number;
  avgSentenceWords: number;
  pageCount: { min: number; max: number };
  wordsPerPage: { min: number; max: number };
  vocabConstraints: {
    cumulativeCefrCap: string;
    allowedPartsOfSpeech: readonly string[];
  };
  grammarConstraints: {
    allowContractions: boolean;
    allowPastTense: boolean;
    allowFutureTense: boolean;
    allowConditionals: boolean;
    allowPhrasalVerbs: boolean;
    maxClausesPerSentence: number;
    allowWasWere?: boolean;
  };
  targetVocabPerStory: number;
  questionTypeMix: {
    mcq_comprehension: number;
    vocab_matching: number;
    sequence_order: number;
  };
}

export function applyOverridesToLevel(
  level: ReadingLevel,
  overrides: GenerateOverrides | undefined,
): EffectiveReadingLevel {
  // Spread-clone is shallow; nested objects (pageCount, wordsPerPage,
  // grammarConstraints, questionTypeMix) need their own copies so we
  // don't mutate the canonical READING_LEVELS entry.
  const out: EffectiveReadingLevel = {
    ...level,
    pageCount: { ...level.pageCount },
    wordsPerPage: { ...level.wordsPerPage },
    grammarConstraints: { ...level.grammarConstraints },
    questionTypeMix: { ...level.questionTypeMix },
    vocabConstraints: { ...level.vocabConstraints },
  };
  if (!overrides) return out;

  // Precedence Tier 2: Story Length preset ('short' | 'medium' | 'long')
  if (overrides.storyLength) {
    const lengthConfig = resolveStoryLengthConfig(level.id, overrides.storyLength);
    out.pageCount = { ...lengthConfig.pageCount };
    out.wordsPerPage = { ...lengthConfig.wordsPerPage };
  }

  // Precedence Tier 1: Explicit numerical overrides (highest precedence)
  if (typeof overrides.pageCount === 'number') {
    // Lock both ends to the single value the teacher chose so the
    // prose stage gets an exact target rather than a range.
    out.pageCount = { min: overrides.pageCount, max: overrides.pageCount };
  }
  if (typeof overrides.maxSentenceWords === 'number') {
    out.maxSentenceWords = overrides.maxSentenceWords;
  }
  if (typeof overrides.wordsPerPageMin === 'number') {
    out.wordsPerPage.min = overrides.wordsPerPageMin;
  }
  if (typeof overrides.wordsPerPageMax === 'number') {
    out.wordsPerPage.max = overrides.wordsPerPageMax;
  }
  if (typeof overrides.allowPastTense === 'boolean') {
    out.grammarConstraints.allowPastTense = overrides.allowPastTense;
  }
  if (typeof overrides.allowWasWere === 'boolean') {
    out.grammarConstraints.allowWasWere = overrides.allowWasWere;
  }
  if (typeof overrides.allowContractions === 'boolean') {
    out.grammarConstraints.allowContractions = overrides.allowContractions;
  }
  if (typeof overrides.allowPhrasalVerbs === 'boolean') {
    out.grammarConstraints.allowPhrasalVerbs = overrides.allowPhrasalVerbs;
  }
  if (typeof overrides.allowFutureTense === 'boolean') {
    out.grammarConstraints.allowFutureTense = overrides.allowFutureTense;
  }
  if (typeof overrides.targetVocabCount === 'number') {
    out.targetVocabPerStory = overrides.targetVocabCount;
  }
  if (overrides.questionTypeMix) {
    out.questionTypeMix = { ...overrides.questionTypeMix };
  }
  return out;
}

// ---------- Override validation ----------
//
// Returned to the API endpoint so the teacher gets human-readable
// errors before any generation kicks off. Bounds are universal
// (across all levels) and deliberately loose — teachers know their
// classes, so we trust them to set, say, "max 25 words per sentence
// at Level 1" if that's what their lesson needs.

interface OverrideValidationResult {
  valid: boolean;
  errors: string[];
}

const THEME_SOURCES: ThemeSource[] = ['unit_topic', 'custom', 'model_choice'];

const PAGE_COUNT_MIN = 3;
const PAGE_COUNT_MAX = 20;
const MAX_SENTENCE_WORDS_MIN = 3;
const MAX_SENTENCE_WORDS_MAX = 25;
const TARGET_VOCAB_COUNT_MIN = 1;
const TARGET_VOCAB_COUNT_MAX = 10;
const WORDS_PER_PAGE_MIN = 3;
const WORDS_PER_PAGE_MAX = 60;
const QUESTION_COUNT_MIN = 3;
const QUESTION_COUNT_MAX = 8;

export function validateOverrides(
  levelId: number,
  overrides: GenerateOverrides,
): OverrideValidationResult {
  const errors: string[] = [];
  let baseLevel: ReadingLevel;

  // Reject unknown level early; otherwise the rest of validation has
  // nothing to reference.
  try {
    baseLevel = getReadingLevel(levelId);
  } catch {
    errors.push(`Reading level ${levelId} is not valid.`);
    return { valid: false, errors };
  }

  if (overrides.pageCount !== undefined) {
    if (
      !Number.isInteger(overrides.pageCount) ||
      overrides.pageCount < PAGE_COUNT_MIN ||
      overrides.pageCount > PAGE_COUNT_MAX
    ) {
      errors.push(
        `Page count must be a whole number between ${PAGE_COUNT_MIN} and ${PAGE_COUNT_MAX}.`,
      );
    }
  }
  if (overrides.maxSentenceWords !== undefined) {
    if (
      !Number.isInteger(overrides.maxSentenceWords) ||
      overrides.maxSentenceWords < MAX_SENTENCE_WORDS_MIN ||
      overrides.maxSentenceWords > MAX_SENTENCE_WORDS_MAX
    ) {
      errors.push(
        `Sentence length cap must be between ${MAX_SENTENCE_WORDS_MIN} and ${MAX_SENTENCE_WORDS_MAX} words.`,
      );
    }
  }
  if (overrides.castId !== undefined && !isCastId(overrides.castId)) {
    errors.push(
      `Character cast "${overrides.castId}" is not valid. Choose one of: ${Object.keys(CHARACTER_CASTS).join(', ')}.`,
    );
  }
  if (overrides.themeSource !== undefined && !THEME_SOURCES.includes(overrides.themeSource)) {
    errors.push(
      `Theme source "${overrides.themeSource}" is not valid. Choose one of: ${THEME_SOURCES.join(', ')}.`,
    );
  }
  if (overrides.targetVocabCount !== undefined) {
    if (
      !Number.isInteger(overrides.targetVocabCount) ||
      overrides.targetVocabCount < TARGET_VOCAB_COUNT_MIN ||
      overrides.targetVocabCount > TARGET_VOCAB_COUNT_MAX
    ) {
      errors.push(
        `Target vocab count must be between ${TARGET_VOCAB_COUNT_MIN} and ${TARGET_VOCAB_COUNT_MAX}.`,
      );
    }
  }
  const wppMinSet = overrides.wordsPerPageMin !== undefined;
  const wppMaxSet = overrides.wordsPerPageMax !== undefined;
  if (wppMinSet || wppMaxSet) {
    const min = overrides.wordsPerPageMin ?? WORDS_PER_PAGE_MIN;
    const max = overrides.wordsPerPageMax ?? WORDS_PER_PAGE_MAX;
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min < WORDS_PER_PAGE_MIN ||
      max > WORDS_PER_PAGE_MAX
    ) {
      errors.push(
        `Words per page must be between ${WORDS_PER_PAGE_MIN} and ${WORDS_PER_PAGE_MAX}.`,
      );
    } else if (min > max) {
      errors.push(`Words per page minimum (${min}) cannot exceed maximum (${max}).`);
    }
  }
  if (overrides.questionCount !== undefined) {
    if (
      !Number.isInteger(overrides.questionCount) ||
      overrides.questionCount < QUESTION_COUNT_MIN ||
      overrides.questionCount > QUESTION_COUNT_MAX
    ) {
      errors.push(
        `Question count must be between ${QUESTION_COUNT_MIN} and ${QUESTION_COUNT_MAX}.`,
      );
    }
  }
  if (overrides.questionTypeMix) {
    const mix = overrides.questionTypeMix;
    const counts = [
      mix.mcq_comprehension,
      mix.vocab_matching,
      mix.sequence_order,
    ];
    if (counts.some((count) => !Number.isInteger(count))) {
      errors.push('Question type counts must be whole numbers.');
    }
    const sum =
      mix.mcq_comprehension + mix.vocab_matching + mix.sequence_order;
    const expected =
      overrides.questionCount ??
      baseLevel.questionTypeMix.mcq_comprehension +
        baseLevel.questionTypeMix.vocab_matching +
        baseLevel.questionTypeMix.sequence_order;
    if (sum !== expected) {
      errors.push(
        `Question type counts must add up to ${expected} (got ${sum}: ${mix.mcq_comprehension} MCQ + ${mix.vocab_matching} vocab matching + ${mix.sequence_order} sequence order).`,
      );
    }
    if (
      mix.mcq_comprehension < 0 ||
      mix.vocab_matching < 0 ||
      mix.sequence_order < 0
    ) {
      errors.push('Question type counts cannot be negative.');
    }
  } else if (
    overrides.questionCount !== undefined &&
    overrides.questionCount !==
      baseLevel.questionTypeMix.mcq_comprehension +
        baseLevel.questionTypeMix.vocab_matching +
        baseLevel.questionTypeMix.sequence_order
  ) {
    errors.push(
      'Changing the question count also requires a matching question type mix.',
    );
  }
  if (
    overrides.targetVocabSelectionMode === 'specific' &&
    (!overrides.targetVocabIds || overrides.targetVocabIds.length === 0)
  ) {
    errors.push(
      'Specific-words mode requires at least one selected vocabulary word.',
    );
  }
  if (
    overrides.targetVocabSelectionMode === 'random_unit' &&
    overrides.targetVocabUnit === undefined
  ) {
    errors.push('Random-from-unit mode requires a unit number.');
  }

  // Note: target-vocab-must-be-picturable when vocab_matching > 0 is
  // checked in the API endpoint (it needs DB access to look up
  // is_picturable on the supplied UUIDs). We document the contract here
  // so the UI knows to grey out unpicturable words pre-submission.

  return { valid: errors.length === 0, errors };
}
