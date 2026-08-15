import { NextRequest, NextResponse } from 'next/server';
import { createSession, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/auth';
import {
    authenticateStudentLoginToken,
    requestIp,
} from '@/lib/auth/student-login';

interface RouteParams {
    params: Promise<{ token: string }>;
}

function getBaseUrl(request: NextRequest): string {
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    return `${proto}://${host}`;
}

// GET /s/[token] - Instant passwordless login for students
export async function GET(request: NextRequest, { params }: RouteParams) {
    const { token } = await params;
    const baseUrl = getBaseUrl(request);

    const login = await authenticateStudentLoginToken({
        loginToken: token,
        ipAddress: requestIp(request),
    });
    if (!login.ok) {
        return NextResponse.redirect(`${baseUrl}/student-login`);
    }

    // Create a session and set the cookie
    const sessionId = await createSession(login.user.id, {
        ipAddress: requestIp(request),
        userAgent: request.headers.get('user-agent') ?? undefined,
    });
    const response = NextResponse.redirect(`${baseUrl}/student/dashboard`);
    response.cookies.set(COOKIE_NAME, sessionId, COOKIE_OPTIONS);

    return response;
}
