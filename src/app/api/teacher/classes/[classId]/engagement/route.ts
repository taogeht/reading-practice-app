import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { userCanManageClass, userIsClassPrimary } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import {
    classes,
    classEnrollments,
    students,
    users,
    studentProgression,
    studentXpEvents,
} from '@/lib/db/schema';
import { animalForLevel } from '@/lib/gamification/rules';
import { computeStudentActivity } from '@/lib/activity/login-activity';
import { getStartOfWeek, getStartOfMonth } from '@/lib/date-utils';

export const runtime = 'nodejs';

// GET /api/teacher/classes/[classId]/engagement
// Returns the class roster with unified gamification stats (level, XP, streak,
// animal) and learning effort metrics (online status, active minutes, recordings,
// questions answered, spelling games, slipping state).
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ classId: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { classId } = await params;

        if (!(await userCanManageClass(user.id, user.role, classId))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        const classRow = await db.query.classes.findFirst({
            where: eq(classes.id, classId),
            columns: { id: true, leaderboardEnabled: true },
        });
        if (!classRow) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        }

        const { searchParams } = new URL(request.url);
        const windowParam = (searchParams.get('window') || 'week') as 'week' | 'month' | 'all';
        const selectedWindow = ['week', 'month', 'all'].includes(windowParam) ? windowParam : 'week';

        const enrolled = await db
            .select({
                studentId: classEnrollments.studentId,
                firstName: users.firstName,
                lastName: users.lastName,
                avatarUrl: students.avatarUrl,
            })
            .from(classEnrollments)
            .innerJoin(students, eq(classEnrollments.studentId, students.id))
            .innerJoin(users, eq(students.id, users.id))
            .where(eq(classEnrollments.classId, classId));

        if (enrolled.length === 0) {
            return NextResponse.json({
                students: [],
                leaderboardEnabled: classRow.leaderboardEnabled,
                window: selectedWindow,
                weekTotalXp: 0,
                monthTotalXp: 0,
                allTimeTotalXp: 0,
                summary: {
                    totalStudents: 0,
                    onlineCount: 0,
                    activeCount: 0,
                    slippingCount: 0,
                    neverCount: 0,
                    totalMinutesOnline: 0,
                    totalRecordings: 0,
                    totalQuestions: 0,
                    totalSpellingGames: 0,
                    totalActions: 0,
                },
            });
        }

        const studentIds = enrolled.map((s) => s.studentId);
        const now = new Date();

        // Timezone-aware date boundaries (Asia/Taipei by default)
        const startOfWeek = getStartOfWeek();
        const startOfMonth = getStartOfMonth();
        const activeWindowStart =
            selectedWindow === 'month' ? startOfMonth : selectedWindow === 'all' ? null : startOfWeek;

        // Fetch progression rows, activity metrics, and XP events in parallel
        const [progressionRows, activityMap, weekRows, monthRows] = await Promise.all([
            db
                .select()
                .from(studentProgression)
                .where(inArray(studentProgression.studentId, studentIds)),
            computeStudentActivity(studentIds, activeWindowStart, now),
            db
                .select({
                    studentId: studentXpEvents.studentId,
                    xp: sql<number>`COALESCE(SUM(${studentXpEvents.points}), 0)`,
                })
                .from(studentXpEvents)
                .where(
                    and(
                        inArray(studentXpEvents.studentId, studentIds),
                        gte(studentXpEvents.createdAt, startOfWeek)
                    )
                )
                .groupBy(studentXpEvents.studentId),
            db
                .select({
                    studentId: studentXpEvents.studentId,
                    xp: sql<number>`COALESCE(SUM(${studentXpEvents.points}), 0)`,
                })
                .from(studentXpEvents)
                .where(
                    and(
                        inArray(studentXpEvents.studentId, studentIds),
                        gte(studentXpEvents.createdAt, startOfMonth)
                    )
                )
                .groupBy(studentXpEvents.studentId),
        ]);

        const progressionByStudent = new Map(progressionRows.map((p) => [p.studentId, p]));
        const weekXpByStudent = new Map(weekRows.map((r) => [r.studentId, Number(r.xp)]));
        const monthXpByStudent = new Map(monthRows.map((r) => [r.studentId, Number(r.xp)]));

        let onlineCount = 0;
        let activeCount = 0;
        let slippingCount = 0;
        let neverCount = 0;
        let totalMinutesOnline = 0;
        let totalRecordings = 0;
        let totalQuestions = 0;
        let totalSpellingGames = 0;
        let totalActions = 0;

        const studentsPayload = enrolled.map((s) => {
            const p = progressionByStudent.get(s.studentId);
            const m = activityMap.get(s.studentId);
            const level = p?.currentLevel ?? 1;

            const weekXp = weekXpByStudent.get(s.studentId) ?? 0;
            const monthXp = monthXpByStudent.get(s.studentId) ?? 0;
            const totalXp = p?.totalXp ?? 0;

            const status = m?.status ?? 'never';
            if (m?.isCurrentlyOnline) onlineCount++;
            if (status === 'active') activeCount++;
            else if (status === 'slipping') slippingCount++;
            else if (status === 'never') neverCount++;

            const minutes = Math.round(m?.totalMinutesOnline ?? 0);
            const recs = m?.recordingsCount ?? 0;
            const qCount = m?.questionsAnswered ?? 0;
            const spelling = m?.spellingGames ?? 0;
            const acts = m?.actionsCount ?? 0;

            totalMinutesOnline += minutes;
            totalRecordings += recs;
            totalQuestions += qCount;
            totalSpellingGames += spelling;
            totalActions += acts;

            return {
                studentId: s.studentId,
                firstName: s.firstName,
                lastName: s.lastName,
                avatarEmoji: s.avatarUrl,
                animal: animalForLevel(level),
                currentLevel: level,
                totalXp,
                weekXp,
                monthXp,
                currentStreakDays: p?.currentStreakDays ?? m?.currentStreakDays ?? 0,
                lastActivityDate: p?.lastActivityDate ?? null,
                lastLoginAt: m?.lastLoginAt ? m.lastLoginAt.toISOString() : null,
                lastActivityAt: m?.lastActivityAt ? m.lastActivityAt.toISOString() : null,
                status,
                isCurrentlyOnline: Boolean(m?.isCurrentlyOnline),
                currentActivity: m?.currentActivity ?? null,
                activeInWindow: Boolean(m?.activeInWindow),
                totalMinutesOnline: minutes,
                timeBreakdown: m?.timeBreakdown ?? {
                    reading: 0,
                    spelling: 0,
                    assignment: 0,
                    practice: 0,
                    general: 0,
                },
                recordingsCount: recs,
                questionsAnswered: qCount,
                spellingGames: spelling,
                actionsCount: acts,
            };
        });

        const weekTotalXp = studentsPayload.reduce((sum, s) => sum + s.weekXp, 0);
        const monthTotalXp = studentsPayload.reduce((sum, s) => sum + s.monthXp, 0);
        const allTimeTotalXp = studentsPayload.reduce((sum, s) => sum + s.totalXp, 0);

        const classTimeBreakdown = {
            reading: studentsPayload.reduce((sum, s) => sum + s.timeBreakdown.reading, 0),
            spelling: studentsPayload.reduce((sum, s) => sum + s.timeBreakdown.spelling, 0),
            assignment: studentsPayload.reduce((sum, s) => sum + s.timeBreakdown.assignment, 0),
            practice: studentsPayload.reduce((sum, s) => sum + s.timeBreakdown.practice, 0),
            general: studentsPayload.reduce((sum, s) => sum + s.timeBreakdown.general, 0),
        };

        return NextResponse.json({
            students: studentsPayload,
            leaderboardEnabled: classRow.leaderboardEnabled,
            window: selectedWindow,
            weekTotalXp,
            monthTotalXp,
            allTimeTotalXp,
            summary: {
                totalStudents: enrolled.length,
                onlineCount,
                activeCount,
                slippingCount,
                neverCount,
                totalMinutesOnline,
                timeBreakdown: classTimeBreakdown,
                totalRecordings,
                totalQuestions,
                totalSpellingGames,
                totalActions,
            },
        });
    } catch (error) {
        console.error('[GET /api/teacher/classes/[classId]/engagement] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT /api/teacher/classes/[classId]/engagement
// Body: { leaderboardEnabled: boolean } — flips the per-class leaderboard toggle.
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ classId: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { classId } = await params;

        // Settings change → primary teacher (or admin) only.
        const allowed =
            user.role === 'admin' || (await userIsClassPrimary(user.id, classId));
        if (!allowed) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        const classRow = await db.query.classes.findFirst({
            where: eq(classes.id, classId),
            columns: { id: true },
        });
        if (!classRow) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        }

        let body: { leaderboardEnabled?: unknown };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        if (typeof body.leaderboardEnabled !== 'boolean') {
            return NextResponse.json(
                { error: 'leaderboardEnabled (boolean) is required' },
                { status: 400 }
            );
        }

        await db
            .update(classes)
            .set({ leaderboardEnabled: body.leaderboardEnabled, updatedAt: new Date() })
            .where(eq(classes.id, classId));

        return NextResponse.json({ leaderboardEnabled: body.leaderboardEnabled });
    } catch (error) {
        console.error('[PUT /api/teacher/classes/[classId]/engagement] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
