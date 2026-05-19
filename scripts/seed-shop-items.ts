// Seeds built-in shop items. Idempotent on (type, category, name) — re-running
// is safe; existing items keep their id and any class toggles/inventory rows.
//
// Usage: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-shop-items.ts

import { db } from '../src/lib/db';
import { shopItems } from '../src/lib/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';

type AssetData = { emoji: string; color: string; layer: string; scene_prompt?: string };
type StarterItem = {
    type: 'avatar_cosmetic' | 'collectible';
    category: string;
    name: string;
    description: string;
    starCost: number;
    sortOrder: number;
    assetData: AssetData;
};

const STARTER_ITEMS: StarterItem[] = [
    // Hats
    { type: 'avatar_cosmetic', category: 'hat', name: 'Party Hat',   description: 'Time to celebrate!',           starCost: 8,  sortOrder: 10, assetData: { emoji: '🎉', color: '#FF6B6B', layer: 'hat' } },
    { type: 'avatar_cosmetic', category: 'hat', name: 'Wizard Hat',  description: 'Pure magic.',                  starCost: 15, sortOrder: 20, assetData: { emoji: '🧙', color: '#7B68EE', layer: 'hat' } },
    { type: 'avatar_cosmetic', category: 'hat', name: 'Crown',       description: 'For the top student.',         starCost: 25, sortOrder: 30, assetData: { emoji: '👑', color: '#FFD700', layer: 'hat' } },
    // Accessories
    { type: 'avatar_cosmetic', category: 'accessory', name: 'Rainbow Scarf', description: 'Very cozy.',                  starCost: 10, sortOrder: 10, assetData: { emoji: '🌈', color: '#FF9999', layer: 'accessory' } },
    { type: 'avatar_cosmetic', category: 'accessory', name: 'Star Glasses',  description: 'See the world differently.', starCost: 12, sortOrder: 20, assetData: { emoji: '⭐', color: '#FFE066', layer: 'accessory' } },
    // Backgrounds
    { type: 'avatar_cosmetic', category: 'background', name: 'Space',   description: 'To infinity!',     starCost: 20, sortOrder: 10, assetData: { emoji: '🚀', color: '#1a1a2e', layer: 'background' } },
    { type: 'avatar_cosmetic', category: 'background', name: 'Garden',  description: 'Fresh and green.', starCost: 20, sortOrder: 20, assetData: { emoji: '🌸', color: '#d4edda', layer: 'background' } },
    // Collectibles — stickers
    { type: 'collectible', category: 'sticker', name: 'Gold Star', description: 'The classic.',       starCost: 5, sortOrder: 10, assetData: { emoji: '⭐', color: '#FFD700', layer: 'collectible' } },
    { type: 'collectible', category: 'sticker', name: 'Rainbow',   description: 'Bright and happy.',  starCost: 5, sortOrder: 20, assetData: { emoji: '🌈', color: '#FF9999', layer: 'collectible' } },
    // Collectibles — trophies
    { type: 'collectible', category: 'trophy', name: 'Reading Trophy', description: 'For bookworms.',         starCost: 15, sortOrder: 30, assetData: { emoji: '📚', color: '#8B4513', layer: 'collectible' } },
    { type: 'collectible', category: 'trophy', name: 'Quiz Champion',  description: 'Ace every question.',    starCost: 15, sortOrder: 40, assetData: { emoji: '🏆', color: '#FFD700', layer: 'collectible' } },
    // Collectibles — pets
    { type: 'collectible', category: 'pet', name: 'Baby Dragon', description: 'Friendly fire.',     starCost: 20, sortOrder: 50, assetData: { emoji: '🐉', color: '#90EE90', layer: 'collectible' } },
    { type: 'collectible', category: 'pet', name: 'Lucky Cat',   description: 'Good fortune ahead.', starCost: 20, sortOrder: 60, assetData: { emoji: '🐱', color: '#FFB347', layer: 'collectible' } },
    // Scenes — Phase 5. asset_type starts as 'css'; admin upgrades to 'image' via Gemini.
    {
        type: 'avatar_cosmetic', category: 'scene', name: 'Cozy Classroom',
        description: 'A bright, cheerful classroom full of books and color.',
        starCost: 25, sortOrder: 100,
        assetData: {
            emoji: '🏫', color: '#FFE5B4', layer: 'background',
            scene_prompt: 'a cozy cartoon classroom scene, colorful desks, books on shelves, big windows with sunshine, alphabet posters on walls, plants, cheerful and bright',
        },
    },
    {
        type: 'avatar_cosmetic', category: 'scene', name: 'Outer Space',
        description: 'Floating among the stars!',
        starCost: 30, sortOrder: 110,
        assetData: {
            emoji: '🚀', color: '#0d1b2a', layer: 'background',
            scene_prompt: 'a cute cartoon outer space scene, colorful planets, stars, a small rocket ship, nebula clouds in purples and blues, fun and adventurous, kid-friendly',
        },
    },
    {
        type: 'avatar_cosmetic', category: 'scene', name: 'Enchanted Forest',
        description: 'Magical trees and glowing mushrooms.',
        starCost: 30, sortOrder: 120,
        assetData: {
            emoji: '🌲', color: '#1a472a', layer: 'background',
            scene_prompt: 'a cute cartoon enchanted forest scene, tall colorful trees, glowing mushrooms, fireflies, soft magical light beams, friendly and whimsical, kid-friendly',
        },
    },
];

async function main() {
    let inserted = 0;
    let updated = 0;
    for (const item of STARTER_ITEMS) {
        // Built-in items (school_id IS NULL) are uniqued on (type, category, name).
        const existing = await db
            .select({ id: shopItems.id })
            .from(shopItems)
            .where(
                and(
                    isNull(shopItems.schoolId),
                    eq(shopItems.type, item.type),
                    eq(shopItems.category, item.category),
                    eq(shopItems.name, item.name),
                ),
            )
            .limit(1);

        if (existing.length) {
            // Refresh cost/description/asset_data/sort in case we tweak the seed.
            await db
                .update(shopItems)
                .set({
                    description: item.description,
                    starCost: item.starCost,
                    sortOrder: item.sortOrder,
                    assetData: sql`${JSON.stringify(item.assetData)}::jsonb`,
                    isActive: true,
                })
                .where(eq(shopItems.id, existing[0].id));
            updated++;
        } else {
            await db.insert(shopItems).values({
                type: item.type,
                category: item.category,
                name: item.name,
                description: item.description,
                starCost: item.starCost,
                sortOrder: item.sortOrder,
                assetType: 'css',
                assetData: item.assetData,
            });
            inserted++;
        }
    }
    console.log(`✓ Seeded shop items — inserted ${inserted}, updated ${updated}, total ${STARTER_ITEMS.length}`);
    process.exit(0);
}

main().catch((err) => {
    console.error('Failed to seed shop items:', err);
    process.exit(1);
});
