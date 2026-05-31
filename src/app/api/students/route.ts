import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { students, users, classEnrollments, classes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// GET /api/students?classId=<id> - Roster for the student-login picker, scoped
// to one active class. Does NOT return the visual-password type (that's fetched
// per-student after selection via /api/classes/[classId]/students/[studentId]).
//
// Previously this returned every active student school-wide together with their
// visualPasswordType — an unauthenticated enumeration + password-type leak that,
// with the tiny visual-password keyspace, enabled account takeover. Now it
// requires a classId and mirrors the class-scoped roster.
export async function GET(request: NextRequest) {
  try {
    const classId = request.nextUrl.searchParams.get('classId');
    if (!classId) {
      return NextResponse.json({ error: 'classId is required' }, { status: 400 });
    }

    const studentData = await db
      .select({
        id: students.id,
        firstName: users.firstName,
        lastName: users.lastName,
        avatarUrl: students.avatarUrl,
      })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .innerJoin(users, eq(students.id, users.id))
      .innerJoin(classes, eq(classEnrollments.classId, classes.id))
      .where(
        and(
          eq(classEnrollments.classId, classId),
          eq(users.active, true),
          eq(classes.active, true),
        ),
      );

    return NextResponse.json({
      students: studentData,
    });
  } catch (error) {
    logError(error, 'api/students');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
