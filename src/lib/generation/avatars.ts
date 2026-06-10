// Phase 5 avatar generation. Two entry points, both server-only:
//   - generateBaseCharacter(id) → portrait PNG for a base_characters row
//   - generateScene(id)         → background PNG for an avatar_cosmetic scene
//
// Both run as fire-and-forget calls from the admin endpoints — they update
// status on the row as they progress and never throw upstream. Gemini already
// retries transients internally, so this layer only needs the orchestration:
// flip to 'generating', call Gemini, upload to R2, flip to 'complete' (or
// 'failed' on uncovered error).

import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { baseCharacters, shopItems } from '@/lib/db/schema';
import { geminiImageClient } from '@/lib/image/gemini-client';
import { r2Client } from '@/lib/storage/r2-client';
import { stripGeminiBackground } from './strip-background';

// Gemini Flash routinely interprets "transparent background" visually — it
// draws the checkerboard pattern image editors use to indicate transparency
// instead of emitting an alpha channel. We ask for a deterministic solid
// green background, but Gemini's compliance is hit-and-miss (some images
// come back on grey checkerboard anyway). stripGeminiBackground below uses
// a corner-seeded flood-fill so we remove whatever background Gemini chose,
// not just lime green.
const CHROMA_KEY_INSTRUCTION = `Place the subject on a solid uniform pure lime-green background (RGB 0, 255, 0). The background MUST be flat #00FF00 with no gradient, no pattern, no shadow, no checkerboard. The lime green will be removed in post-processing — do not blend the subject's edges into the green.`;

export const CHIBI_STYLE_PROMPT = `cute chibi cartoon style, full body character, neutral standing pose facing forward, arms slightly out, feet together, big expressive head, small simple body, bright vibrant colors, thick clean outlines, soft shading, kid-friendly, Toca Boca inspired, high quality illustration, no text, no watermarks. ${CHROMA_KEY_INSTRUCTION}`;

export const SCENE_STYLE_PROMPT = `cute cartoon background scene, no characters, full rectangular illustration, bright vibrant colors, thick clean outlines, soft cel-shading, kid-friendly, Toca Boca inspired, detailed environment, high quality illustration, no text, no watermarks`;

export const COSMETIC_STYLE_PROMPT = `cute chibi cartoon style, single isolated item, no character, no person, item only, centered in frame, bright vibrant colors, thick clean outlines, soft shading, kid-friendly, Toca Boca inspired, high quality illustration, no text, no watermarks. ${CHROMA_KEY_INSTRUCTION}`;

function characterKey(characterId: string): string {
    return `images/avatars/characters/${characterId}.png`;
}

function sceneKey(itemId: string): string {
    return `images/avatars/scenes/${itemId}.png`;
}

function cosmeticKey(itemId: string): string {
    return `images/avatars/cosmetics/${itemId}.png`;
}

export async function generateBaseCharacter(characterId: string): Promise<void> {
    const [character] = await db
        .select()
        .from(baseCharacters)
        .where(eq(baseCharacters.id, characterId))
        .limit(1);
    if (!character) {
        console.error(`[generateBaseCharacter] no row for ${characterId}`);
        return;
    }

    const prompt = `${character.personality} chibi character. ${CHIBI_STYLE_PROMPT}`;

    await db
        .update(baseCharacters)
        .set({ generationStatus: 'generating', generationPrompt: prompt })
        .where(eq(baseCharacters.id, characterId));

    try {
        const result = await geminiImageClient.generateImagePanel({
            prompt,
            label: `character ${character.characterType}/${character.variantIndex} (${character.name})`,
        });

        if (!result.success || !result.imageBuffer) {
            await db
                .update(baseCharacters)
                .set({ generationStatus: 'failed' })
                .where(eq(baseCharacters.id, characterId));
            console.error(`[generateBaseCharacter] ${character.name} failed:`, result.error);
            return;
        }

        const transparent = await stripGeminiBackground(result.imageBuffer);
        const url = await r2Client.uploadFile(
            characterKey(characterId),
            transparent,
            'image/png',
        );

        await db
            .update(baseCharacters)
            .set({
                assetUrl: url,
                generationStatus: 'complete',
                generatedAt: new Date(),
            })
            .where(eq(baseCharacters.id, characterId));
    } catch (error) {
        console.error(`[generateBaseCharacter] ${character.name} threw:`, error);
        await db
            .update(baseCharacters)
            .set({ generationStatus: 'failed' })
            .where(eq(baseCharacters.id, characterId));
    }
}

