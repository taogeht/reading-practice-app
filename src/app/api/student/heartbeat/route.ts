import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { session } from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { getCurrentSession } from '@/lib/auth';

export const runtime = 'nodejs';

// POST /api/student/heartbeat - Update session lastActivityAt
export async function POST() {
    try {
        const currentSession = await getCurrentSession();

        if (!currentSession || currentSession.user.role !== 'student') {
            return NextResponse.json({ error: 'No session' }, { status: 401 });
        }

        const now = new Date();

        // Update lastActivityAt for this session (only if not expired)
        const result = await db
            .update(session)
            .set({ lastActivityAt: now, updatedAt: now })
            .where(
                and(
                    eq(session.id, currentSession.sessionId),
                    gt(session.expiresAt, now)
                )
            );

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[POST /api/student/heartbeat] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
