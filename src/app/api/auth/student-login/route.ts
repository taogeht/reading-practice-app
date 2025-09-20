import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { students, users, session } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateSessionId } from '@/lib/auth';
import { cookies } from 'next/headers';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, visualPassword } = body;

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

    // Validate visual password
    const correctAnswer = getCorrectAnswer(student.visualPasswordData, student.visualPasswordType);
    
    if (visualPassword !== correctAnswer) {
      return NextResponse.json({ error: 'Invalid visual password' }, { status: 401 });
    }

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
    });
  } catch (error) {
    const body = await request.clone().json().catch(() => ({}));
    logError(error, 'api/auth/student-login');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      studentId: body?.studentId,
      visualPassword: body?.visualPassword
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
    case 'color_shape':
      return `${passwordData.color}-${passwordData.shape}`;
    default:
      return '';
  }
}