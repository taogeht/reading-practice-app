import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { shopItems, starTransactions, teacherStarGrants } from '@/lib/db/schema';

export const runtime = 'nodejs';

const PAGE_SIZE = 20;

// Cursor is a base64 of "<iso>|<id>" — the createdAt + id of the last row of
// the previous page. Tiebreaker by id keeps pagination stable when two rows
// land in the same millisecond.
function encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}
function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
    try {
        const raw = Buffer.from(cursor, 'base64url').toString('utf8');
        const [iso, id] = raw.split('|');
        if (!iso || !id) return null;
        const createdAt = new Date(iso);
        if (Number.isNaN(createdAt.getTime())) return null;
        return { createdAt, id };
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(request.url);
        const cursorParam = url.searchParams.get('cursor');
        const cursor = cursorParam ? decodeCursor(cursorParam) : null;

        const limitParam = url.searchParams.get('limit');
        const limit = Math.min(PAGE_SIZE, Math.max(1, Number(limitParam) || PAGE_SIZE));

        const conditions = [eq(starTransactions.studentId, user.id)];
        if (cursor) {
            // Strictly-before-cursor: (createdAt, id) < (cursor.createdAt, cursor.id)
            conditions.push(
                or(
                    lt(starTransactions.createdAt, cursor.createdAt),
                    and(
                        eq(starTransactions.createdAt, cursor.createdAt),
                        sql`${starTransactions.id} < ${cursor.id}`,
                    ),
                )!
            );
        }

        const rows = await db
            .select()
            .from(starTransactions)
            .where(and(...conditions))
            .orderBy(desc(starTransactions.createdAt), desc(starTransactions.id))
            .limit(limit + 1);

        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);
        const last = page[page.length - 1];
        const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

        // Enrich shop_purchase rows with the item name and teacher_grant rows
        // with the note. source_ref stores the item.id / grant.id so a single
        // batched lookup per type keeps this O(1) page render rather than N.
        const purchaseRefs = page
            .filter((r) => r.sourceType === 'shop_purchase' && r.sourceRef)
            .map((r) => r.sourceRef as string);
        const grantRefs = page
            .filter((r) => r.sourceType === 'teacher_grant' && r.sourceRef)
            .map((r) => r.sourceRef as string);

        const itemNameById = new Map<string, string>();
        if (purchaseRefs.length > 0) {
            const items = await db
                .select({ id: shopItems.id, name: shopItems.name })
                .from(shopItems)
                .where(inArray(shopItems.id, Array.from(new Set(purchaseRefs))));
            for (const i of items) itemNameById.set(i.id, i.name);
        }

        const grantNoteById = new Map<string, string | null>();
        if (grantRefs.length > 0) {
            const grants = await db
                .select({ id: teacherStarGrants.id, note: teacherStarGrants.note })
                .from(teacherStarGrants)
                .where(inArray(teacherStarGrants.id, Array.from(new Set(grantRefs))));
            for (const g of grants) grantNoteById.set(g.id, g.note);
        }

        return NextResponse.json({
            transactions: page.map((r) => ({
                id: r.id,
                amount: r.amount,
                direction: r.direction,
                source_type: r.sourceType,
                source_ref: r.sourceRef,
                created_at: r.createdAt,
                item_name:
                    r.sourceType === 'shop_purchase' && r.sourceRef
                        ? itemNameById.get(r.sourceRef) ?? null
                        : null,
                note:
                    r.sourceType === 'teacher_grant' && r.sourceRef
                        ? grantNoteById.get(r.sourceRef) ?? null
                        : null,
            })),
            next_cursor: nextCursor,
        });
    } catch (error) {
        console.error('[GET /api/student/stars/history] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
