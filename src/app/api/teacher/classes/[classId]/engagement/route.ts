import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
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

        const classRow = await db.query.classes.findFirst({
            where: eq(classes.id, classId),
            columns: { id: true, teacherId: true, leaderboardEnabled: true },
        });
        if (!classRow) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        }
        if (user.role !== 'admin' && classRow.teacherId !== user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
            });
        }

        const studentIds = enrolled.map((s) => s.studentId);

        const progressionRows = await db
            .select()
            .from(studentProgression)
            .where(inArray(studentProgression.studentId, studentIds));
        const progressionByStudent = new Map(progressionRows.map((p) => [p.studentId, p]));

        // Week-XP rollup — grouped sum from the start of this week (Monday).
        const startOfWeek = new Date();
        const day = startOfWeek.getDay();
        const diffToMonday = day === 0 ? 6 : day - 1;
        startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
        startOfWeek.setHours(0, 0, 0, 0);

        const weekRows = await db
            .select({
                studentId: studentXpEvents.studentId,
                weekXp: sql<number>`COALESCE(SUM(${studentXpEvents.points}), 0)`,
            })
            .from(studentXpEvents)
            .where(
                and(
                    inArray(studentXpEvents.studentId, studentIds),
                    gte(studentXpEvents.createdAt, startOfWeek)
                )
            )
            .groupBy(studentXpEvents.studentId);
        const weekXpByStudent = new Map(weekRows.map((r) => [r.studentId, Number(r.weekXp)]));

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
                currentStreakDays: p?.currentStreakDays ?? 0,
                lastActivityDate: p?.lastActivityDate ?? null,
            };
        });

        // Default sort: this week's XP descending
        studentsPayload.sort((a, b) => b.weekXp - a.weekXp);

        const weekTotalXp = studentsPayload.reduce((sum, s) => sum + s.weekXp, 0);

        return NextResponse.json({
            students: studentsPayload,
            leaderboardEnabled: classRow.leaderboardEnabled,
            weekTotalXp,
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

        const classRow = await db.query.classes.findFirst({
            where: eq(classes.id, classId),
            columns: { id: true, teacherId: true },
        });
        if (!classRow) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        }
        if (user.role !== 'admin' && classRow.teacherId !== user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
