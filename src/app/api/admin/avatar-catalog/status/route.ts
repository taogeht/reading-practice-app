import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { baseCharacters, shopItems } from '@/lib/db/schema';

export const runtime = 'nodejs';

// GET /api/admin/avatar-catalog/status
// Combined catalog snapshot used by the admin UI's poll loop. Returns every
// base character + every scene shop item with the fields needed to render the
// catalog grid: name, status, image URL, prompt origins for debugging.
export async function GET(_request: NextRequest) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const characters = await db
        .select()
        .from(baseCharacters)
        .orderBy(asc(baseCharacters.characterType), asc(baseCharacters.variantIndex));

    const scenes = await db
        .select()
        .from(shopItems)
        .where(and(eq(shopItems.type, 'avatar_cosmetic'), eq(shopItems.category, 'scene')))
        .orderBy(asc(shopItems.sortOrder), asc(shopItems.name));

    // Phase 6: cosmetics (hat / outfit / accessory) are everything in
    // avatar_cosmetic that isn't a scene/background. Same status semantics:
    // asset_type 'css' = pending, 'image' = complete.
    const cosmetics = await db
        .select()
        .from(shopItems)
        .where(
            and(
                eq(shopItems.type, 'avatar_cosmetic'),
                ne(shopItems.category, 'scene'),
                inArray(shopItems.category, ['hat', 'outfit', 'accessory']),
            ),
        )
        .orderBy(asc(shopItems.category), asc(shopItems.sortOrder), asc(shopItems.name));

    const mapItem = (s: typeof shopItems.$inferSelect) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        description: s.description,
        star_cost: s.starCost,
        asset_type: s.assetType,
        asset_data: s.assetData,
    });

    return NextResponse.json({
        characters: characters.map((c) => ({
            id: c.id,
            character_type: c.characterType,
            variant_index: c.variantIndex,
            name: c.name,
            personality: c.personality,
            asset_url: c.assetUrl,
            generation_status: c.generationStatus,
            generated_at: c.generatedAt,
        })),
        scenes: scenes.map(mapItem),
        cosmetics: cosmetics.map(mapItem),
    });
}
