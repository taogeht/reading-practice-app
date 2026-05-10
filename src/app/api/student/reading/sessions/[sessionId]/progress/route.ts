// PATCH /api/student/reading/sessions/[sessionId]/progress
//
// Body: { pagesViewed?: number, abandoned?: boolean }
//
// Lightweight progress check-in. Used during the reader phase as the
// student moves between pages, and by the back-arrow path when the
// student returns to the library mid-read (we don't abandon — they
// can resume — but we keep pagesViewed fresh).
//
// pagesViewed is monotonic: this endpoint never lets it go down so
// out-of-order request retries can't shorten the resume position.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { studentReadingSessions } from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import { awardXp } from '@/lib/gamification/award';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { sessionId } = await params;

    const body = await request.json().catch(() => null);
    const pagesViewed =
      typeof body?.pagesViewed === 'number' && Number.isFinite(body.pagesViewed)
        ? Math.max(0, Math.floor(body.pagesViewed))
        : null;
    const abandoned = body?.abandoned === true;

    const [session] = await db
      .select()
      .from(studentReadingSessions)
      .where(
        and(
          eq(studentReadingSessions.id, sessionId),
          eq(studentReadingSessions.studentId, user.id),
        ),
      )
      .limit(1);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const updates: Partial<typeof studentReadingSessions.$inferInsert> = {};
    if (pagesViewed !== null) {
      // Monotonic: take the GREATEST of current and incoming. Done at
      // the SQL level so a concurrent request can't observe an
      // earlier read-then-write window.
      // Drizzle's .set accepts SQL expressions for jsonb/numerics.
      updates.pagesViewed = sql`GREATEST(${studentReadingSessions.pagesViewed}, ${pagesViewed})` as unknown as number;
    }
    if (abandoned) {
      updates.completionStatus = 'abandoned';
      updates.finishedAt = new Date();
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, noop: true });
    }

    await db
      .update(studentReadingSessions)
      .set(updates)
      .where(eq(studentReadingSessions.id, sessionId));

    // Fire reading_page_finished once per genuine new page advance.
    // Detection lives outside the SQL UPDATE so the GREATEST() guard
    // above stays the source of truth on stored value: we look at
    // (incoming pagesViewed - prior pagesViewed) and award one XP
    // per advance the kid genuinely just made. Re-views (back to
    // page 2 then forward to page 3 again) don't double-fire because
    // the prior value is already at 3 — incoming 3 doesn't exceed it.
    if (pagesViewed !== null && pagesViewed > session.pagesViewed) {
      const advances = pagesViewed - session.pagesViewed;
      try {
        for (let i = 0; i < advances; i++) {
          await awardXp(user.id, 'reading_page_finished', sessionId);
        }
      } catch (err) {
        console.error('[progress] reading_page_finished XP failed:', err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError(error, 'api/student/reading/sessions/[sessionId]/progress');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
