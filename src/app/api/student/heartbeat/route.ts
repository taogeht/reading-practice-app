import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { session, studentDailyActivity } from '@/lib/db/schema';
import { eq, and, gt, sql } from 'drizzle-orm';
import { getCurrentSession } from '@/lib/auth';
import { getTodayDateString } from '@/lib/date-utils';

export const runtime = 'nodejs';

const VALID_ACTIVITY_TYPES = ['reading', 'spelling', 'assignment', 'practice', 'general'] as const;
type ValidActivityType = typeof VALID_ACTIVITY_TYPES[number];

// POST /api/student/heartbeat - Update session and record granular activity time
export async function POST(request: NextRequest) {
    try {
        const currentSession = await getCurrentSession();

        if (!currentSession || currentSession.user.role !== 'student') {
            return NextResponse.json({ error: 'No session' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const rawType = typeof body.activityType === 'string' ? body.activityType.trim().toLowerCase() : '';
        const activityType: ValidActivityType = (VALID_ACTIVITY_TYPES as readonly string[]).includes(rawType)
            ? (rawType as ValidActivityType)
            : 'general';

        const contextLabel = typeof body.contextLabel === 'string' && body.contextLabel.trim()
            ? body.contextLabel.trim().slice(0, 255)
            : null;

        const now = new Date();
        const todayStr = getTodayDateString(now);

        // 1. Update session with timestamp and real-time activity status
        await db
            .update(session)
            .set({
                lastActivityAt: now,
                updatedAt: now,
                currentActivityType: activityType,
                currentActivityLabel: contextLabel,
            })
            .where(
                and(
                    eq(session.id, currentSession.sessionId),
                    gt(session.expiresAt, now)
                )
            );

        // 2. Anti-inflation & elapsed time calculation
        // Find student's most recent activity heartbeat today across any category
        const recentActivity = await db
            .select({
                lastHeartbeatAt: studentDailyActivity.lastHeartbeatAt,
            })
            .from(studentDailyActivity)
            .where(
                and(
                    eq(studentDailyActivity.studentId, currentSession.user.id),
                    eq(studentDailyActivity.date, todayStr),
                )
            )
            .orderBy(sql`${studentDailyActivity.lastHeartbeatAt} DESC`)
            .limit(1);

        let deltaSeconds = 60; // Standard 60s heartbeat interval
        if (recentActivity.length > 0 && recentActivity[0].lastHeartbeatAt) {
            const diffMs = now.getTime() - new Date(recentActivity[0].lastHeartbeatAt).getTime();
            if (diffMs < 45_000) {
                // Heartbeat sent too quickly (e.g. rapid focus/blur burst)
                // Credit actual elapsed seconds, minimum 0 to prevent inflation
                deltaSeconds = Math.max(Math.round(diffMs / 1000), 0);
            } else if (diffMs > 180_000) {
                // Returned after a long idle pause/gap: credit initial 60s block
                deltaSeconds = 60;
            } else {
                // Normal heartbeat interval (~60s): credit up to 75s
                deltaSeconds = Math.min(Math.round(diffMs / 1000), 75);
            }
        }

        // 3. Atomic upsert into student_daily_activity
        if (deltaSeconds > 0) {
            await db
                .insert(studentDailyActivity)
                .values({
                    studentId: currentSession.user.id,
                    date: todayStr,
                    activityType,
                    secondsActive: deltaSeconds,
                    lastContextLabel: contextLabel,
                    lastHeartbeatAt: now,
                    updatedAt: now,
                })
                .onConflictDoUpdate({
                    target: [
                        studentDailyActivity.studentId,
                        studentDailyActivity.date,
                        studentDailyActivity.activityType,
                    ],
                    set: {
                        secondsActive: sql`${studentDailyActivity.secondsActive} + ${deltaSeconds}`,
                        lastContextLabel: contextLabel ?? studentDailyActivity.lastContextLabel,
                        lastHeartbeatAt: now,
                        updatedAt: now,
                    },
                });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[POST /api/student/heartbeat] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
