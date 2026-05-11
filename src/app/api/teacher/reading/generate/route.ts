// POST /api/teacher/reading/generate
//
// Teacher-facing entry point for the passage pipeline. Validates the
// requested overrides, picks target vocab per the selection mode,
// INSERTs a reading_generation_jobs row up front so the teacher's
// UI can poll for status, then fires the generator in the background
// (queueMicrotask). Each passage completion UPDATEs the job row;
// final status flips when the loop ends.
//
// Auth: teacher or admin.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { readingGenerationJobs, vocabulary } from '@/lib/db/schema';
import { logError, logInfo } from '@/lib/logger';
import {
  applyOverridesToLevel,
  getReadingLevel,
  validateOverrides,
} from '@/lib/reading/levels';
import { generatePassage } from '@/lib/reading/generate';
import type { GenerateOverrides, GeneratePassageResult } from '@/lib/reading/generate';
import { translateFailureReason } from '@/lib/reading/failure-reasons';

export const runtime = 'nodejs';

const COUNT_MAX = 5;
/** Rough estimate of wall-clock per generation. Calibrated from the
 *  bulk-run logs at ~2.5–3 min per passage. */
const ESTIMATED_MINUTES_PER_PASSAGE = 3;

interface RequestBody {
  readingLevelId?: number;
  overrides?: GenerateOverrides;
  countToGenerate?: number;
  skipImages?: boolean;
  /** When this request is a retry, point back at the originating
   *  job so the row records the lineage. Set by the /retry route. */
  parentJobId?: string;
}

/** Per-passage outcome appended to reading_generation_jobs.passages_results.
 *  Stored as JSONB; this type stays in TS as the contract the UI reads. */
