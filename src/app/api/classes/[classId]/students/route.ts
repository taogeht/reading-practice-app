import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classes, classEnrollments, students, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  try {
    const { classId } = await params;

    // Verify the class exists and is active (public endpoint for student login)
    const classData = await db
      .select({ active: classes.active })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!classData.length || !classData[0].active) {
      return NextResponse.json(
        { error: 'Class not found or not active' },
        { status: 404 }
      );
    }

    // Get students enrolled in this class with their login data
    const enrolledStudents = await db
      .select({
        id: students.id,
        firstName: users.firstName,
        lastName: users.lastName,
        visualPasswordType: students.visualPasswordType,
        visualPasswordData: students.visualPasswordData,
        avatarUrl: students.avatarUrl,
      })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .innerJoin(users, eq(students.id, users.id))
      .where(and(
        eq(classEnrollments.classId, classId),
        eq(users.active, true) // Only active students
      ))
      .orderBy(users.firstName, users.lastName);

    return NextResponse.json({
      students: enrolledStudents
    }, { status: 200 });

  } catch (error) {
    logError(error, 'api/classes/[classId]/students');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
