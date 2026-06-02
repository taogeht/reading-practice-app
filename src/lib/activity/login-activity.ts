import { db } from '@/lib/db';
import {
    session,
    recordings,
    passagePageRecordings,
    studentReadingSessions,
    spellingGameResults,
    studentProgression,
} from '@/lib/db/schema';
import { and, count, gte, inArray, max, sql } from 'drizzle-orm';

// A student is "online" if their last heartbeat landed within this window.
// Heartbeats fire from the student dashboard + reading pages (see
// src/hooks/use-heartbeat.ts).
export const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

// Engagement bucket. These are deliberately orthogonal to the date-range
// dropdown's *label* problem: `never` is always lifetime (no session has ever
// existed), so changing the activity window can never turn a real student into
// "never logged in". `slipping` is the windowed-inactivity signal that used to
// be conflated with `never`.
export type ActivityStatus = 'online' | 'active' | 'slipping' | 'never';

export interface StudentActivityMetrics {
    // ── Lifetime (never filtered by the window) ──────────────────────────
    /** Most recent session start, ever. Null ⇒ truly never logged in. */
    lastLoginAt: Date | null;
    /** Most recent heartbeat, ever. Drives online + "last active". */
    lastActivityAt: Date | null;
    hasEverLoggedIn: boolean;
    isCurrentlyOnline: boolean;

    // ── Windowed (scoped to the selected date range) ─────────────────────
    /** Logins counted within the window. */
    sessionCount: number;
    /** Approx minutes with the app open in the window (capped 4h/session). */
    totalMinutesOnline: number;
    /** Read-aloud recordings submitted in the window (assignment + passage). */
    recordingsCount: number;
    /** Reading-comprehension questions answered in the window. */
    questionsAnswered: number;
    /** Spelling game rounds played in the window. */
    spellingGames: number;
    /** Sum of the meaningful actions above — the "did real work?" signal. */
    actionsCount: number;
    /** Logged in OR did meaningful work within the window. */
    activeInWindow: boolean;

    // ── Current gamification state (point-in-time, not windowed) ──────────
    currentStreakDays: number;

    // ── Derived ──────────────────────────────────────────────────────────
    status: ActivityStatus;
}

function emptyMetrics(): StudentActivityMetrics {
    return {
        lastLoginAt: null,
        lastActivityAt: null,
        hasEverLoggedIn: false,
        isCurrentlyOnline: false,
        sessionCount: 0,
        totalMinutesOnline: 0,
        recordingsCount: 0,
        questionsAnswered: 0,
        spellingGames: 0,
        actionsCount: 0,
        activeInWindow: false,
        currentStreakDays: 0,
        status: 'never',
    };
}

function deriveStatus(m: StudentActivityMetrics): ActivityStatus {
    // 'never' = no evidence of engagement at all: no session has ever existed
    // AND no meaningful work landed in the window. A student who did work in
    // the window but whose only session has since been deleted (explicit logout
    // or lazy expiry-prune in getCurrentUser) still counts as engaged, not
    // "never" — otherwise we'd resurrect the very false-negative this rework
    // set out to kill.
    if (!m.hasEverLoggedIn && m.actionsCount === 0) return 'never';
    if (m.isCurrentlyOnline) return 'online';
    if (m.activeInWindow) return 'active';
    return 'slipping';
}

/**
 * Compute engagement metrics for a set of students over an optional window.
 *
 * Shared by the cross-class teacher dashboard and the per-class sidebar so the
 * two surfaces can never drift on what "never logged in" / "active" mean.
 *
 * @param studentIds  user IDs (== students.id). Deduped internally.
 * @param startDate   window lower bound, or null for all-time. Lifetime fields
 *                    (lastLoginAt / never) ignore this entirely.
 * @param now         reference time for the online check (caller-supplied so a
 *                    single request uses one clock).
 */
