import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assignments, teachers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';
import { userCanManageAssignment } from '@/lib/auth/class-access';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: assignmentId } = await params;

    // Get teacher ID
    const teacher = await db.query.teachers.findFirst({
      where: eq(teachers.id, user.id),
    });

    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    if (!(await userCanManageAssignment(user.id, user.role, assignmentId))) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }
    const existingAssignment = await db
      .select({ id: assignments.id, status: assignments.status })
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1);
    if (!existingAssignment.length) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    // For now, we'll use 'archived' status to represent completed assignments
    // since 'completed' is not yet in the database enum. The UI will treat
    // archived assignments as completed assignments that remain visible to students.
    const [updatedAssignment] = await db
      .update(assignments)
      .set({
        status: 'archived',
      })
      .where(eq(assignments.id, assignmentId))
      .returning();

    return NextResponse.json({
      success: true,
      assignment: updatedAssignment,
      message: 'Assignment marked as completed',
    });
  } catch (error) {
    logError(error, 'api/assignments/[id]/complete');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}