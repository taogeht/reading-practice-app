import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, classEnrollments, students, users } from '@/lib/db/schema';
import { eq, and, notInArray } from 'drizzle-orm';

export const runtime = 'nodejs';

// Get students in a specific class
export async function GET(
  request: NextRequest,
  { params }: { params: { classId: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'teacher') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    const { classId } = params;

    // Verify teacher owns this class
    const teacherClass = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(
        eq(classes.id, classId),
        eq(classes.teacherId, user.id)
      ))
      .limit(1);

    if (!teacherClass.length) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // Get enrolled students
    const enrolledStudents = await db
      .select({
        id: students.id,
        firstName: users.firstName,
        lastName: users.lastName,
        gradeLevel: students.gradeLevel,
        readingLevel: students.readingLevel,
        parentEmail: students.parentEmail,
        enrolledAt: classEnrollments.enrolledAt,
      })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .innerJoin(users, eq(students.id, users.id))
      .where(eq(classEnrollments.classId, classId))
      .orderBy(users.firstName, users.lastName);

    return NextResponse.json({ students: enrolledStudents }, { status: 200 });

  } catch (error) {
    console.error('Get class students error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Add existing student to class
export async function POST(
  request: NextRequest,
  { params }: { params: { classId: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'teacher') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    const { classId } = params;
    const body = await request.json();
    const { studentId } = body;

    if (!studentId) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    // Verify teacher owns this class
    const teacherClass = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(
        eq(classes.id, classId),
        eq(classes.teacherId, user.id)
      ))
      .limit(1);

    if (!teacherClass.length) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // Check if student exists
    const student = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);

    if (!student.length) {
      return NextResponse.json(
        { error: 'Student not found' },
        { status: 404 }
      );
    }

    // Check if student is already enrolled
    const existingEnrollment = await db
      .select({ id: classEnrollments.id })
      .from(classEnrollments)
      .where(and(
        eq(classEnrollments.classId, classId),
        eq(classEnrollments.studentId, studentId)
      ))
      .limit(1);

    if (existingEnrollment.length) {
      return NextResponse.json(
        { error: 'Student is already enrolled in this class' },
        { status: 400 }
      );
    }

    // Enroll student in class
    await db
      .insert(classEnrollments)
      .values({
        classId,
        studentId,
      });

    return NextResponse.json(
      { message: 'Student enrolled successfully' },
      { status: 201 }
    );

  } catch (error) {
    console.error('Enroll student error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}