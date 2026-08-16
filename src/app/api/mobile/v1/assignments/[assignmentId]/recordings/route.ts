import { NextResponse } from 'next/server';
import { mobileRecordingSubmissionResponseSchema } from '@starling-rise/contracts';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { logError } from '@/lib/logger';
import { mobileError } from '@/lib/mobile/http';
import {
  MobileRecordingError,
  submitMobileRecording,
} from '@/lib/mobile/recordings';
import { MEDIA_LIMITS, validateMediaFile } from '@/lib/storage/media-validation';

export const runtime = 'nodejs';

const assignmentIdSchema = z.uuid();
const operationIdSchema = z.string().regex(/^[a-zA-Z0-9-]{20,64}$/);
const durationSchema = z.coerce.number().positive().max(601);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return mobileError('NOT_AUTHENTICATED', 'Not authenticated.', 401);
    }

    const parsedAssignmentId = assignmentIdSchema.safeParse((await params).assignmentId);
    if (!parsedAssignmentId.success) {
      return mobileError('BAD_REQUEST', 'Invalid assignment ID.', 400);
    }

    const formData = await request.formData();
    const audio = formData.get('audio');
    const operationId = operationIdSchema.safeParse(formData.get('operationId'));
    const durationSeconds = durationSchema.safeParse(formData.get('durationSeconds'));
    if (!(audio instanceof File) || !operationId.success || !durationSeconds.success) {
      return mobileError('BAD_REQUEST', 'Invalid recording upload.', 400);
    }
    if (audio.size === 0) {
      return mobileError('BAD_REQUEST', 'Recording is empty.', 400);
    }
    const validation = validateMediaFile(audio, 'audio');
    if (!validation.valid) {
      const tooLarge = audio.size > MEDIA_LIMITS.audio.maxSize;
      return mobileError(
        'BAD_REQUEST',
        tooLarge ? 'Recording is too large.' : 'Unsupported recording format.',
        tooLarge ? 413 : 400,
      );
    }

    const submission = await submitMobileRecording({
      studentId: user.id,
      assignmentId: parsedAssignmentId.data,
      clientOperationId: operationId.data,
      audioBuffer: Buffer.from(await audio.arrayBuffer()),
      contentType: audio.type,
      durationSeconds: durationSeconds.data,
    });

    return NextResponse.json(
      mobileRecordingSubmissionResponseSchema.parse({
        success: true,
        duplicate: submission.duplicate,
        recording: {
          ...submission.recording,
          submittedAt: submission.recording.submittedAt.toISOString(),
        },
        award: {
          pointsAwarded: submission.award.pointsAwarded,
          newTotalXp: submission.award.newTotalXp,
          leveledUp: submission.award.leveledUp,
          newLevel: submission.award.newLevel,
        },
      }),
    );
  } catch (error) {
    if (error instanceof MobileRecordingError) {
      return mobileError(error.code, error.message, error.status);
    }
    logError(error, 'api/mobile/v1/assignments/[assignmentId]/recordings');
    return mobileError('INTERNAL_ERROR', 'Unable to submit this recording.', 500);
  }
}
