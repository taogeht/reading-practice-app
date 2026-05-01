import { NextRequest, NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classEnrollments, classPracticeUnits } from '@/lib/db/schema';
import { UNITS } from '@/lib/practice/units';

export const runtime = 'nodejs';

// GET /api/student/practice/available-units
// Returns the practice unit picker entries for this student, restricted to
// units enabled on at least one of their enrolled classes.
export async function GET(_request: NextRequest) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const enrollments = await db
        .select({ classId: classEnrollments.classId })
        .from(classEnrollments)
        .where(eq(classEnrollments.studentId, user.id));

    const classIds = enrollments.map((e) => e.classId);
    if (classIds.length === 0) {
        return NextResponse.json({ units: [] });
    }

    const enabled = await db
        .select({ unit: classPracticeUnits.unit })
        .from(classPracticeUnits)
        .where(inArray(classPracticeUnits.classId, classIds));

    const enabledSet = new Set(enabled.map((row) => row.unit));
    const units = UNITS.filter((u) => enabledSet.has(u.unit));

    return NextResponse.json({ units });
}
