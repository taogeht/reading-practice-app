import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  classes,
  classEnrollments,
  schools,
  teachers,
  users,
} from '@/lib/db/schema';
import { alias } from 'drizzle-orm/pg-core';
import { count, eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/audit';

export const runtime = 'nodejs';

const teacherUsers = alias(users, 'teacher_users');

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const classList = await db
      .select({
        id: classes.id,
        name: classes.name,
        description: classes.description,
        gradeLevel: classes.gradeLevel,
        academicYear: classes.academicYear,
        active: classes.active,
        showPracticeStories: classes.showPracticeStories,
        createdAt: classes.createdAt,
        updatedAt: classes.updatedAt,
        schoolId: classes.schoolId,
        schoolName: schools.name,
        teacherId: classes.teacherId,
        teacherFirstName: teacherUsers.firstName,
        teacherLastName: teacherUsers.lastName,
        teacherEmail: teacherUsers.email,
        studentCount: count(classEnrollments.id).as('studentCount'),
      })
      .from(classes)
      .leftJoin(schools, eq(classes.schoolId, schools.id))
      .leftJoin(teachers, eq(classes.teacherId, teachers.id))
      .leftJoin(teacherUsers, eq(teachers.id, teacherUsers.id))
      .leftJoin(classEnrollments, eq(classEnrollments.classId, classes.id))
      .groupBy(
        classes.id,
        classes.name,
        classes.description,
        classes.gradeLevel,
        classes.academicYear,
        classes.active,
        classes.showPracticeStories,
        classes.createdAt,
        classes.updatedAt,
        classes.schoolId,
        schools.name,
        classes.teacherId,
        teacherUsers.firstName,
        teacherUsers.lastName,
        teacherUsers.email,
      )
      .orderBy(classes.name);

    const formatted = classList.map((cls) => ({
      id: cls.id,
      name: cls.name,
      description: cls.description,
      gradeLevel: cls.gradeLevel,
      academicYear: cls.academicYear,
      active: cls.active,
      showPracticeStories: cls.showPracticeStories,
      createdAt: cls.createdAt,
      updatedAt: cls.updatedAt,
      studentCount: Number(cls.studentCount ?? 0),
      school: cls.schoolId
        ? {
            id: cls.schoolId,
            name: cls.schoolName ?? 'Unknown school',
          }
        : null,
      teacher: cls.teacherId
        ? {
            id: cls.teacherId,
            firstName: cls.teacherFirstName ?? 'Unknown',
            lastName: cls.teacherLastName ?? '',
            email: cls.teacherEmail,
          }
        : null,
    }));

    return NextResponse.json({ classes: formatted });
  } catch (error) {
    logError(error, 'api/admin/classes');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      description,
      schoolId,
      teacherId,
      gradeLevel,
      academicYear,
      showPracticeStories = false,
      active = true,
    } = body;

    if (!name || !schoolId || !teacherId) {
      return NextResponse.json(
        { error: 'Name, schoolId, and teacherId are required' },
        { status: 400 },
      );
    }

    const [schoolExists] = await db
      .select({ id: schools.id })
      .from(schools)
      .where(eq(schools.id, schoolId))
      .limit(1);

    if (!schoolExists) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    const [teacherUserRecord] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, teacherId))
      .limit(1);

    if (!teacherUserRecord || teacherUserRecord.role !== 'teacher') {
      return NextResponse.json(
        { error: 'Teacher not found or not a teacher account' },
        { status: 400 },
      );
    }

    const [existingTeacherProfile] = await db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.id, teacherId))
      .limit(1);

    if (!existingTeacherProfile) {
      await db.insert(teachers).values({ id: teacherId });
    }

    const parsedGradeLevel =
      gradeLevel !== undefined && gradeLevel !== null && gradeLevel !== ''
        ? Number(gradeLevel)
        : null;

    if (
      parsedGradeLevel !== null &&
      (Number.isNaN(parsedGradeLevel) || parsedGradeLevel < 0)
    ) {
      return NextResponse.json(
        { error: 'Grade level must be a positive number' },
        { status: 400 },
      );
    }

    const [newClass] = await db
      .insert(classes)
      .values({
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        schoolId,
        teacherId,
        gradeLevel: parsedGradeLevel,
        academicYear: academicYear ? String(academicYear).trim() : null,
        showPracticeStories: Boolean(showPracticeStories),
        active: Boolean(active),
      })
      .returning();

    await recordAuditEvent({
      userId: user.id,
      action: 'admin.class.create',
      resourceType: 'class',
      resourceId: newClass.id,
      details: {
        name,
        schoolId,
        teacherId,
        gradeLevel: parsedGradeLevel,
        academicYear,
      },
      request,
    });

    return NextResponse.json({ class: newClass }, { status: 201 });
  } catch (error) {
    logError(error, 'api/admin/classes');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
