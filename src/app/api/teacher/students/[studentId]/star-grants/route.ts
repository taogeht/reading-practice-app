import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { accessibleClassIds } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import { classEnrollments, teacherStarGrants, users } from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// GET /api/teacher/students/[studentId]/star-grants
// Returns the most recent star grants for a student (last 5). Used by the
// "Recent grants" list under the Award Stars card on the teacher student
// detail page. Includes the granting teacher's display name.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ studentId: string }> },
) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'teacher') {
            return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
        }

        const { studentId } = await params;

        const allowedClassIds = await accessibleClassIds(user.id, user.role);
        if (allowedClassIds.length === 0) {
            return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }
        const enrollment = await db
            .select({ id: classEnrollments.studentId })
            .from(classEnrollments)
            .where(
                and(
                    eq(classEnrollments.studentId, studentId),
                    inArray(classEnrollments.classId, allowedClassIds),
                ),
            )
            .limit(1);
        if (enrollment.length === 0) {
            return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        const rows = await db
            .select({
                id: teacherStarGrants.id,
                amount: teacherStarGrants.amount,
                note: teacherStarGrants.note,
                createdAt: teacherStarGrants.createdAt,
                teacherFirstName: users.firstName,
                teacherLastName: users.lastName,
            })
            .from(teacherStarGrants)
            .innerJoin(users, eq(users.id, teacherStarGrants.teacherId))
            .where(eq(teacherStarGrants.studentId, studentId))
            .orderBy(desc(teacherStarGrants.createdAt))
            .limit(5);

        return NextResponse.json({
            grants: rows.map((r) => ({
                id: r.id,
                amount: r.amount,
                note: r.note,
                created_at: r.createdAt,
                teacher_name: `${r.teacherFirstName} ${r.teacherLastName}`.trim(),
            })),
        });
    } catch (error) {
        logError(error, 'api/teacher/students/[studentId]/star-grants GET');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
