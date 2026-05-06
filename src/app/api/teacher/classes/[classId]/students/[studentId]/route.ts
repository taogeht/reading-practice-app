import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, classEnrollments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';
import { userCanManageClass } from '@/lib/auth/class-access';

export const runtime = 'nodejs';

// Remove student from class
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string; studentId: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'teacher') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    const { classId, studentId } = await params;

    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // Check if enrollment exists
    const enrollment = await db
      .select({ id: classEnrollments.id })
      .from(classEnrollments)
      .where(and(
        eq(classEnrollments.classId, classId),
        eq(classEnrollments.studentId, studentId)
      ))
      .limit(1);

    if (!enrollment.length) {
      return NextResponse.json(
        { error: 'Student is not enrolled in this class' },
        { status: 404 }
      );
    }

    // Remove student from class
    await db
      .delete(classEnrollments)
      .where(and(
        eq(classEnrollments.classId, classId),
        eq(classEnrollments.studentId, studentId)
      ));

    return NextResponse.json(
      { message: 'Student removed from class successfully' },
      { status: 200 }
    );

  } catch (error) {
    logError(error, 'api/teacher/classes/[classId]/students/[studentId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}