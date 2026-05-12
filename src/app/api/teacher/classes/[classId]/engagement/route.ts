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

export const runtime = 'nodejs';

// GET /api/teacher/classes/[classId]/engagement
// Returns the class roster with each student's gamification stats (level, total
// XP, week XP, streak, animal). Plus the leaderboard_enabled flag so the
// teacher UI can render the toggle.
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ classId: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { classId } = await params;

        // Read is open to any class member (primary or co-teacher). Write
        // (leaderboard toggle) below stays primary-only.
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
                weekTotalXp: 0,
                monthTotalXp: 0,
                allTimeTotalXp: 0,
            });
        }

        const studentIds = enrolled.map((s) => s.studentId);

        const progressionRows = await db
            .select()
            .from(studentProgression)
            .where(inArray(studentProgression.studentId, studentIds));
        const progressionByStudent = new Map(progressionRows.map((p) => [p.studentId, p]));

        // Time windows: week starts Monday 00:00 local-ish; month starts on
        // the 1st of the current month. Both computed once and reused across
        // the two grouped sums.
        const startOfWeek = new Date();
        const day = startOfWeek.getDay();
        const diffToMonday = day === 0 ? 6 : day - 1;
        startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [weekRows, monthRows] = await Promise.all([
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
        const weekXpByStudent = new Map(weekRows.map((r) => [r.studentId, Number(r.xp)]));
        const monthXpByStudent = new Map(monthRows.map((r) => [r.studentId, Number(r.xp)]));

        const studentsPayload = enrolled.map((s) => {
            const p = progressionByStudent.get(s.studentId);
            const level = p?.currentLevel ?? 1;
            return {
                studentId: s.studentId,
                firstName: s.firstName,
                lastName: s.lastName,
                avatarEmoji: s.avatarUrl,
                animal: animalForLevel(level),
                currentLevel: level,
                totalXp: p?.totalXp ?? 0,
                weekXp: weekXpByStudent.get(s.studentId) ?? 0,
                monthXp: monthXpByStudent.get(s.studentId) ?? 0,
                currentStreakDays: p?.currentStreakDays ?? 0,
                lastActivityDate: p?.lastActivityDate ?? null,
            };
        });

        // Default sort kept on week XP — the component re-sorts client-side
        // when the teacher switches the time-window toggle.
        studentsPayload.sort((a, b) => b.weekXp - a.weekXp);

        const weekTotalXp = studentsPayload.reduce((sum, s) => sum + s.weekXp, 0);
        const monthTotalXp = studentsPayload.reduce((sum, s) => sum + s.monthXp, 0);
        const allTimeTotalXp = studentsPayload.reduce((sum, s) => sum + s.totalXp, 0);

        return NextResponse.json({
            students: studentsPayload,
            leaderboardEnabled: classRow.leaderboardEnabled,
            weekTotalXp,
            monthTotalXp,
            allTimeTotalXp,
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
