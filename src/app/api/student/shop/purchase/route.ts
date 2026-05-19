import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { PurchaseError, purchaseItem } from '@/lib/gamification/shop';

export const runtime = 'nodejs';

// POST /api/student/shop/purchase
// Body: { item_id }. Returns { success, item, new_balance }.
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const { item_id } = body as { item_id?: string };
        if (!item_id || typeof item_id !== 'string') {
            return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
        }

        const result = await purchaseItem(user.id, item_id);
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        if (error instanceof PurchaseError) {
            const status = error.code === 'not_found' || error.code === 'not_available' ? 404 : 400;
            return NextResponse.json({ error: error.message, code: error.code }, { status });
        }
        console.error('[POST /api/student/shop/purchase] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
