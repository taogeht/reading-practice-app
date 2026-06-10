import { randomUUID } from 'node:crypto';
import {
  generateForCurriculum,
  loadUnionCurriculum,
  type QuestionType,
  type UnitCurriculum,
} from './generate';
import {
  EXERCISE_META,
  isTestExerciseType,
  type TestComposition,
  type TestDocument,
  type TestExerciseType,
  type TestItem,
  type TestSection,
} from './test-types';

// Which underlying LLM generator backs each exercise kind. circle_word and
// write_word both come from the MCQ generator; listen_true_false reuses the
// true/false generator (its statement is spoken, not printed). listen_circle_word
// has NO entry — it's built deterministically from unit vocabulary below.
const LLM_TYPE: Partial<Record<TestExerciseType, QuestionType>> = {
  circle_word: 'fill_blank_mcq',
  write_word: 'fill_blank_mcq',
  true_false: 'true_false',
  unscramble: 'sentence_builder',
  listen_true_false: 'true_false',
};

// Fisher–Yates. Used to scramble unscramble tokens for display and to sample
// listening vocabulary; the canonical answer is preserved separately.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sampleN<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, Math.max(0, n));
}

// Maps one LLM-generated question to a stored test item. imageUrl/audioUrl start
// null — background passes fill them in after the row is saved.
function mapGeneratedToItem(
  type: TestExerciseType,
  q: { prompt: string; correctAnswer: string; distractors: string[]; imagePrompt: string; payload?: Record<string, unknown> | null },
): TestItem {
  const item: TestItem = {
    id: randomUUID(),
    prompt: q.prompt,
    correctAnswer: q.correctAnswer,
    distractors: type === 'circle_word' ? q.distractors : [],
    imagePrompt: q.imagePrompt ?? null,
    imageUrl: null,
  };
  if (type === 'unscramble') {
    const tokens = Array.isArray(q.payload?.tokens) ? (q.payload!.tokens as string[]) : [];
    item.tokens = shuffle(tokens);
  }
  if (type === 'listen_true_false') {
    // The statement is spoken by the teacher, not printed; the picture is the
    // only visible content the student judges.
    item.audioText = q.prompt;
    item.audioUrl = null;
  }
  return item;
}

// Deterministic "listen and circle the word" items straight from unit vocabulary:
// the audio speaks the target word, the page prints it among same-unit distractors.
// No LLM — fully curriculum-faithful and reliable.
function buildListenCircleItems(curriculum: UnitCurriculum, count: number): TestItem[] {
  const pool = Array.from(
    new Set(
      curriculum.vocabulary
        .map((v) => v.word)
        .filter((w): w is string => typeof w === 'string' && w.trim().length > 0),
    ),
  );
  if (pool.length < 2) return [];

  const targets = sampleN(pool, Math.min(count, pool.length));
  return targets.map((word) => {
    const distractors = sampleN(
      pool.filter((w) => w !== word),
      3,
    );
    return {
      id: randomUUID(),
      prompt: word, // teacher reference; not printed
      correctAnswer: word,
      distractors,
      imagePrompt: null,
      imageUrl: null,
      audioText: word,
      audioUrl: null,
    };
  });
}

async function buildItemsForEntry(
  entry: TestComposition[number],
  curriculum: UnitCurriculum,
): Promise<TestItem[]> {
  if (entry.type === 'listen_circle_word') {
    return buildListenCircleItems(curriculum, entry.count);
  }
  const questionType = LLM_TYPE[entry.type];
  if (!questionType) return [];
  const generated = await generateForCurriculum({ curriculum, questionType, count: entry.count });
  return generated.map((q) => mapGeneratedToItem(entry.type, q));
}

export type GenerateTestParams = {
  bookSlug: string;
  units: number[];
  composition: TestComposition;
  title?: string;
};

export type GenerateTestResult = {
  document: TestDocument;
  // Per-exercise outcome so the caller can warn if a section came back short.
  sectionStats: Array<{ type: TestExerciseType; requested: number; produced: number }>;
};

// Builds a full printable test document: one section per composition entry,
// generated in parallel over the union of the chosen units' curriculum. Each
// item gets a stable id; imageUrl/audioUrl are filled by background passes after
// the row is saved.
export async function generateTest(params: GenerateTestParams): Promise<GenerateTestResult> {
  const units = [...new Set(params.units)].filter((u) => Number.isInteger(u));
  if (units.length === 0) {
    throw new Error('Pick at least one unit.');
  }

  const curriculum = await loadUnionCurriculum(params.bookSlug, units);
  if (!curriculum) {
    throw new Error(`No curated curriculum for ${params.bookSlug} units ${units.join(', ')}.`);
  }
  if (!curriculum.grammar_patterns?.length) {
    throw new Error(
      `The chosen units have no grammar patterns to build a test from (${params.bookSlug} units ${units.join(', ')}).`,
    );
  }

  // Keep only valid, positive-count entries; preserve the caller's ordering.
  const entries = params.composition.filter(
    (c) => isTestExerciseType(c.type) && Number.isInteger(c.count) && c.count > 0,
  );
  if (entries.length === 0) {
    throw new Error('Choose at least one exercise type with a count above zero.');
  }

  // Fan out one builder per section. Promise.allSettled so a single section
  // failing (e.g. transient LLM error) doesn't sink the whole test.
  const settled = await Promise.allSettled(
    entries.map((entry) => buildItemsForEntry(entry, curriculum)),
  );

  const sections: TestSection[] = [];
  const sectionStats: GenerateTestResult['sectionStats'] = [];

  settled.forEach((outcome, i) => {
    const entry = entries[i];
    const items = outcome.status === 'fulfilled' ? outcome.value : [];
    sectionStats.push({ type: entry.type, requested: entry.count, produced: items.length });
    if (items.length === 0) return;
    sections.push({
      type: entry.type,
      instruction: EXERCISE_META[entry.type].instruction,
      items,
    });
  });

  if (sections.length === 0) {
    throw new Error('The generator returned no usable questions. Try again.');
  }

  return { document: { sections }, sectionStats };
}
