import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classSyllabusWeeks, classSyllabusAssignments } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ classId: string; weekId: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId, weekId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { weekNumber, title, startDate, endDate, assignments } = body;

        // Verify the week belongs to this class
        const existing = await db
            .select()
            .from(classSyllabusWeeks)
            .where(and(eq(classSyllabusWeeks.id, weekId), eq(classSyllabusWeeks.classId, classId)))
            .limit(1);

        if (existing.length === 0) {
            return NextResponse.json({ error: 'Week not found' }, { status: 404 });
        }

        // Update the week
        const [updatedWeek] = await db
            .update(classSyllabusWeeks)
            .set({
                weekNumber,
                title,
                startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null,
            })
            .where(eq(classSyllabusWeeks.id, weekId))
            .returning();

        // Update assignments (clear and recreate for simplicity)
        await db.delete(classSyllabusAssignments).where(eq(classSyllabusAssignments.weekId, weekId));

        if (assignments && assignments.length > 0) {
            const assignmentsToInsert = assignments.map((a: any) => ({
                weekId: weekId,
                bookId: a.bookId,
                pages: a.pages
            }));
            await db.insert(classSyllabusAssignments).values(assignmentsToInsert);
        }

        return NextResponse.json({ week: updatedWeek });
    } catch (error) {
        console.error('[PUT /api/classes/[classId]/syllabus/weeks/[weekId]] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId, weekId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const existing = await db
            .select()
            .from(classSyllabusWeeks)
            .where(and(eq(classSyllabusWeeks.id, weekId), eq(classSyllabusWeeks.classId, classId)))
            .limit(1);

        if (existing.length === 0) {
            return NextResponse.json({ error: 'Week not found' }, { status: 404 });
        }

        await db.delete(classSyllabusWeeks).where(eq(classSyllabusWeeks.id, weekId));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[DELETE /api/classes/[classId]/syllabus/weeks/[weekId]] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