export async function computeStudentActivity(
    studentIds: string[],
    startDate: Date | null,
    now: Date,
): Promise<Map<string, StudentActivityMetrics>> {
    const ids = Array.from(new Set(studentIds));
    const result = new Map<string, StudentActivityMetrics>();
    if (ids.length === 0) return result;

    for (const id of ids) result.set(id, emptyMetrics());

    const onlineThreshold = new Date(now.getTime() - ONLINE_THRESHOLD_MS);

    // Per-session active minutes, capped at 4h, summed in SQL so we never
    // truncate a busy cohort's history the way a `LIMIT 50*N` fetch would.
    // Measure each session from the later of (its start, the window start) so a
    // session that began before the window doesn't donate its pre-window span
    // to the windowed minutes total. All-time uses the true session start.
    const windowStart = startDate
        ? sql`GREATEST(${session.createdAt}, ${startDate})`
        : sql`${session.createdAt}`;
    const minutesExpr = sql<number>`COALESCE(SUM(LEAST(GREATEST(EXTRACT(EPOCH FROM (COALESCE(${session.lastActivityAt}, ${session.createdAt}) - ${windowStart})) / 60.0, 0), 240)), 0)`;

    const [
        lifetimeSessions,
        windowSessions,
        recCounts,
        passageRecCounts,
        readingAgg,
        spellingCounts,
        progression,
    ] = await Promise.all([
        // Lifetime login + activity — NO window filter. This is the fix: a
        // student who logged in long ago is still "logged in", never "never".
        db
            .select({
                userId: session.userId,
                lastLoginAt: max(session.createdAt),
                lastActivityAt: max(session.lastActivityAt),
            })
            .from(session)
            .where(inArray(session.userId, ids))
            .groupBy(session.userId),

        // Windowed sessions: count + approximate minutes online. Filtered by
        // last activity so a session that started before the window but stayed
        // active inside it still counts.
        db
            .select({
                userId: session.userId,
                sessionCount: count(),
                minutes: minutesExpr,
            })
            .from(session)
            .where(
                startDate
                    ? and(inArray(session.userId, ids), gte(session.lastActivityAt, startDate))
                    : inArray(session.userId, ids),
            )
            .groupBy(session.userId),

        // Assignment read-aloud recordings submitted in the window.
        db
            .select({ studentId: recordings.studentId, c: count() })
            .from(recordings)
            .where(
                startDate
                    ? and(inArray(recordings.studentId, ids), gte(recordings.submittedAt, startDate))
                    : inArray(recordings.studentId, ids),
            )
            .groupBy(recordings.studentId),

        // Per-page passage recordings submitted in the window.
        db
            .select({ studentId: passagePageRecordings.studentId, c: count() })
            .from(passagePageRecordings)
            .where(
                startDate
                    ? and(
                          inArray(passagePageRecordings.studentId, ids),
                          gte(passagePageRecordings.submittedAt, startDate),
                      )
                    : inArray(passagePageRecordings.studentId, ids),
            )
            .groupBy(passagePageRecordings.studentId),

        // Reading-comprehension questions answered in the window (summed off
        // the per-session counter; filtered by session start).
        db
            .select({
                studentId: studentReadingSessions.studentId,
                q: sql<number>`COALESCE(SUM(${studentReadingSessions.questionsAnswered}), 0)`,
            })
            .from(studentReadingSessions)
            .where(
                startDate
                    ? and(
                          inArray(studentReadingSessions.studentId, ids),
                          gte(studentReadingSessions.startedAt, startDate),
                      )
                    : inArray(studentReadingSessions.studentId, ids),
            )
            .groupBy(studentReadingSessions.studentId),

        // Spelling game rounds played in the window.
        db
            .select({ studentId: spellingGameResults.studentId, c: count() })
            .from(spellingGameResults)
            .where(
                startDate
                    ? and(
                          inArray(spellingGameResults.studentId, ids),
                          gte(spellingGameResults.createdAt, startDate),
                      )
                    : inArray(spellingGameResults.studentId, ids),
            )
            .groupBy(spellingGameResults.studentId),

        // Current streak (point-in-time, not windowed).
        db
            .select({
                studentId: studentProgression.studentId,
                streak: studentProgression.currentStreakDays,
            })
            .from(studentProgression)
            .where(inArray(studentProgression.studentId, ids)),
    ]);

    for (const row of lifetimeSessions) {
        if (!row.userId) continue;
        const m = result.get(row.userId);
        if (!m) continue;
        m.lastLoginAt = row.lastLoginAt ?? null;
        m.lastActivityAt = row.lastActivityAt ?? null;
        m.hasEverLoggedIn = m.lastLoginAt !== null;
        m.isCurrentlyOnline = m.lastActivityAt !== null && m.lastActivityAt > onlineThreshold;
    }

    for (const row of windowSessions) {
        if (!row.userId) continue;
        const m = result.get(row.userId);
        if (!m) continue;
        m.sessionCount = Number(row.sessionCount) || 0;
        m.totalMinutesOnline = Math.round(Number(row.minutes) || 0);
    }

    for (const row of recCounts) {
        const m = result.get(row.studentId);
        if (m) m.recordingsCount += Number(row.c) || 0;
    }
    for (const row of passageRecCounts) {
        const m = result.get(row.studentId);
        if (m) m.recordingsCount += Number(row.c) || 0;
    }
    for (const row of readingAgg) {
        const m = result.get(row.studentId);
        if (m) m.questionsAnswered = Number(row.q) || 0;
    }
    for (const row of spellingCounts) {
        const m = result.get(row.studentId);
        if (m) m.spellingGames = Number(row.c) || 0;
    }
    for (const row of progression) {
        const m = result.get(row.studentId);
        if (m) m.currentStreakDays = Number(row.streak) || 0;
    }

    for (const m of result.values()) {
        m.actionsCount = m.recordingsCount + m.questionsAnswered + m.spellingGames;
        m.activeInWindow = m.sessionCount > 0 || m.actionsCount > 0;
        m.status = deriveStatus(m);
    }

    return result;
}

/** Tallies for the dashboard summary line, computed over unique students. */
export interface ActivityCounts {
    total: number;
    online: number;
    active: number;
    slipping: number;
    everLoggedIn: number;
    neverLoggedIn: number;
}

export function summarizeActivity(
    metricsById: Map<string, StudentActivityMetrics>,
): ActivityCounts {
    const counts: ActivityCounts = {
        total: metricsById.size,
        online: 0,
        active: 0,
        slipping: 0,
        everLoggedIn: 0,
        neverLoggedIn: 0,
    };
    for (const m of metricsById.values()) {
        // Keep the headline count aligned with the 'never' bucket so the summary
        // line and the per-student pills can never disagree.
        if (m.status === 'never') counts.neverLoggedIn++;
        else counts.everLoggedIn++;
        if (m.status === 'online') counts.online++;
        else if (m.status === 'active') counts.active++;
        else if (m.status === 'slipping') counts.slipping++;
    }
    return counts;
}
