import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { shopItems, studentAvatars } from '@/lib/db/schema';
import { generateSnapshot } from '@/lib/generation/snapshot';

export const runtime = 'nodejs';
export const maxDuration = 60;

// PATCH /api/student/character/canvas
// Body: { canvas_state: {items, character}, background_item_id: uuid | null }
// Persists the new state synchronously, fires snapshot generation async.
// Response returns immediately; the client polls GET /character for the new
// snapshot_url.
export async function PATCH(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const { canvas_state, background_item_id } = body as {
            canvas_state?: unknown;
            background_item_id?: string | null;
        };

        if (!canvas_state || typeof canvas_state !== 'object') {
            return NextResponse.json({ error: 'canvas_state is required' }, { status: 400 });
        }
        const state = canvas_state as { items?: unknown; character?: unknown };
        if (!Array.isArray(state.items) || !state.character || typeof state.character !== 'object') {
            return NextResponse.json(
                { error: 'canvas_state must have items[] and character{}' },
                { status: 400 },
            );
        }

        // Optional background — must be a real shop item or null.
        if (background_item_id !== null && background_item_id !== undefined) {
            const [bg] = await db
                .select({ id: shopItems.id })
                .from(shopItems)
                .where(and(eq(shopItems.id, background_item_id), eq(shopItems.type, 'avatar_cosmetic')))
                .limit(1);
            if (!bg) {
                return NextResponse.json({ error: 'Background item not found' }, { status: 404 });
            }
        }

        await db
            .update(studentAvatars)
            .set({
                equippedItems: canvas_state as object,
                backgroundItemId: background_item_id ?? null,
                updatedAt: new Date(),
            })
            .where(eq(studentAvatars.studentId, user.id));

        // Fire-and-forget snapshot regeneration. The route returns immediately;
        // the canvas editor keeps showing the live state, and the client polls
        // GET /character to pick up the new snapshot_url for nav/gallery.
        void generateSnapshot(user.id).catch((err) => {
            console.error('[PATCH canvas] snapshot failed:', err);
        });

        return NextResponse.json({ success: true, snapshot_status: 'generating' });
    } catch (error) {
        console.error('[PATCH /api/student/character/canvas] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
