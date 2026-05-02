import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingGameResults, spellingWords } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { awardXp } from '@/lib/gamification/award';

export const runtime = 'nodejs';

// POST /api/student/spelling-game/results - Save a game round result
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { spellingWordId, classId, won, wrongGuesses, guessedLetters, timeSeconds, activityType } = body;

        if (!spellingWordId || !classId || won === undefined || wrongGuesses === undefined) {
            return NextResponse.json(
                { error: 'spellingWordId, classId, won, and wrongGuesses are required' },
                { status: 400 }
            );
        }

        // Verify the spelling word exists (use direct select to avoid relation issues)
        const [word] = await db
            .select({ id: spellingWords.id })
            .from(spellingWords)
            .where(eq(spellingWords.id, spellingWordId))
            .limit(1);

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
                activityType: activityType || 'snowman',
                timeSeconds: timeSeconds || null,
            })
            .returning();

        // Award XP — never blocks the result save
        const award = await awardXp(user.id, won ? 'spelling_won' : 'spelling_lost', result.id);

        return NextResponse.json({ ...result, award }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : '';
        console.error('[POST /api/student/spelling-game/results] Error:', message);
        console.error('[POST /api/student/spelling-game/results] Stack:', stack);
        return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 });
    }
}
