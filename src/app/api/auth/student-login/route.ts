import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  students,
  users,
  session,
  classEnrollments,
  classes,
  assignments,
  recordings,
} from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { generateSessionId } from '@/lib/auth';
import { cookies } from 'next/headers';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, visualPassword, classId } = body;

    if (!studentId || !visualPassword) {
      return NextResponse.json({ error: 'Student ID and visual password are required' }, { status: 400 });
    }

    // Get student with user information
    const studentData = await db
      .select({
        id: students.id,
        visualPasswordType: students.visualPasswordType,
        visualPasswordData: students.visualPasswordData,
        userId: students.id, // student.id is same as user.id in this schema
        email: users.email,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        active: users.active,
      })
      .from(students)
      .innerJoin(users, eq(students.id, users.id))
      .where(eq(students.id, studentId))
      .limit(1);

    if (studentData.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const student = studentData[0];

    if (!student.active) {
      return NextResponse.json({ error: 'Student account is inactive' }, { status: 403 });
    }

    if (classId) {
      const enrollment = await db
        .select({
          classActive: classes.active,
        })
        .from(classEnrollments)
        .innerJoin(classes, eq(classEnrollments.classId, classes.id))
        .where(and(
          eq(classEnrollments.studentId, studentId),
          eq(classEnrollments.classId, classId)
        ))
        .limit(1);

      if (!enrollment.length) {
        return NextResponse.json({ error: 'Student is not enrolled in this class' }, { status: 403 });
      }

      if (!enrollment[0].classActive) {
        return NextResponse.json({ error: 'Class is not active' }, { status: 403 });
      }
    }

    // Validate visual password
    const correctAnswer = getCorrectAnswer(student.visualPasswordData, student.visualPasswordType || '');
    
    if (visualPassword !== correctAnswer) {
      return NextResponse.json({ error: 'Invalid visual password' }, { status: 401 });
    }

    // Determine if the student has any pending assignments
    const assignmentFilters = [
      eq(assignments.status, 'published'),
      eq(classes.active, true),
    ];

    if (classId) {
      assignmentFilters.push(eq(assignments.classId, classId));
    }

    const pendingAssignmentCandidates = await db
      .select({
        id: assignments.id,
        dueAt: assignments.dueAt,
        assignedAt: assignments.assignedAt,
        createdAt: assignments.createdAt,
        completedCount: sql<number>`COUNT(CASE WHEN ${recordings.id} IS NOT NULL AND ${recordings.status} IN ('submitted', 'reviewed') THEN 1 END)`,
      })
      .from(assignments)
      .innerJoin(classes, eq(assignments.classId, classes.id))
      .innerJoin(
        classEnrollments,
        and(
          eq(classEnrollments.classId, classes.id),
          eq(classEnrollments.studentId, student.userId),
        ),
      )
      .leftJoin(
        recordings,
        and(
          eq(recordings.assignmentId, assignments.id),
          eq(recordings.studentId, student.userId),
        ),
      )
      .where(and(...assignmentFilters))
      .groupBy(
        assignments.id,
        assignments.dueAt,
        assignments.assignedAt,
        assignments.createdAt,
      )
      .orderBy(
        sql`COALESCE(${assignments.dueAt}, ${assignments.assignedAt}, ${assignments.createdAt}) ASC`,
      );

    const nextAssignmentId = pendingAssignmentCandidates.find(
      (candidate) => Number(candidate.completedCount ?? 0) === 0,
    )?.id;

    // Create session
    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(session).values({
      id: sessionId,
      token: sessionId,
      userId: student.userId,
      expiresAt,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('remote-addr') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    });

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set('session-id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours in seconds
      path: '/',
    });

    return NextResponse.json({
      message: 'Login successful',
      user: {
        id: student.userId,
        email: student.email,
        role: student.role,
        firstName: student.firstName,
        lastName: student.lastName,
      },
      nextAssignmentId,
    });
  } catch (error) {
    const body = await request.clone().json().catch(() => ({}));
    logError(error, 'api/auth/student-login');
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      studentId: body?.studentId,
      visualPassword: body?.visualPassword,
      classId: body?.classId,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getCorrectAnswer(passwordData: any, type: string): string {
  switch (type) {
    case 'animal':
      return passwordData.animal;
    case 'object':
      return passwordData.object;
    default:
      return '';
  }
}
