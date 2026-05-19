import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAvatar, getRerollCost } from '@/lib/gamification/avatar';

export const runtime = 'nodejs';

// GET /api/student/character — current character avatar + equipped items, or
// null when the student hasn't picked yet. Lives at /character (not /avatar)
// because /api/student/avatar is the existing emoji/visual-password feature.
// Also returns the current reroll cost so the client doesn't need a second
// fetch to show the price.
export async function GET(_request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const [avatar, rerollCost] = await Promise.all([getAvatar(user.id), getRerollCost()]);
        return NextResponse.json({ avatar, reroll_cost: rerollCost });
    } catch (error) {
        console.error('[GET /api/student/character] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
