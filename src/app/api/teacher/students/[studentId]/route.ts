import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { students, users, classEnrollments, classes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
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
      .where(and(eq(classEnrollments.studentId, studentId), eq(classes.teacherId, user.id)));

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
        classes: classList,
      },
    });
  } catch (error) {
    logError(error, 'api/teacher/students/[studentId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
