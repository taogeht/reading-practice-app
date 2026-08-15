import { NextRequest } from 'next/server';
import { mobileQrLoginRequestSchema } from '@starling-rise/contracts';
import { issueMobileSession } from '@/lib/auth/mobile-session';
import {
  authenticateStudentLoginToken,
  requestIp,
} from '@/lib/auth/student-login';
import { logError } from '@/lib/logger';
import { mobileAuthResponse, mobileError } from '@/lib/mobile/http';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const parsed = mobileQrLoginRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return mobileError('BAD_REQUEST', 'Invalid QR login request.', 400);
    }

    const login = await authenticateStudentLoginToken({
      loginToken: parsed.data.loginToken,
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
    logError(error, 'api/mobile/v1/auth/qr');
    return mobileError('INTERNAL_ERROR', 'Unable to sign in.', 500);
  }
}
