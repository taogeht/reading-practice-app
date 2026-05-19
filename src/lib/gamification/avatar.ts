// Avatar service. Phase history:
//   Phase 3 — slot-keyed equipped_items map (hat/outfit/accessory/background)
//   Phase 5 — characterId + Gemini PNG portraits
//   Phase 6 — free canvas: equipped_items is { items: [...], character: {...} };
//             background lives in its own column (always full-bleed); snapshot
//             URL renders the flat composite for nav/gallery/peer views.
//
// Public surface today:
//   - getAvatar               → hydrated avatar (canvas items inlined with shop item data)
//   - createAvatar            → first-time pick of a base_characters variant
//   - rerollAvatar            → swap character (free for same-type / legacy / paid for cross-type)
//   - getRerollCost           → reads system_settings
//
// Phase 6 dropped equipItem/unequipSlot — the canvas PATCH route is the only
// way to mutate equipped state now.

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
    baseCharacters,
    shopItems,
    starTransactions,
    studentAvatars,
    studentProgression,
    systemSettings,
} from '@/lib/db/schema';

export type CharacterType = 'human' | 'animal' | 'robot';
export const CHARACTER_TYPES: readonly CharacterType[] = ['human', 'animal', 'robot'] as const;

export const REROLL_COST_FALLBACK = 20;

type AssetData = { emoji?: string; color?: string; layer?: string; url?: string };

// Bare canvas state as stored in jsonb. itemId references shop_items.id.
export interface BareCanvasItem {
    itemId: string;
    category: string;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    zIndex: number;
}
export interface BareCanvasState {
    items: BareCanvasItem[];
    character: { x: number; y: number; scale: number; rotation: number; zIndex: number };
}

// Hydrated for the API response: each item carries the shop_item data so the
// client can render it without a second fetch.
export interface CanvasItemDto extends BareCanvasItem {
    name: string;
    asset_type: string;
    asset_data: AssetData;
}
export interface CanvasStateDto {
    items: CanvasItemDto[];
    character: BareCanvasState['character'];
}

export interface BackgroundItemDto {
    id: string;
    name: string;
    asset_type: string;
    asset_data: AssetData;
}

export interface AvatarDto {
    characterType: CharacterType;
    characterId: string | null;
    characterName: string | null;
    canvas: CanvasStateDto;
    background: BackgroundItemDto | null;
    snapshotUrl: string | null;
    rerollCount: number;
    generationStatus: string;
    baseAssetUrl: string | null;
}

export class AvatarError extends Error {
    code:
        | 'no_avatar'
        | 'already_exists'
        | 'bad_character_type'
        | 'character_not_found'
        | 'character_not_ready'
        | 'same_character'
        | 'insufficient_stars'
        | 'wallet_missing';
    constructor(code: AvatarError['code'], message: string) {
        super(message);
        this.code = code;
    }
}

function isAssetData(v: unknown): v is AssetData {
    return typeof v === 'object' && v !== null;
}

export function defaultCanvasState(): BareCanvasState {
    return {
        items: [],
        character: { x: 0.5, y: 0.6, scale: 1, rotation: 0, zIndex: 0 },
    };
}

// Read the canvas state from a row, normalising legacy rows (the migration
// should have converted them, but be defensive — if anything looks wrong, fall
// back to the empty canvas so the editor opens with the character only).
function readCanvasState(value: unknown): BareCanvasState {
    if (!value || typeof value !== 'object') return defaultCanvasState();
    const v = value as { items?: unknown; character?: unknown };
    const items = Array.isArray(v.items) ? (v.items.filter(isBareCanvasItem) as BareCanvasItem[]) : [];
    const character = isCharacterTransform(v.character)
        ? v.character
        : defaultCanvasState().character;
    return { items, character };
}

