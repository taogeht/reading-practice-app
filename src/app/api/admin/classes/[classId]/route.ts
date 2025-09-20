import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, classEnrollments, users, students } from '@/lib/db/schema';
import { eq, and, count } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    const { classId } = await params;

    // Get class details with teacher information
    const classData = await db
      .select({
        id: classes.id,
        name: classes.name,
        description: classes.description,
        gradeLevel: classes.gradeLevel,
        academicYear: classes.academicYear,
        active: classes.active,
        createdAt: classes.createdAt,
        teacherId: classes.teacherId,
        teacherFirstName: users.firstName,
        teacherLastName: users.lastName,
        teacherEmail: users.email,
      })
      .from(classes)
      .leftJoin(users, eq(classes.teacherId, users.id))
      .where(eq(classes.id, classId))
      .limit(1);

    if (!classData.length) {
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
        enrolledAt: classEnrollments.enrolledAt,
      })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .innerJoin(users, eq(students.id, users.id))
      .where(eq(classEnrollments.classId, classId))
      .orderBy(users.firstName, users.lastName);

    const classInfo = classData[0];

    return NextResponse.json({
      class: {
        id: classInfo.id,
        name: classInfo.name,
        description: classInfo.description,
        gradeLevel: classInfo.gradeLevel,
        academicYear: classInfo.academicYear,
        active: classInfo.active,
        createdAt: classInfo.createdAt,
        studentCount: enrolledStudents.length,
        students: enrolledStudents,
        teacher: classInfo.teacherId ? {
          id: classInfo.teacherId,
          firstName: classInfo.teacherFirstName,
          lastName: classInfo.teacherLastName,
          email: classInfo.teacherEmail,
        } : null,
      }
    }, { status: 200 });

  } catch (error) {
    logError(error, 'api/admin/classes/[classId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    const { classId } = await params;
    const body = await request.json();
    const { name, description, gradeLevel, academicYear, active } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Class name is required' },
        { status: 400 }
      );
    }

    // Verify class exists
    const existingClass = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!existingClass.length) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // Update class (admin can modify any class)
    const updatedClass = await db
      .update(classes)
      .set({
        name: name.trim(),
        description: description?.trim() || null,
        gradeLevel: gradeLevel || null,
        academicYear: academicYear?.trim() || null,
        active: active !== undefined ? active : true,
        updatedAt: new Date(),
      })
      .where(eq(classes.id, classId))
      .returning();

    return NextResponse.json(
      { class: updatedClass[0], message: 'Class updated successfully' },
      { status: 200 }
    );

  } catch (error) {
    logError(error, 'api/admin/classes/[classId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    const { classId } = await params;

    // Verify class exists
    const existingClass = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!existingClass.length) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // Admin can delete class even with students (admin override)
    // First remove all enrollments
    await db
      .delete(classEnrollments)
      .where(eq(classEnrollments.classId, classId));

    // Then delete the class
    await db
      .delete(classes)
      .where(eq(classes.id, classId));

    return NextResponse.json(
      { message: 'Class deleted successfully (admin override)' },
      { status: 200 }
    );

  } catch (error) {
    logError(error, 'api/admin/classes/[classId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}