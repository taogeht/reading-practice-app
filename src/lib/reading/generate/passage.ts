// Top-level orchestrator for the reading-passage pipeline. Composes
// Stages 1-5 (plan → prose+regen → questions → images), uploads images
// to R2, and persists the row + page rows + question rows in a single
// Drizzle transaction. The result row is always status='review' — no
// auto-publish; the human still approves.
//
// Failure handling: each stage that throws is caught and converted to
// a structured `status: 'failed'` result. No partial writes. R2 uploads
// happen BEFORE the DB transaction; if any upload fails we abort
// pre-DB. If the DB transaction fails after R2 succeeds, R2 blobs are
// orphaned (acceptable for v1; a janitor job can sweep them).
//
// No regeneration logic at the orchestrator level for v1. The prose
// pipeline already has its own regen wrapper; question/image regen
// would be a separate task once we have failure-rate data.

import { randomUUID } from 'node:crypto';
import { logInfo, logError } from '@/lib/logger';
import { db } from '@/lib/db';
import {
  readingPassages,
  readingQuestions,
  storyPages,
  type PassageGenerationMeta,
} from '@/lib/db/schema';
import { r2Client } from '@/lib/storage/r2-client';
import {
  generatePassagePlan,
  generatePassageImages,
  generateQuestions,
  generateValidatedProse,
  validatePassageImages,
  validateQuestions,
} from './index';
import type {
  GeneratedPageImage,
  GeneratedPageProse,
  GeneratedQuestion,
  GenerateOverrides,
  ImageValidationIssue,
  QuestionValidationIssue,
  ValidationIssue,
} from './types';

// ---------- Helpers: R2 upload retry ----------

/** Upload to R2 with retry-on-transient. Up to 3 attempts with
 *  500ms/1s/2s backoff. Retries on EPIPE / ECONNRESET / ETIMEDOUT /
 *  5xx — anything else (auth, NoSuchBucket) bubbles after the first
 *  failure. Logs each retry attempt with the cause. */
async function uploadWithRetry(
  key: string,
  body: Buffer,
  contentType: string,
  metadata: Record<string, string>,
  label: string,
): Promise<void> {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = [500, 1000, 2000];
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await r2Client.uploadFile(key, body, contentType, metadata);
      return;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient = isR2TransientError(err);
      if (!transient) throw err;
      if (attempt < MAX_ATTEMPTS) {
        const delay = BACKOFF_MS[attempt - 1] ?? 2000;
        console.warn(
          `[passage uploads] transient R2 error on attempt ${attempt} for ${label} (${key}): ${msg}. Retrying in ${delay}ms…`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr));
}

function isR2TransientError(err: unknown): boolean {
  // Network-level errors surface either as the raw code on a Node error,
  // or via the message (S3Client wraps fetch errors). Cover both.
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : '';
  if (
    code === 'EPIPE' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENETUNREACH' ||
    code === 'EAI_AGAIN'
  ) {
    return true;
  }
  const msg = err instanceof Error ? err.message : '';
  if (/EPIPE|ECONNRESET|ETIMEDOUT|ENETUNREACH|EAI_AGAIN/.test(msg)) return true;

  // S3 SDK surfaces 5xx via $metadata.httpStatusCode.
  const httpStatus =
    err && typeof err === 'object' && '$metadata' in err
      ? Number(((err as { $metadata?: { httpStatusCode?: number } }).$metadata)?.httpStatusCode)
      : NaN;
  if (Number.isFinite(httpStatus) && httpStatus >= 500 && httpStatus < 600) return true;

  return false;
}

// ---------- Tunable thresholds ----------

const DEFAULT_MAX_PROSE_ATTEMPTS = 3;
/** Minimum prose qualityScore to mark passageReady=true. Prose
 *  warnings affect narrative the kid actually reads, so the bar is
 *  higher than for questions. */
const PROSE_QUALITY_FLOOR = 0.7;
/** Minimum question qualityScore to mark passageReady=true. Question
 *  warnings are mostly metalanguage ("how many", "match") rather than
 *  narrative content, so a lower threshold is appropriate. */
