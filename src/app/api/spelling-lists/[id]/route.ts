import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists, spellingWords } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/spelling-lists/[id] - Get a single spelling list with words
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const list = await db.query.spellingLists.findFirst({
            where: eq(spellingLists.id, id),
            with: {
                words: {
                    orderBy: (words, { asc }) => [asc(words.orderIndex)],
                },
                class: true,
            },
        });

        if (!list) {
            return NextResponse.json({ error: 'Spelling list not found' }, { status: 404 });
        }

        return NextResponse.json(list);
    } catch (error) {
        console.error('[GET /api/spelling-lists/[id]] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT /api/spelling-lists/[id] - Update a spelling list
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { title, weekNumber, active, words } = body;

        // Check if list exists
        const existingList = await db.query.spellingLists.findFirst({
            where: eq(spellingLists.id, id),
        });

        if (!existingList) {
            return NextResponse.json({ error: 'Spelling list not found' }, { status: 404 });
        }

        // Update list metadata
        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (title !== undefined) updateData.title = title;
        if (weekNumber !== undefined) updateData.weekNumber = weekNumber;
        if (active !== undefined) updateData.active = active;

        await db
            .update(spellingLists)
            .set(updateData)
            .where(eq(spellingLists.id, id));

        // If words are provided, replace all words
        if (words && Array.isArray(words)) {
            // Delete existing words
            await db.delete(spellingWords).where(eq(spellingWords.spellingListId, id));

            // Insert new words
            if (words.length > 0) {
                const wordRecords = words.map((word: string, index: number) => ({
                    spellingListId: id,
                    word: word.trim(),
                    orderIndex: index,
                }));

                await db.insert(spellingWords).values(wordRecords);
            }
        }

        // Fetch updated list
        const updatedList = await db.query.spellingLists.findFirst({
            where: eq(spellingLists.id, id),
            with: {
                words: {
                    orderBy: (words, { asc }) => [asc(words.orderIndex)],
                },
            },
        });

        return NextResponse.json(updatedList);
    } catch (error) {
        console.error('[PUT /api/spelling-lists/[id]] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/spelling-lists/[id] - Delete a spelling list
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if list exists
        const existingList = await db.query.spellingLists.findFirst({
            where: eq(spellingLists.id, id),
        });

        if (!existingList) {
            return NextResponse.json({ error: 'Spelling list not found' }, { status: 404 });
        }

        // Delete list (words will cascade delete)
        await db.delete(spellingLists).where(eq(spellingLists.id, id));

        return NextResponse.json({ message: 'Spelling list deleted' });
    } catch (error) {
        console.error('[DELETE /api/spelling-lists/[id]] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
