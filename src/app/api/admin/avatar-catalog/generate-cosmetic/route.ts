import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { shopItems } from '@/lib/db/schema';
import { generateCosmeticItem } from '@/lib/generation/avatars';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/admin/avatar-catalog/generate-cosmetic
// Body: { item_id }. Same pattern as generate-scene — fires Gemini async,
// returns immediately, UI polls /status until asset_type flips to 'image'.
export async function POST(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { item_id } = body as { item_id?: string };
    if (!item_id) {
        return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
    }

    const [row] = await db
        .select({ id: shopItems.id, category: shopItems.category, type: shopItems.type })
        .from(shopItems)
        .where(and(eq(shopItems.id, item_id), eq(shopItems.type, 'avatar_cosmetic'), ne(shopItems.category, 'scene')))
        .limit(1);
    if (!row) {
        return NextResponse.json({ error: 'Cosmetic not found (or it is a scene — use generate-scene)' }, { status: 404 });
    }

    void generateCosmeticItem(item_id).catch((err) => {
        console.error('[generate-cosmetic] unhandled:', err);
    });

    return NextResponse.json({ success: true, status: 'generating' });
}
