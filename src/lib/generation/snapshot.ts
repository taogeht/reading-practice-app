// Phase 6 snapshot pipeline. Composites the student's canvas state into a flat
// PNG using Sharp, uploads it to R2, and stores the URL on student_avatars.
// The snapshot is what every read-only surface renders (nav, classmates, etc).
// The editor itself keeps using the live canvas state.
//
// Sharp doesn't rotate composites natively, so each layer is pre-processed
// (resize then rotate with a transparent background) into a buffer with new
// dimensions, and we center it at the requested (x, y) on the final canvas.

import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '@/lib/db';
import { baseCharacters, shopItems, studentAvatars } from '@/lib/db/schema';
import { r2Client } from '@/lib/storage/r2-client';

const CANVAS_W = 640;
const CANVAS_H = 840;

// Default rendered size per category, expressed as a fraction of canvas height
// (or width for some). scale=1.0 lands here; transforms scale this up/down.
const DEFAULT_HEIGHT_FRACTION: Record<string, number> = {
    character: 0.7,
    hat: 0.22,
    outfit: 0.32,
    accessory: 0.18,
    sticker: 0.18,
    trophy: 0.22,
    pet: 0.22,
};

type CanvasItem = {
    itemId: string;
    category: string;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    zIndex: number;
};

type CanvasState = {
    items: CanvasItem[];
    character: { x: number; y: number; scale: number; rotation: number; zIndex: number };
};

function urlToKey(url: string | null | undefined): string | null {
    if (!url) return null;
    const prefix = '/api/images/';
    if (url.startsWith(prefix)) return url.slice(prefix.length);
    // Already a raw key or an external URL we can't fetch — bail out.
    return null;
}

async function streamToBuffer(stream: ReadableStream | null): Promise<Buffer | null> {
    if (!stream) return null;
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
    }
    return Buffer.concat(chunks.map((u) => Buffer.from(u)));
}

async function fetchR2Image(url: string | null | undefined): Promise<Buffer | null> {
    const key = urlToKey(url);
    if (!key) return null;
    const obj = await r2Client.getObject(key);
    if (!obj) return null;
    return streamToBuffer(obj.body);
}

interface PreparedLayer {
    buffer: Buffer;
    left: number;
    top: number;
    zIndex: number;
}

// Pre-process one layer: resize + rotate to its final shape, then compute the
// top-left coord that centers it at the requested (x, y) on the canvas.
async function prepareLayer(
    sourceBuffer: Buffer,
    state: { x: number; y: number; scale: number; rotation: number; zIndex: number },
    defaultHeightFraction: number,
): Promise<PreparedLayer | null> {
    try {
        const targetHeight = Math.max(8, Math.round(CANVAS_H * defaultHeightFraction * state.scale));
        let pipeline = sharp(sourceBuffer).resize({ height: targetHeight, fit: 'inside' });
        if (state.rotation && state.rotation % 360 !== 0) {
            pipeline = pipeline.rotate(state.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
        }
        const out = await pipeline.png().toBuffer({ resolveWithObject: true });
        const w = out.info.width;
        const h = out.info.height;
        const centerX = state.x * CANVAS_W;
        const centerY = state.y * CANVAS_H;
        return {
            buffer: out.data,
            left: Math.round(centerX - w / 2),
            top: Math.round(centerY - h / 2),
            zIndex: state.zIndex,
        };
    } catch (error) {
        console.error('[snapshot] prepareLayer failed:', error);
        return null;
    }
}

export async function generateSnapshot(studentId: string): Promise<string | null> {
    const [avatar] = await db
        .select()
        .from(studentAvatars)
        .where(eq(studentAvatars.studentId, studentId))
        .limit(1);
    if (!avatar) return null;

    const canvas = (avatar.equippedItems as unknown as CanvasState) ?? {
        items: [],
        character: { x: 0.5, y: 0.6, scale: 1, rotation: 0, zIndex: 0 },
    };

    // 1) Background — either a scene image (object-cover sized to canvas) or
    //    a flat fill color. Falls back to a neutral grey if neither is set.
    let baseImage: sharp.Sharp;
    if (avatar.backgroundItemId) {
        const [bg] = await db
            .select()
            .from(shopItems)
            .where(eq(shopItems.id, avatar.backgroundItemId))
            .limit(1);
        const sceneUrl = (bg?.assetData as { url?: string } | null)?.url;
        const sceneColor = (bg?.assetData as { color?: string } | null)?.color ?? '#e5e7eb';
        const sceneBytes = await fetchR2Image(sceneUrl);
        if (sceneBytes) {
            baseImage = sharp(sceneBytes).resize(CANVAS_W, CANVAS_H, { fit: 'cover' });
        } else {
            baseImage = sharp({
                create: { width: CANVAS_W, height: CANVAS_H, channels: 4, background: sceneColor },
            });
        }
    } else {
        baseImage = sharp({
            create: { width: CANVAS_W, height: CANVAS_H, channels: 4, background: '#e5e7eb' },
        });
    }

    const layers: PreparedLayer[] = [];

    // 2) Character — only composited when we actually have a Gemini PNG. CSS
    //    emoji fallback can't be rasterized here; the snapshot for those rare
    //    cases just shows scene + items, and the canvas editor still works.
    if (avatar.baseAssetUrl) {
        const charBytes = await fetchR2Image(avatar.baseAssetUrl);
        if (charBytes) {
            const layer = await prepareLayer(
                charBytes,
                canvas.character,
                DEFAULT_HEIGHT_FRACTION.character,
            );
            if (layer) layers.push(layer);
        }
    }

    // 3) Cosmetics + collectibles. Pull all items in one query to avoid N+1.
    const items = canvas.items ?? [];
    if (items.length > 0) {
        const itemIds = Array.from(new Set(items.map((i) => i.itemId)));
        const shopRows = await db.select().from(shopItems).where(
            // drizzle inArray with an array of strings
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (await import('drizzle-orm')).inArray(shopItems.id, itemIds) as any,
        );
        const shopById = new Map(shopRows.map((r) => [r.id, r]));

        for (const it of items) {
            const shopRow = shopById.get(it.itemId);
            if (!shopRow) continue;
            const url = (shopRow.assetData as { url?: string } | null)?.url ?? null;
            const bytes = await fetchR2Image(url);
            if (!bytes) continue; // CSS-only cosmetic (no PNG yet) — skip; canvas editor still renders it via emoji
            const heightFrac = DEFAULT_HEIGHT_FRACTION[it.category] ?? 0.22;
            const layer = await prepareLayer(bytes, it, heightFrac);
            if (layer) layers.push(layer);
        }
    }

    // 4) Sort by zIndex and composite. Sharp's composite preserves array order
    //    bottom→top, so sort ascending and the highest zIndex ends up on top.
    layers.sort((a, b) => a.zIndex - b.zIndex);

    const snapshotBuffer = await baseImage
        .composite(layers.map((l) => ({ input: l.buffer, left: l.left, top: l.top })))
        .png()
        .toBuffer();

    const key = `images/avatars/snapshots/${studentId}.png`;
    const url = await r2Client.uploadFile(key, snapshotBuffer, 'image/png');

    // Cache-bust by appending a query param so the client refetches after save.
    const versionedUrl = `${url}?v=${Date.now()}`;

    await db
        .update(studentAvatars)
        .set({ snapshotUrl: versionedUrl, updatedAt: new Date() })
        .where(eq(studentAvatars.studentId, studentId));

    return versionedUrl;
}
