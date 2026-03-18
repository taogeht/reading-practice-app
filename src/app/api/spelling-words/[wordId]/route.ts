import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingWords } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ wordId: string }>;
}

// PATCH /api/spelling-words/[wordId] - Update a single spelling word (syllables, etc.)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { wordId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { syllables } = body;

        const existing = await db.query.spellingWords.findFirst({
            where: eq(spellingWords.id, wordId),
        });

        if (!existing) {
            return NextResponse.json({ error: 'Word not found' }, { status: 404 });
        }

        const updateData: Record<string, unknown> = {};
        if (syllables !== undefined) {
            updateData.syllables = syllables;
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        }

        await db
            .update(spellingWords)
            .set(updateData)
            .where(eq(spellingWords.id, wordId));

        const updated = await db.query.spellingWords.findFirst({
            where: eq(spellingWords.id, wordId),
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error('[PATCH /api/spelling-words/[wordId]] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
