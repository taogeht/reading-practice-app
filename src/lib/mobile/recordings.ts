import type { MobileErrorCode } from '@starling-rise/contracts';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  assignments,
  classes,
  classEnrollments,
  recordings,
  stories,
} from '@/lib/db/schema';
import { awardXp, type AwardResult } from '@/lib/gamification/award';
import { aiGradingEnabled, analyzeRecordingInBackground } from '@/lib/grading/analyze-recording';
import {
  generateMobileRecordingKey,
  r2Client,
  uploadRecordingToR2,
} from '@/lib/storage/r2-client';

export class MobileRecordingError extends Error {
  constructor(
    readonly code: MobileErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'MobileRecordingError';
  }
}

type StoredRecording = typeof recordings.$inferSelect;

export type MobileRecordingSubmission = {
  duplicate: boolean;
  recording: {
    id: string;
    attemptNumber: number;
    status: Exclude<StoredRecording['status'], 'pending' | null>;
    submittedAt: Date;
  };
  award: AwardResult;
};

const NO_AWARD: AwardResult = {
  pointsAwarded: 0,
  newTotalXp: 0,
  leveledUp: false,
  newLevel: 1,
  streakIncremented: false,
  newStreakDays: 0,
  unlockedAnimal: null,
  unlockedBadges: [],
  bonusEvents: [],
};

function audioExtension(contentType: string): string {
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  if (normalized === 'audio/mp4' || normalized === 'audio/m4a') return 'm4a';
  if (normalized === 'audio/mpeg' || normalized === 'audio/mp3') return 'mp3';
  if (normalized === 'audio/wav') return 'wav';
  throw new MobileRecordingError('BAD_REQUEST', 'Unsupported recording format.', 400);
}

function submittedRecording(recording: StoredRecording): MobileRecordingSubmission['recording'] {
  if (
    !recording.attemptNumber ||
    !recording.submittedAt ||
    !recording.status ||
    recording.status === 'pending'
  ) {
    throw new Error(`Mobile recording ${recording.id} is not a submitted attempt.`);
  }
  return {
    id: recording.id,
    attemptNumber: recording.attemptNumber,
    status: recording.status,
    submittedAt: recording.submittedAt,
  };
}

