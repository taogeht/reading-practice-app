import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classSyllabusWeeks, classSyllabusAssignments } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';

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
        const { weeks } = body;

        if (!Array.isArray(weeks)) {
            return NextResponse.json({ error: 'Invalid payload: weeks must be an array' }, { status: 400 });
        }

        let createdCount = 0;
        await db.transaction(async (tx) => {
            // 1. Delete all existing weeks for this class to start fresh
            await tx.delete(classSyllabusWeeks).where(eq(classSyllabusWeeks.classId, classId));

            // 2. Insert weeks and their assignments
            for (const week of weeks) {
                const { weekNumber, title, startDate, endDate, assignments } = week;

                const [newWeek] = await tx.insert(classSyllabusWeeks).values({
                    classId,
                    weekNumber,
                    title,
                    startDate: startDate ? new Date(startDate) : null,
                    endDate: endDate ? new Date(endDate) : null,
                }).returning();

                if (assignments && assignments.length > 0) {
                    const assignmentsToInsert = assignments.map((a: any) => ({
                        weekId: newWeek.id,
                        bookId: a.bookId,
                        pages: a.pages
                    }));
                    await tx.insert(classSyllabusAssignments).values(assignmentsToInsert);
                }
                createdCount++;
            }
        });

        return NextResponse.json({ success: true, weeksCreated: createdCount });
    } catch (error: any) {
        console.error('[POST /api/classes/[classId]/syllabus/bulk-import] Error:', error);
        return NextResponse.json({ error: 'Internal server error', details: error?.message || String(error), stack: error?.stack }, { status: 500 });
    }
}
