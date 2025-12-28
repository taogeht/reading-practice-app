import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists, spellingWords, classEnrollments, classes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, desc } from 'drizzle-orm';

export const runtime = 'nodejs';

// GET /api/student/spelling-lists - Get active spelling lists for student's enrolled classes
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get student's enrolled classes
        const enrollments = await db.query.classEnrollments.findMany({
            where: eq(classEnrollments.studentId, user.id),
            with: {
                class: true,
            },
        });

        if (enrollments.length === 0) {
            return NextResponse.json([]);
        }

        // Get active spelling lists for all enrolled classes
        const classIds = enrollments.map((e) => e.classId);
        const allLists = [];

        for (const classId of classIds) {
            const lists = await db.query.spellingLists.findMany({
                where: and(
                    eq(spellingLists.classId, classId),
                    eq(spellingLists.active, true)
                ),
                with: {
                    words: {
                        orderBy: (words, { asc }) => [asc(words.orderIndex)],
                    },
                    class: {
                        columns: {
                            id: true,
                            name: true,
                        },
                    },
                },
                orderBy: [desc(spellingLists.createdAt)],
            });

            allLists.push(...lists);
        }

        // Sort by creation date (most recent first)
        allLists.sort((a, b) =>
            new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
        );

        return NextResponse.json(allLists);
    } catch (error) {
        console.error('[GET /api/student/spelling-lists] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
