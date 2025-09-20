import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, assignments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

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

    // Verify the recording exists and the teacher has access to it
    const recording = await db
      .select({
        id: recordings.id,
        assignmentId: recordings.assignmentId,
      })
      .from(recordings)
      .innerJoin(assignments, eq(recordings.assignmentId, assignments.id))
      .where(and(
        eq(recordings.id, id),
        eq(assignments.teacherId, user.id)
      ))
      .limit(1);

    if (!recording.length) {
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

    // First verify the recording exists and the teacher owns the assignment
    const recording = await db
      .select({
        id: recordings.id,
        assignmentId: recordings.assignmentId,
        teacherId: assignments.teacherId,
      })
      .from(recordings)
      .innerJoin(assignments, eq(recordings.assignmentId, assignments.id))
      .where(eq(recordings.id, recordingId))
      .limit(1);

    if (!recording.length) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      );
    }

    // Check if the teacher owns the assignment
    if (recording[0].teacherId !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized to delete this recording' },
        { status: 403 }
      );
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