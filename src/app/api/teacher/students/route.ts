import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, students, teachers, classEnrollments, classes, schoolMemberships, schools } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

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

    // Get all students from teacher's classes
    const teacherStudents = await db
      .select({
        id: students.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        gradeLevel: students.gradeLevel,
        readingLevel: students.readingLevel,
        parentEmail: students.parentEmail,
        visualPasswordType: students.visualPasswordType,
        createdAt: users.createdAt,
        className: classes.name,
        classId: classes.id,
      })
      .from(students)
      .innerJoin(users, eq(students.id, users.id))
      .innerJoin(classEnrollments, eq(students.id, classEnrollments.studentId))
      .innerJoin(classes, eq(classEnrollments.classId, classes.id))
      .where(eq(classes.teacherId, user.id))
      .orderBy(users.firstName, users.lastName);

    return NextResponse.json({ students: teacherStudents }, { status: 200 });

  } catch (error) {
    console.error('Get students error:', error);
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
    const {
      firstName,
      lastName,
      gradeLevel,
      readingLevel,
      parentEmail,
      visualPasswordType,
      visualPasswordData,
      classId
    } = body;

    // Validate required fields
    if (!firstName || !lastName || !visualPasswordType || !visualPasswordData || !classId) {
      return NextResponse.json(
        { error: 'First name, last name, visual password, and class are required' },
        { status: 400 }
      );
    }

    // Verify teacher owns the class
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
        { error: 'Class not found or not authorized' },
        { status: 404 }
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

    // Get teacher's school for the student
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

    // Create user record first
    const newUser = await db
      .insert(users)
      .values({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: null, // Students don't have email logins
        role: 'student',
        active: true,
      })
      .returning();

    const userId = newUser[0].id;

    // Create student record
    const newStudent = await db
      .insert(students)
      .values({
        id: userId,
        gradeLevel: gradeLevel || null,
        readingLevel: readingLevel?.trim() || null,
        parentEmail: parentEmail?.trim() || null,
        visualPasswordType,
        visualPasswordData,
      })
      .returning();

    // Add student to school
    await db
      .insert(schoolMemberships)
      .values({
        userId,
        schoolId: teacherSchool[0].schoolId,
        isPrimary: true,
      });

    // Enroll student in class
    await db
      .insert(classEnrollments)
      .values({
        classId,
        studentId: userId,
      });

    return NextResponse.json(
      {
        student: {
          id: userId,
          firstName: newUser[0].firstName,
          lastName: newUser[0].lastName,
          ...newStudent[0],
        },
        message: 'Student created and enrolled successfully'
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Create student error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}