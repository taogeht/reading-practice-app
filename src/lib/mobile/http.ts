import { NextResponse } from 'next/server';
import type {
  MobileAuthResponse,
  MobileErrorCode,
  MobileErrorResponse,
} from '@starling-rise/contracts';
import type { MobileSessionTokens } from '@/lib/auth/mobile-session';

export function mobileError(
  code: MobileErrorCode,
  message: string,
  status: number,
  retryAfterSeconds?: number,
): NextResponse<MobileErrorResponse> {
  const response = NextResponse.json(
    {
      error: {
        code,
        message,
        ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
      },
    },
    { status },
  );
  if (retryAfterSeconds) {
    response.headers.set('Retry-After', String(retryAfterSeconds));
  }
  return response;
}

export function mobileAuthResponse(
  tokens: MobileSessionTokens,
): NextResponse<MobileAuthResponse> {
  return NextResponse.json({
    ...tokens,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
  });
}
