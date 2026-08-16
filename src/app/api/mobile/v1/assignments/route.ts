import { NextResponse } from 'next/server';
import {
  mobileAssignmentListResponseSchema,
  type MobileAssignmentListResponse,
} from '@starling-rise/contracts';
import { getCurrentUser } from '@/lib/auth';
import { logError } from '@/lib/logger';
import { mobileError } from '@/lib/mobile/http';
import { listActiveMobileAssignments } from '@/lib/mobile/assignments';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return mobileError('NOT_AUTHENTICATED', 'Not authenticated.', 401);
    }

    const response: MobileAssignmentListResponse = {
      assignments: await listActiveMobileAssignments(user.id),
    };
    return NextResponse.json(mobileAssignmentListResponseSchema.parse(response));
  } catch (error) {
    logError(error, 'api/mobile/v1/assignments');
    return mobileError('INTERNAL_ERROR', 'Unable to load reading assignments.', 500);
  }
}
