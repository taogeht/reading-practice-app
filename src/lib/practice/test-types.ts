// Shared shapes for printable practice tests (the "generated_tests" feature).
//
// A test is a single saved worksheet: an ordered list of sections, each section
// a batch of same-kind items. The whole document is stored as one jsonb blob on
// `generated_tests.document` — we never query individual items (a test is
// printed as a unit, not served item-by-item like practice_questions), so a
// blob is the right shape.
//
// Pure types only — safe to import from schema.ts ($type) and the generator
// without creating a runtime import cycle.

// The paper exercise kind drives RENDERING. Several kinds are backed by the same
// underlying LLM generator (circle_word and write_word both come from the MCQ
// generator) but lay out differently on the page. The `listen_*` kinds carry
// audio (TTS) the teacher plays aloud — the prompt/statement is SPOKEN, not
// printed, so the student must listen rather than read.
export type TestExerciseType =
  | 'circle_word' // sentence with a blank; student circles the right word from choices
  | 'write_word' // sentence with a blank; student writes the word (choices hidden)
  | 'true_false' // statement; student circles True or False
  | 'unscramble' // shuffled word tokens; student writes the sentence in order
  | 'listen_circle_word' // hear a word; circle it among printed choices
  | 'listen_true_false'; // hear a statement about the picture; circle True or False

export type TestItem = {
  // Stable id so per-item image/audio regeneration can target one item in the blob.
  id: string;
  // The sentence/statement. For circle_word/write_word it contains a "____" blank.
  // For listen_* this is the teacher's reference text; it is NOT printed.
  prompt: string;
  correctAnswer: string;
  // Wrong choices (circle_word + listen_circle_word). Empty for the other kinds.
  distractors: string[];
  // Canonical-order word tokens (unscramble only). The page shows them shuffled.
  tokens?: string[];
  imagePrompt: string | null;
  imageUrl: string | null;
  // What the teacher's audio speaks (listen_* only). null for printed-text kinds.
  audioText?: string | null;
  // Generated TTS clip (R2 proxy url), populated in the background like imageUrl.
  audioUrl?: string | null;
};

export type TestSection = {
  type: TestExerciseType;
  // Student-facing instruction line, e.g. "Circle the correct word."
  instruction: string;
  items: TestItem[];
};

export type TestDocument = {
  sections: TestSection[];
};

// One entry of the requested composition (how many items of each exercise kind).
export type TestComposition = Array<{ type: TestExerciseType; count: number }>;

// Human labels + default instruction lines, single source of truth for UI + gen.
export const EXERCISE_META: Record<
  TestExerciseType,
  { label: string; instruction: string }
> = {
  circle_word: { label: 'Circle the word', instruction: 'Circle the correct word.' },
  write_word: { label: 'Write the word', instruction: 'Write the missing word.' },
  true_false: { label: 'True or False', instruction: 'Circle True or False.' },
  unscramble: { label: 'Put in order', instruction: 'Write the words in order.' },
  listen_circle_word: {
    label: 'Listen & circle',
    instruction: 'Listen and circle the word you hear.',
  },
  listen_true_false: {
    label: 'Listen: True/False',
    instruction: 'Listen and circle True or False.',
  },
};

// Reading kinds print all their text; listening kinds carry teacher-played audio
// and hide the spoken text on the printout. The UI groups the picker by these.
export const READING_EXERCISE_TYPES: TestExerciseType[] = [
  'circle_word',
  'write_word',
  'true_false',
  'unscramble',
];

export const LISTENING_EXERCISE_TYPES: TestExerciseType[] = [
  'listen_circle_word',
  'listen_true_false',
];

export const ALL_EXERCISE_TYPES: TestExerciseType[] = [
  ...READING_EXERCISE_TYPES,
  ...LISTENING_EXERCISE_TYPES,
];

export function isListeningType(t: TestExerciseType): boolean {
  return (LISTENING_EXERCISE_TYPES as string[]).includes(t);
}

// Sensible default worksheet: ~13 items, about a page and a half before the key.
export const DEFAULT_COMPOSITION: TestComposition = [
  { type: 'circle_word', count: 4 },
  { type: 'write_word', count: 3 },
  { type: 'true_false', count: 3 },
  { type: 'unscramble', count: 3 },
];

export function isTestExerciseType(v: unknown): v is TestExerciseType {
  return typeof v === 'string' && (ALL_EXERCISE_TYPES as string[]).includes(v);
}
