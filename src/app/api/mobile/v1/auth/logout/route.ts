import { NextRequest, NextResponse } from 'next/server';
import { mobileLogoutRequestSchema } from '@starling-rise/contracts';
import { revokeMobileSession } from '@/lib/auth/mobile-session';
import { logError } from '@/lib/logger';
import { mobileError } from '@/lib/mobile/http';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const parsed = mobileLogoutRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return mobileError('BAD_REQUEST', 'Invalid logout request.', 400);
    }

    // Possession of the opaque refresh token is sufficient to revoke it. The
    // response is deliberately idempotent and does not disclose token validity.
    await revokeMobileSession(parsed.data.refreshToken);
    return NextResponse.json({ message: 'Logout successful' });
  } catch (error) {
    logError(error, 'api/mobile/v1/auth/logout');
    return mobileError('INTERNAL_ERROR', 'Unable to sign out.', 500);
  }
}
