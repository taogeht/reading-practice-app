import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { accessibleClassIds } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import { classEnrollments, studentProgression, teacherStarGrants } from '@/lib/db/schema';
import { awardStars } from '@/lib/gamification/stars';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// POST /api/teacher/stars/grant
// Body: { student_id, amount, note? }
// Awards stars from the calling teacher to a student in one of their classes.
// Logs the grant in teacher_star_grants and bumps the student's wallet via
// awardStars (source_type = 'teacher_grant').
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'teacher') {
            return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const { student_id, amount, note } = body as {
            student_id?: string;
            amount?: number;
            note?: string;
        };

        if (!student_id || typeof student_id !== 'string') {
            return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
        }
        if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > 100) {
            return NextResponse.json(
                { error: 'amount must be an integer between 1 and 100' },
                { status: 400 },
            );
        }
        const trimmedNote = typeof note === 'string' ? note.trim().slice(0, 280) : null;

        // Same-school check: the student must be enrolled in a class this
        // teacher can manage (owns or co-teaches).
        const allowedClassIds = await accessibleClassIds(user.id, user.role);
        if (allowedClassIds.length === 0) {
            return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }
        const enrollment = await db
            .select({ id: classEnrollments.studentId })
            .from(classEnrollments)
            .where(
                and(
                    eq(classEnrollments.studentId, student_id),
                    inArray(classEnrollments.classId, allowedClassIds),
                ),
            )
            .limit(1);
        if (enrollment.length === 0) {
            return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        const [grant] = await db
            .insert(teacherStarGrants)
            .values({
                teacherId: user.id,
                studentId: student_id,
                amount,
                note: trimmedNote || null,
            })
            .returning({ id: teacherStarGrants.id });

        await awardStars({
            studentId: student_id,
            amount,
            sourceType: 'teacher_grant',
            sourceRef: grant.id,
        });

        const [wallet] = await db
            .select({ balance: studentProgression.starsBalance })
            .from(studentProgression)
            .where(eq(studentProgression.studentId, student_id))
            .limit(1);

        return NextResponse.json({ success: true, new_balance: wallet?.balance ?? 0 });
    } catch (error) {
        logError(error, 'api/teacher/stars/grant POST');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
