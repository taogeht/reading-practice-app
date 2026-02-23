import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classProgress } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, gte, lte } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ classId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { assignments, date, lessonNotes } = body;

        if (!assignments || !Array.isArray(assignments) || !date) {
            return NextResponse.json(
                { error: 'assignments and date are required' },
                { status: 400 }
            );
        }

        // Safely parse YYYY-MM-DD without relying on system timezone
        const [year, month, day] = date.split('-').map(Number);

        // Use UTC to avoid any server-time offset issues
        const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

        // Ensure progressDate matches startOfDay for the record
        const progressDate = new Date(startOfDay);

        const createdRecords = [];

        // 1. Fetch all existing records for this class on this date
        const existingRecords = await db
            .select()
            .from(classProgress)
            .where(
                and(
                    eq(classProgress.classId, classId),
                    gte(classProgress.date, startOfDay),
                    lte(classProgress.date, endOfDay)
                )
            );

        // 2. Identify and delete records for books that were REMOVED from the payload
        //    (Only consider assignments that have a bookId)
        const validIncomingBookIds = new Set(
            assignments.filter((a: any) => a.bookId).map((a: any) => a.bookId)
        );

        for (const record of existingRecords) {
            if (!validIncomingBookIds.has(record.bookId)) {
                await db
                    .delete(classProgress)
                    .where(eq(classProgress.id, record.id));
            }
        }

        // 3. Process incoming assignments (Update or Insert)
        for (const assignment of assignments) {
            if (!assignment.bookId) continue;

            const existing = await db
                .select()
                .from(classProgress)
                .where(
                    and(
                        eq(classProgress.classId, classId),
                        eq(classProgress.bookId, assignment.bookId),
                        gte(classProgress.date, startOfDay),
                        lte(classProgress.date, endOfDay)
                    )
                )
                .limit(1);

            if (existing.length > 0) {
                const [updated] = await db
                    .update(classProgress)
                    .set({
                        pagesCompleted: assignment.pages || null,
                        lessonNotes: lessonNotes || null,
                        recordedBy: user.id,
                        updatedAt: new Date(),
                    })
                    .where(eq(classProgress.id, existing[0].id))
                    .returning();
                createdRecords.push(updated);
            } else {
                const [newProgress] = await db.insert(classProgress).values({
                    classId,
                    bookId: assignment.bookId,
                    date: progressDate,
                    pagesCompleted: assignment.pages || null,
                    lessonNotes: lessonNotes || null,
                    recordedBy: user.id,
                }).returning();
                createdRecords.push(newProgress);
            }
        }

        return NextResponse.json({ progress: createdRecords, action: 'bulk_processed' }, { status: 201 });
    } catch (error) {
        console.error('[POST /api/classes/[classId]/progress/bulk] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
