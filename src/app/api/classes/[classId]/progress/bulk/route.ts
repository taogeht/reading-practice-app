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

        const progressDate = new Date(date);
        progressDate.setHours(0, 0, 0, 0);

        const startOfDay = new Date(progressDate);
        const endOfDay = new Date(progressDate);
        endOfDay.setHours(23, 59, 59, 999);

        const createdRecords = [];

        // Note: Using a transaction loop or individual queries. Drizzle handles raw loops fine here.
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
