import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists, spellingWords, classes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, inArray } from 'drizzle-orm';

export const runtime = 'nodejs';

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
        const { title, gradeLevel, isPublic, active, classId, words } = body;

        // Verify the list exists and the user has permission to edit it
        const existingList = await db.query.spellingLists.findFirst({
            where: eq(spellingLists.id, listId),
            with: {
                class: true
            }
        });

        if (!existingList) {
            return NextResponse.json({ error: 'List not found' }, { status: 404 });
        }

        if (existingList.class.teacherId !== user.id && user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized to edit this list' }, { status: 403 });
        }

        // Update basic list details
        await db
            .update(spellingLists)
            .set({
                title: title !== undefined ? title : existingList.title,
                gradeLevel: gradeLevel !== undefined ? gradeLevel : existingList.gradeLevel,
                isPublic: isPublic !== undefined ? isPublic : existingList.isPublic,
                active: active !== undefined ? active : existingList.active,
                classId: classId !== undefined ? classId : existingList.classId,
                updatedAt: new Date()
            })
            .where(eq(spellingLists.id, listId));

        // If words are provided, update them
        if (words && Array.isArray(words)) {
            // Simplest approach: delete all existing words and insert new ones
            // This maintains the correct order and handles additions/deletions easily
            await db.delete(spellingWords).where(eq(spellingWords.spellingListId, listId));

            if (words.length > 0) {
                const wordRecords = words.map((word: any, index: number) => {
                    const wordString = typeof word === 'string' ? word : word.word;
                    const syllables = typeof word === 'string' ? null : (word.syllables || null);
                    const audioUrl = typeof word === 'string' ? null : (word.audioUrl || null);

                    return {
                        spellingListId: listId,
                        word: wordString.trim(),
                        syllables,
                        audioUrl,
                        orderIndex: index,
                    };
                });

                await db.insert(spellingWords).values(wordRecords);
            }
        }

        // Fetch updated complete list
        const completeList = await db.query.spellingLists.findFirst({
            where: eq(spellingLists.id, listId),
            with: {
                words: {
                    orderBy: (words, { asc }) => [asc(words.orderIndex)],
                },
            },
        });

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
