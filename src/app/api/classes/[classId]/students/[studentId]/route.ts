import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classEnrollments, students, users, classes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string; studentId: string }> }
) {
  try {
    const { classId, studentId } = await params;

    const [classRecord] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const [studentEnrollment] = await db
      .select({
        studentId: classEnrollments.studentId,
      })
      .from(classEnrollments)
      .where(and(
        eq(classEnrollments.classId, classId),
        eq(classEnrollments.studentId, studentId),
      ))
      .limit(1);

    if (!studentEnrollment) {
      return NextResponse.json({ error: 'Student not enrolled in this class' }, { status: 404 });
    }

    const [studentRecord] = await db
      .select({
        id: students.id,
        firstName: users.firstName,
        lastName: users.lastName,
        visualPasswordType: students.visualPasswordType,
        visualPasswordData: students.visualPasswordData,
        avatarUrl: students.avatarUrl,
      })
      .from(students)
      .innerJoin(users, eq(students.id, users.id))
      .where(eq(students.id, studentId))
      .limit(1);

    if (!studentRecord) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    return NextResponse.json({
      student: {
        id: studentRecord.id,
        firstName: studentRecord.firstName,
        lastName: studentRecord.lastName,
        visualPasswordType: studentRecord.visualPasswordType,
        visualPasswordData: studentRecord.visualPasswordData,
        avatarUrl: studentRecord.avatarUrl,
      },
    });
  } catch (error) {
    logError(error, 'api/classes/[classId]/students/[studentId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
