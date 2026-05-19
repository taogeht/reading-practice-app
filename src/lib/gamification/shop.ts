// Phase 2 shop service. Three entry points:
//   - getShopItemsForStudent  → enriched, grouped catalogue
//   - getInventoryForStudent  → owned items, same grouping
//   - purchaseItem            → transactional spend (stars + inventory in one BEGIN/COMMIT)
//
// Visibility rule (opt-out across enrolled classes): an item is shown to the
// student if at least one of their enrolled classes does NOT have an explicit
// disable row in class_shop_items. Equivalently — hidden only when every
// enrolled class has explicitly disabled it.

import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
    classEnrollments,
    classes,
    classShopItems,
    shopItems,
    starTransactions,
    studentInventory,
    studentProgression,
} from '@/lib/db/schema';

export type ShopItemDto = {
    id: string;
    type: string;
    category: string;
    name: string;
    description: string | null;
    star_cost: number;
    min_level: number;
    asset_type: string;
    asset_data: unknown;
    character_type: string | null;
    sort_order: number;
};

export type EnrichedShopItem = ShopItemDto & {
    owned: boolean;
    affordable: boolean;
    level_locked: boolean;
};

export type GroupedShop = {
    avatar_cosmetics: Record<string, EnrichedShopItem[]>;
    collectibles: Record<string, EnrichedShopItem[]>;
};

function toDto(row: typeof shopItems.$inferSelect): ShopItemDto {
    return {
        id: row.id,
        type: row.type,
        category: row.category,
        name: row.name,
        description: row.description,
        star_cost: row.starCost,
        min_level: row.minLevel,
        asset_type: row.assetType,
        asset_data: row.assetData,
        character_type: row.characterType,
        sort_order: row.sortOrder,
    };
}

function emptyGrouped(): GroupedShop {
    return {
        avatar_cosmetics: { hat: [], outfit: [], accessory: [], background: [] },
        collectibles: { sticker: [], trophy: [], pet: [] },
    };
}

function groupItems<T extends ShopItemDto>(items: T[]): { avatar_cosmetics: Record<string, T[]>; collectibles: Record<string, T[]> } {
    const out = {
        avatar_cosmetics: { hat: [], outfit: [], accessory: [], background: [] } as Record<string, T[]>,
        collectibles: { sticker: [], trophy: [], pet: [] } as Record<string, T[]>,
    };
    for (const item of items) {
        const bucket = item.type === 'avatar_cosmetic' ? out.avatar_cosmetics : out.collectibles;
        if (!bucket[item.category]) bucket[item.category] = [];
        bucket[item.category].push(item);
    }
    return out;
}

export async function getShopItemsForStudent(studentId: string): Promise<GroupedShop> {
    // 1. Enrollments (and the schools those classes sit in)
    const enrollments = await db
        .select({ classId: classEnrollments.classId, schoolId: classes.schoolId })
        .from(classEnrollments)
        .innerJoin(classes, eq(classes.id, classEnrollments.classId))
        .where(eq(classEnrollments.studentId, studentId));

    if (enrollments.length === 0) return emptyGrouped();

    const classIds = enrollments.map((e) => e.classId);
    const schoolIds = Array.from(new Set(enrollments.map((e) => e.schoolId).filter(Boolean) as string[]));

    // 2. Wallet + level
    const [progression] = await db
        .select({ balance: studentProgression.starsBalance, level: studentProgression.currentLevel })
        .from(studentProgression)
        .where(eq(studentProgression.studentId, studentId))
        .limit(1);
    const balance = progression?.balance ?? 0;
    const level = progression?.level ?? 1;

    // 3. Owned set
    const ownedRows = await db
        .select({ itemId: studentInventory.itemId })
        .from(studentInventory)
        .where(eq(studentInventory.studentId, studentId));
    const ownedSet = new Set(ownedRows.map((r) => r.itemId));

    // 4. Candidate items — active + built-in (school_id IS NULL) OR scoped to a
    // school the student touches through any enrollment.
    const candidates = await db
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

    if (candidates.length === 0) return emptyGrouped();

    // 5. Class-level disable rows for these candidates. Visible iff NOT every
    // enrolled class has an explicit disable row.
    const itemIds = candidates.map((c) => c.id);
    const disabledRows = await db
        .select({ classId: classShopItems.classId, itemId: classShopItems.itemId })
        .from(classShopItems)
        .where(
            and(
                inArray(classShopItems.classId, classIds),
                inArray(classShopItems.itemId, itemIds),
                eq(classShopItems.isEnabled, false),
            ),
        );

    const disabledClassesByItem = new Map<string, Set<string>>();
    for (const r of disabledRows) {
        if (!disabledClassesByItem.has(r.itemId)) disabledClassesByItem.set(r.itemId, new Set());
        disabledClassesByItem.get(r.itemId)!.add(r.classId);
    }

    const visible = candidates.filter((c) => {
        const disabledIn = disabledClassesByItem.get(c.id);
        if (!disabledIn) return true;
        return disabledIn.size < classIds.length;
    });

    const enriched: EnrichedShopItem[] = visible.map((c) => ({
        ...toDto(c),
        owned: ownedSet.has(c.id),
        affordable: balance >= c.starCost,
        level_locked: level < c.minLevel,
    }));

    return groupItems(enriched);
}

