import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, assignments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';
import { userCanManageRecording } from '@/lib/auth/class-access';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { teacherFeedback, status } = body;

    if (!(await userCanManageRecording(user.id, user.role, id))) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    // Update the recording with feedback
    await db
      .update(recordings)
      .set({
        teacherFeedback: teacherFeedback,
        status: status || 'reviewed',
        reviewedAt: new Date(),
        reviewedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(recordings.id, id));

    return NextResponse.json({
      success: true,
      message: 'Feedback saved successfully',
    });

  } catch (error) {
    logError(error, 'api/recordings/[id]');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: recordingId } = await params;
    if (!(await userCanManageRecording(user.id, user.role, recordingId))) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    // Delete the recording
    await db
      .delete(recordings)
      .where(eq(recordings.id, recordingId));

    return NextResponse.json({
      success: true,
      message: 'Recording deleted successfully',
    });

  } catch (error) {
    logError(error, 'api/recordings/[id]');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}