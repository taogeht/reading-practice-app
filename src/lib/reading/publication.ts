import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  readingPassages,
  readingQuestions,
  storyPages,
  vocabulary,
  type PassageGenerationMeta,
} from '@/lib/db/schema';
import { applyOverridesToLevel, getReadingLevel } from './levels';
import {
  assertPassagePlanMatchesRequest,
  PassagePlanSchema,
  resolvePageIllustrationPlan,
  validatePagesProse,
  validateQuestions,
  type GeneratedQuestion,
  type GenerateOverrides,
  type IllustrationDensity,
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

  const isCustomPassage =
    generationMeta.promptVersion === 'reading-passage-custom-v1' ||
    targetVocabIds.length === 0;

  if (!isCustomPassage && targetVocabIds.length === 0) {
    addError(issues, 'target_vocabulary_missing', 'The passage has no target vocabulary.');
  }

  if (planResult.success && !isCustomPassage) {
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

  const illustrationDensity =
    (generationMeta.illustrationDensity as IllustrationDensity | undefined) ??
    (overrides?.illustrationDensity as IllustrationDensity | undefined) ??
    'every_page';

  const illustrationPlan = resolvePageIllustrationPlan(
    pages.map((p) => p.pageNumber),
    illustrationDensity,
  );
  const requiredPageNumbers = new Set(
    illustrationPlan
      .filter((ip) => ip.illustrationRole === 'required')
      .map((ip) => ip.pageNumber),
  );

  const missingRequiredImages = pages
    .filter((page) => requiredPageNumbers.has(page.pageNumber) && !page.imageKey)
    .map((page) => page.pageNumber);

  if (!passage.coverImageKey) {
    addError(issues, 'cover_image_missing', 'The passage has no cover image.');
  }
  if (missingRequiredImages.length > 0) {
    addError(
      issues,
      'page_images_missing',
      `Missing illustrations for page${missingRequiredImages.length === 1 ? '' : 's'} ${missingRequiredImages.join(', ')}.`,
    );
  }

  let proseScore = 0;
  let questionsScore = 0;

  if (planResult.success && (targetVocabIds.length > 0 || isCustomPassage)) {
    try {
      let cumulativeWords: { id: string; word: string }[] = [];
      let targetRows: { id: string; word: string; afFLevel?: any; afFUnit?: any }[] = [];

      if (isCustomPassage) {
        const allVocab = await db
          .select({ id: vocabulary.id, word: vocabulary.word })
          .from(vocabulary);
        cumulativeWords = allVocab;
        targetRows = [];
      } else {
        const fetchedTargets = await fetchTargetVocab(targetVocabIds);
        const fetchedCumulative = await resolveCumulativeVocab(fetchedTargets, undefined);
        targetRows = fetchedTargets.map((row) => ({
          id: row.id,
          word: row.word,
          afFLevel: row.afFLevel,
          afFUnit: row.afFUnit,
        }));
        cumulativeWords = fetchedCumulative.map((row) => ({ id: row.id, word: row.word }));
      }

      const prosePages = pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
      }));

      const proseValidation = validatePagesProse(
        prosePages,
        planResult.data,
        passage.readingLevel,
        cumulativeWords,
        targetRows,
        isCustomPassage ? { vocabStrictness: 'permissive', ...overrides } : overrides,
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

      if (questions.length > 0) {
        const questionValidation = validateQuestions(
          questions,
          prosePages,
          targetRows.map((row) => ({ id: row.id, word: row.word })),
          cumulativeWords,
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
  if (questionRows.length > 0 && questionsScore < QUESTIONS_QUALITY_FLOOR) {
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

function describeValidationIssue(issue: any): string {
  if (issue.type === 'unknown_word') {
    return `Page ${issue.pageNumber}: Unknown word "${issue.word}"`;
  }
  if (issue.type === 'sentence_too_long') {
    return `Page ${issue.pageNumber}: Sentence is too long (${issue.wordCount} words; max ${issue.maxAllowed})`;
  }
  if (issue.type === 'target_word_missing') {
    return `Story is missing target vocabulary word "${issue.word}"`;
  }
  if (issue.type === 'page_too_short') {
    return `Page ${issue.pageNumber}: Page has too few words (${issue.wordCount} words; min ${issue.minRequired})`;
  }
  if (issue.type === 'page_too_long') {
    return `Page ${issue.pageNumber}: Page has too many words (${issue.wordCount} words; max ${issue.maxAllowed})`;
  }
  if (issue.type === 'forbidden_construction') {
    return `Page ${issue.pageNumber}: Disallowed grammar detected — ${issue.reason ?? 'forbidden construction'} in "${issue.sentence}"`;
  }
  if (issue.type === 'duplicate_options') {
    return `Question ${Number(issue.orderIndex ?? 0) + 1}: Multiple choice options must be unique`;
  }
  if (issue.type === 'empty_option') {
    return `Question ${Number(issue.orderIndex ?? 0) + 1}: Multiple choice options cannot be blank`;
  }
  if (issue.type === 'invalid_option_count') {
    return `Question ${Number(issue.orderIndex ?? 0) + 1}: Multiple choice questions must have exactly 4 options`;
  }
  if (issue.type === 'invalid_correct_index') {
    return `Question ${Number(issue.orderIndex ?? 0) + 1}: Correct answer index is invalid`;
  }
  if (issue.type === 'evidence_not_found') {
    return `Question ${Number(issue.orderIndex ?? 0) + 1}: Evidence quote "${issue.evidenceQuote ?? ''}" was not found on page ${issue.evidencePageNumber ?? ''}`;
  }
  return `Validation issue: ${issue.type.replaceAll('_', ' ')}${issue.details ? ` (${issue.details})` : ''}`;
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