const QUESTIONS_QUALITY_FLOOR = 0.5;

const COMBINED_MODEL_LABEL = 'claude-sonnet-4-6 + gemini-2.5-flash-image';

// ---------- Public types ----------

export interface GeneratePassageInput {
  readingLevelId: number;
  targetVocabIds: string[];
  seedTheme?: string;
  maxProseAttempts?: number;
  /** Teacher-controlled overrides (length, sentence cap, grammar
   *  toggles, vocab strictness, setting, question mix). Threaded into
   *  every stage that needs to read constraint values. */
  overrides?: GenerateOverrides;
  /** Test-pipeline shortcut: skip both page-image generation (Stage 5)
   *  AND vocab-pair image generation in Stage 4. The DB row is still
   *  written but with status='draft', NULL coverImageKey, NULL
   *  storyPages.imageKey, and a sentinel imageKey of
   *  "skipped:vocab-{vocabId}" on each vocab_matching pair (which the
   *  validator recognises as a deliberate skip). Set by the test
   *  scripts when iterating on prose / questions / vocab logic without
   *  burning Gemini budget. Production paths leave this undefined. */
  skipImages?: boolean;
}

/** A passage-level issue is a per-stage validation issue from prose,
 *  questions, or images, plus a synthetic 'pipeline_error' variant for
 *  exceptions that abort the whole run. */
export type PassageIssue =
  | (ValidationIssue & { stage: 'prose' })
  | (QuestionValidationIssue & { stage: 'questions' })
  | (ImageValidationIssue & { stage: 'images' })
  | { stage: 'pipeline'; type: 'pipeline_error'; severity: 'error'; message: string };

export interface GeneratePassageResult {
  /** UUID of the created reading_passages row, OR a unique
   *  identifier for the failed run (no DB row exists for failures). */
  passageId: string;
  /** Mirrors the DB status column for successful runs. 'draft' when
   *  the caller passed skipImages (test-pipeline artifact); 'review'
   *  otherwise (queued for teacher review). 'failed' means no DB row. */
  status: 'review' | 'draft' | 'failed';
  qualityReport: {
    proseScore: number;
    questionsScore: number;
    imagesValid: boolean;
    passageReady: boolean;
  };
  timing: {
    planMs: number;
    proseMs: number;
    questionsMs: number;
    imagesMs: number;
    uploadsMs: number;
    dbWriteMs: number;
    totalMs: number;
  };
  cost: {
    totalInputTokens: number;
    totalOutputTokens: number;
    imageCallsCount: number;
  };
  issues: PassageIssue[];
}

// ---------- Helpers ----------

const zeroTiming = () => ({
  planMs: 0,
  proseMs: 0,
  questionsMs: 0,
  imagesMs: 0,
  uploadsMs: 0,
  dbWriteMs: 0,
  totalMs: 0,
});
const zeroCost = () => ({ totalInputTokens: 0, totalOutputTokens: 0, imageCallsCount: 0 });
const zeroQuality = () => ({
  proseScore: 0,
  questionsScore: 0,
  imagesValid: false,
  passageReady: false,
});

function failedResult(
  passageId: string,
  message: string,
  partial: Partial<GeneratePassageResult> = {},
): GeneratePassageResult {
  return {
    passageId,
    status: 'failed',
    qualityReport: partial.qualityReport ?? zeroQuality(),
    timing: { ...zeroTiming(), ...partial.timing },
    cost: { ...zeroCost(), ...partial.cost },
    issues: [
      ...(partial.issues ?? []),
      { stage: 'pipeline', type: 'pipeline_error', severity: 'error', message },
    ],
  };
}

// ---------- Main entry point ----------

