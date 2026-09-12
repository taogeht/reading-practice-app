import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, students, classes, classEnrollments } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, inArray } from 'drizzle-orm';
import { accessibleClassIds } from '@/lib/auth/class-access';
import { computeStudentActivity, summarizeActivity } from '@/lib/activity/login-activity';

export const runtime = 'nodejs';

// GET /api/teacher/login-activity?days=7
// Aggregated student activity across every class this teacher owns. Returns one
// row per student-class enrollment, so a student in two of the teacher's classes
// shows up twice with each class tag. `days` scopes the *activity* metrics only;
// "never logged in" is always lifetime (see computeStudentActivity).
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

        // Every active class the user can manage (primary + co-teacher; admins see
        // all). Excludes archived/inactive classes and untracked classes.
        const allowedIds = await accessibleClassIds(user.id, user.role);
        const teacherClasses = await db
            .select({ id: classes.id, name: classes.name })
            .from(classes)
            .where(
                user.role === 'admin'
                    ? and(eq(classes.trackLoginActivity, true), eq(classes.active, true))
                    : and(
                          allowedIds.length > 0
                              ? inArray(classes.id, allowedIds)
                              : eq(classes.id, '00000000-0000-0000-0000-000000000000'),
                          eq(classes.trackLoginActivity, true),
                          eq(classes.active, true),
                      )
            );

        if (teacherClasses.length === 0) {
            return NextResponse.json({
                activity: [],
                classes: [],
                daysIncluded: days ?? 'all',
                totalEnrollments: 0,
                uniqueStudents: 0,
                studentsLoggedIn: 0,
                counts: { total: 0, online: 0, active: 0, slipping: 0, everLoggedIn: 0, neverLoggedIn: 0 },
            });
        }

        const classIds = teacherClasses.map((c) => c.id);

        // All (student, class) enrollments under this teacher's active classes, joined with profile data.
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
                classes: teacherClasses,
                daysIncluded: days ?? 'all',
                totalEnrollments: 0,
                uniqueStudents: 0,
                studentsLoggedIn: 0,
                counts: { total: 0, online: 0, active: 0, slipping: 0, everLoggedIn: 0, neverLoggedIn: 0 },
            });
        }

        const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));
        const metricsById = await computeStudentActivity(studentIds, startDate, now);

        const classNameById = new Map(teacherClasses.map((c) => [c.id, c.name]));

        // Group enrollments by studentId to prevent duplicate cards when a
        // student is enrolled in multiple classes (or an older class).
        interface GroupedStudentEnrollment {
            studentId: string;
            firstName: string;
            lastName: string;
            avatarUrl: string | null;
            classes: Array<{ id: string; name: string }>;
        }

        const enrollmentsByStudent = new Map<string, GroupedStudentEnrollment>();

        for (const e of enrollments) {
            let record = enrollmentsByStudent.get(e.studentId);
            const cName = classNameById.get(e.classId) ?? 'Unknown class';
            if (!record) {
                record = {
                    studentId: e.studentId,
                    firstName: e.firstName,
                    lastName: e.lastName,
                    avatarUrl: e.avatarUrl,
                    classes: [],
                };
                enrollmentsByStudent.set(e.studentId, record);
            }
            if (!record.classes.some((c) => c.id === e.classId)) {
                record.classes.push({ id: e.classId, name: cName });
            }
        }

        const activity = Array.from(enrollmentsByStudent.values()).map((e) => {
            const m = metricsById.get(e.studentId)!;
            return {
                studentId: e.studentId,
                classId: e.classes[0]?.id ?? '',
                className: e.classes.map((c) => c.name).join(', '),
                classes: e.classes,
                firstName: e.firstName,
                lastName: e.lastName,
                avatarUrl: e.avatarUrl,
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

        // Sort: online → active → slipping → never; within a bucket, most
        // recent login first.
        const bucketRank = { online: 0, active: 1, slipping: 2, never: 3 } as const;
        activity.sort((a, b) => {
            if (bucketRank[a.status] !== bucketRank[b.status]) {
                return bucketRank[a.status] - bucketRank[b.status];
            }
            const at = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
            const bt = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
            return bt - at;
        });

        const counts = summarizeActivity(metricsById);

        return NextResponse.json({
            activity,
            classes: teacherClasses,
            daysIncluded: days ?? 'all',
            totalEnrollments: enrollments.length,
            uniqueStudents: studentIds.length,
            // Lifetime — honest "ever logged in" count, unaffected by the window.
            studentsLoggedIn: counts.everLoggedIn,
            counts,
        });
    } catch (error) {
        console.error('[GET /api/teacher/login-activity] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
