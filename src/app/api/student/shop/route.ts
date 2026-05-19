import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getShopItemsForStudent } from '@/lib/gamification/shop';

export const runtime = 'nodejs';

// GET /api/student/shop — enriched shop catalogue, grouped by type → category.
export async function GET(_request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const grouped = await getShopItemsForStudent(user.id);
        return NextResponse.json(grouped);
    } catch (error) {
        console.error('[GET /api/student/shop] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
