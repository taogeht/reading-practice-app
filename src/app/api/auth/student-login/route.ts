import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { students, users, session, classEnrollments, classes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateSessionId } from '@/lib/auth';
import { cookies } from 'next/headers';
import { logError } from '@/lib/logger';
import { checkRateLimit, recordFailure, clearRateLimit, type RateLimitPolicy } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// A visual password is one of ~12-13 fixed options, so it's cheap to brute
// force without throttling. Per-student is the precise control; per-IP is a
// looser backstop tuned to survive a shared classroom NAT (one school egress IP).
const PER_STUDENT: RateLimitPolicy = { maxFailures: 8, windowMs: 10 * 60_000, lockMs: 5 * 60_000 };
const PER_IP: RateLimitPolicy = { maxFailures: 50, windowMs: 10 * 60_000, lockMs: 5 * 60_000 };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, visualPassword, classId } = body;

    if (!studentId || !visualPassword) {
      return NextResponse.json(
        { error: 'Student ID and visual password are required' },
        { status: 400 },
      );
    }
    // classId is required so every login is verified against class enrollment,
    // preventing an attacker from targeting an arbitrary studentId school-wide.
    if (!classId) {
      return NextResponse.json({ error: 'classId is required' }, { status: 400 });
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('remote-addr') ||
      'unknown';
    const studentKey = `login:student:${studentId}`;
    const ipKey = `login:ip:${ip}`;

    const studentLimit = checkRateLimit(studentKey, PER_STUDENT);
    const ipLimit = checkRateLimit(ipKey, PER_IP);
    if (studentLimit.blocked || ipLimit.blocked) {
      const retryAfter = Math.max(studentLimit.retryAfterSec, ipLimit.retryAfterSec);
      return NextResponse.json(
        { error: 'Too many attempts. Please wait and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    const studentData = await db
      .select({
        id: students.id,
        visualPasswordType: students.visualPasswordType,
        visualPasswordData: students.visualPasswordData,
        userId: students.id,
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
      recordFailure(ipKey, PER_IP);
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const student = studentData[0];

    if (!student.active) {
      recordFailure(ipKey, PER_IP);
      return NextResponse.json({ error: 'Student account is inactive' }, { status: 403 });
    }

    const enrollment = await db
      .select({ classActive: classes.active })
      .from(classEnrollments)
      .innerJoin(classes, eq(classEnrollments.classId, classes.id))
      .where(
        and(
          eq(classEnrollments.studentId, studentId),
          eq(classEnrollments.classId, classId),
        ),
      )
      .limit(1);

    if (!enrollment.length) {
      recordFailure(ipKey, PER_IP);
      return NextResponse.json({ error: 'Student is not enrolled in this class' }, { status: 403 });
    }

    if (!enrollment[0].classActive) {
      return NextResponse.json({ error: 'Class is not active' }, { status: 403 });
    }

    const correctAnswer = getCorrectAnswer(
      student.visualPasswordData,
      student.visualPasswordType || '',
    );

    // Reject an empty correctAnswer outright so malformed password data can't be
    // matched by an empty/garbage guess.
    if (!correctAnswer || visualPassword !== correctAnswer) {
      recordFailure(studentKey, PER_STUDENT);
      recordFailure(ipKey, PER_IP);
      return NextResponse.json({ error: 'Invalid visual password' }, { status: 401 });
    }

    // Success — clear this student's failure counter.
    clearRateLimit(studentKey);

    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.insert(session).values({
      id: sessionId,
      token: sessionId,
      userId: student.userId,
      expiresAt,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || 'unknown',
    });

    const cookieStore = await cookies();
    cookieStore.set('session-id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
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
    });
  } catch (error) {
    logError(error, 'api/auth/student-login');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getCorrectAnswer(passwordData: any, type: string): string {
  switch (type) {
    case 'animal':
      return passwordData?.animal ?? '';
    case 'object':
      return passwordData?.object ?? '';
    default:
      return '';
  }
}
