import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  classes,
  classEnrollments,
  students,
  teachers,
  users,
} from '@/lib/db/schema';
import { alias } from 'drizzle-orm/pg-core';
import { asc, eq, isNull } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

const teacherUsers = alias(users, 'teacher_users');
const studentUsers = alias(users, 'student_users');

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const classRows = await db
      .select({
        classId: classes.id,
        className: classes.name,
        classActive: classes.active,
        classGradeLevel: classes.gradeLevel,
        teacherId: classes.teacherId,
        teacherFirstName: teacherUsers.firstName,
        teacherLastName: teacherUsers.lastName,
        teacherEmail: teacherUsers.email,
        studentId: students.id,
        studentFirstName: studentUsers.firstName,
        studentLastName: studentUsers.lastName,
        studentGradeLevel: students.gradeLevel,
        studentReadingLevel: students.readingLevel,
        studentParentEmail: students.parentEmail,
        studentActive: studentUsers.active,
      })
      .from(classes)
      .leftJoin(teachers, eq(classes.teacherId, teachers.id))
      .leftJoin(teacherUsers, eq(teachers.id, teacherUsers.id))
      .leftJoin(classEnrollments, eq(classEnrollments.classId, classes.id))
      .leftJoin(students, eq(classEnrollments.studentId, students.id))
      .leftJoin(studentUsers, eq(students.id, studentUsers.id))
      .orderBy(
        asc(classes.name),
        asc(studentUsers.firstName),
        asc(studentUsers.lastName),
      );

    const classMap = new Map<
      string,
      {
        id: string;
        name: string;
        active: boolean;
        gradeLevel: number | null;
        teacherName: string | null;
        teacherEmail: string | null;
        students: Array<{
          id: string;
          firstName: string;
          lastName: string;
          gradeLevel: number | null;
          readingLevel: string | null;
          parentEmail: string | null;
          active: boolean;
        }>;
      }
    >();

    for (const row of classRows) {
      const existing = classMap.get(row.classId);
      if (!existing) {
        const teacherName = row.teacherFirstName
          ? `${row.teacherFirstName} ${row.teacherLastName ?? ''}`.trim()
          : null;

        classMap.set(row.classId, {
          id: row.classId,
          name: row.className,
          active: row.classActive,
          gradeLevel: row.classGradeLevel,
          teacherName: teacherName && teacherName.length ? teacherName : null,
          teacherEmail: row.teacherEmail ?? null,
          students: [],
        });
      }

      if (row.studentId) {
        const classEntry = classMap.get(row.classId);
        if (classEntry) {
          classEntry.students.push({
            id: row.studentId,
            firstName: row.studentFirstName ?? 'Unknown',
            lastName: row.studentLastName ?? '',
            gradeLevel: row.studentGradeLevel,
            readingLevel: row.studentReadingLevel,
            parentEmail: row.studentParentEmail,
            active: Boolean(row.studentActive),
          });
        }
      }
    }

    const classesWithStudents = Array.from(classMap.values()).map((cls) => ({
      id: cls.id,
      name: cls.name,
      active: cls.active,
      gradeLevel: cls.gradeLevel,
      teacherName: cls.teacherName,
      teacherEmail: cls.teacherEmail,
      studentCount: cls.students.length,
      students: cls.students,
    }));

    const unassignedRows = await db
      .select({
        id: students.id,
        firstName: studentUsers.firstName,
        lastName: studentUsers.lastName,
        gradeLevel: students.gradeLevel,
        readingLevel: students.readingLevel,
        parentEmail: students.parentEmail,
        active: studentUsers.active,
      })
      .from(students)
      .innerJoin(studentUsers, eq(students.id, studentUsers.id))
      .leftJoin(classEnrollments, eq(classEnrollments.studentId, students.id))
      .where(isNull(classEnrollments.classId))
      .orderBy(asc(studentUsers.firstName), asc(studentUsers.lastName));

    const unassignedStudents = unassignedRows.map((row) => ({
      id: row.id,
      firstName: row.firstName ?? 'Unknown',
      lastName: row.lastName ?? '',
      gradeLevel: row.gradeLevel,
      readingLevel: row.readingLevel,
      parentEmail: row.parentEmail,
      active: Boolean(row.active),
    }));

    return NextResponse.json({
      classes: classesWithStudents,
      unassignedStudents,
    });
  } catch (error) {
    logError(error, 'api/admin/students');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
