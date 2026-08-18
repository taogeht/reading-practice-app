import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  readingPassages,
  readingQuestions,
  storyPages,
  type PassageGenerationMeta,
} from '@/lib/db/schema';
import { applyOverridesToLevel, getReadingLevel } from './levels';
import {
  assertPassagePlanMatchesRequest,
  PassagePlanSchema,
  validatePagesProse,
  validateQuestions,
  type GeneratedQuestion,
  type GenerateOverrides,
} from './generate';
import { fetchTargetVocab, resolveCumulativeVocab } from './generate/vocab';

const PROSE_QUALITY_FLOOR = 0.7;
const QUESTIONS_QUALITY_FLOOR = 0.5;

export interface PublicationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export type PassagePublicationAssessment =
  | { found: false }
  | {
      found: true;
      passageId: string;
      currentStatus: 'draft' | 'review' | 'published' | 'archived';
      snapshotUpdatedAt: Date;
      publishable: boolean;
      issues: PublicationIssue[];
      qualityReport: {
        proseScore: number;
        questionsScore: number;
        imagesValid: boolean;
        passageReady: boolean;
      };
      generationMeta: PassageGenerationMeta;
    };

/**
 * Reload and assess the complete, current passage aggregate. This is the one
 * interface the publication route needs to learn; plan, prose, question, and
 * asset invariants stay local to this module.
 */
export async function assessPassageForPublication(
  passageId: string,
): Promise<PassagePublicationAssessment> {
  const [passage] = await db
    .select()
    .from(readingPassages)
    .where(eq(readingPassages.id, passageId))
    .limit(1);
  if (!passage) return { found: false };

  const [pages, questionRows] = await Promise.all([
    db
      .select()
      .from(storyPages)
      .where(eq(storyPages.passageId, passageId))
      .orderBy(storyPages.pageNumber),
    db
      .select()
      .from(readingQuestions)
      .where(eq(readingQuestions.passageId, passageId))
      .orderBy(readingQuestions.orderIndex),
  ]);

  const issues: PublicationIssue[] = [];
  const generationMeta =
    (passage.generationMeta as PassageGenerationMeta | null) ?? {};
  const overrides = generationMeta.overridesUsed as GenerateOverrides | undefined;
  const effectiveLevel = applyOverridesToLevel(
    getReadingLevel(passage.readingLevel),
    overrides,
  );

  const planResult = PassagePlanSchema.safeParse(generationMeta.plan);
  if (!planResult.success) {
    addError(issues, 'plan_missing_or_invalid', 'The stored story plan is missing or invalid.');
  }

  const targetVocabIds = Array.isArray(passage.targetVocabIds)
    ? passage.targetVocabIds.filter((id): id is string => typeof id === 'string')
    : [];
  if (targetVocabIds.length === 0) {
    addError(issues, 'target_vocabulary_missing', 'The passage has no target vocabulary.');
  }

  if (planResult.success) {
    try {
      assertPassagePlanMatchesRequest(planResult.data, {
        pageCount: effectiveLevel.pageCount,
        requiredTargetVocabIds: targetVocabIds,
      });
    } catch (error) {
      addError(
        issues,
        'plan_request_mismatch',
        error instanceof Error ? error.message : 'The story plan does not match its request.',
      );
    }
  }

  if (passage.pageCount !== pages.length) {
    addError(
      issues,
      'page_count_mismatch',
      `Passage says it has ${passage.pageCount} pages but ${pages.length} page rows exist.`,
    );
  }
  const pageNumbersSequential = pages.every(
    (page, index) => page.pageNumber === index + 1,
  );
  if (!pageNumbersSequential) {
    addError(issues, 'page_numbers_invalid', 'Page numbers must be sequential from 1.');
  }
  const questionOrderSequential = questionRows.every(
    (question, index) => question.orderIndex === index,
  );
  if (!questionOrderSequential) {
    addError(
      issues,
      'question_order_invalid',
      'Question order indexes must be sequential from 0.',
    );
  }

  const pagesWithoutImages = pages
    .filter((page) => !page.imageKey)
    .map((page) => page.pageNumber);
  if (!passage.coverImageKey) {
    addError(issues, 'cover_image_missing', 'The passage has no cover image.');
  }
  if (pagesWithoutImages.length > 0) {
    addError(
      issues,
      'page_images_missing',
      `Missing illustrations for page${pagesWithoutImages.length === 1 ? '' : 's'} ${pagesWithoutImages.join(', ')}.`,
    );
  }

  let proseScore = 0;
  let questionsScore = 0;

  if (planResult.success && targetVocabIds.length > 0) {
    try {
      const targetRows = await fetchTargetVocab(targetVocabIds);
      const cumulativeRows = await resolveCumulativeVocab(targetRows, undefined);
      const prosePages = pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
      }));

      const proseValidation = validatePagesProse(
        prosePages,
        planResult.data,
        passage.readingLevel,
        cumulativeRows.map((row) => ({ id: row.id, word: row.word })),
        targetRows.map((row) => ({ id: row.id, word: row.word })),
        overrides,
      );
      proseScore = proseValidation.qualityScore;
      for (const issue of proseValidation.issues) {
        issues.push({
          severity: issue.severity,
          code: `prose.${issue.type}`,
          message: describeValidationIssue(issue),
        });
      }

      const questions: GeneratedQuestion[] = [];
      for (const row of questionRows) {
        const mapped = mapQuestionRow(row);
        if (mapped) {
          questions.push(mapped);
        } else {
          addError(
            issues,
            'question_payload_invalid',
            `Question ${row.orderIndex + 1} has an invalid payload.`,
          );
        }
      }

      const questionValidation = validateQuestions(
        questions,
        prosePages,
        targetRows.map((row) => ({ id: row.id, word: row.word })),
        cumulativeRows,
        passage.readingLevel,
        passageId,
        effectiveLevel,
      );
      questionsScore = questionValidation.qualityScore;
      for (const issue of questionValidation.issues) {
        issues.push({
          severity: issue.severity,
          code: `questions.${issue.type}`,
          message: describeValidationIssue(issue),
        });
      }
    } catch (error) {
      addError(
        issues,
        'validation_failed',
        error instanceof Error ? error.message : 'Passage validation failed.',
      );
    }
  }

  if (proseScore < PROSE_QUALITY_FLOOR) {
    addError(
      issues,
      'prose_quality_below_floor',
      `Prose quality ${proseScore.toFixed(2)} is below ${PROSE_QUALITY_FLOOR.toFixed(2)}.`,
    );
  }
  if (questionsScore < QUESTIONS_QUALITY_FLOOR) {
    addError(
      issues,
      'question_quality_below_floor',
      `Question quality ${questionsScore.toFixed(2)} is below ${QUESTIONS_QUALITY_FLOOR.toFixed(2)}.`,
    );
  }

  const imagesValid = Boolean(passage.coverImageKey) && pagesWithoutImages.length === 0;
  const passageReady = !issues.some((issue) => issue.severity === 'error');

  return {
    found: true,
    passageId,
    currentStatus: passage.status,
    snapshotUpdatedAt: passage.updatedAt,
    publishable: passage.status === 'review' && passageReady,
    issues,
    qualityReport: {
      proseScore,
      questionsScore,
      imagesValid,
      passageReady,
    },
    generationMeta,
  };
}

