import { NextRequest, NextResponse } from 'next/server';
import { deleteSession, getCurrentSession, COOKIE_NAME } from '@/lib/auth';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const currentSession = await getCurrentSession();

    // Delete session from database if it exists
    if (currentSession) {
      await deleteSession(currentSession.sessionId);
    }

    const response = NextResponse.json(
      { message: 'Logout successful' },
      { status: 200 }
    );

    // Clear the auth cookie
    response.cookies.set(COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    return response;
    
  } catch (error) {
    logError(error, 'api/auth/logout');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
