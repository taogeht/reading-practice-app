import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { AvatarError, rerollAvatar } from '@/lib/gamification/avatar';

export const runtime = 'nodejs';

// POST /api/student/character/reroll — swap to a different character variant.
// Body: { character_id }. Pricing:
//   - legacy avatar (no character_id yet): free claim
//   - same character_type as current: free (variant swap within identity)
//   - different character_type: paid (reroll_cost_stars from system_settings)
// Returns { charged, new_balance, reroll_count, avatar } so the client can
// show "Free!" vs "−⭐20" feedback.
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const body = await request.json().catch(() => ({}));
        const { character_id } = body as { character_id?: string };
        if (!character_id) {
            return NextResponse.json({ error: 'character_id is required' }, { status: 400 });
        }
        const result = await rerollAvatar(user.id, character_id);
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        if (error instanceof AvatarError) {
            const status =
                error.code === 'insufficient_stars'
                    ? 402
                    : error.code === 'character_not_found'
                        ? 404
                        : error.code === 'no_avatar' || error.code === 'wallet_missing'
                            ? 409
                            : 400;
            return NextResponse.json({ error: error.message, code: error.code }, { status });
        }
        console.error('[POST /api/student/character/reroll] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
