import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, assignments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
        eq(recordings.id, params.id),
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
      .where(eq(recordings.id, params.id));

    return NextResponse.json({
      success: true,
      message: 'Feedback saved successfully',
    });

  } catch (error) {
    console.error('Error updating recording:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}