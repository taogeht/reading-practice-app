import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { session, users, students, classEnrollments } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, desc, gte, sql } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ classId: string }>;
}

// GET /api/classes/[classId]/login-activity - Get student login activity for a class
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const daysParam = searchParams.get('days');
        const days = daysParam ? parseInt(daysParam, 10) : 7;

        // Calculate date range
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        // Get all students enrolled in this class with their session data
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

        // Get session data for each student
        const studentActivity = await Promise.all(
            enrolledStudents.map(async (student) => {
                // Get most recent session
                const recentSessions = await db
                    .select({
                        id: session.id,
                        createdAt: session.createdAt,
                        lastActivityAt: session.lastActivityAt,
                        expiresAt: session.expiresAt,
                    })
                    .from(session)
                    .where(
                        and(
                            eq(session.userId, student.studentId),
                            gte(session.createdAt, startDate)
                        )
                    )
                    .orderBy(desc(session.createdAt))
                    .limit(10);

                // Calculate total session time (approximate)
                let totalMinutes = 0;
                for (const s of recentSessions) {
                    const start = new Date(s.createdAt!);
                    const end = s.lastActivityAt ? new Date(s.lastActivityAt) : start;
                    const duration = Math.max(0, (end.getTime() - start.getTime()) / 60000);
                    // Cap individual session at 4 hours to avoid inflated numbers
                    totalMinutes += Math.min(duration, 240);
                }

                const lastSession = recentSessions[0];

                return {
                    studentId: student.studentId,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    avatarUrl: student.avatarUrl,
                    lastLoginAt: lastSession?.createdAt || null,
                    lastActivityAt: lastSession?.lastActivityAt || null,
                    sessionCount: recentSessions.length,
                    totalMinutesOnline: Math.round(totalMinutes),
                    isCurrentlyOnline: lastSession?.expiresAt
                        ? new Date(lastSession.expiresAt) > new Date()
                        : false,
                };
            })
        );

        // Sort by last login (most recent first), then by those who never logged in
        studentActivity.sort((a, b) => {
            if (!a.lastLoginAt && !b.lastLoginAt) return 0;
            if (!a.lastLoginAt) return 1;
            if (!b.lastLoginAt) return -1;
            return new Date(b.lastLoginAt).getTime() - new Date(a.lastLoginAt).getTime();
        });

        return NextResponse.json({
            activity: studentActivity,
            daysIncluded: days,
            totalStudents: enrolledStudents.length,
            studentsLoggedIn: studentActivity.filter(s => s.lastLoginAt).length,
        });
    } catch (error) {
        console.error('[GET /api/classes/[classId]/login-activity] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
