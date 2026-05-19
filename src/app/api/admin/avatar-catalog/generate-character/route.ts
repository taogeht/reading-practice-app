import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { baseCharacters } from '@/lib/db/schema';
import { generateBaseCharacter } from '@/lib/generation/avatars';

export const runtime = 'nodejs';
// Image generation runs for ~10-30s. Default Next.js dev/serverless function
// timeout would kill the request, but we return as soon as the row is flipped
// to 'generating' and let the actual gen continue in the background.
export const maxDuration = 60;

// POST /api/admin/avatar-catalog/generate-character
// Body: { character_id }
// Flips the row to 'generating' synchronously, fires generateBaseCharacter()
// as a detached promise, and returns immediately. The UI polls /status until
// 'complete' (or 'failed').
export async function POST(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { character_id } = body as { character_id?: string };
    if (!character_id) {
        return NextResponse.json({ error: 'character_id is required' }, { status: 400 });
    }

    const [row] = await db
        .select({ id: baseCharacters.id, status: baseCharacters.generationStatus })
        .from(baseCharacters)
        .where(eq(baseCharacters.id, character_id))
        .limit(1);
    if (!row) {
        return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }
    if (row.status === 'generating') {
        return NextResponse.json({ success: true, status: 'generating', alreadyRunning: true });
    }

    // Synchronously flip status so a concurrent click sees 'generating' and
    // the bulk path can skip rows already in flight.
    await db
        .update(baseCharacters)
        .set({ generationStatus: 'generating' })
        .where(eq(baseCharacters.id, character_id));

    // Fire-and-forget. The function handles its own errors and status updates.
    void generateBaseCharacter(character_id).catch((err) => {
        console.error('[generate-character] unhandled:', err);
    });

    return NextResponse.json({ success: true, status: 'generating' });
}
