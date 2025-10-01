import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, classEnrollments, students } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/audit';

export const runtime = 'nodejs';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: studentId } = await params;
    const body = await request.json().catch(() => ({}));
    const rawClassId = body?.classId;
    const targetClassId =
      typeof rawClassId === 'string' && rawClassId.trim().length > 0
        ? rawClassId.trim()
        : null;

    const [studentRecord] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);

    if (!studentRecord) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (targetClassId) {
      const [classRecord] = await db
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.id, targetClassId))
        .limit(1);

      if (!classRecord) {
        return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(classEnrollments)
        .where(eq(classEnrollments.studentId, studentId));

      if (targetClassId) {
        await tx.insert(classEnrollments).values({
          studentId,
          classId: targetClassId,
        });
      }
    });

    await recordAuditEvent({
      userId: currentUser.id,
      action: 'admin.student.reassign',
      resourceType: 'student',
      resourceId: studentId,
      details: {
        classId: targetClassId,
      },
      request,
    });

    return NextResponse.json({
      message: targetClassId
        ? 'Student assigned to new class'
        : 'Student removed from all classes',
      classId: targetClassId,
    });
  } catch (error) {
    logError(error, 'api/admin/students/[id]/class');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
