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
        const { classId, title, weekNumber, words } = body;

        if (!classId || !title || !words || !Array.isArray(words)) {
            return NextResponse.json(
                { error: 'classId, title, and words array are required' },
                { status: 400 }
            );
        }

        // Verify class exists
        const classExists = await db.query.classes.findFirst({
            where: eq(classes.id, classId),
        });

        if (!classExists) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        }

        // Create the spelling list
        const [newList] = await db
            .insert(spellingLists)
            .values({
                classId,
                title,
                weekNumber: weekNumber || null,
                active: true,
            })
            .returning();

        // Insert words with syllables from dictionary API
        if (words.length > 0) {
            // Import and use the syllables function
            const { getSyllablesForWords } = await import('@/lib/dictionary/syllables');

            // Fetch syllables for all words in parallel
            const syllablesMap = await getSyllablesForWords(
                words.map((w: string) => w.trim())
            );

            const wordRecords = words.map((word: string, index: number) => {
                const trimmedWord = word.trim();
                const syllables = syllablesMap.get(trimmedWord.toLowerCase()) || [trimmedWord];
                return {
                    spellingListId: newList.id,
                    word: trimmedWord,
                    syllables,
                    orderIndex: index,
                };
            });

            await db.insert(spellingWords).values(wordRecords);
        }

        // Fetch the complete list with words
        const completeList = await db.query.spellingLists.findFirst({
            where: eq(spellingLists.id, newList.id),
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
