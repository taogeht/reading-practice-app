import { NextResponse } from 'next/server';
import type { MobileMeResponse } from '@starling-rise/contracts';
import { getCurrentUser } from '@/lib/auth';
import { mobileError } from '@/lib/mobile/http';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'student') {
    return mobileError('NOT_AUTHENTICATED', 'Not authenticated.', 401);
  }

  return NextResponse.json<MobileMeResponse>({
    user: { ...user, role: 'student' },
  });
}
