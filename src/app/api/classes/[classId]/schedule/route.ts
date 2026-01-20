import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classSchedules } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ classId: string }>;
}

interface ScheduleEntry {
    dayOfWeek: number;
    startTime: string | null;
    endTime: string | null;
}

// GET /api/classes/[classId]/schedule - Get schedule (days and times) for a class
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const schedule = await db
            .select({
                dayOfWeek: classSchedules.dayOfWeek,
                startTime: classSchedules.startTime,
                endTime: classSchedules.endTime,
            })
            .from(classSchedules)
            .where(eq(classSchedules.classId, classId))
            .orderBy(classSchedules.dayOfWeek);

        // Return array of day numbers (for backwards compatibility) and full schedule
        const days = schedule.map(s => s.dayOfWeek);

        return NextResponse.json({
            classId,
            days,
            schedule: schedule.map(s => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
            })),
        });
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

        // Support both old format (days array) and new format (schedule array with times)
        let scheduleEntries: ScheduleEntry[] = [];

        if (body.schedule && Array.isArray(body.schedule)) {
            // New format: { schedule: [{ dayOfWeek, startTime, endTime }, ...] }
            scheduleEntries = body.schedule
                .filter((entry: ScheduleEntry) => entry.dayOfWeek >= 0 && entry.dayOfWeek <= 6)
                .map((entry: ScheduleEntry) => ({
                    dayOfWeek: entry.dayOfWeek,
                    startTime: entry.startTime || null,
                    endTime: entry.endTime || null,
                }));
        } else if (body.days && Array.isArray(body.days)) {
            // Old format: { days: [0, 1, 3] } - backwards compatible
            scheduleEntries = body.days
                .filter((d: number) => d >= 0 && d <= 6)
                .map((d: number) => ({ dayOfWeek: d, startTime: null, endTime: null }));
        } else {
            return NextResponse.json(
                { error: 'Either days array or schedule array is required' },
                { status: 400 }
            );
        }

        // Delete existing schedule
        await db
            .delete(classSchedules)
            .where(eq(classSchedules.classId, classId));

        // Insert new schedule
        if (scheduleEntries.length > 0) {
            await db.insert(classSchedules).values(
                scheduleEntries.map((entry) => ({
                    classId,
                    dayOfWeek: entry.dayOfWeek,
                    startTime: entry.startTime,
                    endTime: entry.endTime,
                }))
            );
        }

        return NextResponse.json({
            success: true,
            classId,
            days: scheduleEntries.map(e => e.dayOfWeek),
            schedule: scheduleEntries,
        });
    } catch (error) {
        console.error('[PUT /api/classes/[classId]/schedule] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
