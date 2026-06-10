import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { accessibleClassIds } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import { students, classEnrollments, classes, studentReadingLevelHistory } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// Update a student's reading level and record the change in
// student_reading_level_history (who + when), powering the longitudinal
// "journey" view. Enrollment-scoped to classes the teacher manages; admins see
// every class via accessibleClassIds. A no-op (same level) is accepted but not
// logged, so re-saving the same value doesn't pollute the history.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const { studentId } = await params;

    const allowedClassIds = await accessibleClassIds(user.id, user.role);
    if (allowedClassIds.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    const scoped = await db
      .select({ current: students.readingLevel })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .innerJoin(classes, eq(classEnrollments.classId, classes.id))
      .where(and(eq(classEnrollments.studentId, studentId), inArray(classes.id, allowedClassIds)))
      .limit(1);
    if (!scoped.length) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const body = await request.json();
    const { level, note } = body;
    if (typeof level !== 'string' || !level.trim()) {
      return NextResponse.json({ error: 'A reading level is required' }, { status: 400 });
    }
    const trimmed = level.trim();
    if (trimmed.length > 50) {
      return NextResponse.json({ error: 'Reading level is too long (max 50 chars)' }, { status: 400 });
    }

    const current = scoped[0].current;
    if (current === trimmed) {
      return NextResponse.json({ success: true, changed: false, level: trimmed });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(students)
        .set({ readingLevel: trimmed, updatedAt: new Date() })
        .where(eq(students.id, studentId));
      await tx.insert(studentReadingLevelHistory).values({
        studentId,
        level: trimmed,
        changedByUserId: user.id,
        note: typeof note === 'string' && note.trim() ? note.trim() : null,
      });
    });

    return NextResponse.json({ success: true, changed: true, level: trimmed });
  } catch (error) {
    logError(error, 'api/teacher/students/[studentId]/reading-level');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
