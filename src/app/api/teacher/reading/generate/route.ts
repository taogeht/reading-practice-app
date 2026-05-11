// POST /api/teacher/reading/generate
//
// Teacher-facing entry point for the passage pipeline. Validates the
// requested overrides, picks target vocab per the selection mode, and
// fires the generator in the background (queueMicrotask) — returning
// a jobId + ETA immediately so the UI doesn't tie up a 10-minute
// HTTP request. Generated passages land in the review queue.
//
// Auth: teacher or admin.

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { vocabulary } from '@/lib/db/schema';
import { logError, logInfo } from '@/lib/logger';
import {
  applyOverridesToLevel,
  getReadingLevel,
  validateOverrides,
} from '@/lib/reading/levels';
import { generatePassage } from '@/lib/reading/generate';
import type { GenerateOverrides } from '@/lib/reading/generate';

export const runtime = 'nodejs';

const COUNT_MAX = 5;
/** Rough estimate of wall-clock per generation (plan + prose + ~3 prose
 *  attempts + questions + 5 vocab images + 8 page images + uploads +
 *  DB write). Calibrated from the bulk-run logs at ~2.5–3 min per
 *  passage; bumped to 3 here as the user-facing estimate is a soft
 *  upper bound. */
const ESTIMATED_MINUTES_PER_PASSAGE = 3;

interface RequestBody {
  readingLevelId?: number;
  overrides?: GenerateOverrides;
  countToGenerate?: number;
  skipImages?: boolean;
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

    // Bounds + sums validation up front so the teacher gets a clean
    // error before we start picking vocab.
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

    // Vocab-id-list validation: if the teacher hand-picked words, make
    // sure every UUID exists at the right level AND (when vocab_matching
    // > 0) is picturable. Done here rather than inside validateOverrides
    // so we keep that helper pure (no DB).
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

    // Pre-resolve target-vocab-id lists for each of the N generations.
    // For specific-mode: reuse the same IDs each time. For random
    // modes: pick fresh per-call so a "Generate 3" run produces three
    // distinct stories.
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

    const jobId = randomUUID();
    logInfo(
      `generation job queued`,
      `api/teacher/reading/generate user_id=${user.id} job_id=${jobId} level=${readingLevelId} count=${countToGenerate} skip_images=${Boolean(body.skipImages)}`,
    );

    // Fire-and-forget. We do NOT await — the loop runs serially in the
    // background after the response goes out. Each passage takes ~2.5
    // min so a sync response is not feasible. On serverless platforms
    // this can be killed mid-loop; the teacher's recovery is the
    // review queue ("if you see fewer than expected, run again"). Same
    // failure mode the existing analyzeRecordingInBackground accepts.
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
  // Shuffle in JS — small candidate counts make this fine.
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

/** Background loop. Generations run serially because the upstream
 *  Gemini quota tolerates ~1 call at a time before throwing 429s.
 *  Each generation's outcome is logged so the operator can correlate
 *  the job id with successes/failures in the orchestrator log. */
async function runJob(args: JobArgs): Promise<void> {
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < args.perCallTargetIds.length; i++) {
    const targetVocabIds = args.perCallTargetIds[i]!;
    try {
      const result = await generatePassage({
        readingLevelId: args.readingLevelId,
        targetVocabIds,
        seedTheme: args.overrides.seedTheme,
        overrides: args.overrides,
        skipImages: args.skipImages,
      });
      if (result.status === 'failed') {
        failed++;
        logInfo(
          `generation finished — failed`,
          `api/teacher/reading/generate job_id=${args.jobId} idx=${i + 1}/${args.perCallTargetIds.length} status=failed passage_id=${result.passageId}`,
        );
      } else {
        succeeded++;
        logInfo(
          `generation finished — review`,
          `api/teacher/reading/generate job_id=${args.jobId} idx=${i + 1}/${args.perCallTargetIds.length} status=${result.status} passage_id=${result.passageId} ready=${result.qualityReport.passageReady}`,
        );
      }
    } catch (err) {
      failed++;
      logError(err, `api/teacher/reading/generate job_id=${args.jobId} idx=${i + 1}`);
    }
  }
  logInfo(
    `generation job complete`,
    `api/teacher/reading/generate job_id=${args.jobId} succeeded=${succeeded} failed=${failed} total=${args.perCallTargetIds.length} teacher_id=${args.teacherId}`,
  );
}

