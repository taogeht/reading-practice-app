import { NextRequest, NextResponse } from 'next/server';
import { setCookie } from 'cookies-next';
import { authenticateUser, createSession, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/auth';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const user = await authenticateUser(email, password);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const sessionId = await createSession(user.id);
    
    const response = NextResponse.json(
      { 
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
        }
      },
      { status: 200 }
    );

    // Set HTTP-only cookie
    response.cookies.set(COOKIE_NAME, sessionId, COOKIE_OPTIONS);

    return response;
    
  } catch (error) {
    const context = createRequestContext('POST', '/api/auth/login');
    logError(error, context);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}