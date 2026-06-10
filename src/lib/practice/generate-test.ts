import { randomUUID } from 'node:crypto';
import {
  generateForCurriculum,
  loadUnionCurriculum,
  type QuestionType,
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

// Which underlying LLM generator backs each paper exercise kind. circle_word and
// write_word both come from the MCQ generator (a sentence with a blank); they
// only differ in how the page renders them.
const TYPE_TO_GENERATOR: Record<TestExerciseType, QuestionType> = {
  circle_word: 'fill_blank_mcq',
  write_word: 'fill_blank_mcq',
  true_false: 'true_false',
  unscramble: 'sentence_builder',
};

// Fisher–Yates. Used to scramble unscramble tokens for display; the canonical
// sentence is preserved separately in correctAnswer for the answer key.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
// item gets a stable id (so a single item's image can be regenerated later) and
// imageUrl: null (a background pass fills these in after the row is saved).
export async function generateTest(params: GenerateTestParams): Promise<GenerateTestResult> {
  const units = [...new Set(params.units)].filter((u) => Number.isInteger(u));
  if (units.length === 0) {
    throw new Error('Pick at least one unit.');
  }

  const curriculum = await loadUnionCurriculum(params.bookSlug, units);
  if (!curriculum) {
    throw new Error(
      `No curated curriculum for ${params.bookSlug} units ${units.join(', ')}.`,
    );
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

  // Fan out one generation call per section. Promise.allSettled so a single
  // section failing (e.g. transient LLM error) doesn't sink the whole test.
  const settled = await Promise.allSettled(
    entries.map((entry) =>
      generateForCurriculum({
        curriculum,
        questionType: TYPE_TO_GENERATOR[entry.type],
        count: entry.count,
      }),
    ),
  );

  const sections: TestSection[] = [];
  const sectionStats: GenerateTestResult['sectionStats'] = [];

  settled.forEach((outcome, i) => {
    const entry = entries[i];
    const generated = outcome.status === 'fulfilled' ? outcome.value : [];
    sectionStats.push({ type: entry.type, requested: entry.count, produced: generated.length });
    if (generated.length === 0) return;

    const items: TestItem[] = generated.map((q) => {
      const base: TestItem = {
        id: randomUUID(),
        prompt: q.prompt,
        correctAnswer: q.correctAnswer,
        distractors: entry.type === 'circle_word' ? q.distractors : [],
        imagePrompt: q.imagePrompt ?? null,
        imageUrl: null,
      };
      if (entry.type === 'unscramble') {
        const tokens = Array.isArray(q.payload?.tokens) ? (q.payload!.tokens as string[]) : [];
        base.tokens = shuffle(tokens);
      }
      return base;
    });

    sections.push({
      type: entry.type,
      instruction: EXERCISE_META[entry.type].instruction,
      items,
    });
  });

  if (sections.length === 0) {
    throw new Error('The generator returned no usable questions. Try again.');
  }

  const document: TestDocument = { sections };
  return { document, sectionStats };
}