export async function generatePassage(
  input: GeneratePassageInput,
): Promise<GeneratePassageResult> {
  // Reserve the passage id up-front. R2 keys reference it before the
  // DB row exists, and we want a stable identifier for log correlation
  // even on failure paths.
  const passageId = randomUUID();
  const overallStart = Date.now();
  const timing = zeroTiming();
  const cost = zeroCost();
  const issues: PassageIssue[] = [];

  logInfo(
    `passage generation started`,
    `lib/reading/generate/passage start passage_id=${passageId} level=${input.readingLevelId} targets=${input.targetVocabIds.slice(0, 5).join(',')}${input.skipImages ? ' skip_images=true' : ''}`,
  );
  if (input.skipImages) {
    console.log(
      `[SKIP-IMAGES MODE] Generating passage without page or vocab images. status will be 'draft'. Estimated cost: ~$0.05 (Claude only).`,
    );
  }

  // ---------- Stage 1: plan ----------
  let plan: Awaited<ReturnType<typeof generatePassagePlan>>['plan'];
  let planTokens = { input: 0, output: 0 };
  try {
    const t0 = Date.now();
    const r = await generatePassagePlan({
      readingLevel: input.readingLevelId,
      targetVocabIds: input.targetVocabIds,
      seedTheme: input.seedTheme,
      overrides: input.overrides,
    });
    timing.planMs = Date.now() - t0;
    plan = r.plan;
    planTokens = { input: r.meta.inputTokens, output: r.meta.outputTokens };
    cost.totalInputTokens += planTokens.input;
    cost.totalOutputTokens += planTokens.output;
    logInfo(
      `stage complete`,
      `lib/reading/generate/passage stage=plan passage_id=${passageId} ms=${timing.planMs} tokens_in=${planTokens.input} tokens_out=${planTokens.output} pages=${plan.pages.length}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(err, `lib/reading/generate/passage stage=plan passage_id=${passageId}`);
    timing.totalMs = Date.now() - overallStart;
    return failedResult(passageId, `Stage 1 (plan) failed: ${msg}`, { timing, cost, issues });
  }

  // ---------- Stage 2 + 3: prose with regen ----------
  let pages: GeneratedPageProse[];
  let proseValidation;
  let proseAttemptCount = 0;
  try {
    const t0 = Date.now();
    const r = await generateValidatedProse({
      plan,
      readingLevelId: input.readingLevelId,
      maxAttempts: input.maxProseAttempts ?? DEFAULT_MAX_PROSE_ATTEMPTS,
      overrides: input.overrides,
    });
    timing.proseMs = Date.now() - t0;
    pages = r.finalPages;
    proseValidation = r.finalValidation;
    proseAttemptCount = r.attempts.length;
    cost.totalInputTokens += r.totalInputTokens;
    cost.totalOutputTokens += r.totalOutputTokens;
    for (const issue of proseValidation.issues) {
      issues.push({ ...issue, stage: 'prose' } as PassageIssue);
    }
    logInfo(
      `stage complete`,
      `lib/reading/generate/passage stage=prose passage_id=${passageId} ms=${timing.proseMs} attempts=${proseAttemptCount} tokens_in=${r.totalInputTokens} tokens_out=${r.totalOutputTokens} score=${proseValidation.qualityScore.toFixed(2)}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(err, `lib/reading/generate/passage stage=prose passage_id=${passageId}`);
    timing.totalMs = Date.now() - overallStart;
    return failedResult(passageId, `Stage 2/3 (prose) failed: ${msg}`, { timing, cost, issues });
  }

  // ---------- Stage 4: questions ----------
  // Re-fetch the same vocab rows the prose validator used so the
  // question generator + validator see an identical allowlist.
  const { fetchTargetVocab, resolveCumulativeVocab } = await import('./vocab');
  const targetRowsFull = await fetchTargetVocab(input.targetVocabIds);
  const cumulativeFull = await resolveCumulativeVocab(targetRowsFull, undefined);
  const targetVocabRows = targetRowsFull.map((r) => ({
    id: r.id,
    word: r.word,
    mandarinTranslation: r.mandarinTranslation,
    isPicturable: r.isPicturable,
  }));
  const cumulativeVocabRows = cumulativeFull.map((r) => ({
    id: r.id,
    word: r.word,
    isPicturable: r.isPicturable,
  }));

  let questions: GeneratedQuestion[];
  let questionsValidation;
  let vocabImages: Awaited<ReturnType<typeof generateQuestions>>['vocabImages'] = [];
  try {
    const t0 = Date.now();
    const qResult = await generateQuestions({
      plan,
      pages,
      targetVocabRows,
      cumulativeVocabRows,
      readingLevelId: input.readingLevelId,
      passageId,
      skipImages: input.skipImages,
      overrides: input.overrides,
    });
    questions = qResult.questions;
    vocabImages = qResult.vocabImages;
    cost.totalInputTokens += qResult.meta.inputTokens;
    cost.totalOutputTokens += qResult.meta.outputTokens;
    // Each generated vocab pair illustration is an image-model call —
    // roll it into the same imageCallsCount metric as page images so
    // the cost budget reflects the full per-passage spend.
    cost.imageCallsCount += qResult.vocabImageCallCount;

    questionsValidation = validateQuestions(
      questions,
      pages,
      targetVocabRows.map((r) => ({ id: r.id, word: r.word })),
      cumulativeVocabRows,
      input.readingLevelId,
      passageId,
    );
    timing.questionsMs = Date.now() - t0;
    for (const issue of questionsValidation.issues) {
      issues.push({ ...issue, stage: 'questions' } as PassageIssue);
    }
    logInfo(
      `stage complete`,
      `lib/reading/generate/passage stage=questions passage_id=${passageId} ms=${timing.questionsMs} tokens_in=${qResult.meta.inputTokens} tokens_out=${qResult.meta.outputTokens} score=${questionsValidation.qualityScore.toFixed(2)} errors=${questionsValidation.errorCount}`,
    );

    // Structurally-broken question sets can't be salvaged without a
    // regen wrapper we don't yet have — abort.
    if (questionsValidation.errorCount > 0) {
      timing.totalMs = Date.now() - overallStart;
      return failedResult(
        passageId,
        `Stage 4 (questions) produced ${questionsValidation.errorCount} structural errors; cannot ship`,
        {
          timing,
          cost,
          issues,
          qualityReport: {
            proseScore: proseValidation.qualityScore,
            questionsScore: questionsValidation.qualityScore,
            imagesValid: false,
            passageReady: false,
          },
        },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(err, `lib/reading/generate/passage stage=questions passage_id=${passageId}`);
    timing.totalMs = Date.now() - overallStart;
    return failedResult(passageId, `Stage 4 (questions) failed: ${msg}`, { timing, cost, issues });
  }

  // ---------- Stage 5: images ----------
  // Skipped under --skip-images. The DB row still gets written (with
  // NULL coverImageKey + NULL storyPages.imageKey), but Gemini is never
  // called and imagesValidation is synthesised as "valid, 0 issues".
  let images: GeneratedPageImage[] = [];
  let imagesValidation: ReturnType<typeof validatePassageImages>;
  if (input.skipImages) {
    imagesValidation = {
      valid: true,
      errorCount: 0,
      warningCount: 0,
      qualityScore: 1.0,
      issues: [],
    };
    logInfo(
      `stage skipped`,
      `lib/reading/generate/passage stage=images passage_id=${passageId} skipped=true`,
    );
  } else {
    try {
      const t0 = Date.now();
      const imgResult = await generatePassageImages({ plan, pages });
      timing.imagesMs = Date.now() - t0;
      images = imgResult.pages;
      cost.imageCallsCount += images.length;

      imagesValidation = validatePassageImages(images, pages);
      for (const issue of imagesValidation.issues) {
        issues.push({ ...issue, stage: 'images' } as PassageIssue);
      }
      logInfo(
        `stage complete`,
        `lib/reading/generate/passage stage=images passage_id=${passageId} ms=${timing.imagesMs} pages=${images.length} score=${imagesValidation.qualityScore.toFixed(2)} errors=${imagesValidation.errorCount}`,
      );

      if (imagesValidation.errorCount > 0) {
        timing.totalMs = Date.now() - overallStart;
        return failedResult(
          passageId,
          `Stage 5 (images) produced ${imagesValidation.errorCount} errors; cannot ship`,
          {
            timing,
            cost,
            issues,
            qualityReport: {
              proseScore: proseValidation.qualityScore,
              questionsScore: questionsValidation.qualityScore,
              imagesValid: false,
              passageReady: false,
            },
          },
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError(err, `lib/reading/generate/passage stage=images passage_id=${passageId}`);
      timing.totalMs = Date.now() - overallStart;
      return failedResult(passageId, `Stage 5 (images) failed: ${msg}`, { timing, cost, issues });
    }
  }

  // ---------- R2 uploads ----------
  // Upload all page images AND vocab pair illustrations in a single
  // parallel batch. Each upload retries on transient signatures (EPIPE,
  // ECONNRESET, 5xx) up to 3 attempts with 500ms/1s/2s backoff — recently
  // we've seen one EPIPE per ~15 passages and the cost of failing the
  // whole passage on a single hiccup isn't worth it. Non-transient
  // failures (auth, missing bucket) propagate immediately.
  const imageKeyByPage = new Map<number, string>();
  if (input.skipImages) {
    // Nothing to upload. images and vocabImages are both empty by
    // construction; imageKeyByPage stays empty so the DB write below
    // sets storyPages.imageKey = NULL for every page.
    logInfo(
      `stage skipped`,
      `lib/reading/generate/passage stage=uploads passage_id=${passageId} skipped=true`,
    );
  } else {
  try {
    const t0 = Date.now();
    const pageUploads = images.map((img) => {
      const key = r2Client.generateStoryImageKey(passageId, img.pageNumber);
      return uploadWithRetry(
        key,
        img.buffer,
        img.mimeType,
        {
          'passage-id': passageId,
          'page-number': String(img.pageNumber),
        },
        `page-${img.pageNumber}`,
      ).then(() => imageKeyByPage.set(img.pageNumber, key));
    });
    const vocabUploads = vocabImages.map((vimg) =>
      uploadWithRetry(
        vimg.key,
        vimg.buffer,
        vimg.mimeType,
        {
          'passage-id': passageId,
          'vocab-id': vimg.vocabId,
          'vocab-word': vimg.word,
        },
        `vocab-${vimg.word}`,
      ),
    );
    await Promise.all([...pageUploads, ...vocabUploads]);
    timing.uploadsMs = Date.now() - t0;
    logInfo(
      `stage complete`,
      `lib/reading/generate/passage stage=uploads passage_id=${passageId} ms=${timing.uploadsMs} pages=${images.length} vocab=${vocabImages.length}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(err, `lib/reading/generate/passage stage=uploads passage_id=${passageId}`);
    timing.totalMs = Date.now() - overallStart;
    return failedResult(passageId, `R2 upload failed: ${msg}`, {
      timing,
      cost,
      issues,
      qualityReport: {
        proseScore: proseValidation.qualityScore,
        questionsScore: questionsValidation.qualityScore,
        imagesValid: imagesValidation.valid,
        passageReady: false,
      },
    });
  }
  } // end else (skipImages branch closed above)

  // ---------- Compute passageReady ----------
  const passageReady =
    proseValidation.errorCount === 0 &&
    questionsValidation.errorCount === 0 &&
    imagesValidation.valid &&
    proseValidation.qualityScore >= PROSE_QUALITY_FLOOR &&
    questionsValidation.qualityScore >= QUESTIONS_QUALITY_FLOOR;

  const qualityReport = {
    proseScore: proseValidation.qualityScore,
    questionsScore: questionsValidation.qualityScore,
    imagesValid: imagesValidation.valid,
    passageReady,
  };

  // ---------- DB transaction: passage + pages + questions ----------
  const totalMsBeforeDb = Date.now() - overallStart;
  try {
    const t0 = Date.now();
    await db.transaction(async (tx) => {
      const generationMeta: PassageGenerationMeta = {
        model: COMBINED_MODEL_LABEL,
        generatedAt: new Date().toISOString(),
        generationDurationMs: totalMsBeforeDb,
        proseAttemptCount,
        imageCallCount: images.length,
        totalInputTokens: cost.totalInputTokens,
        totalOutputTokens: cost.totalOutputTokens,
        qualityReport,
        // Persist the full plan so per-page and per-question regen
        // endpoints can rebuild the prompt context without re-running
        // Stage 1.
        plan,
      };

      // 1. readingPassages — single row. status='draft' under
      //    --skip-images so these test artifacts never reach the
      //    review queue (which filters on status='review' by default).
      await tx.insert(readingPassages).values({
        id: passageId,
        title: plan.title,
        readingLevel: input.readingLevelId,
        targetVocabIds: input.targetVocabIds,
        pageCount: plan.pages.length,
        status: input.skipImages ? 'draft' : 'review',
        generationMeta,
        summary: plan.summary,
        coverImageKey: input.skipImages
          ? null
          : (images[0]
              ? imageKeyByPage.get(images[0].pageNumber) ?? null
              : null),
        isActive: true,
      });

      // 2. story_pages — one row per prose page. Under --skip-images
      //    we walk the prose array directly (no images to iterate);
      //    imageKey is null on every row.
      const sourcePages = input.skipImages
        ? pages.map((p) => ({ pageNumber: p.pageNumber, promptUsed: null as string | null }))
        : images.map((img) => ({ pageNumber: img.pageNumber, promptUsed: img.promptUsed }));
      const pageRows = sourcePages
        .slice()
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map((src) => {
          const proseRow = pages.find((p) => p.pageNumber === src.pageNumber)!;
          return {
            passageId,
            pageNumber: src.pageNumber,
            text: proseRow.text,
            imageKey: input.skipImages ? null : imageKeyByPage.get(src.pageNumber) ?? null,
            imagePromptUsed: src.promptUsed,
            ttsAudioKey: null,
            ttsVoice: null,
          };
        });
      await tx.insert(storyPages).values(pageRows);

      // 3. reading_questions — five rows, ordered by orderIndex
      //    (which generateQuestions assigned 0..4 in emit order).
      const questionRows = questions.map((q) => {
        const base = {
          passageId,
          questionType: q.type,
          questionText: q.questionText,
          orderIndex: q.orderIndex,
          payload: q.payload,
          // vocab_word_id stays null — vocab_matching's per-pair
          // vocabIds live in the payload; MCQ + sequence_order
          // don't tag a single word.
          vocabWordId: null,
          difficulty: null,
        };
        if (q.type === 'mcq_comprehension') {
          return {
            ...base,
            evidenceQuote: q.evidenceQuote,
            evidencePageNumber: q.evidencePageNumber,
          };
        }
        return { ...base, evidenceQuote: null, evidencePageNumber: null };
      });
      await tx.insert(readingQuestions).values(questionRows);
    });
    timing.dbWriteMs = Date.now() - t0;
    logInfo(
      `stage complete`,
      `lib/reading/generate/passage stage=db_write passage_id=${passageId} ms=${timing.dbWriteMs}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(err, `lib/reading/generate/passage stage=db_write passage_id=${passageId}`);
    timing.totalMs = Date.now() - overallStart;
    // R2 blobs are now orphaned — log so a janitor sweep can find them.
    console.warn(
      `[passage] DB write failed for ${passageId}; R2 blobs at story-images/${passageId}/* are orphaned and need a sweep.`,
    );
    return failedResult(passageId, `DB write failed: ${msg}`, {
      timing,
      cost,
      issues,
      qualityReport,
    });
  }

  timing.totalMs = Date.now() - overallStart;

  logInfo(
    `passage generation complete`,
    `lib/reading/generate/passage final passage_id=${passageId} status=${input.skipImages ? 'draft' : 'review'} ready=${passageReady} total_ms=${timing.totalMs} total_tokens=${cost.totalInputTokens + cost.totalOutputTokens} image_calls=${cost.imageCallsCount}`,
  );

  return {
    passageId,
    status: input.skipImages ? 'draft' : 'review',
    qualityReport,
    timing,
    cost,
    issues,
  };
}
