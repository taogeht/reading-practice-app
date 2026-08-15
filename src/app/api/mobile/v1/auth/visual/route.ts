import { NextRequest } from 'next/server';
import { mobileVisualLoginRequestSchema } from '@starling-rise/contracts';
import { issueMobileSession } from '@/lib/auth/mobile-session';
import {
  authenticateStudentVisualPassword,
  requestIp,
} from '@/lib/auth/student-login';
import { logError } from '@/lib/logger';
import { mobileAuthResponse, mobileError } from '@/lib/mobile/http';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const parsed = mobileVisualLoginRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return mobileError('BAD_REQUEST', 'Invalid visual login request.', 400);
    }

    const login = await authenticateStudentVisualPassword({
      studentId: parsed.data.studentId,
      classId: parsed.data.classId,
      visualPassword: parsed.data.visualPassword,
      ipAddress: requestIp(request),
    });
    if (!login.ok) {
      return mobileError(
        login.code,
        login.message,
        login.status,
        login.retryAfterSeconds,
      );
    }

    const tokens = await issueMobileSession(login.user, parsed.data, {
      ipAddress: requestIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });
    return mobileAuthResponse(tokens);
  } catch (error) {
    logError(error, 'api/mobile/v1/auth/visual');
    return mobileError('INTERNAL_ERROR', 'Unable to sign in.', 500);
  }
}
