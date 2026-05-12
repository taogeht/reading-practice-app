import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { accessibleClassIds } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import { students, users, classEnrollments, classes } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'teacher') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const { studentId } = await params;

    // Co-teacher fix: previously this filtered on classes.teacher_id = user.id,
    // which dropped students whose only enrollment was a class the user
    // co-teaches. accessibleClassIds() returns primary-owned + co-taught
    // (plus all for admins), keeping the JOIN scoped to classes the user
    // legitimately sees.
    const allowedClassIds = await accessibleClassIds(user.id, user.role);
    if (allowedClassIds.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const enrollmentRecords = await db
      .select({
        studentId: students.id,
        firstName: users.firstName,
        lastName: users.lastName,
        gradeLevel: students.gradeLevel,
        readingLevel: students.readingLevel,
        parentEmail: students.parentEmail,
        visualPasswordType: students.visualPasswordType,
        visualPasswordData: students.visualPasswordData,
        avatarUrl: students.avatarUrl,
        oupEmail: students.oupEmail,
        oupPassword: students.oupPassword,
        classId: classes.id,
        className: classes.name,
        classDescription: classes.description,
        showPracticeStories: classes.showPracticeStories,
        classActive: classes.active,
        enrolledAt: classEnrollments.enrolledAt,
      })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .innerJoin(users, eq(students.id, users.id))
      .innerJoin(classes, eq(classEnrollments.classId, classes.id))
      .where(and(eq(classEnrollments.studentId, studentId), inArray(classes.id, allowedClassIds)));

    if (!enrollmentRecords.length) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const base = enrollmentRecords[0];
    const classList = enrollmentRecords.map((record) => ({
      id: record.classId,
      name: record.className,
      description: record.classDescription,
      showPracticeStories: record.showPracticeStories,
      active: record.classActive,
      enrolledAt: record.enrolledAt,
    }));

    return NextResponse.json({
      student: {
        id: base.studentId,
        firstName: base.firstName,
        lastName: base.lastName,
        gradeLevel: base.gradeLevel,
        readingLevel: base.readingLevel,
        parentEmail: base.parentEmail,
        visualPasswordType: base.visualPasswordType,
        visualPasswordData: base.visualPasswordData,
        avatarUrl: base.avatarUrl,
        oupEmail: base.oupEmail,
        oupPassword: base.oupPassword,
        classes: classList,
      },
    });
  } catch (error) {
    logError(error, 'api/teacher/students/[studentId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'teacher') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const { studentId } = await params;

    // PUT (edit OUP credentials) is still gated to classes the user sees;
    // co-teachers can adjust student records on shared classes too. If
    // this should be primary-only later, swap accessibleClassIds for a
    // userIsClassPrimary check per-enrollment.
    const allowedClassIds = await accessibleClassIds(user.id, user.role);
    if (allowedClassIds.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    const enrollment = await db
      .select({ studentId: classEnrollments.studentId })
      .from(classEnrollments)
      .innerJoin(classes, eq(classEnrollments.classId, classes.id))
      .where(and(eq(classEnrollments.studentId, studentId), inArray(classes.id, allowedClassIds)))
      .limit(1);

    if (!enrollment.length) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const body = await request.json();
    const { oupEmail, oupPassword } = body;

    await db
      .update(students)
      .set({
        oupEmail: oupEmail?.trim() || null,
        oupPassword: oupPassword?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(students.id, studentId));

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, 'api/teacher/students/[studentId] PUT');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
