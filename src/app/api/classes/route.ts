import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, teachers, classEnrollments, schoolMemberships } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get teacher ID
    const teacher = await db.query.teachers.findFirst({
      where: eq(teachers.id, user.id),
    });

    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    // Get classes for this teacher with student count
    const teacherClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        description: classes.description,
        gradeLevel: classes.gradeLevel,
        academicYear: classes.academicYear,
        active: classes.active,
        createdAt: classes.createdAt,
        studentCount: count(classEnrollments.studentId),
      })
      .from(classes)
      .leftJoin(classEnrollments, eq(classes.id, classEnrollments.classId))
      .where(eq(classes.teacherId, teacher.id))
      .groupBy(classes.id)
      .orderBy(classes.name);

    return NextResponse.json({
      success: true,
      classes: teacherClasses,
    });
  } catch (error) {
    logError(error, 'api/classes');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get teacher ID
    const teacher = await db.query.teachers.findFirst({
      where: eq(teachers.id, user.id),
    });

    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      description,
      gradeLevel,
      academicYear,
    } = body;

    // Validate required fields
    if (!name) {
      return NextResponse.json(
        { error: 'Class name is required' },
        { status: 400 }
      );
    }

    // Get the teacher's school membership to get schoolId
    const schoolMembership = await db.query.schoolMemberships.findFirst({
      where: eq(schoolMemberships.userId, teacher.id),
    });

    if (!schoolMembership) {
      return NextResponse.json({ error: 'Teacher must be associated with a school' }, { status: 400 });
    }

    // Create the class
    const [newClass] = await db
      .insert(classes)
      .values({
        name,
        description,
        teacherId: teacher.id,
        schoolId: schoolMembership.schoolId,
        gradeLevel,
        academicYear: academicYear || new Date().getFullYear().toString(),
        active: true,
      })
      .returning();

    return NextResponse.json({
      success: true,
      class: newClass,
      message: 'Class created successfully',
    });
  } catch (error) {
    logError(error, 'api/classes');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}