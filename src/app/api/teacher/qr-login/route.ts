import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUser, generateLoginToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { logError, logInfo } from '@/lib/logger';

export const runtime = 'nodejs';

function getBaseUrl(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    'localhost:3000';
  return `${proto}://${host}`;
}

/**
 * GET /api/teacher/qr-login
 * Returns the calling teacher's existing loginToken and magic URL.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [userRow] = await db
      .select({ loginToken: users.loginToken })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const token = userRow?.loginToken ?? null;
    const baseUrl = getBaseUrl(request);
    const loginUrl = token ? `${baseUrl}/s/${token}` : null;

    return NextResponse.json({
      hasToken: Boolean(token),
      token,
      loginUrl,
    });
  } catch (error) {
    logError(error, 'api/teacher/qr-login.GET');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/teacher/qr-login
 * Generates or regenerates a fresh loginToken for the teacher.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const newToken = generateLoginToken();

    const [updated] = await db
      .update(users)
      .set({ loginToken: newToken })
      .where(eq(users.id, user.id))
      .returning({ loginToken: users.loginToken });

    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const baseUrl = getBaseUrl(request);
    const loginUrl = `${baseUrl}/s/${updated.loginToken}`;

    logInfo(
      'teacher QR login token generated',
      `user_id=${user.id} role=${user.role}`,
    );

    return NextResponse.json({
      hasToken: true,
      token: updated.loginToken,
      loginUrl,
    });
  } catch (error) {
    logError(error, 'api/teacher/qr-login.POST');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/teacher/qr-login
 * Revokes the teacher's current loginToken immediately.
 */
export async function DELETE(_request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await db
      .update(users)
      .set({ loginToken: null })
      .where(eq(users.id, user.id));

    logInfo(
      'teacher QR login token revoked',
      `user_id=${user.id} role=${user.role}`,
    );

    return NextResponse.json({
      hasToken: false,
      token: null,
      loginUrl: null,
    });
  } catch (error) {
    logError(error, 'api/teacher/qr-login.DELETE');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
