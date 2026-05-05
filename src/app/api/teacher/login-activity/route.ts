import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { session, users, students, classes, classEnrollments } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, desc, gte, inArray } from 'drizzle-orm';

export const runtime = 'nodejs';

// A student is considered "online" if their last heartbeat was within this window.
const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

// GET /api/teacher/login-activity?days=7
// Aggregated student activity across every class this teacher owns. Returns one
// row per student-class enrollment, so a student in two of the teacher's classes
// shows up twice with each class tag.
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const daysParam = searchParams.get('days');
        const days = daysParam ? parseInt(daysParam, 10) : 7;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const now = new Date();
        const onlineThreshold = new Date(now.getTime() - ONLINE_THRESHOLD_MS);

        // Teacher's classes (admin sees all). Excludes classes the teacher has
        // marked as untracked (e.g. attendance-only kindergarten where students
        // never log in).
        const teacherClasses = await db
            .select({ id: classes.id, name: classes.name })
            .from(classes)
            .where(
                user.role === 'admin'
                    ? eq(classes.trackLoginActivity, true)
                    : and(eq(classes.teacherId, user.id), eq(classes.trackLoginActivity, true))
            );

        if (teacherClasses.length === 0) {
            return NextResponse.json({
                activity: [],
                daysIncluded: days,
                totalEnrollments: 0,
                studentsLoggedIn: 0,
            });
        }

        const classIds = teacherClasses.map((c) => c.id);

        // All (student, class) enrollments under this teacher, joined with profile data.
        const enrollments = await db
            .select({
                studentId: classEnrollments.studentId,
                classId: classEnrollments.classId,
                firstName: users.firstName,
                lastName: users.lastName,
                avatarUrl: students.avatarUrl,
            })
            .from(classEnrollments)
            .innerJoin(students, eq(classEnrollments.studentId, students.id))
            .innerJoin(users, eq(students.id, users.id))
            .where(inArray(classEnrollments.classId, classIds));

        if (enrollments.length === 0) {
            return NextResponse.json({
                activity: [],
                daysIncluded: days,
                totalEnrollments: 0,
                studentsLoggedIn: 0,
            });
        }

        // One sessions query for every student in scope, grouped client-side. Avoids
        // the N+1 of the per-class endpoint.
        const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));
        const recentSessions = await db
            .select({
                userId: session.userId,
                createdAt: session.createdAt,
                lastActivityAt: session.lastActivityAt,
            })
            .from(session)
            .where(and(inArray(session.userId, studentIds), gte(session.createdAt, startDate)))
            .orderBy(desc(session.createdAt))
            .limit(50 * studentIds.length);

        const sessionsByStudent = new Map<string, typeof recentSessions>();
        for (const s of recentSessions) {
            if (!s.userId) continue;
            const bucket = sessionsByStudent.get(s.userId);
            if (bucket) bucket.push(s);
            else sessionsByStudent.set(s.userId, [s]);
        }

        const classNameById = new Map(teacherClasses.map((c) => [c.id, c.name]));

        const activity = enrollments.map((e) => {
            const sessions = sessionsByStudent.get(e.studentId) ?? [];

            let totalMinutes = 0;
            for (const s of sessions) {
                const start = new Date(s.createdAt!);
                const end = s.lastActivityAt ? new Date(s.lastActivityAt) : start;
                const duration = Math.max(0, (end.getTime() - start.getTime()) / 60000);
                totalMinutes += Math.min(duration, 240);
            }

            const lastSession = sessions[0];
            const isCurrentlyOnline = lastSession?.lastActivityAt
                ? new Date(lastSession.lastActivityAt) > onlineThreshold
                : false;

            return {
                studentId: e.studentId,
                classId: e.classId,
                className: classNameById.get(e.classId) ?? 'Unknown class',
                firstName: e.firstName,
                lastName: e.lastName,
                avatarUrl: e.avatarUrl,
                lastLoginAt: lastSession?.createdAt ?? null,
                lastActivityAt: lastSession?.lastActivityAt ?? null,
                sessionCount: sessions.length,
                totalMinutesOnline: Math.round(totalMinutes),
                isCurrentlyOnline,
            };
        });

        // Sort: currently online first, then most recent login, then never-logged-in last.
        activity.sort((a, b) => {
            if (a.isCurrentlyOnline !== b.isCurrentlyOnline) return a.isCurrentlyOnline ? -1 : 1;
            if (!a.lastLoginAt && !b.lastLoginAt) return 0;
            if (!a.lastLoginAt) return 1;
            if (!b.lastLoginAt) return -1;
            return new Date(b.lastLoginAt).getTime() - new Date(a.lastLoginAt).getTime();
        });

        const studentsLoggedIn = new Set(
            activity.filter((a) => a.lastLoginAt).map((a) => a.studentId)
        ).size;

        return NextResponse.json({
            activity,
            daysIncluded: days,
            totalEnrollments: enrollments.length,
            studentsLoggedIn,
            uniqueStudents: studentIds.length,
        });
    } catch (error) {
        console.error('[GET /api/teacher/login-activity] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