export interface StoredPassageResult {
  passageId: string;
  status: 'review' | 'draft' | 'failed';
  qualityReport: GeneratePassageResult['qualityReport'];
  targetVocabIds: string[];
  failure?: {
    teacherMessage: string;
    technicalDetails: string;
    failureStage: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const readingLevelId = body.readingLevelId;
    if (!Number.isInteger(readingLevelId) || readingLevelId! < 1 || readingLevelId! > 5) {
      return NextResponse.json(
        { error: 'readingLevelId must be 1-5' },
        { status: 400 },
      );
    }
    const countToGenerate = body.countToGenerate ?? 1;
    if (
      !Number.isInteger(countToGenerate) ||
      countToGenerate < 1 ||
      countToGenerate > COUNT_MAX
    ) {
      return NextResponse.json(
        { error: `countToGenerate must be between 1 and ${COUNT_MAX}` },
        { status: 400 },
      );
    }

    const overrides = body.overrides ?? {};

    const validation = validateOverrides(readingLevelId!, overrides);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid settings', issues: validation.errors },
        { status: 400 },
      );
    }

    const baseLevel = getReadingLevel(readingLevelId!);
    const effectiveLevel = applyOverridesToLevel(baseLevel, overrides);
    const targetCount =
      overrides.targetVocabCount ?? effectiveLevel.targetVocabPerStory;
    const needsPicturable = effectiveLevel.questionTypeMix.vocab_matching > 0;

    if (
      overrides.targetVocabSelectionMode === 'specific' &&
      overrides.targetVocabIds &&
      overrides.targetVocabIds.length > 0
    ) {
      const rows = await db
        .select({
          id: vocabulary.id,
          word: vocabulary.word,
          isPicturable: vocabulary.isPicturable,
          isFunctionWord: vocabulary.isFunctionWord,
        })
        .from(vocabulary)
        .where(inArray(vocabulary.id, overrides.targetVocabIds));
      const foundIds = new Set(rows.map((r) => r.id));
      const missing = overrides.targetVocabIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: 'Some selected vocabulary words could not be found.',
            issues: missing.map((id) => `Unknown vocabulary id: ${id}`),
          },
          { status: 400 },
        );
      }
      const fnWords = rows.filter((r) => r.isFunctionWord);
      if (fnWords.length > 0) {
        return NextResponse.json(
          {
            error: 'Function words cannot be used as target vocabulary.',
            issues: fnWords.map((r) => `"${r.word}" is a function word`),
          },
          { status: 400 },
        );
      }
      if (needsPicturable) {
        const unpicturable = rows.filter((r) => !r.isPicturable);
        if (unpicturable.length > 0) {
          return NextResponse.json(
            {
              error:
                'Vocabulary matching is on, but some selected words are not picture-friendly.',
              issues: unpicturable.map(
                (r) => `"${r.word}" can't be used as a picture-matching word`,
              ),
            },
            { status: 400 },
          );
        }
      }
    }

    const perCallTargetIds: string[][] = [];
    for (let i = 0; i < countToGenerate; i++) {
      const ids = await pickTargetIds({
        levelTargetAfFLevel: baseLevel.targetAfFLevel,
        mode: overrides.targetVocabSelectionMode ?? 'random_level',
        unit: overrides.targetVocabUnit,
        targetCount,
        needsPicturable,
        specificIds: overrides.targetVocabIds,
      });
      if (ids.length < Math.min(targetCount, 1)) {
        return NextResponse.json(
          {
            error:
              'Not enough vocabulary words match the selected filters. Loosen the picture requirement or pick a different unit.',
          },
          { status: 400 },
        );
      }
      perCallTargetIds.push(ids);
    }

    // Insert the queued job row. We do this BEFORE firing the
    // background loop so the response carries a real DB id the UI can
    // poll. The union of every passage's targetVocabIds lives on the
    // row as a debugging convenience; passage-level IDs land in
    // passages_results as each passage completes.
    const allTargetIds = Array.from(
      new Set(perCallTargetIds.flat()),
    );
    const [jobRow] = await db
      .insert(readingGenerationJobs)
      .values({
        teacherId: user.id,
        parentJobId: body.parentJobId ?? null,
        readingLevelId: readingLevelId!,
        countRequested: countToGenerate,
        overridesUsed: overrides as Record<string, unknown>,
        targetVocabIds: allTargetIds,
        status: 'queued',
      })
      .returning({ id: readingGenerationJobs.id });
    if (!jobRow) {
      return NextResponse.json(
        { error: 'Failed to record generation job' },
        { status: 500 },
      );
    }
    const jobId = jobRow.id;

    logInfo(
      `generation job queued`,
      `api/teacher/reading/generate user_id=${user.id} job_id=${jobId} level=${readingLevelId} count=${countToGenerate} skip_images=${Boolean(body.skipImages)}${body.parentJobId ? ` parent_job_id=${body.parentJobId}` : ''}`,
    );

    // Fire-and-forget background loop. Sets status='running' first
    // (so a poll between insert and the first generatePassage call
    // shows accurate state), then walks the per-call lists.
    queueMicrotask(() => {
      void runJob({
        jobId,
        teacherId: user.id,
        readingLevelId: readingLevelId!,
        overrides,
        perCallTargetIds,
        skipImages: Boolean(body.skipImages),
      });
    });

    const estimatedMinutes = ESTIMATED_MINUTES_PER_PASSAGE * countToGenerate;
    return NextResponse.json({
      jobId,
      countToGenerate,
      estimatedMinutes,
      message: `${countToGenerate} passage${countToGenerate === 1 ? '' : 's'} generating. Check the review queue in about ${estimatedMinutes} minute${estimatedMinutes === 1 ? '' : 's'}.`,
    });
  } catch (err) {
    logError(err, 'api/teacher/reading/generate');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------- Helpers ----------

interface PickTargetsArgs {
  levelTargetAfFLevel: string;
  mode: 'random_level' | 'random_unit' | 'specific';
  unit: number | undefined;
  targetCount: number;
  needsPicturable: boolean;
  specificIds: string[] | undefined;
}

async function pickTargetIds(args: PickTargetsArgs): Promise<string[]> {
  if (args.mode === 'specific' && args.specificIds) {
    return args.specificIds;
  }
  const conditions = [
    eq(vocabulary.afFLevel, args.levelTargetAfFLevel as 'starter'),
    eq(vocabulary.isFunctionWord, false),
    eq(vocabulary.isScaffold, false),
  ];
  if (args.needsPicturable) {
    conditions.push(eq(vocabulary.isPicturable, true));
  }
  if (args.mode === 'random_unit' && typeof args.unit === 'number') {
    conditions.push(eq(vocabulary.afFUnit, args.unit));
  }
  const candidates = await db
    .select({ id: vocabulary.id })
    .from(vocabulary)
    .where(and(...conditions));
  const shuffled = candidates.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, args.targetCount).map((r) => r.id);
}

interface JobArgs {
  jobId: string;
  teacherId: string;
  readingLevelId: number;
  overrides: GenerateOverrides;
  perCallTargetIds: string[][];
  skipImages: boolean;
}

