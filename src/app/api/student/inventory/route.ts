import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getInventoryForStudent } from '@/lib/gamification/shop';

export const runtime = 'nodejs';

// GET /api/student/inventory — what the student owns, grouped like the shop.
export async function GET(_request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const grouped = await getInventoryForStudent(user.id);
        return NextResponse.json(grouped);
    } catch (error) {
        console.error('[GET /api/student/inventory] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
