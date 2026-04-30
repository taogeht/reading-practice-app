import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists, classes, spellingWords } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, desc, inArray } from 'drizzle-orm';

export const runtime = 'nodejs';

// GET /api/teacher/spelling-lists - Get all spelling lists across all classes for a teacher
// Deduplicates lists with the same title and words across classes
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get all classes for this teacher (admins see all classes)
        const teacherClasses = await db
            .select({ id: classes.id })
            .from(classes)
            .where(user.role === 'admin' ? undefined : eq(classes.teacherId, user.id));

        if (teacherClasses.length === 0) {
            return NextResponse.json([]);
        }

        const classIds = teacherClasses.map((c) => c.id);

        // Get all spelling lists for these classes (current week first)
        const lists = await db
            .select()
            .from(spellingLists)
            .where(inArray(spellingLists.classId, classIds))
            .orderBy(desc(spellingLists.isCurrent), desc(spellingLists.createdAt));

        // Build class lookup
        const classMap = new Map(
            (await db.select({ id: classes.id, name: classes.name }).from(classes).where(inArray(classes.id, classIds))).map(c => [c.id, c.name])
        );

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

        // Deduplicate: group lists with the same title and identical word sets
        const grouped = new Map<string, {
            primary: typeof listsWithWords[0];
            classIds: string[];
            classNames: string[];
            duplicateIds: string[];
        }>();

        for (const list of listsWithWords) {
            const wordKey = list.words.map(w => w.word.toLowerCase()).sort().join('|');
            const groupKey = `${list.title}::${wordKey}`;

            if (grouped.has(groupKey)) {
                const group = grouped.get(groupKey)!;
                group.classIds.push(list.classId);
                group.classNames.push(classMap.get(list.classId) || 'Unknown Class');
                group.duplicateIds.push(list.id);
            } else {
                grouped.set(groupKey, {
                    primary: list,
                    classIds: [list.classId],
                    classNames: [classMap.get(list.classId) || 'Unknown Class'],
                    duplicateIds: [list.id],
                });
            }
        }

        // Return deduplicated list with combined class info
        const dedupedLists = Array.from(grouped.values()).map(({ primary, classIds, classNames, duplicateIds }) => ({
            ...primary,
            className: classNames.join(', '),
            classIds,
            classNames,
            allListIds: duplicateIds,
        }));

        return NextResponse.json(dedupedLists);
    } catch (error) {
        console.error('[GET /api/teacher/spelling-lists] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