/** Background loop. Each completed passage appends to
 *  passages_results + bumps the per-bucket counter via a SQL
 *  jsonb_concat so concurrent UPDATEs (none today but cheap
 *  insurance) don't clobber each other.
 *
 *  Final status flips to:
 *    - 'completed' if ANY passage succeeded
 *    - 'failed' if every passage failed
 *  Matches the spec's "at least one succeeded ⇒ completed". */
async function runJob(args: JobArgs): Promise<void> {
  // Mark running so polls between INSERT and the first
  // generatePassage call report accurate state.
  await db
    .update(readingGenerationJobs)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(readingGenerationJobs.id, args.jobId));

  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < args.perCallTargetIds.length; i++) {
    const targetVocabIds = args.perCallTargetIds[i]!;
    let result: GeneratePassageResult | null = null;
    try {
      result = await generatePassage({
        readingLevelId: args.readingLevelId,
        targetVocabIds,
        seedTheme: args.overrides.seedTheme,
        overrides: args.overrides,
        skipImages: args.skipImages,
      });
    } catch (err) {
      logError(err, `api/teacher/reading/generate job_id=${args.jobId} idx=${i + 1}`);
      // Synthesise a failure result so the UI sees the row.
      result = {
        passageId: 'unknown',
        status: 'failed',
        qualityReport: {
          proseScore: 0,
          questionsScore: 0,
          imagesValid: false,
          passageReady: false,
        },
        timing: {
          planMs: 0,
          proseMs: 0,
          questionsMs: 0,
          imagesMs: 0,
          uploadsMs: 0,
          dbWriteMs: 0,
          totalMs: 0,
        },
        cost: { totalInputTokens: 0, totalOutputTokens: 0, imageCallsCount: 0 },
        issues: [
          {
            stage: 'pipeline',
            type: 'pipeline_error',
            severity: 'error',
            message: err instanceof Error ? err.message : String(err),
          },
        ],
      };
    }

    const passageEntry: StoredPassageResult = {
      passageId: result.passageId,
      status: result.status,
      qualityReport: result.qualityReport,
      targetVocabIds,
    };
    if (result.status === 'failed') {
      const translated = translateFailureReason(result.issues);
      passageEntry.failure = {
        teacherMessage: translated.teacherMessage,
        technicalDetails: translated.technicalDetails,
        failureStage: translated.failureStage,
      };
      failed++;
      logInfo(
        `generation finished — failed`,
        `api/teacher/reading/generate job_id=${args.jobId} idx=${i + 1}/${args.perCallTargetIds.length} status=failed stage=${translated.failureStage}`,
      );
    } else {
      succeeded++;
      logInfo(
        `generation finished — ${result.status}`,
        `api/teacher/reading/generate job_id=${args.jobId} idx=${i + 1}/${args.perCallTargetIds.length} status=${result.status} passage_id=${result.passageId} ready=${result.qualityReport.passageReady}`,
      );
    }

    // Append the per-passage entry + bump the counter. Done in one
    // round trip via a jsonb_concat with passages_results.
    await db
      .update(readingGenerationJobs)
      .set({
        passagesResults: sql`${readingGenerationJobs.passagesResults} || ${JSON.stringify([passageEntry])}::jsonb`,
        passagesSucceeded: sql`${readingGenerationJobs.passagesSucceeded} + ${result.status === 'failed' ? 0 : 1}`,
        passagesFailed: sql`${readingGenerationJobs.passagesFailed} + ${result.status === 'failed' ? 1 : 0}`,
        updatedAt: new Date(),
      })
      .where(eq(readingGenerationJobs.id, args.jobId));
  }

  // Final flip. 'completed' when at least one succeeded; 'failed'
  // when every passage in the batch failed. Either way the row is
  // terminal — UI stops polling here.
  const finalStatus = succeeded > 0 ? 'completed' : 'failed';
  await db
    .update(readingGenerationJobs)
    .set({ status: finalStatus, updatedAt: new Date() })
    .where(eq(readingGenerationJobs.id, args.jobId));

  logInfo(
    `generation job complete`,
    `api/teacher/reading/generate job_id=${args.jobId} succeeded=${succeeded} failed=${failed} total=${args.perCallTargetIds.length} final_status=${finalStatus} teacher_id=${args.teacherId}`,
  );
}
