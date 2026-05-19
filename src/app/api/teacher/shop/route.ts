import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { accessibleClassIds } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import { classes, classShopItems, shopItems } from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// GET /api/teacher/shop
// Returns every shop item the teacher can curate (built-in + items scoped to
// schools where the teacher has at least one class), plus a per-class enabled
// map so the UI can render Switch states. Default-on: a missing class_shop_items
// row means the item is enabled for that class.
export async function GET(_request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'teacher') {
            return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
        }

        const myClassIds = await accessibleClassIds(user.id, user.role);
        if (myClassIds.length === 0) {
            return NextResponse.json({ items: [], classes: [] });
        }

        // Find the schools the teacher touches (for the built-in OR school items filter)
        const classRows = await db
            .select({ id: classes.id, name: classes.name, schoolId: classes.schoolId })
            .from(classes)
            .where(inArray(classes.id, myClassIds));
        const schoolIds = Array.from(new Set(classRows.map((c) => c.schoolId).filter(Boolean) as string[]));

        const items = await db
            .select()
            .from(shopItems)
            .where(
                and(
                    eq(shopItems.isActive, true),
                    schoolIds.length > 0
                        ? or(isNull(shopItems.schoolId), inArray(shopItems.schoolId, schoolIds))
                        : isNull(shopItems.schoolId),
                ),
            )
            .orderBy(asc(shopItems.type), asc(shopItems.category), asc(shopItems.sortOrder), asc(shopItems.name));

        const disabledRows = items.length > 0
            ? await db
                .select({ classId: classShopItems.classId, itemId: classShopItems.itemId })
                .from(classShopItems)
                .where(
                    and(
                        inArray(classShopItems.classId, myClassIds),
                        inArray(classShopItems.itemId, items.map((i) => i.id)),
                        eq(classShopItems.isEnabled, false),
                    ),
                )
            : [];

        const disabledKey = (classId: string, itemId: string) => `${classId}:${itemId}`;
        const disabledSet = new Set(disabledRows.map((r) => disabledKey(r.classId, r.itemId)));

        return NextResponse.json({
            classes: classRows.map((c) => ({ id: c.id, name: c.name })),
            items: items.map((i) => ({
                id: i.id,
                type: i.type,
                category: i.category,
                name: i.name,
                description: i.description,
                star_cost: i.starCost,
                asset_type: i.assetType,
                asset_data: i.assetData,
                min_level: i.minLevel,
                enabled_for_classes: Object.fromEntries(
                    myClassIds.map((cid) => [cid, !disabledSet.has(disabledKey(cid, i.id))]),
                ),
            })),
        });
    } catch (error) {
        logError(error, 'api/teacher/shop GET');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
