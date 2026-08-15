import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSession, COOKIE_NAME } from '@/lib/auth';
import {
  authenticateStudentVisualPassword,
  requestIp,
} from '@/lib/auth/student-login';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const login = await authenticateStudentVisualPassword({
      studentId: typeof body.studentId === 'string' ? body.studentId : '',
      classId: typeof body.classId === 'string' ? body.classId : '',
      visualPassword:
        typeof body.visualPassword === 'string' ? body.visualPassword : '',
      ipAddress: requestIp(request),
    });

    if (!login.ok) {
      return NextResponse.json(
        { error: login.message },
        {
          status: login.status,
          ...(login.retryAfterSeconds
            ? { headers: { 'Retry-After': String(login.retryAfterSeconds) } }
            : {}),
        },
      );
    }

    const sessionId = await createSession(login.user.id, {
      durationMs: 24 * 60 * 60_000,
      ipAddress: requestIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    });

    return NextResponse.json({
      message: 'Login successful',
      user: login.user,
    });
  } catch (error) {
    logError(error, 'api/auth/student-login');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
