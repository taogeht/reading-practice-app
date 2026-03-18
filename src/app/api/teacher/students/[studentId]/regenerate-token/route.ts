import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, generateLoginToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface RouteParams {
    params: Promise<{ studentId: string }>;
}

// POST /api/teacher/students/[studentId]/regenerate-token
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { studentId } = await params;
        const newToken = generateLoginToken();

        const [updated] = await db
            .update(users)
            .set({ loginToken: newToken })
            .where(eq(users.id, studentId))
            .returning({ id: users.id, loginToken: users.loginToken });

        if (!updated) {
            return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        return NextResponse.json({ loginToken: updated.loginToken });
    } catch (error) {
        console.error('[regenerate-token] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
