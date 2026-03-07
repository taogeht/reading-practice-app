import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingGameResults, spellingWords } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

// POST /api/student/spelling-game/results - Save a game round result
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { spellingWordId, classId, won, wrongGuesses, guessedLetters, timeSeconds } = body;

        if (!spellingWordId || !classId || won === undefined || wrongGuesses === undefined) {
            return NextResponse.json(
                { error: 'spellingWordId, classId, won, and wrongGuesses are required' },
                { status: 400 }
            );
        }

        // Verify the spelling word exists
        const word = await db.query.spellingWords.findFirst({
            where: eq(spellingWords.id, spellingWordId),
        });

        if (!word) {
            return NextResponse.json({ error: 'Spelling word not found' }, { status: 404 });
        }

        // Save the result
        const [result] = await db
            .insert(spellingGameResults)
            .values({
                studentId: user.id,
                spellingWordId,
                classId,
                won,
                wrongGuesses,
                guessedLetters: guessedLetters || [],
                timeSeconds: timeSeconds || null,
            })
            .returning();

        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        console.error('[POST /api/student/spelling-game/results] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
