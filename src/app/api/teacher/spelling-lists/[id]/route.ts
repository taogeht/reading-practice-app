import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists, spellingWords, classes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, inArray } from 'drizzle-orm';

export const runtime = 'nodejs';

// GET /api/teacher/spelling-lists/[id] - Get a single spelling list
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: listId } = await params;

        const list = await db.query.spellingLists.findFirst({
            where: eq(spellingLists.id, listId),
            with: {
                class: true,
                words: {
                    orderBy: (words, { asc }) => [asc(words.orderIndex)],
                },
            },
        });

        if (!list) {
            return NextResponse.json({ error: 'List not found' }, { status: 404 });
        }

        if (list.class.teacherId !== user.id && user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        return NextResponse.json({
            id: list.id,
            classId: list.classId,
            className: list.class.name,
            title: list.title,
            weekNumber: list.weekNumber,
            gradeLevel: list.gradeLevel,
            isPublic: list.isPublic,
            active: list.active,
            words: list.words.map(w => ({
                id: w.id,
                word: w.word,
                syllables: w.syllables,
                audioUrl: w.audioUrl,
                imageUrl: w.imageUrl,
            })),
            createdAt: list.createdAt,
        });
    } catch (error) {
        console.error(`[GET /api/teacher/spelling-lists/[id]] Error:`, error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Use a dynamic route for [id]
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: listId } = await params;
        const body = await request.json();
        const { title, gradeLevel, isPublic, active, classId, classIds, words } = body;

        // Verify the list exists and the user has permission to edit it
        const existingList = await db.query.spellingLists.findFirst({
            where: eq(spellingLists.id, listId),
            with: {
                class: true,
                words: {
                    orderBy: (words, { asc }) => [asc(words.orderIndex)],
                },
            }
        });

        if (!existingList) {
            return NextResponse.json({ error: 'List not found' }, { status: 404 });
        }

        if (existingList.class.teacherId !== user.id && user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized to edit this list' }, { status: 403 });
        }

        // Resolve target class IDs
        const targetClassIds: string[] = classIds && Array.isArray(classIds) && classIds.length > 0
            ? classIds
            : classId ? [classId] : [existingList.classId];

        // Find all sibling lists (same title + teacher, representing shared copies)
        const allTeacherLists = await db
            .select({ id: spellingLists.id, classId: spellingLists.classId })
            .from(spellingLists)
            .innerJoin(classes, eq(classes.id, spellingLists.classId))
            .where(
                and(
                    eq(spellingLists.title, existingList.title),
                    eq(classes.teacherId, existingList.class.teacherId)
                )
            );

        const existingClassIds = allTeacherLists.map(l => l.classId);
        const existingListMap = new Map(allTeacherLists.map(l => [l.classId, l.id]));

        // Determine which classes to add/remove/keep
        const classesToAdd = targetClassIds.filter(cid => !existingClassIds.includes(cid));
        const classesToRemove = existingClassIds.filter(cid => !targetClassIds.includes(cid));
        const classesToKeep = existingClassIds.filter(cid => targetClassIds.includes(cid));

        // Prepare word data (use provided words or keep existing)
        const wordData = words && Array.isArray(words) ? words : existingList.words;

        // Update all kept lists (including the primary one)
        for (const cid of classesToKeep) {
            const keepListId = existingListMap.get(cid)!;
            await db
                .update(spellingLists)
                .set({
                    title: title !== undefined ? title : existingList.title,
                    gradeLevel: gradeLevel !== undefined ? gradeLevel : existingList.gradeLevel,
                    isPublic: isPublic !== undefined ? isPublic : existingList.isPublic,
                    active: active !== undefined ? active : existingList.active,
                    updatedAt: new Date()
                })
                .where(eq(spellingLists.id, keepListId));

            // Update words if provided
            if (words && Array.isArray(words)) {
                await db.delete(spellingWords).where(eq(spellingWords.spellingListId, keepListId));
                if (words.length > 0) {
                    const wordRecords = words.map((word: any, index: number) => {
                        const wordString = typeof word === 'string' ? word : word.word;
                        const syllables = typeof word === 'string' ? null : (word.syllables || null);
                        const audioUrl = typeof word === 'string' ? null : (word.audioUrl || null);
                        return {
                            spellingListId: keepListId,
                            word: wordString.trim(),
                            syllables,
                            audioUrl,
                            orderIndex: index,
                        };
                    });
                    await db.insert(spellingWords).values(wordRecords);
                }
            }
        }

        // Remove lists for deselected classes
        for (const cid of classesToRemove) {
            const removeListId = existingListMap.get(cid)!;
            await db.delete(spellingLists).where(eq(spellingLists.id, removeListId));
        }

        // Create lists for newly selected classes
        for (const cid of classesToAdd) {
            const [newList] = await db
                .insert(spellingLists)
                .values({
                    classId: cid,
                    title: title !== undefined ? title : existingList.title,
                    weekNumber: existingList.weekNumber,
                    gradeLevel: gradeLevel !== undefined ? gradeLevel : existingList.gradeLevel,
                    isPublic: isPublic !== undefined ? isPublic : existingList.isPublic,
                    active: active !== undefined ? active : existingList.active,
                })
                .returning();

            // Copy words to the new list
            const wordsToInsert = wordData.map((word: any, index: number) => {
                const wordString = typeof word === 'string' ? word : word.word;
                const syllables = typeof word === 'string' ? null : (word.syllables || null);
                const audioUrl = typeof word === 'string' ? null : (word.audioUrl || null);
                return {
                    spellingListId: newList.id,
                    word: wordString.trim(),
                    syllables,
                    audioUrl,
                    orderIndex: index,
                };
            });
            if (wordsToInsert.length > 0) {
                await db.insert(spellingWords).values(wordsToInsert);
            }
        }

        // Fetch updated complete list (use primary list if it still exists, otherwise first kept/added)
        const returnListId = targetClassIds.includes(existingList.classId)
            ? listId
            : (classesToKeep.length > 0 ? existingListMap.get(classesToKeep[0])! : undefined);

        const completeList = returnListId
            ? await db.query.spellingLists.findFirst({
                where: eq(spellingLists.id, returnListId),
                with: {
                    words: {
                        orderBy: (words, { asc }) => [asc(words.orderIndex)],
                    },
                },
            })
            : { success: true };

        return NextResponse.json(completeList);
    } catch (error) {
        console.error(`[PUT /api/teacher/spelling-lists] Error:`, error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: listId } = await params;

        // Verify the list exists and the user has permission to delete it
        const existingList = await db.query.spellingLists.findFirst({
            where: eq(spellingLists.id, listId),
            with: { class: true }
        });

        if (!existingList) {
            return NextResponse.json({ error: 'List not found' }, { status: 404 });
        }

        if (existingList.class.teacherId !== user.id && user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized to delete this list' }, { status: 403 });
        }

        await db.delete(spellingLists).where(eq(spellingLists.id, listId));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(`[DELETE /api/teacher/spelling-lists] Error:`, error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
