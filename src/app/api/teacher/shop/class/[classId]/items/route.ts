import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { userCanManageClass } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import { classShopItems, shopItems } from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// PUT /api/teacher/shop/class/[classId]/items
// Body: { item_id, enabled }
// Upserts the class_shop_items row so a teacher can toggle individual items
// on or off for one of their classes. Default is enabled (opt-out), so an
// "enable" toggle on an item with no row is a no-op write to keep the state
// explicit in the DB.
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ classId: string }> },
) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'teacher') {
            return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
        }
        const { classId } = await params;
        const canManage = await userCanManageClass(user.id, user.role, classId);
        if (!canManage) {
            return NextResponse.json({ error: 'Not authorized for this class' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const { item_id, enabled } = body as { item_id?: string; enabled?: boolean };
        if (!item_id || typeof item_id !== 'string') {
            return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
        }
        if (typeof enabled !== 'boolean') {
            return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
        }

        // Validate the item exists (and is active — teachers shouldn't toggle a
        // soft-deleted item).
        const [item] = await db
            .select({ id: shopItems.id })
            .from(shopItems)
            .where(and(eq(shopItems.id, item_id), eq(shopItems.isActive, true)))
            .limit(1);
        if (!item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        await db
            .insert(classShopItems)
            .values({ classId, itemId: item_id, isEnabled: enabled })
            .onConflictDoUpdate({
                target: [classShopItems.classId, classShopItems.itemId],
                set: { isEnabled: enabled },
            });

        return NextResponse.json({ success: true });
    } catch (error) {
        logError(error, 'api/teacher/shop/class/[classId]/items PUT');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
