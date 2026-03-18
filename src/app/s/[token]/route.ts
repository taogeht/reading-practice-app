import { NextRequest, NextResponse } from 'next/server';
import { loginWithToken, createSession, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/auth';

interface RouteParams {
    params: Promise<{ token: string }>;
}

// GET /s/[token] - Instant passwordless login for students
export async function GET(request: NextRequest, { params }: RouteParams) {
    const { token } = await params;

    const user = await loginWithToken(token);
    if (!user) {
        // Invalid or expired token — redirect to generic student login
        return NextResponse.redirect(new URL('/student-login', request.url));
    }

    // Create a session and set the cookie
    const sessionId = await createSession(user.id);
    const response = NextResponse.redirect(new URL('/student/dashboard', request.url));
    response.cookies.set(COOKIE_NAME, sessionId, COOKIE_OPTIONS);

    return response;
}
