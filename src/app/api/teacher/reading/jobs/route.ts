// GET /api/teacher/reading/jobs
//
// Returns the calling teacher's most-recent batch generation jobs.
// Powers the "Your recent generations" panel on
// /teacher/reading/generate plus the recent-jobs list any teacher
// dashboard widget could embed later.
//
// Auth: teacher or admin. Each row is teacher-scoped — admins see
// their own jobs only here; cross-teacher visibility would need a
// separate admin endpoint.

import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { readingGenerationJobs } from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

const RECENT_LIMIT = 20;

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const rows = await db
      .select({
        id: readingGenerationJobs.id,
        createdAt: readingGenerationJobs.createdAt,
        readingLevelId: readingGenerationJobs.readingLevelId,
        countRequested: readingGenerationJobs.countRequested,
        status: readingGenerationJobs.status,
        passagesSucceeded: readingGenerationJobs.passagesSucceeded,
        passagesFailed: readingGenerationJobs.passagesFailed,
        parentJobId: readingGenerationJobs.parentJobId,
      })
      .from(readingGenerationJobs)
      .where(eq(readingGenerationJobs.teacherId, user.id))
      .orderBy(desc(readingGenerationJobs.createdAt))
      .limit(RECENT_LIMIT);

    return NextResponse.json({
      jobs: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        readingLevelId: r.readingLevelId,
        countRequested: r.countRequested,
        status: r.status,
        passagesSucceeded: r.passagesSucceeded,
        passagesFailed: r.passagesFailed,
        parentJobId: r.parentJobId,
        // Retry is offered when the job is terminal (either status)
        // and at least one passage failed. A 100% successful run
        // doesn't need a retry button; an in-flight run isn't a
        // candidate yet.
        hasRetry:
          (r.status === 'completed' || r.status === 'failed') &&
          r.passagesFailed > 0,
      })),
    });
  } catch (err) {
    logError(err, 'api/teacher/reading/jobs');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
