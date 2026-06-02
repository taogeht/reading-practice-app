import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, students, classEnrollments } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { userCanManageClass } from '@/lib/auth/class-access';
import { eq } from 'drizzle-orm';
import { computeStudentActivity, summarizeActivity } from '@/lib/activity/login-activity';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ classId: string }>;
}

// GET /api/classes/[classId]/login-activity - Student login activity for one class.
// `days` scopes the activity metrics only; "never logged in" is always lifetime.
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!(await userCanManageClass(user.id, user.role, classId))) {
            return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const daysParam = searchParams.get('days');
        // No `days` param means "all time". Malformed / non-positive input also
        // degrades to all-time rather than producing an Invalid Date (which
        // would 500 on serialization) or a future window that hides everyone.
        const parsedDays = daysParam ? parseInt(daysParam, 10) : null;
        const days = parsedDays != null && Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : null;

        const now = new Date();
        const startDate = days !== null ? new Date(now) : null;
        if (startDate && days !== null) {
            startDate.setDate(startDate.getDate() - days);
            startDate.setHours(0, 0, 0, 0);
        }

        const enrolledStudents = await db
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

        const studentIds = enrolledStudents.map((s) => s.studentId);
        const metricsById = await computeStudentActivity(studentIds, startDate, now);

        const studentActivity = enrolledStudents.map((student) => {
            const m = metricsById.get(student.studentId)!;
            return {
                studentId: student.studentId,
                firstName: student.firstName,
                lastName: student.lastName,
                avatarUrl: student.avatarUrl,
                status: m.status,
                hasEverLoggedIn: m.hasEverLoggedIn,
                isCurrentlyOnline: m.isCurrentlyOnline,
                lastLoginAt: m.lastLoginAt,
                lastActivityAt: m.lastActivityAt,
                activeInWindow: m.activeInWindow,
                sessionCount: m.sessionCount,
                totalMinutesOnline: m.totalMinutesOnline,
                recordingsCount: m.recordingsCount,
                questionsAnswered: m.questionsAnswered,
                spellingGames: m.spellingGames,
                actionsCount: m.actionsCount,
                currentStreakDays: m.currentStreakDays,
            };
        });

        const bucketRank = { online: 0, active: 1, slipping: 2, never: 3 } as const;
        studentActivity.sort((a, b) => {
            if (bucketRank[a.status] !== bucketRank[b.status]) {
                return bucketRank[a.status] - bucketRank[b.status];
            }
            const at = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
            const bt = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
            return bt - at;
        });

        const counts = summarizeActivity(metricsById);

        return NextResponse.json({
            activity: studentActivity,
            daysIncluded: days ?? 'all',
            totalStudents: enrolledStudents.length,
            // Lifetime — unaffected by the window.
            studentsLoggedIn: counts.everLoggedIn,
            counts,
        });
    } catch (error) {
        console.error('[GET /api/classes/[classId]/login-activity] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