function isBareCanvasItem(v: unknown): v is BareCanvasItem {
    if (!v || typeof v !== 'object') return false;
    const it = v as Partial<BareCanvasItem>;
    return (
        typeof it.itemId === 'string' &&
        typeof it.category === 'string' &&
        typeof it.x === 'number' &&
        typeof it.y === 'number' &&
        typeof it.scale === 'number' &&
        typeof it.rotation === 'number' &&
        typeof it.zIndex === 'number'
    );
}
function isCharacterTransform(v: unknown): v is BareCanvasState['character'] {
    if (!v || typeof v !== 'object') return false;
    const it = v as Partial<BareCanvasState['character']>;
    return (
        typeof it.x === 'number' &&
        typeof it.y === 'number' &&
        typeof it.scale === 'number' &&
        typeof it.rotation === 'number' &&
        typeof it.zIndex === 'number'
    );
}

export async function getAvatar(studentId: string): Promise<AvatarDto | null> {
    const [row] = await db
        .select()
        .from(studentAvatars)
        .where(eq(studentAvatars.studentId, studentId))
        .limit(1);
    if (!row) return null;

    const bare = readCanvasState(row.equippedItems);

    // Hydrate canvas items with shop_items data in one batched query.
    const itemIds = Array.from(new Set(bare.items.map((i) => i.itemId)));
    const itemById = new Map<string, typeof shopItems.$inferSelect>();
    if (itemIds.length > 0) {
        const rows = await db.select().from(shopItems).where(inArray(shopItems.id, itemIds));
        for (const r of rows) itemById.set(r.id, r);
    }
    const hydratedItems: CanvasItemDto[] = [];
    for (const it of bare.items) {
        const shop = itemById.get(it.itemId);
        if (!shop) continue; // item was deleted from catalogue — skip silently
        hydratedItems.push({
            ...it,
            name: shop.name,
            asset_type: shop.assetType,
            asset_data: isAssetData(shop.assetData) ? shop.assetData : {},
        });
    }

    // Background hydration: stored as backgroundItemId on the row.
    let background: BackgroundItemDto | null = null;
    if (row.backgroundItemId) {
        const [bg] = await db
            .select()
            .from(shopItems)
            .where(eq(shopItems.id, row.backgroundItemId))
            .limit(1);
        if (bg) {
            background = {
                id: bg.id,
                name: bg.name,
                asset_type: bg.assetType,
                asset_data: isAssetData(bg.assetData) ? bg.assetData : {},
            };
        }
    }

    let characterName: string | null = null;
    if (row.characterId) {
        const [char] = await db
            .select({ name: baseCharacters.name })
            .from(baseCharacters)
            .where(eq(baseCharacters.id, row.characterId))
            .limit(1);
        characterName = char?.name ?? null;
    }

    return {
        characterType: row.characterType as CharacterType,
        characterId: row.characterId,
        characterName,
        canvas: { items: hydratedItems, character: bare.character },
        background,
        snapshotUrl: row.snapshotUrl,
        rerollCount: row.rerollCount,
        generationStatus: row.generationStatus,
        baseAssetUrl: row.baseAssetUrl,
    };
}

export async function createAvatar(studentId: string, characterId: string): Promise<AvatarDto> {
    const [character] = await db
        .select()
        .from(baseCharacters)
        .where(eq(baseCharacters.id, characterId))
        .limit(1);
    if (!character) throw new AvatarError('character_not_found', 'That character does not exist.');
    if (character.generationStatus !== 'complete' || !character.assetUrl) {
        throw new AvatarError('character_not_ready', 'That character is not ready yet.');
    }

    const existing = await db
        .select({ studentId: studentAvatars.studentId })
        .from(studentAvatars)
        .where(eq(studentAvatars.studentId, studentId))
        .limit(1);
    if (existing.length) {
        throw new AvatarError('already_exists', 'You already have an avatar. Use reroll to change character.');
    }

    await db.insert(studentAvatars).values({
        studentId,
        characterType: character.characterType,
        characterId: character.id,
        baseAssetUrl: character.assetUrl,
        generationStatus: 'complete',
        equippedItems: defaultCanvasState() as unknown as object,
    });

    const fresh = await getAvatar(studentId);
    if (!fresh) throw new AvatarError('no_avatar', 'Avatar creation failed.');
    return fresh;
}

