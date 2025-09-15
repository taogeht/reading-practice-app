import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, schools, schoolMemberships, teachers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'teacher') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    // Get teacher's classes
    const teacherClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        description: classes.description,
        gradeLevel: classes.gradeLevel,
        academicYear: classes.academicYear,
        active: classes.active,
        createdAt: classes.createdAt,
        schoolName: schools.name,
      })
      .from(classes)
      .innerJoin(schools, eq(classes.schoolId, schools.id))
      .where(eq(classes.teacherId, user.id))
      .orderBy(classes.createdAt);

    return NextResponse.json({ classes: teacherClasses }, { status: 200 });

  } catch (error) {
    console.error('Get classes error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'teacher') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, description, gradeLevel, academicYear } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Class name is required' },
        { status: 400 }
      );
    }

    // Ensure teacher record exists
    const teacherRecord = await db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.id, user.id))
      .limit(1);

    if (!teacherRecord.length) {
      // Create teacher record if it doesn't exist
      await db.insert(teachers).values({
        id: user.id,
        employeeId: null,
        department: null,
        subjects: null,
      });
    }

    // Get teacher's primary school
    let teacherSchool = await db
      .select({ schoolId: schoolMemberships.schoolId })
      .from(schoolMemberships)
      .where(and(
        eq(schoolMemberships.userId, user.id),
        eq(schoolMemberships.isPrimary, true)
      ))
      .limit(1);

    if (!teacherSchool.length) {
      // Create a default school for the teacher
      const defaultSchool = await db
        .insert(schools)
        .values({
          name: `${user.firstName} ${user.lastName}'s School`,
          district: null,
          address: null,
          city: null,
          state: null,
          zipCode: null,
        })
        .returning();

      // Associate teacher with the new school
      await db
        .insert(schoolMemberships)
        .values({
          userId: user.id,
          schoolId: defaultSchool[0].id,
          isPrimary: true,
        });

      teacherSchool = [{ schoolId: defaultSchool[0].id }];
    }

    // Create new class
    const newClass = await db
      .insert(classes)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        gradeLevel: gradeLevel || null,
        academicYear: academicYear?.trim() || null,
        teacherId: user.id,
        schoolId: teacherSchool[0].schoolId,
      })
      .returning();

    return NextResponse.json(
      { class: newClass[0], message: 'Class created successfully' },
      { status: 201 }
    );

  } catch (error) {
    console.error('Create class error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}