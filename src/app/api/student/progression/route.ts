import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, and, gte } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { studentProgression, studentXpEvents, studentUnlocks } from '@/lib/db/schema';
import { animalForLevel, xpProgressToNextLevel, ANIMAL_UNLOCK_ORDER } from '@/lib/gamification/rules';

export const runtime = 'nodejs';

// GET /api/student/progression
// Returns the student's current XP, level, streak, animal, recent unlocks,
// and today's XP tally for the dashboard progression card.
export async function GET(_request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const [progression] = await db
            .select()
            .from(studentProgression)
            .where(eq(studentProgression.studentId, user.id))
            .limit(1);

        const totalXp = progression?.totalXp ?? 0;
        const progress = xpProgressToNextLevel(totalXp);
        const currentAnimal = animalForLevel(progress.currentLevel);

        // Today's XP — sum events from the start of today (server local time)
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const todayEvents = await db
            .select({ points: studentXpEvents.points })
            .from(studentXpEvents)
            .where(
                and(eq(studentXpEvents.studentId, user.id), gte(studentXpEvents.createdAt, startOfDay))
            );
        const todayXp = todayEvents.reduce((sum, e) => sum + e.points, 0);

        // Last 5 unlocks for the recent-rewards row
        const recentUnlocks = await db
            .select()
            .from(studentUnlocks)
            .where(eq(studentUnlocks.studentId, user.id))
            .orderBy(desc(studentUnlocks.unlockedAt))
            .limit(5);

        return NextResponse.json({
            totalXp,
            currentLevel: progress.currentLevel,
            xpInLevel: progress.xpInLevel,
            xpForNextLevel: progress.xpForNextLevel,
            fractionToNextLevel: progress.fraction,
            currentStreakDays: progression?.currentStreakDays ?? 0,
            longestStreakDays: progression?.longestStreakDays ?? 0,
            todayXp,
            currentAnimal,
            totalAnimalsAvailable: ANIMAL_UNLOCK_ORDER.length,
            recentUnlocks: recentUnlocks.map((u) => ({
                type: u.unlockType,
                key: u.unlockKey,
                unlockedAt: u.unlockedAt,
            })),
        });
    } catch (error) {
        console.error('[GET /api/student/progression] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
