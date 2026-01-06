import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classProgress, classEnrollments, books } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, gte, desc, isNotNull } from 'drizzle-orm';

export const runtime = 'nodejs';

// GET /api/student/homework - Get current homework assignments for the student
export async function GET() {
    try {
        const user = await getCurrentUser();

        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get the student's enrolled classes
        const enrollments = await db
            .select({ classId: classEnrollments.classId })
            .from(classEnrollments)
            .where(eq(classEnrollments.studentId, user.id));

        if (enrollments.length === 0) {
            return NextResponse.json({ homework: [] });
        }

        const classIds = enrollments.map(e => e.classId);

        // Get the past week's date
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        weekAgo.setHours(0, 0, 0, 0);

        // Get recent progress entries with homework for student's classes
        const homeworkEntries = [];

        for (const classId of classIds) {
            const entries = await db
                .select({
                    id: classProgress.id,
                    classId: classProgress.classId,
                    bookId: classProgress.bookId,
                    date: classProgress.date,
                    pagesCompleted: classProgress.pagesCompleted,
                    homeworkAssigned: classProgress.homeworkAssigned,
                    bookTitle: books.title,
                    bookPublisher: books.publisher,
                })
                .from(classProgress)
                .innerJoin(books, eq(classProgress.bookId, books.id))
                .where(
                    and(
                        eq(classProgress.classId, classId),
                        gte(classProgress.date, weekAgo),
                        isNotNull(classProgress.homeworkAssigned)
                    )
                )
                .orderBy(desc(classProgress.date))
                .limit(10);

            homeworkEntries.push(...entries);
        }

        // Sort by date descending (most recent first)
        homeworkEntries.sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        return NextResponse.json({
            homework: homeworkEntries.map(entry => ({
                id: entry.id,
                date: entry.date,
                bookTitle: entry.bookTitle,
                bookPublisher: entry.bookPublisher,
                pagesCompleted: entry.pagesCompleted,
                homeworkAssigned: entry.homeworkAssigned,
            })),
        });
    } catch (error) {
        console.error('[GET /api/student/homework] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
