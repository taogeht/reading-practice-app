import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, inArray } from 'drizzle-orm';
import { accessibleClassIds } from '@/lib/auth/class-access';

export const runtime = 'nodejs';

// POST /api/teacher/spelling-lists/[id]/set-current
// Marks this list as the current week's list for its class.
// Body: { applyToListIds?: string[] } — when the same list is shared across multiple
// classes (deduped in the teacher view), pass all sibling list IDs to mark current
// in every class at once.
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: listId } = await params;
        const body = await request.json().catch(() => ({}));
        const requestedIds: string[] = Array.isArray(body.applyToListIds) && body.applyToListIds.length > 0
            ? body.applyToListIds
            : [listId];

        // Always include the primary id
        const targetIds = Array.from(new Set([listId, ...requestedIds]));

        // Fetch all target lists for the class-id needed below.
        const targets = await db
            .select({
                id: spellingLists.id,
                classId: spellingLists.classId,
            })
            .from(spellingLists)
            .where(inArray(spellingLists.id, targetIds));

        if (targets.length === 0) {
            return NextResponse.json({ error: 'List not found' }, { status: 404 });
        }

        // Authorize: every targeted list must belong to a class the user can manage.
        if (user.role !== 'admin') {
            const myClassIds = new Set(await accessibleClassIds(user.id, user.role));
            const unauthorized = targets.find((t) => !myClassIds.has(t.classId));
            if (unauthorized) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }
        }

        const targetClassIds = Array.from(new Set(targets.map((t) => t.classId)));
        const targetListIds = targets.map((t) => t.id);

        // Clear is_current on all lists in affected classes, then set true on target lists
        await db
            .update(spellingLists)
            .set({ isCurrent: false, updatedAt: new Date() })
            .where(inArray(spellingLists.classId, targetClassIds));

        await db
            .update(spellingLists)
            .set({ isCurrent: true, updatedAt: new Date() })
            .where(inArray(spellingLists.id, targetListIds));

        return NextResponse.json({ success: true, updatedListIds: targetListIds });
    } catch (error) {
        console.error('[POST /api/teacher/spelling-lists/[id]/set-current] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/teacher/spelling-lists/[id]/set-current
// Clears the "current" flag on this list (and optional siblings).
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: listId } = await params;
        const { searchParams } = new URL(request.url);
        const applyToParam = searchParams.get('applyToListIds');
        const requestedIds = applyToParam
            ? applyToParam.split(',').map((s) => s.trim()).filter(Boolean)
            : [];
        const targetIds = Array.from(new Set([listId, ...requestedIds]));

        const targets = await db
            .select({ id: spellingLists.id, classId: spellingLists.classId })
            .from(spellingLists)
            .where(inArray(spellingLists.id, targetIds));

        if (targets.length === 0) {
            return NextResponse.json({ error: 'List not found' }, { status: 404 });
        }

        if (user.role !== 'admin') {
            const myClassIds = new Set(await accessibleClassIds(user.id, user.role));
            if (targets.some((t) => !myClassIds.has(t.classId))) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }
        }

        await db
            .update(spellingLists)
            .set({ isCurrent: false, updatedAt: new Date() })
            .where(inArray(spellingLists.id, targets.map((t) => t.id)));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[DELETE /api/teacher/spelling-lists/[id]/set-current] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
