import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists, spellingWords, classes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, desc, and } from 'drizzle-orm';

export const runtime = 'nodejs';

// GET /api/spelling-lists?classId=xxx - Get all spelling lists for a class
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

        // Use simple select instead of relational query to avoid LATERAL JOIN issues
        const lists = await db
            .select()
            .from(spellingLists)
            .where(eq(spellingLists.classId, classId))
            .orderBy(desc(spellingLists.createdAt));

        // Fetch words for each list separately
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

        return NextResponse.json(listsWithWords);
    } catch (error) {
        console.error('[GET /api/spelling-lists] Error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Also try to get the underlying cause if it exists
        const cause = (error as { cause?: unknown })?.cause;
        return NextResponse.json({
            error: 'Internal server error',
            details: errorMessage,
            cause: cause ? String(cause) : undefined,
            stack: error instanceof Error ? error.stack : undefined
        }, { status: 500 });
    }
}

// POST /api/spelling-lists - Create a new spelling list with words
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { classId, classIds: rawClassIds, title, weekNumber, gradeLevel, isPublic, words } = body;

        // Support both single classId and array of classIds
        const classIds: string[] = rawClassIds && Array.isArray(rawClassIds) && rawClassIds.length > 0
            ? rawClassIds
            : classId ? [classId] : [];

        if (classIds.length === 0 || !title || !words || !Array.isArray(words)) {
            return NextResponse.json(
                { error: 'At least one class, title, and words array are required' },
                { status: 400 }
            );
        }

        // Verify all classes exist
        for (const cid of classIds) {
            const classExists = await db.query.classes.findFirst({
                where: eq(classes.id, cid),
            });
            if (!classExists) {
                return NextResponse.json({ error: `Class not found: ${cid}` }, { status: 404 });
            }
        }

        // Create a spelling list for each selected class
        const createdLists = [];
        for (const cid of classIds) {
            const [newList] = await db
                .insert(spellingLists)
                .values({
                    classId: cid,
                    title,
                    weekNumber: weekNumber || null,
                    gradeLevel: gradeLevel || null,
                    isPublic: isPublic === true,
                    active: true,
                })
                .returning();

            // Insert words for this list
            if (words.length > 0) {
                const wordRecords = words.map((word: string | { word: string; syllables?: string[] | null; audioUrl?: string | null; imageUrl?: string | null }, index: number) => {
                    if (typeof word === 'string') {
                        return {
                            spellingListId: newList.id,
                            word: word.trim(),
                            syllables: null,
                            audioUrl: null,
                            imageUrl: null,
                            orderIndex: index,
                        };
                    } else {
                        return {
                            spellingListId: newList.id,
                            word: word.word.trim(),
                            syllables: word.syllables || null,
                            audioUrl: word.audioUrl || null,
                            imageUrl: word.imageUrl || null,
                            orderIndex: index,
                        };
                    }
                });

                await db.insert(spellingWords).values(wordRecords);
            }

            createdLists.push(newList);
        }

        // Fetch the first complete list with words to return
        const completeList = await db.query.spellingLists.findFirst({
            where: eq(spellingLists.id, createdLists[0].id),
            with: {
                words: {
                    orderBy: (words, { asc }) => [asc(words.orderIndex)],
                },
            },
        });

        return NextResponse.json(completeList, { status: 201 });
    } catch (error) {
        console.error('[POST /api/spelling-lists] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
