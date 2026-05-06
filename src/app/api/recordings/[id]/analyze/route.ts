import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, assignments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { aiGradingEnabled, reanalyzeRecordingById } from '@/lib/grading/analyze-recording';
import { userCanManageRecording } from '@/lib/auth/class-access';

export const runtime = 'nodejs';

// POST /api/recordings/[id]/analyze
// Re-runs Whisper + alignment for a single recording. Used by the teacher's
// "Re-analyze" button on the submissions page after a failed background job.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!aiGradingEnabled()) {
      return NextResponse.json(
        { error: 'AI grading is not enabled in this environment' },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!(await userCanManageRecording(user.id, user.role, id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rows = await db
      .select({
        recordingId: recordings.id,
        recordingMode: assignments.recordingMode,
      })
      .from(recordings)
      .innerJoin(assignments, eq(recordings.assignmentId, assignments.id))
      .where(eq(recordings.id, id))
      .limit(1);

    if (!rows.length) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }
    if (rows[0].recordingMode !== 'ai_graded') {
      return NextResponse.json(
        { error: 'This recording is not part of an AI-graded assignment' },
        { status: 400 }
      );
    }

    const result = await reanalyzeRecordingById(id);
    return NextResponse.json({ success: !result.error, result });
  } catch (error) {
    logError(error, 'api/recordings/[id]/analyze');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
