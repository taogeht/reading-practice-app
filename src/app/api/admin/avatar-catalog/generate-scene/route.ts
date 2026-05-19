import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { shopItems } from '@/lib/db/schema';
import { generateScene } from '@/lib/generation/avatars';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/admin/avatar-catalog/generate-scene
// Body: { item_id }
// Same shape as generate-character but for scene shop items. No status flip on
// shopItems (no generation_status column there) — completion is implicit when
// asset_type flips from 'css' to 'image'. Concurrent invocations during a slow
// generation are tolerated; the second one just overwrites the R2 object.
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
        .select({ id: shopItems.id, category: shopItems.category })
        .from(shopItems)
        .where(and(eq(shopItems.id, item_id), eq(shopItems.type, 'avatar_cosmetic')))
        .limit(1);
    if (!row || row.category !== 'scene') {
        return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    void generateScene(item_id).catch((err) => {
        console.error('[generate-scene] unhandled:', err);
    });

    return NextResponse.json({ success: true, status: 'generating' });
}
