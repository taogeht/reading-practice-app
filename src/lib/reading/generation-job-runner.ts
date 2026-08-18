import { randomUUID } from 'node:crypto';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  readingGenerationJobs,
  readingPassages,
  type PassageGenerationMeta,
  type ReadingGenerationJobWorkItem,
} from '@/lib/db/schema';
import { logError, logInfo } from '@/lib/logger';
import { generatePassage } from './generate';
import type {
  GenerateOverrides,
  GeneratePassageResult,
} from './generate';
import { translateFailureReason } from './failure-reasons';
import { parseGenerationWorkItems } from './generation-job-plan';

const LEASE_DURATION_MS = 3 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const RETRY_DELAY_AFTER_RUNNER_ERROR_MS = 30 * 1000;

export interface StoredPassageResult {
  passageId: string;
  status: 'review' | 'draft' | 'failed';
  qualityReport: GeneratePassageResult['qualityReport'];
  targetVocabIds: string[];
  /** Stable identity inside the batch; older rows may omit it. */
  workItemIndex?: number;
  recoveredAfterRestart?: boolean;
  failure?: {
    teacherMessage: string;
    technicalDetails: string;
    failureStage: string;
  };
}

/** Schedule a runner without making callers own promise/error semantics. */
export function launchGenerationJob(jobId: string): void {
  queueMicrotask(() => {
    void runGenerationJob(jobId).catch((error) =>
      logError(error, `lib/reading/generation-job-runner job_id=${jobId} launch_failed`),
    );
  });
}

/**
 * Claim and drain one durable generation job. The database lease is the
 * concurrency interface: duplicate callers are harmless, and a new process
 * can resume only after the previous runner stops renewing its lease.
 */
