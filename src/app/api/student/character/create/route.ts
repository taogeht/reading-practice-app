import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { AvatarError, createAvatar } from '@/lib/gamification/avatar';

export const runtime = 'nodejs';

// POST /api/student/character/create — first-time character pick. Body now
// carries a specific character_id (Phase 5) instead of a bare character_type.
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
        const avatar = await createAvatar(user.id, character_id);
        return NextResponse.json({ success: true, avatar });
    } catch (error) {
        if (error instanceof AvatarError) {
            const status =
                error.code === 'already_exists'
                    ? 409
                    : error.code === 'character_not_found'
                        ? 404
                        : 400;
            return NextResponse.json({ error: error.message, code: error.code }, { status });
        }
        console.error('[POST /api/student/character/create] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
