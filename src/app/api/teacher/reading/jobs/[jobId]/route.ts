// GET /api/teacher/reading/jobs/[jobId]
//
// Returns the full job row including the per-passage results array
// with translated failure messages. Powers the polling status card
// on /teacher/reading/generate and the focused job-detail page.
//
// Auth: teacher (must own the row) or admin (any row).

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { readingGenerationJobs } from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { jobId } = await params;

    const [row] = await db
      .select()
      .from(readingGenerationJobs)
      .where(eq(readingGenerationJobs.id, jobId))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    // Teachers can only see their own jobs. Admins can see any.
    if (user.role !== 'admin' && row.teacherId !== user.id) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      job: {
        id: row.id,
        teacherId: row.teacherId,
        parentJobId: row.parentJobId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        readingLevelId: row.readingLevelId,
        countRequested: row.countRequested,
        overridesUsed: row.overridesUsed,
        targetVocabIds: row.targetVocabIds,
        status: row.status,
        passagesSucceeded: row.passagesSucceeded,
        passagesFailed: row.passagesFailed,
        passagesResults: row.passagesResults,
        hasRetry:
          (row.status === 'completed' || row.status === 'failed') &&
          row.passagesFailed > 0,
      },
    });
  } catch (err) {
    logError(err, 'api/teacher/reading/jobs/[jobId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
