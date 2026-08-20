import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists, classes, spellingWords } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, desc, inArray } from 'drizzle-orm';
import { accessibleClassIds } from '@/lib/auth/class-access';
import { canManageSpellingLists } from '@/lib/auth/teacher-capabilities';

export const runtime = 'nodejs';

// GET /api/teacher/spelling-lists - Get all spelling lists across all classes for a teacher
// Deduplicates lists with the same title and words across classes
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!(await canManageSpellingLists(user))) {
            return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }

        // Every class the user can manage (primary or co-teacher; admins see all).
        const classIds = await accessibleClassIds(user.id, user.role);
        if (classIds.length === 0) {
            return NextResponse.json([]);
        }

        // Get all spelling lists for these classes (current week first)
        const lists = await db
            .select()
            .from(spellingLists)
            .where(inArray(spellingLists.classId, classIds))
            .orderBy(desc(spellingLists.isCurrent), desc(spellingLists.createdAt));

        // Build class lookup. active + academicYear come along because class
        // names repeat across years — a school runs a "1B" every year — so the
        // teacher view needs to tell this year's 1B from an archived one.
        const classMap = new Map(
            (await db
                .select({
                    id: classes.id,
                    name: classes.name,
                    active: classes.active,
                    academicYear: classes.academicYear,
                })
                .from(classes)
                .where(inArray(classes.id, classIds))
            ).map(c => [c.id, c])
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
            academicYears: string[];
            anyActive: boolean;
        }>();

        for (const list of listsWithWords) {
            const wordKey = list.words.map(w => w.word.toLowerCase()).sort().join('|');
            const groupKey = `${list.title}::${wordKey}`;
            const cls = classMap.get(list.classId);
            const className = cls?.name || 'Unknown Class';
            const academicYear = cls?.academicYear || '';
            // A deduped card spans several classes; it counts as live if any of
            // them is still active, so a list shared with an archived class
            // doesn't vanish from the working view.
            const isActive = cls?.active ?? true;

            if (grouped.has(groupKey)) {
                const group = grouped.get(groupKey)!;
                group.classIds.push(list.classId);
                group.classNames.push(className);
                group.duplicateIds.push(list.id);
                if (academicYear) group.academicYears.push(academicYear);
                group.anyActive = group.anyActive || isActive;
            } else {
                grouped.set(groupKey, {
                    primary: list,
                    classIds: [list.classId],
                    classNames: [className],
                    duplicateIds: [list.id],
                    academicYears: academicYear ? [academicYear] : [],
                    anyActive: isActive,
                });
            }
        }

        // Return deduplicated list with combined class info
        const dedupedLists = Array.from(grouped.values()).map(
            ({ primary, classIds, classNames, duplicateIds, academicYears, anyActive }) => ({
                ...primary,
                className: classNames.join(', '),
                classIds,
                classNames,
                allListIds: duplicateIds,
                // Distinct years, so a card shared across two classes in the
                // same year shows "2026-2027" once rather than twice.
                academicYears: Array.from(new Set(academicYears)),
                classActive: anyActive,
            }),
        );

        return NextResponse.json(dedupedLists);
    } catch (error) {
        console.error('[GET /api/teacher/spelling-lists] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
