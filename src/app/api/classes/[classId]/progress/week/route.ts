import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
    classSyllabusWeeks,
    classSyllabusAssignments,
    classProgress,
    books,
    classBooks,
} from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, gte, lte, asc } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ classId: string }>;
}

// GET /api/classes/[classId]/progress/week
// Query params: ?weekId=<id>  (optional — auto-detects current week if omitted)
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const requestedWeekId = searchParams.get('weekId');

        // 1. Fetch all syllabus weeks for this class
        const allWeeks = await db
            .select()
            .from(classSyllabusWeeks)
            .where(eq(classSyllabusWeeks.classId, classId))
            .orderBy(asc(classSyllabusWeeks.weekNumber));

        // Fetch all class-assigned books — needed even if no syllabus weeks exist
        const assignedBooks = await db
            .select({
                bookId: classBooks.bookId,
                title: books.title,
                totalPages: books.totalPages,
                isCurrent: classBooks.isCurrent,
            })
            .from(classBooks)
            .innerJoin(books, eq(classBooks.bookId, books.id))
            .where(and(eq(classBooks.classId, classId), eq(classBooks.isCurrent, true)));

        if (allWeeks.length === 0) {
            return NextResponse.json({ week: null, books: [], allWeeks: [], assignedBooks });
        }

        // 2. Determine which week to show
        let currentWeek: typeof allWeeks[0] | undefined;

        if (requestedWeekId) {
            currentWeek = allWeeks.find(w => w.id === requestedWeekId);
        }

        if (!currentWeek) {
            // Auto-detect: find week whose date range contains today
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            currentWeek = allWeeks.find(w => {
                if (!w.startDate || !w.endDate) return false;
                const start = new Date(w.startDate);
                start.setHours(0, 0, 0, 0);
                const end = new Date(w.endDate);
                end.setHours(23, 59, 59, 999);
                return today >= start && today <= end;
            });

            // Fallback: most recent past week, or week 1
            if (!currentWeek) {
                const pastWeeks = allWeeks.filter(w => {
                    if (!w.endDate) return false;
                    return new Date(w.endDate) < new Date();
                });
                currentWeek = pastWeeks[pastWeeks.length - 1] || allWeeks[0];
            }
        }

        // 3. Fetch syllabus assignments for this week
        const syllabusAssignments = await db
            .select({
                id: classSyllabusAssignments.id,
                bookId: classSyllabusAssignments.bookId,
                pages: classSyllabusAssignments.pages,
                bookTitle: books.title,
                bookTotalPages: books.totalPages,
                bookPublisher: books.publisher,
                bookSubject: books.subject,
            })
            .from(classSyllabusAssignments)
            .innerJoin(books, eq(classSyllabusAssignments.bookId, books.id))
            .where(eq(classSyllabusAssignments.weekId, currentWeek.id));

        // 4. Fetch progress records for this week's date range to find done pages
        let doneProgressRecords: Array<{ bookId: string; pagesCompleted: string | null }> = [];

        if (currentWeek.startDate && currentWeek.endDate) {
            const weekStart = new Date(currentWeek.startDate);
            weekStart.setHours(0, 0, 0, 0);
            const weekEnd = new Date(currentWeek.endDate);
            weekEnd.setHours(23, 59, 59, 999);

            doneProgressRecords = await db
                .select({
                    bookId: classProgress.bookId,
                    pagesCompleted: classProgress.pagesCompleted,
                })
                .from(classProgress)
                .where(
                    and(
                        eq(classProgress.classId, classId),
                        gte(classProgress.date, weekStart),
                        lte(classProgress.date, weekEnd)
                    )
                );
        }

        // 5. Build book list with done pages
        const booksResult = syllabusAssignments.map(a => {
            // Find all progress records for this book this week
            const bookDoneRecords = doneProgressRecords.filter(r => r.bookId === a.bookId);
            const donePages = bookDoneRecords
                .map(r => r.pagesCompleted)
                .filter(Boolean) as string[];

            return {
                bookId: a.bookId,
                title: a.bookTitle,
                totalPages: a.bookTotalPages,
                publisher: a.bookPublisher,
                subject: a.bookSubject,
                syllabusPages: a.pages, // e.g. "4-7" from syllabus
                donePages,             // array of page strings already logged this week
            };
        });



        return NextResponse.json({
            week: {
                id: currentWeek.id,
                weekNumber: currentWeek.weekNumber,
                title: currentWeek.title,
                startDate: currentWeek.startDate,
                endDate: currentWeek.endDate,
            },
            books: booksResult,
            allWeeks: allWeeks.map(w => ({
                id: w.id,
                weekNumber: w.weekNumber,
                title: w.title,
                startDate: w.startDate,
                endDate: w.endDate,
            })),
            assignedBooks,
        });
    } catch (error) {
        console.error('[GET /api/classes/[classId]/progress/week] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
