import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classes, classSyllabusWeeks, classSyllabusAssignments } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, asc } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ classId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch class info (for syllabusUrl)
        const [classInfo] = await db
            .select({ syllabusUrl: classes.syllabusUrl })
            .from(classes)
            .where(eq(classes.id, classId))
            .limit(1);

        if (!classInfo) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        }

        // Fetch weeks
        const weeks = await db
            .select()
            .from(classSyllabusWeeks)
            .where(eq(classSyllabusWeeks.classId, classId))
            .orderBy(asc(classSyllabusWeeks.weekNumber));

        // Fetch all assignments for these weeks
        const allAssignments = await db
            .select({
                id: classSyllabusAssignments.id,
                weekId: classSyllabusAssignments.weekId,
                bookId: classSyllabusAssignments.bookId,
                pages: classSyllabusAssignments.pages
            })
            .from(classSyllabusAssignments)
            .innerJoin(classSyllabusWeeks, eq(classSyllabusAssignments.weekId, classSyllabusWeeks.id))
            .where(eq(classSyllabusWeeks.classId, classId));

        // Group assignments by weekId
        const weeksWithAssignments = weeks.map(week => ({
            ...week,
            assignments: allAssignments.filter(a => a.weekId === week.id)
        }));

        return NextResponse.json({
            syllabusUrl: classInfo.syllabusUrl,
            weeks: weeksWithAssignments
        });
    } catch (error) {
        console.error('[GET /api/classes/[classId]/syllabus] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        if (body.action === 'updateSyllabusUrl') {
            const { syllabusUrl } = body;
            await db.update(classes).set({ syllabusUrl }).where(eq(classes.id, classId));
            return NextResponse.json({ success: true });
        }

        if (body.action === 'createWeek') {
            const { weekNumber, title, startDate, endDate, assignments } = body;

            const [newWeek] = await db.insert(classSyllabusWeeks).values({
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
                await db.insert(classSyllabusAssignments).values(assignmentsToInsert);
            }

            return NextResponse.json({ week: newWeek }, { status: 201 });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        console.error('[POST /api/classes/[classId]/syllabus] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
