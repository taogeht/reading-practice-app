import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { studentProgression } from '@/lib/db/schema';

export const runtime = 'nodejs';

// GET /api/student/stars — current student's wallet.
// Returns { balance, lifetime }. If the progression row doesn't exist yet
// (student has never earned XP), returns zeros.
export async function GET(_request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const [row] = await db
            .select({
                balance: studentProgression.starsBalance,
                lifetime: studentProgression.starsLifetime,
            })
            .from(studentProgression)
            .where(eq(studentProgression.studentId, user.id))
            .limit(1);

        return NextResponse.json({
            balance: row?.balance ?? 0,
            lifetime: row?.lifetime ?? 0,
        });
    } catch (error) {
        console.error('[GET /api/student/stars] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
