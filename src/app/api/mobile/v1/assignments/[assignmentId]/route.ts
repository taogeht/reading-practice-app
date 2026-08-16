import { NextResponse } from 'next/server';
import {
  mobileAssignmentDetailResponseSchema,
  type MobileAssignmentDetailResponse,
} from '@starling-rise/contracts';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { logError } from '@/lib/logger';
import { mobileError } from '@/lib/mobile/http';
import { getMobileAssignmentDetail } from '@/lib/mobile/assignments';

export const runtime = 'nodejs';

const assignmentIdSchema = z.uuid();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return mobileError('NOT_AUTHENTICATED', 'Not authenticated.', 401);
    }

    const parsedId = assignmentIdSchema.safeParse((await params).assignmentId);
    if (!parsedId.success) {
      return mobileError('BAD_REQUEST', 'Invalid assignment ID.', 400);
    }

    const assignment = await getMobileAssignmentDetail(user.id, parsedId.data);
    if (!assignment) {
      return mobileError('NOT_FOUND', 'Assignment not found.', 404);
    }

    const response: MobileAssignmentDetailResponse = { assignment };
    return NextResponse.json(mobileAssignmentDetailResponseSchema.parse(response));
  } catch (error) {
    logError(error, 'api/mobile/v1/assignments/[assignmentId]');
    return mobileError('INTERNAL_ERROR', 'Unable to load this assignment.', 500);
  }
}
