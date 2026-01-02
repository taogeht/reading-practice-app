import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classSchedules } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ classId: string }>;
}

// GET /api/classes/[classId]/schedule - Get schedule (days of week) for a class
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const schedule = await db
            .select()
            .from(classSchedules)
            .where(eq(classSchedules.classId, classId))
            .orderBy(classSchedules.dayOfWeek);

        // Return array of day numbers (0-6)
        const days = schedule.map(s => s.dayOfWeek);

        return NextResponse.json({ classId, days });
    } catch (error) {
        console.error('[GET /api/classes/[classId]/schedule] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT /api/classes/[classId]/schedule - Update schedule for a class (admin only)
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user || user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
        }

        const body = await request.json();
        const { days } = body;

        if (!days || !Array.isArray(days)) {
            return NextResponse.json(
                { error: 'days array is required (0-6 for Sunday-Saturday)' },
                { status: 400 }
            );
        }

        // Validate days are 0-6
        const validDays = days.filter((d: number) => d >= 0 && d <= 6);

        // Delete existing schedule
        await db
            .delete(classSchedules)
            .where(eq(classSchedules.classId, classId));

        // Insert new schedule
        if (validDays.length > 0) {
            await db.insert(classSchedules).values(
                validDays.map((day: number) => ({
                    classId,
                    dayOfWeek: day,
                }))
            );
        }

        return NextResponse.json({
            success: true,
            classId,
            days: validDays,
        });
    } catch (error) {
        console.error('[PUT /api/classes/[classId]/schedule] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
