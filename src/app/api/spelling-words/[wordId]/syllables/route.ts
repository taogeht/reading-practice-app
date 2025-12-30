import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingWords } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ wordId: string }>;
}

// PUT /api/spelling-words/[wordId]/syllables - Update syllables for a word
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { wordId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { syllables } = body;

        if (!syllables || !Array.isArray(syllables)) {
            return NextResponse.json(
                { error: 'syllables array is required' },
                { status: 400 }
            );
        }

        // Verify word exists
        const word = await db.query.spellingWords.findFirst({
            where: eq(spellingWords.id, wordId),
        });

        if (!word) {
            return NextResponse.json({ error: 'Word not found' }, { status: 404 });
        }

        // Validate that syllables join back to the original word
        const joinedSyllables = syllables.join('').toLowerCase();
        const originalWord = word.word.toLowerCase();

        if (joinedSyllables !== originalWord) {
            return NextResponse.json(
                {
                    error: 'Syllables must join to form the original word',
                    expected: originalWord,
                    got: joinedSyllables
                },
                { status: 400 }
            );
        }

        // Update syllables
        await db
            .update(spellingWords)
            .set({ syllables })
            .where(eq(spellingWords.id, wordId));

        return NextResponse.json({
            success: true,
            wordId,
            syllables
        });
    } catch (error) {
        console.error('[PUT /api/spelling-words/[wordId]/syllables] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
