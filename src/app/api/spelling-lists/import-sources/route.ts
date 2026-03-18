import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists, spellingWords, classes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, ne, desc } from 'drizzle-orm';

export const runtime = 'nodejs';

// GET /api/spelling-lists/import-sources?classId=xxx
// Returns spelling lists from other classes at the same grade level in the same school
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const classId = searchParams.get('classId');

        if (!classId) {
            return NextResponse.json({ error: 'classId is required' }, { status: 400 });
        }

        // Get the current class to find its grade level and school
        const currentClass = await db.query.classes.findFirst({
            where: eq(classes.id, classId),
        });

        if (!currentClass) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        }

        if (!currentClass.gradeLevel) {
            return NextResponse.json({ error: 'This class has no grade level set' }, { status: 400 });
        }

        // Find other classes at the same grade level in the same school
        const sameLevelClasses = await db
            .select()
            .from(classes)
            .where(
                and(
                    eq(classes.schoolId, currentClass.schoolId),
                    eq(classes.gradeLevel, currentClass.gradeLevel),
                    ne(classes.id, classId),
                    eq(classes.active, true)
                )
            );

        if (sameLevelClasses.length === 0) {
            return NextResponse.json([]);
        }

        // Get spelling lists from those classes (all lists within the same school are available for import)
        const result = [];
        for (const cls of sameLevelClasses) {
            const lists = await db
                .select()
                .from(spellingLists)
                .where(eq(spellingLists.classId, cls.id))
                .orderBy(desc(spellingLists.createdAt));

            // Fetch words for each list
            const listsWithWords = await Promise.all(
                lists.map(async (list) => {
                    const words = await db
                        .select()
                        .from(spellingWords)
                        .where(eq(spellingWords.spellingListId, list.id))
                        .orderBy(spellingWords.orderIndex);
                    return { ...list, words };
                })
            );

            if (listsWithWords.length > 0) {
                result.push({
                    class: {
                        id: cls.id,
                        name: cls.name,
                        gradeLevel: cls.gradeLevel,
                    },
                    spellingLists: listsWithWords,
                });
            }
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('[GET /api/spelling-lists/import-sources] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