export async function runGenerationJob(jobId: string): Promise<void> {
  const leaseToken = randomUUID();
  const [job] = await db
    .update(readingGenerationJobs)
    .set({
      status: 'running',
      leaseToken,
      leaseExpiresAt: leaseDeadline(),
      runnerAttempts: sql`${readingGenerationJobs.runnerAttempts} + 1`,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(readingGenerationJobs.id, jobId),
        or(
          eq(readingGenerationJobs.status, 'queued'),
          and(
            eq(readingGenerationJobs.status, 'running'),
            or(
              isNull(readingGenerationJobs.leaseExpiresAt),
              lt(readingGenerationJobs.leaseExpiresAt, new Date()),
            ),
          ),
        ),
      ),
    )
    .returning();

  // Terminal or actively leased by another process.
  if (!job) return;

  const workItems = parseGenerationWorkItems(job.workItems, job.countRequested);
  if (!workItems) {
    await failInvalidJob(jobId, leaseToken, 'Job has no valid resumable work items.');
    return;
  }

  let leaseLost = false;
  const heartbeat = setInterval(() => {
    void renewLease(jobId, leaseToken)
      .then((renewed) => {
        if (!renewed) leaseLost = true;
      })
      .catch((error) => {
        logError(
          error,
          `lib/reading/generation-job-runner job_id=${jobId} heartbeat_failed`,
        );
      });
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  try {
    const priorResults = parseStoredResults(job.passagesResults);
    const completedIndexes = new Set(
      priorResults
        .map((result) => result.workItemIndex)
        .filter((index): index is number => Number.isInteger(index)),
    );

    let succeeded = job.passagesSucceeded;
    let failed = job.passagesFailed;

    for (const workItem of workItems) {
      if (completedIndexes.has(workItem.index)) continue;
      if (leaseLost) throw new Error('Generation job lease was lost.');

      const recoveredBeforeGeneration = await recoverCommittedPassage(jobId, workItem);
      let passageEntry =
        recoveredBeforeGeneration ??
        (await generateWorkItem({
          jobId,
          workItem,
          readingLevelId: job.readingLevelId,
          overrides: job.overridesUsed as GenerateOverrides,
          skipImages: job.skipImages,
        }));
      if (passageEntry.status === 'failed') {
        passageEntry =
          (await recoverCommittedPassage(jobId, workItem)) ?? passageEntry;
      }

      if (leaseLost) throw new Error('Generation job lease was lost.');
      const isFailure = passageEntry.status === 'failed';
      const [progressWritten] = await db
        .update(readingGenerationJobs)
        .set({
          passagesResults: sql`${readingGenerationJobs.passagesResults} || ${JSON.stringify([passageEntry])}::jsonb`,
          passagesSucceeded: sql`${readingGenerationJobs.passagesSucceeded} + ${isFailure ? 0 : 1}`,
          passagesFailed: sql`${readingGenerationJobs.passagesFailed} + ${isFailure ? 1 : 0}`,
          leaseExpiresAt: leaseDeadline(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(readingGenerationJobs.id, jobId),
            eq(readingGenerationJobs.leaseToken, leaseToken),
          ),
        )
        .returning({ id: readingGenerationJobs.id });
      if (!progressWritten) throw new Error('Generation job lease was lost.');

      completedIndexes.add(workItem.index);
      if (isFailure) failed++;
      else succeeded++;

      logInfo(
        'generation work item complete',
        `lib/reading/generation-job-runner job_id=${jobId} item=${workItem.index} status=${passageEntry.status} recovered=${Boolean(recoveredBeforeGeneration || passageEntry.recoveredAfterRestart)}`,
      );
    }

    const finalStatus = succeeded > 0 ? 'completed' : 'failed';
    const [completed] = await db
      .update(readingGenerationJobs)
      .set({
        status: finalStatus,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(readingGenerationJobs.id, jobId),
          eq(readingGenerationJobs.leaseToken, leaseToken),
        ),
      )
      .returning({ id: readingGenerationJobs.id });
    if (!completed) throw new Error('Generation job lease was lost before completion.');

    logInfo(
      'generation job complete',
      `lib/reading/generation-job-runner job_id=${jobId} succeeded=${succeeded} failed=${failed} final_status=${finalStatus}`,
    );
  } catch (error) {
    await deferUnexpectedRunnerFailure(jobId, leaseToken, error);
  } finally {
    clearInterval(heartbeat);
  }
}

interface GenerateWorkItemArgs {
  jobId: string;
  workItem: ReadingGenerationJobWorkItem;
  readingLevelId: number;
  overrides: GenerateOverrides;
  skipImages: boolean;
}

async function generateWorkItem(
  args: GenerateWorkItemArgs,
): Promise<StoredPassageResult> {
  let result: GeneratePassageResult;
  try {
    result = await generatePassage({
      readingLevelId: args.readingLevelId,
      targetVocabIds: args.workItem.targetVocabIds,
      seedTheme: args.overrides.seedTheme,
      overrides: args.overrides,
      skipImages: args.skipImages,
      provenance: {
        generationJobId: args.jobId,
        workItemIndex: args.workItem.index,
      },
    });
  } catch (error) {
    result = failedGenerationResult(error);
  }

  const entry: StoredPassageResult = {
    passageId: result.passageId,
    status: result.status,
    qualityReport: result.qualityReport,
    targetVocabIds: args.workItem.targetVocabIds,
    workItemIndex: args.workItem.index,
  };
  if (result.status === 'failed') {
    const translated = translateFailureReason(result.issues);
    entry.failure = {
      teacherMessage: translated.teacherMessage,
      technicalDetails: translated.technicalDetails,
      failureStage: translated.failureStage,
    };
  }
  return entry;
}

async function recoverCommittedPassage(
  jobId: string,
  workItem: ReadingGenerationJobWorkItem,
): Promise<StoredPassageResult | null> {
  const [passage] = await db
    .select({
      id: readingPassages.id,
      status: readingPassages.status,
      generationMeta: readingPassages.generationMeta,
    })
    .from(readingPassages)
    .where(
      and(
        eq(readingPassages.generationJobId, jobId),
        eq(readingPassages.generationWorkItemIndex, workItem.index),
      ),
    )
    .limit(1);
  if (!passage) return null;

  const meta = (passage.generationMeta as PassageGenerationMeta | null) ?? {};
  const qualityReport = meta.qualityReport ?? zeroQuality();
  return {
    passageId: passage.id,
    status: passage.status === 'draft' ? 'draft' : 'review',
    qualityReport,
    targetVocabIds: workItem.targetVocabIds,
    workItemIndex: workItem.index,
    recoveredAfterRestart: true,
  };
}

async function renewLease(jobId: string, leaseToken: string): Promise<boolean> {
  const [updated] = await db
    .update(readingGenerationJobs)
    .set({ leaseExpiresAt: leaseDeadline(), updatedAt: new Date() })
    .where(
      and(
        eq(readingGenerationJobs.id, jobId),
        eq(readingGenerationJobs.leaseToken, leaseToken),
        eq(readingGenerationJobs.status, 'running'),
      ),
    )
    .returning({ id: readingGenerationJobs.id });
  return Boolean(updated);
}

async function deferUnexpectedRunnerFailure(
  jobId: string,
  leaseToken: string,
  error: unknown,
): Promise<void> {
  logError(error, `lib/reading/generation-job-runner job_id=${jobId} runner_failed`);
  try {
    await db
      .update(readingGenerationJobs)
      .set({
        leaseToken: null,
        leaseExpiresAt: new Date(Date.now() + RETRY_DELAY_AFTER_RUNNER_ERROR_MS),
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(readingGenerationJobs.id, jobId),
          eq(readingGenerationJobs.leaseToken, leaseToken),
        ),
      );
  } catch (persistenceError) {
    logError(
      persistenceError,
      `lib/reading/generation-job-runner job_id=${jobId} runner_failure_persist_failed`,
    );
  }
}

async function failInvalidJob(
  jobId: string,
  leaseToken: string,
  message: string,
): Promise<void> {
  await db
    .update(readingGenerationJobs)
    .set({
      status: 'failed',
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: message,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(readingGenerationJobs.id, jobId),
        eq(readingGenerationJobs.leaseToken, leaseToken),
      ),
    );
}

function parseStoredResults(value: unknown): StoredPassageResult[] {
  return Array.isArray(value) ? (value as StoredPassageResult[]) : [];
}

function failedGenerationResult(error: unknown): GeneratePassageResult {
  return {
    passageId: randomUUID(),
    status: 'failed',
    qualityReport: zeroQuality(),
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
        message: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}

function zeroQuality(): GeneratePassageResult['qualityReport'] {
  return {
    proseScore: 0,
    questionsScore: 0,
    imagesValid: false,
    passageReady: false,
  };
}

function leaseDeadline(): Date {
  return new Date(Date.now() + LEASE_DURATION_MS);
}
