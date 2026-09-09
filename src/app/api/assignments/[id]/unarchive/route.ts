import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assignments, teachers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { userCanManageAssignment } from '@/lib/auth/class-access';
import { canManageAssignments } from '@/lib/auth/teacher-capabilities';

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
    if (!(await canManageAssignments(user))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { id: assignmentId } = await params;

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

    const [updatedAssignment] = await db
      .update(assignments)
      .set({
        status: 'published',
      })
      .where(eq(assignments.id, assignmentId))
      .returning();

    return NextResponse.json({
      success: true,
      assignment: updatedAssignment,
      message: 'Assignment restored to active',
    });
  } catch (error) {
    logError(error, 'api/assignments/[id]/unarchive');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
