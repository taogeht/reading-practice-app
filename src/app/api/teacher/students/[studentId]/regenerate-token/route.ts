import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, generateLoginToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { userCanAccessStudentMedia } from '@/lib/auth/class-access';
import { revokeMobileSessionsForUser } from '@/lib/auth/mobile-session';

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

        // Ownership: teachers may only mint tokens for students enrolled in a
        // class they own or co-teach (admins always pass). Without this, any
        // teacher could regenerate any user's login token and impersonate them
        // via /s/[token].
        const canAccess = await userCanAccessStudentMedia(user.id, user.role, studentId);
        if (!canAccess) {
            return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        const newToken = generateLoginToken();

        // Token regeneration is an explicit credential reset. Revoke native
        // refresh sessions before minting the replacement QR credential.
        await revokeMobileSessionsForUser(studentId);

        const [updated] = await db
            .update(users)
            .set({ loginToken: newToken })
            .where(and(eq(users.id, studentId), eq(users.role, 'student')))
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
