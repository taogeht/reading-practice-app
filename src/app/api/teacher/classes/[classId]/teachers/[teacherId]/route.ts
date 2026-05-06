import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classTeachers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { userIsClassPrimary } from '@/lib/auth/class-access';

export const runtime = 'nodejs';

// DELETE /api/teacher/classes/[classId]/teachers/[teacherId]
// Removes a co-teacher from the class. Only the primary (or admin) may call.
// The primary teacher cannot be removed via this endpoint — change the class
// owner separately if you want to transfer.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ classId: string; teacherId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { classId, teacherId } = await params;

    if (
      user.role !== 'admin' &&
      !(await userIsClassPrimary(user.id, classId))
    ) {
      return NextResponse.json(
        { error: 'Only the primary teacher can remove co-teachers' },
        { status: 403 },
      );
    }

    const deleted = await db
      .delete(classTeachers)
      .where(
        and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, teacherId)),
      )
      .returning({ id: classTeachers.id });

    if (!deleted.length) {
      return NextResponse.json(
        { error: 'Co-teacher not found on this class' },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError(error, 'api/teacher/classes/teachers DELETE');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
