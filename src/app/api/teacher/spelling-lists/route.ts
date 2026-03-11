import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists, classes, spellingWords } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, desc, inArray } from 'drizzle-orm';

export const runtime = 'nodejs';

// GET /api/teacher/spelling-lists - Get all spelling lists across all classes for a teacher
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'teacher') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get all classes for this teacher
        const teacherClasses = await db
            .select({ id: classes.id })
            .from(classes)
            .where(eq(classes.teacherId, user.id));

        if (teacherClasses.length === 0) {
            return NextResponse.json([]);
        }

        const classIds = teacherClasses.map((c) => c.id);

        // Get all spelling lists for these classes
        const lists = await db
            .select()
            .from(spellingLists)
            .where(inArray(spellingLists.classId, classIds))
            .orderBy(desc(spellingLists.createdAt));

        // Let's attach the class name to each list for the UI
        const classMap = new Map(
            (await db.select({ id: classes.id, name: classes.name }).from(classes).where(inArray(classes.id, classIds))).map(c => [c.id, c.name])
        );

        // Fetch words for each list (needed for counts and editing)
        const listsWithDetails = await Promise.all(
            lists.map(async (list) => {
                const words = await db
                    .select()
                    .from(spellingWords)
                    .where(eq(spellingWords.spellingListId, list.id))
                    .orderBy(spellingWords.orderIndex);
                
                return { 
                    ...list, 
                    className: classMap.get(list.classId) || 'Unknown Class',
                    words 
                };
            })
        );

        return NextResponse.json(listsWithDetails);
    } catch (error) {
        console.error('[GET /api/teacher/spelling-lists] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
