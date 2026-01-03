import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classProgress, books, classBooks } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, desc, gte, lte } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ classId: string }>;
}

// GET /api/classes/[classId]/progress - Get progress history for a class
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const bookId = searchParams.get('bookId');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const limit = parseInt(searchParams.get('limit') || '30');

        // Build conditions
        const conditions = [eq(classProgress.classId, classId)];

        if (bookId) {
            conditions.push(eq(classProgress.bookId, bookId));
        }

        if (startDate) {
            conditions.push(gte(classProgress.date, new Date(startDate)));
        }

        if (endDate) {
            conditions.push(lte(classProgress.date, new Date(endDate)));
        }

        const progress = await db
            .select({
                id: classProgress.id,
                classId: classProgress.classId,
                bookId: classProgress.bookId,
                date: classProgress.date,
                pagesCompleted: classProgress.pagesCompleted,
                lessonNotes: classProgress.lessonNotes,
                homeworkAssigned: classProgress.homeworkAssigned,
                createdAt: classProgress.createdAt,
                bookTitle: books.title,
                bookPublisher: books.publisher,
            })
            .from(classProgress)
            .innerJoin(books, eq(classProgress.bookId, books.id))
            .where(and(...conditions))
            .orderBy(desc(classProgress.date))
            .limit(limit);

        return NextResponse.json({ progress });
    } catch (error) {
        console.error('[GET /api/classes/[classId]/progress] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/classes/[classId]/progress - Record progress for a class
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { bookId, date, pagesCompleted, lessonNotes, homeworkAssigned } = body;

        if (!bookId || !date) {
            return NextResponse.json(
                { error: 'bookId and date are required' },
                { status: 400 }
            );
        }

        // Convert date to start of day for consistency
        const progressDate = new Date(date);
        progressDate.setHours(0, 0, 0, 0);

        // Check if progress already exists for this book on this date
        const startOfDay = new Date(progressDate);
        const endOfDay = new Date(progressDate);
        endOfDay.setHours(23, 59, 59, 999);

        const existing = await db
            .select()
            .from(classProgress)
            .where(
                and(
                    eq(classProgress.classId, classId),
                    eq(classProgress.bookId, bookId),
                    gte(classProgress.date, startOfDay),
                    lte(classProgress.date, endOfDay)
                )
            )
            .limit(1);

        if (existing.length > 0) {
            // Update existing record
            const [updated] = await db
                .update(classProgress)
                .set({
                    pagesCompleted: pagesCompleted || null,
                    lessonNotes: lessonNotes || null,
                    homeworkAssigned: homeworkAssigned || null,
                    recordedBy: user.id,
                    updatedAt: new Date(),
                })
                .where(eq(classProgress.id, existing[0].id))
                .returning();

            return NextResponse.json({ progress: updated, action: 'updated' });
        } else {
            // Create new record
            const [newProgress] = await db.insert(classProgress).values({
                classId,
                bookId,
                date: progressDate,
                pagesCompleted: pagesCompleted || null,
                lessonNotes: lessonNotes || null,
                homeworkAssigned: homeworkAssigned || null,
                recordedBy: user.id,
            }).returning();

            return NextResponse.json({ progress: newProgress, action: 'created' }, { status: 201 });
        }
    } catch (error) {
        console.error('[POST /api/classes/[classId]/progress] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/classes/[classId]/progress - Delete a progress entry
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const progressId = searchParams.get('id');

        if (!progressId) {
            return NextResponse.json({ error: 'Progress id is required' }, { status: 400 });
        }

        await db
            .delete(classProgress)
            .where(and(eq(classProgress.id, progressId), eq(classProgress.classId, classId)));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[DELETE /api/classes/[classId]/progress] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
