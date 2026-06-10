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
// generator) but lay out differently on the page.
export type TestExerciseType =
  | 'circle_word' // sentence with a blank; student circles the right word from choices
  | 'write_word' // sentence with a blank; student writes the word (choices hidden)
  | 'true_false' // statement; student circles True or False
  | 'unscramble'; // shuffled word tokens; student writes the sentence in order

export type TestItem = {
  // Stable id so per-item image regeneration can target one item inside the blob.
  id: string;
  // The sentence/statement. For circle_word/write_word it contains a "____" blank.
  prompt: string;
  correctAnswer: string;
  // Wrong choices (circle_word only). Empty for the other kinds.
  distractors: string[];
  // Canonical-order word tokens (unscramble only). The page shows them shuffled.
  tokens?: string[];
  imagePrompt: string | null;
  imageUrl: string | null;
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
};

export const ALL_EXERCISE_TYPES: TestExerciseType[] = [
  'circle_word',
  'write_word',
  'true_false',
  'unscramble',
];

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
