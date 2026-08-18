// POST /api/teacher/reading/generate
//
// Teacher-facing entry point for the passage pipeline. Validates the
// requested overrides, picks target vocab per the selection mode,
// INSERTs a reading_generation_jobs row with exact resumable work items,
// then asks the leased background runner to claim it. Each passage completion
// updates progress; polling relaunches queued or lease-expired work.
//
// Auth: teacher or admin.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateReadingContent } from '@/lib/auth/reading-content';
import { db } from '@/lib/db';
import { readingGenerationJobs, vocabulary } from '@/lib/db/schema';
import { logError, logInfo } from '@/lib/logger';
import {
  applyOverridesToLevel,
  getReadingLevel,
  validateOverrides,
} from '@/lib/reading/levels';
import type { GenerateOverrides } from '@/lib/reading/generate';
import { launchGenerationJob } from '@/lib/reading/generation-job-runner';
import { buildGenerationWorkItems } from '@/lib/reading/generation-job-plan';

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

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    if (!(await canGenerateReadingContent(user))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    const workItems = buildGenerationWorkItems(perCallTargetIds);
    const [jobRow] = await db
      .insert(readingGenerationJobs)
      .values({
        teacherId: user.id,
        parentJobId: body.parentJobId ?? null,
        readingLevelId: readingLevelId!,
        countRequested: countToGenerate,
        overridesUsed: overrides as Record<string, unknown>,
        targetVocabIds: allTargetIds,
        workItems,
        skipImages: Boolean(body.skipImages),
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

    // The runner owns leasing, progress, and recovery. Duplicate launches are
    // harmless because only one process can claim the database lease.
    launchGenerationJob(jobId);

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