export async function generateScene(itemId: string): Promise<void> {
    const [item] = await db.select().from(shopItems).where(eq(shopItems.id, itemId)).limit(1);
    if (!item) {
        console.error(`[generateScene] no row for ${itemId}`);
        return;
    }
    if (item.category !== 'scene') {
        console.error(`[generateScene] ${itemId} is not a scene item (category=${item.category})`);
        return;
    }

    const assetData = (item.assetData ?? {}) as { scene_prompt?: string; emoji?: string; color?: string; layer?: string; url?: string };
    const scenePrompt = assetData.scene_prompt;
    if (!scenePrompt) {
        console.error(`[generateScene] ${item.name}: missing asset_data.scene_prompt`);
        return;
    }

    const prompt = `${scenePrompt}. ${SCENE_STYLE_PROMPT}`;

    try {
        const result = await geminiImageClient.generateImagePanel({
            prompt,
            label: `scene "${item.name}"`,
        });

        if (!result.success || !result.imageBuffer) {
            console.error(`[generateScene] ${item.name} failed:`, result.error);
            return;
        }

        const url = await r2Client.uploadFile(
            sceneKey(itemId),
            result.imageBuffer,
            result.contentType ?? 'image/png',
        );

        // Update asset_data.url + flip asset_type to 'image'. Use jsonb_set so
        // we don't clobber emoji/color/layer/scene_prompt — those stay around
        // as CSS fallback if the image fails to load.
        await db
            .update(shopItems)
            .set({
                assetType: 'image',
                assetData: sql`jsonb_set(${shopItems.assetData}, '{url}', to_jsonb(${url}::text))`,
            })
            .where(eq(shopItems.id, itemId));
    } catch (error) {
        console.error(`[generateScene] ${item.name} threw:`, error);
    }
}

// Phase 6: cosmetic PNG generation. Same fire-and-forget pattern as scene/
// character. shop_items.asset_type flips from 'css' to 'image' on success;
// asset_data.url is added while emoji/color/layer remain for the fallback path.
export async function generateCosmeticItem(itemId: string): Promise<void> {
    const [item] = await db.select().from(shopItems).where(eq(shopItems.id, itemId)).limit(1);
    if (!item) {
        console.error(`[generateCosmeticItem] no row for ${itemId}`);
        return;
    }
    if (item.type !== 'avatar_cosmetic') {
        console.error(`[generateCosmeticItem] ${itemId} is not a cosmetic (type=${item.type})`);
        return;
    }
    if (item.category === 'scene' || item.category === 'background') {
        console.error(`[generateCosmeticItem] ${item.name}: use generateScene for scenes/backgrounds`);
        return;
    }

    const prompt = `${item.name}, a ${item.category} item. ${COSMETIC_STYLE_PROMPT}`;

    try {
        const result = await geminiImageClient.generateImagePanel({
            prompt,
            label: `cosmetic "${item.name}" (${item.category})`,
        });

        if (!result.success || !result.imageBuffer) {
            console.error(`[generateCosmeticItem] ${item.name} failed:`, result.error);
            return;
        }

        const transparent = await stripGeminiBackground(result.imageBuffer);
        const url = await r2Client.uploadFile(
            cosmeticKey(itemId),
            transparent,
            'image/png',
        );

        await db
            .update(shopItems)
            .set({
                assetType: 'image',
                assetData: sql`jsonb_set(${shopItems.assetData}, '{url}', to_jsonb(${url}::text))`,
            })
            .where(eq(shopItems.id, itemId));
    } catch (error) {
        console.error(`[generateCosmeticItem] ${item.name} threw:`, error);
    }
}
