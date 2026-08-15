import { NextRequest } from 'next/server';
import { mobileRefreshRequestSchema } from '@starling-rise/contracts';
import { rotateMobileSession } from '@/lib/auth/mobile-session';
import { requestIp } from '@/lib/auth/student-login';
import { logError } from '@/lib/logger';
import { mobileAuthResponse, mobileError } from '@/lib/mobile/http';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const parsed = mobileRefreshRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return mobileError('BAD_REQUEST', 'Invalid refresh request.', 400);
    }

    const tokens = await rotateMobileSession(
      parsed.data.refreshToken,
      {
        platform: parsed.data.platform,
        deviceName: parsed.data.deviceName,
      },
      {
        ipAddress: requestIp(request),
        userAgent: request.headers.get('user-agent') ?? undefined,
      },
    );
    if (!tokens) {
      return mobileError(
        'SESSION_EXPIRED',
        'This session has expired. Please sign in again.',
        401,
      );
    }

    return mobileAuthResponse(tokens);
  } catch (error) {
    logError(error, 'api/mobile/v1/auth/refresh');
    return mobileError('INTERNAL_ERROR', 'Unable to refresh the session.', 500);
  }
}