export async function getInventoryForStudent(studentId: string): Promise<{ avatar_cosmetics: Record<string, ShopItemDto[]>; collectibles: Record<string, ShopItemDto[]> }> {
    const rows = await db
        .select({ item: shopItems, acquiredAt: studentInventory.acquiredAt })
        .from(studentInventory)
        .innerJoin(shopItems, eq(shopItems.id, studentInventory.itemId))
        .where(eq(studentInventory.studentId, studentId))
        .orderBy(asc(shopItems.type), asc(shopItems.category), asc(shopItems.sortOrder));
    return groupItems(rows.map((r) => toDto(r.item)));
}

export class PurchaseError extends Error {
    code: 'not_found' | 'not_available' | 'level_locked' | 'insufficient_stars' | 'already_owned' | 'no_class';
    constructor(code: PurchaseError['code'], message: string) {
        super(message);
        this.code = code;
    }
}

export async function purchaseItem(
    studentId: string,
    itemId: string,
): Promise<{ item: ShopItemDto; new_balance: number }> {
    // Pre-flight checks outside the transaction — fail fast with user-friendly
    // errors. The transaction below still has CHECK/UNIQUE safety nets for any
    // race we don't catch here.
    const [item] = await db
        .select()
        .from(shopItems)
        .where(and(eq(shopItems.id, itemId), eq(shopItems.isActive, true)))
        .limit(1);
    if (!item) throw new PurchaseError('not_found', 'That item is not available.');

    const enrollments = await db
        .select({ classId: classEnrollments.classId })
        .from(classEnrollments)
        .where(eq(classEnrollments.studentId, studentId));
    const classIds = enrollments.map((e) => e.classId);
    if (classIds.length === 0) {
        throw new PurchaseError('no_class', 'You need to be in a class before you can shop.');
    }

    const disabledIn = await db
        .select({ classId: classShopItems.classId })
        .from(classShopItems)
        .where(
            and(
                eq(classShopItems.itemId, itemId),
                inArray(classShopItems.classId, classIds),
                eq(classShopItems.isEnabled, false),
            ),
        );
    if (disabledIn.length === classIds.length) {
        throw new PurchaseError('not_available', 'This item is not available in your class.');
    }

    const [progression] = await db
        .select({ balance: studentProgression.starsBalance, level: studentProgression.currentLevel })
        .from(studentProgression)
        .where(eq(studentProgression.studentId, studentId))
        .limit(1);
    const balance = progression?.balance ?? 0;
    const level = progression?.level ?? 1;
    if (level < item.minLevel) {
        throw new PurchaseError('level_locked', `Reach level ${item.minLevel} to unlock this.`);
    }
    if (balance < item.starCost) {
        throw new PurchaseError('insufficient_stars', `You need ${item.starCost - balance} more ⭐ to buy this.`);
    }

    const owned = await db
        .select({ id: studentInventory.id })
        .from(studentInventory)
        .where(and(eq(studentInventory.studentId, studentId), eq(studentInventory.itemId, itemId)))
        .limit(1);
    if (owned.length) throw new PurchaseError('already_owned', 'You already own this item.');

    // Transactional spend. The stars_balance >= 0 CHECK and student_inventory
    // UNIQUE constraints catch any race that slipped through the pre-flight
    // (concurrent purchase, double-tap, balance drained by a parallel spend).
    let newBalance = 0;
    try {
        await db.transaction(async (tx) => {
            await tx
                .update(studentProgression)
                .set({
                    starsBalance: sql`${studentProgression.starsBalance} - ${item.starCost}`,
                    updatedAt: new Date(),
                })
                .where(eq(studentProgression.studentId, studentId));

            await tx.insert(starTransactions).values({
                studentId,
                amount: -item.starCost,
                direction: 'spend',
                sourceType: 'shop_purchase',
                sourceRef: item.id,
            });

            await tx.insert(studentInventory).values({
                studentId,
                itemId: item.id,
            });
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // Postgres CHECK violation for stars_balance >= 0
        if (msg.includes('stars_balance_nonneg')) {
            throw new PurchaseError('insufficient_stars', 'Not enough stars (someone else just spent them?).');
        }
        if (msg.includes('unique_student_item')) {
            throw new PurchaseError('already_owned', 'You already own this item.');
        }
        throw error;
    }

    const [after] = await db
        .select({ balance: studentProgression.starsBalance })
        .from(studentProgression)
        .where(eq(studentProgression.studentId, studentId))
        .limit(1);
    newBalance = after?.balance ?? 0;

    return { item: toDto(item), new_balance: newBalance };
}
