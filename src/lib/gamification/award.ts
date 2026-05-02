import { db } from '@/lib/db';
import { studentXpEvents, studentProgression, studentUnlocks } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import {
    XP_VALUES,
    type XpEventType,
    levelForXp,
    newAnimalUnlockOnLevelUp,
    STREAK_MILESTONES,
} from './rules';

export interface AwardResult {
    pointsAwarded: number;
    newTotalXp: number;
    leveledUp: boolean;
    newLevel: number;
    streakIncremented: boolean;
    newStreakDays: number;
    unlockedAnimal: { key: string; displayName: string; image: string } | null;
    unlockedBadges: string[];
    bonusEvents: Array<{ eventType: XpEventType; points: number }>;
}

const ZERO_RESULT: AwardResult = {
    pointsAwarded: 0,
    newTotalXp: 0,
    leveledUp: false,
    newLevel: 1,
    streakIncremented: false,
    newStreakDays: 0,
    unlockedAnimal: null,
    unlockedBadges: [],
    bonusEvents: [],
};

function todayDateString(): string {
    // YYYY-MM-DD in server local time. The schema column is `date` so date math
    // is straightforward and timezone-naive — fine for first cut.
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(earlierIso: string, laterIso: string): number {
    const earlier = new Date(earlierIso);
    const later = new Date(laterIso);
    return Math.floor((later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Single entry point for all XP awards. Use sparingly — call from each earning
 * site (spelling result, practice attempt, recording upload). It:
 *   1. Inserts the XP event.
 *   2. Upserts student_progression (XP, level, streak, last_activity_date).
 *   3. If this is the student's first activity today, also fires daily_login.
 *   4. If the streak just crossed a milestone, fires the bonus event + badge.
 *   5. If the student leveled up, unlocks the next animal.
 *
 * Failures are caught and logged — gamification never blocks the underlying
 * student action (recording, answer, etc.).
 */
export async function awardXp(
    studentId: string,
    eventType: XpEventType,
    sourceId?: string | null
): Promise<AwardResult> {
    try {
        const points = XP_VALUES[eventType];
        if (!points) return ZERO_RESULT;

        const today = todayDateString();

        // Read current state (or initialize if missing)
        const [existing] = await db
            .select()
            .from(studentProgression)
            .where(eq(studentProgression.studentId, studentId))
            .limit(1);

        const startingTotalXp = existing?.totalXp ?? 0;
        const startingLevel = existing?.currentLevel ?? 1;
        const startingStreakDays = existing?.currentStreakDays ?? 0;
        const startingLongest = existing?.longestStreakDays ?? 0;
        const lastActivityDate = existing?.lastActivityDate ?? null;

        // Daily-login bonus: only the first XP event of the day triggers it.
        const isFirstActivityToday = lastActivityDate !== today;
        const bonusEvents: Array<{ eventType: XpEventType; points: number }> = [];
        if (isFirstActivityToday && eventType !== 'daily_login') {
            bonusEvents.push({ eventType: 'daily_login', points: XP_VALUES.daily_login });
        }

        // Streak math: contiguous if last activity was yesterday; reset to 1 if today's
        // the first time, broken if we skipped a day.
        let newStreakDays = startingStreakDays;
        let streakIncremented = false;
        if (isFirstActivityToday) {
            if (lastActivityDate && daysBetween(lastActivityDate, today) === 1) {
                newStreakDays = startingStreakDays + 1;
            } else {
                newStreakDays = 1;
            }
            streakIncremented = true;
        }

        // Streak milestone bonus
        if (streakIncremented) {
            const milestone = STREAK_MILESTONES.find((m) => m.days === newStreakDays);
            if (milestone) {
                bonusEvents.push({ eventType: milestone.eventType, points: XP_VALUES[milestone.eventType] });
            }
        }

        // Total points awarded this call
        const totalPoints = points + bonusEvents.reduce((sum, e) => sum + e.points, 0);
        const newTotalXp = startingTotalXp + totalPoints;
        const newLevel = levelForXp(newTotalXp);
        const leveledUp = newLevel > startingLevel;
        const newLongest = Math.max(startingLongest, newStreakDays);

        // Insert the primary event + bonus events (single multi-row insert)
        const allEvents = [
            { studentId, eventType, points, sourceId: sourceId ?? null },
            ...bonusEvents.map((b) => ({
                studentId,
                eventType: b.eventType,
                points: b.points,
                sourceId: null,
            })),
        ];
        await db.insert(studentXpEvents).values(allEvents);

        // Upsert progression
        if (existing) {
            await db
                .update(studentProgression)
                .set({
                    totalXp: newTotalXp,
                    currentLevel: newLevel,
                    currentStreakDays: newStreakDays,
                    longestStreakDays: newLongest,
                    lastActivityDate: today,
                    updatedAt: new Date(),
                })
                .where(eq(studentProgression.studentId, studentId));
        } else {
            await db.insert(studentProgression).values({
                studentId,
                totalXp: newTotalXp,
                currentLevel: newLevel,
                currentStreakDays: newStreakDays,
                longestStreakDays: newLongest,
                lastActivityDate: today,
            });
        }

        // Unlocks: animal on level up, badge on streak milestone
        const unlockedBadges: string[] = [];
        let unlockedAnimal: AwardResult['unlockedAnimal'] = null;

        if (leveledUp) {
            const animal = newAnimalUnlockOnLevelUp(startingLevel, newLevel);
            if (animal) {
                await db
                    .insert(studentUnlocks)
                    .values({ studentId, unlockType: 'avatar', unlockKey: `animal-${animal.key}` })
                    .onConflictDoNothing();
                unlockedAnimal = animal;
            }
        }

        if (streakIncremented) {
            const milestone = STREAK_MILESTONES.find((m) => m.days === newStreakDays);
            if (milestone) {
                await db
                    .insert(studentUnlocks)
                    .values({ studentId, unlockType: 'badge', unlockKey: milestone.badgeKey })
                    .onConflictDoNothing();
                unlockedBadges.push(milestone.badgeKey);
            }
        }

        return {
            pointsAwarded: totalPoints,
            newTotalXp,
            leveledUp,
            newLevel,
            streakIncremented,
            newStreakDays,
            unlockedAnimal,
            unlockedBadges,
            bonusEvents,
        };
    } catch (error) {
        // Gamification must never block the underlying action.
        console.error('[awardXp] Failed:', error);
        return ZERO_RESULT;
    }
}

// Computes if the student is owed a "first try of the day" bonus on a practice
// attempt. Cheap query against student_xp_events.
export async function isFirstPracticeCorrectToday(studentId: string): Promise<boolean> {
    try {
        const today = todayDateString();
        const [row] = await db
            .select({ id: studentXpEvents.id })
            .from(studentXpEvents)
            .where(
                sql`${studentXpEvents.studentId} = ${studentId}
                    AND ${studentXpEvents.eventType} IN ('practice_correct', 'practice_first_try_bonus')
                    AND ${studentXpEvents.createdAt} >= ${today}`
            )
            .limit(1);
        return !row;
    } catch {
        return false;
    }
}