export async function submitMobileRecording(input: {
  studentId: string;
  assignmentId: string;
  clientOperationId: string;
  audioBuffer: Buffer;
  contentType: string;
  durationSeconds: number;
}): Promise<MobileRecordingSubmission> {
  const [assignment] = await db
    .select({
      id: assignments.id,
      maxAttempts: assignments.maxAttempts,
      maxRecordingSeconds: assignments.maxRecordingSeconds,
      recordingMode: assignments.recordingMode,
      storyContent: stories.content,
    })
    .from(assignments)
    .innerJoin(stories, eq(assignments.storyId, stories.id))
    .innerJoin(classes, eq(assignments.classId, classes.id))
    .innerJoin(
      classEnrollments,
      and(
        eq(classEnrollments.classId, classes.id),
        eq(classEnrollments.studentId, input.studentId),
      ),
    )
    .where(
      and(
        eq(assignments.id, input.assignmentId),
        eq(assignments.status, 'published'),
        eq(classes.active, true),
      ),
    )
    .limit(1);

  if (!assignment) {
    throw new MobileRecordingError('NOT_FOUND', 'Assignment not found.', 404);
  }
  if (input.durationSeconds > assignment.maxRecordingSeconds + 1) {
    throw new MobileRecordingError(
      'BAD_REQUEST',
      `Recording is longer than the ${assignment.maxRecordingSeconds}-second limit.`,
      400,
    );
  }

  const [knownOperation] = await db
    .select()
    .from(recordings)
    .where(
      and(
        eq(recordings.studentId, input.studentId),
        eq(recordings.clientOperationId, input.clientOperationId),
      ),
    )
    .limit(1);
  if (knownOperation) {
    if (knownOperation.assignmentId !== input.assignmentId) {
      throw new MobileRecordingError('BAD_REQUEST', 'Invalid recording operation.', 400);
    }
    return {
      duplicate: true,
      recording: submittedRecording(knownOperation),
      award: NO_AWARD,
    };
  }

  const [latestKnownAttempt] = await db
    .select({ attemptNumber: recordings.attemptNumber })
    .from(recordings)
    .where(
      and(
        eq(recordings.studentId, input.studentId),
        eq(recordings.assignmentId, input.assignmentId),
      ),
    )
    .orderBy(desc(recordings.attemptNumber))
    .limit(1);
  const maxAttempts = Math.max(1, assignment.maxAttempts ?? 3);
  if ((latestKnownAttempt?.attemptNumber ?? 0) >= maxAttempts) {
    throw new MobileRecordingError(
      'BAD_REQUEST',
      `Maximum attempts (${maxAttempts}) reached for this assignment.`,
      400,
    );
  }

  const extension = audioExtension(input.contentType);
  const recordingKey = generateMobileRecordingKey(
    input.studentId,
    input.assignmentId,
    input.clientOperationId,
    extension,
  );
  const audioUrl = await uploadRecordingToR2(
    recordingKey,
    input.audioBuffer,
    input.contentType,
  );

  let created = false;
  let stored: StoredRecording;
  try {
    stored = await db.transaction(async (tx) => {
      const lockKey = `${input.studentId}:${input.assignmentId}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

      const [existingOperation] = await tx
        .select()
        .from(recordings)
        .where(
          and(
            eq(recordings.studentId, input.studentId),
            eq(recordings.clientOperationId, input.clientOperationId),
          ),
        )
        .limit(1);
      if (existingOperation) return existingOperation;

      const [latestAttempt] = await tx
        .select({ attemptNumber: recordings.attemptNumber })
        .from(recordings)
        .where(
          and(
            eq(recordings.studentId, input.studentId),
            eq(recordings.assignmentId, input.assignmentId),
          ),
        )
        .orderBy(desc(recordings.attemptNumber))
        .limit(1);
      const attemptNumber = (latestAttempt?.attemptNumber ?? 0) + 1;
      if (attemptNumber > maxAttempts) {
        throw new MobileRecordingError(
          'BAD_REQUEST',
          `Maximum attempts (${maxAttempts}) reached for this assignment.`,
          400,
        );
      }

      const [recording] = await tx
        .insert(recordings)
        .values({
          studentId: input.studentId,
          assignmentId: input.assignmentId,
          clientOperationId: input.clientOperationId,
          attemptNumber,
          audioUrl,
          fileSizeBytes: input.audioBuffer.length,
          audioDurationSeconds: Math.max(1, Math.round(input.durationSeconds)),
          status: 'submitted',
          submittedAt: new Date(),
        })
        .returning();
      created = true;
      return recording;
    });
  } catch (error) {
    // A max-attempt rejection is final, so its just-uploaded object can be
    // removed. For transient DB failures, retain the deterministic object: a
    // retry will reuse it, and deleting here could race another request for the
    // same operation that is about to commit its row.
    if (error instanceof MobileRecordingError) {
      try {
        await r2Client.deleteFile(recordingKey);
      } catch {
        // Preserve the original submission error; storage cleanup can remove
        // this rejected operation's orphan later.
      }
    }
    throw error;
  }

  if (!created) {
    return { duplicate: true, recording: submittedRecording(stored), award: NO_AWARD };
  }

  const award = await awardXp(input.studentId, 'recording_submitted', stored.id);

  if (assignment.recordingMode === 'ai_graded' && aiGradingEnabled()) {
    analyzeRecordingInBackground({
      recordingId: stored.id,
      audioBuffer: input.audioBuffer,
      audioMime: input.contentType,
      audioExtension: extension,
      storyText: assignment.storyContent ?? '',
    });
  }

  return { duplicate: false, recording: submittedRecording(stored), award };
}