function addError(
  issues: PublicationIssue[],
  code: string,
  message: string,
): void {
  issues.push({ severity: 'error', code, message });
}

function describeValidationIssue(issue: { type: string }): string {
  return `Validation reported ${issue.type.replaceAll('_', ' ')}.`;
}

function mapQuestionRow(
  row: typeof readingQuestions.$inferSelect,
): GeneratedQuestion | null {
  if (row.questionType === 'mcq_comprehension') {
    if (!isRecord(row.payload)) return null;
    const payload = row.payload;
    if (
      !Array.isArray(payload.options) ||
      !payload.options.every((option) => typeof option === 'string') ||
      !Number.isInteger(payload.correctIndex) ||
      typeof row.evidenceQuote !== 'string' ||
      !Number.isInteger(row.evidencePageNumber)
    ) {
      return null;
    }
    return {
      type: 'mcq_comprehension',
      questionText: row.questionText,
      orderIndex: row.orderIndex,
      payload: {
        options: payload.options as string[],
        correctIndex: payload.correctIndex as number,
      },
      evidenceQuote: row.evidenceQuote,
      evidencePageNumber: row.evidencePageNumber as number,
    };
  }

  if (row.questionType === 'vocab_matching') {
    if (!isRecord(row.payload)) return null;
    const payload = row.payload;
    if (payload.version !== 2 || !Array.isArray(payload.pairs)) return null;
    const pairs = payload.pairs;
    if (
      !pairs.every(
        (pair) =>
          isRecord(pair) &&
          typeof pair.word === 'string' &&
          typeof pair.vocabId === 'string' &&
          typeof pair.imageKey === 'string',
      )
    ) {
      return null;
    }
    return {
      type: 'vocab_matching',
      questionText: row.questionText,
      orderIndex: row.orderIndex,
      payload: {
        version: 2,
        pairs: pairs as Array<{ word: string; vocabId: string; imageKey: string }>,
      },
    };
  }

  if (row.questionType !== 'sequence_order' || !isRecord(row.payload)) {
    return null;
  }
  const payload = row.payload;
  if (
    !Array.isArray(payload.events) ||
    !payload.events.every((event) => typeof event === 'string')
  ) {
    return null;
  }
  return {
    type: 'sequence_order',
    questionText: row.questionText,
    orderIndex: row.orderIndex,
    payload: { events: payload.events as string[] },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