export async function getRerollCost(): Promise<number> {
    const [row] = await db
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, 'reroll_cost_stars'))
        .limit(1);
    if (!row) return REROLL_COST_FALLBACK;
    const v = row.value;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.floor(v);
    if (typeof v === 'string') {
        const parsed = Number(v);
        if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
    }
    return REROLL_COST_FALLBACK;
}

export async function rerollAvatar(
    studentId: string,
    newCharacterId: string,
): Promise<{ new_balance: number; reroll_count: number; avatar: AvatarDto; charged: number }> {
    const [character] = await db
        .select()
        .from(baseCharacters)
        .where(eq(baseCharacters.id, newCharacterId))
        .limit(1);
    if (!character) throw new AvatarError('character_not_found', 'That character does not exist.');
    if (character.generationStatus !== 'complete' || !character.assetUrl) {
        throw new AvatarError('character_not_ready', 'That character is not ready yet.');
    }

    const [avatarRow] = await db
        .select()
        .from(studentAvatars)
        .where(eq(studentAvatars.studentId, studentId))
        .limit(1);
    if (!avatarRow) throw new AvatarError('no_avatar', 'You need to pick a character first.');
    if (avatarRow.characterId === newCharacterId) {
        throw new AvatarError('same_character', 'Pick a different character to reroll.');
    }

    const isLegacy = avatarRow.characterId === null;
    const sameType = avatarRow.characterType === character.characterType;
    const isPaid = !isLegacy && !sameType;
    const cost = isPaid ? await getRerollCost() : 0;
    const newRerollCount = avatarRow.rerollCount + 1;

    if (isPaid) {
        const [progression] = await db
            .select({ balance: studentProgression.starsBalance })
            .from(studentProgression)
            .where(eq(studentProgression.studentId, studentId))
            .limit(1);
        if (!progression) throw new AvatarError('wallet_missing', 'Earn some stars first.');
        if (progression.balance < cost) {
            throw new AvatarError(
                'insufficient_stars',
                `You need ${cost - progression.balance} more ⭐ to reroll.`,
            );
        }
    }

    try {
        await db.transaction(async (tx) => {
            if (isPaid) {
                await tx
                    .update(studentProgression)
                    .set({
                        starsBalance: sql`${studentProgression.starsBalance} - ${cost}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(studentProgression.studentId, studentId));

                await tx.insert(starTransactions).values({
                    studentId,
                    amount: -cost,
                    direction: 'spend',
                    sourceType: 'reroll',
                    sourceRef: String(newRerollCount),
                });
            }

            // Reroll resets the canvas: new character, no items, no background,
            // no snapshot. The next canvas save regenerates the snapshot with
            // the new character on a blank backdrop.
            await tx
                .update(studentAvatars)
                .set({
                    characterType: character.characterType,
                    characterId: character.id,
                    baseAssetUrl: character.assetUrl,
                    generationStatus: 'complete',
                    equippedItems: defaultCanvasState() as unknown as object,
                    backgroundItemId: null,
                    snapshotUrl: null,
                    rerollCount: newRerollCount,
                    updatedAt: new Date(),
                })
                .where(eq(studentAvatars.studentId, studentId));
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('stars_balance_nonneg')) {
            throw new AvatarError('insufficient_stars', 'Not enough stars (someone else just spent them?).');
        }
        throw error;
    }

    const [after] = await db
        .select({ balance: studentProgression.starsBalance })
        .from(studentProgression)
        .where(eq(studentProgression.studentId, studentId))
        .limit(1);
    const avatar = await getAvatar(studentId);
    return {
        new_balance: after?.balance ?? 0,
        reroll_count: newRerollCount,
        avatar: avatar!,
        charged: cost,
    };
}

// Helper used by the canvas PATCH route after persisting the state, in case a
// caller wants a server-side post-save query. Currently unused; left as a
// signal that the route handler owns the snapshot trigger itself.
export { defaultCanvasState as _defaultCanvasState };
